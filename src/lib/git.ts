import { mkdir, stat } from "fs/promises";
import path from "path";
import simpleGit, { type SimpleGit } from "simple-git";
import { prisma } from "./db";
import { config } from "./config";
import { logger } from "./logger";
import type { Project } from "@prisma/client";

// Git 自动化（TECH_DESIGN §5）：所有分支操作在服务端 clone 上执行后 push GitHub。
// 仅在 worker 进程调用；git 队列 concurrency=1 保证串行，避免并发操作仓库。

const REPOS_DIR = process.env.REPOS_DIR || "/data/repos";

/** 把 bot PAT 注入 https 地址；ssh 地址转 https（服务器容器内不配 ssh key） */
export function authenticatedUrl(repoUrl: string): string {
  const pat = config.githubBotPat;
  let httpsUrl = repoUrl;
  const sshMatch = repoUrl.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (sshMatch) httpsUrl = `https://${sshMatch[1]}/${sshMatch[2]}.git`;
  if (!pat) return httpsUrl;
  return httpsUrl.replace(/^https:\/\//, `https://x-access-token:${pat}@`);
}

async function ensureRepo(project: Project): Promise<SimpleGit> {
  const dir = path.join(REPOS_DIR, project.name);
  const url = authenticatedUrl(project.repoUrl);
  let exists = false;
  try {
    await stat(path.join(dir, ".git"));
    exists = true;
  } catch {
    // not cloned yet
  }
  if (!exists) {
    await mkdir(REPOS_DIR, { recursive: true });
    logger.info({ project: project.name }, "cloning repo");
    await simpleGit().clone(url, dir);
  }
  const git = simpleGit(dir);
  await git.remote(["set-url", "origin", url]); // PAT 轮换后保持有效
  await git.addConfig("user.name", "bitsoul-pm-bot");
  await git.addConfig("user.email", "pm-bot@bitsouls.cn");
  await git.fetch(["--prune"]);
  return git;
}

export function dailyBranchName(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `daily/${y}${m}${d}`;
}

/** 每日分支：从 main 创建并 push；已存在则跳过。返回分支名。 */
export async function createDailyBranch(projectId: string, date: Date): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const name = dailyBranchName(date);
  const git = await ensureRepo(project);

  const remote = await git.listRemote(["--heads", "origin", name]);
  if (!remote.trim()) {
    await git.raw(["branch", "-f", name, `origin/${project.mainBranch}`]);
    await git.push("origin", name);
    logger.info({ project: project.name, branch: name }, "daily branch created");
  }

  await prisma.dailyBranch.upsert({
    where: { projectId_name: { projectId, name } },
    update: {},
    create: { projectId, name, date },
  });
  return name;
}

/** 需求分支：从当日分支创建 feature/REQ-<seq> 并 push。 */
export async function createFeatureBranch(requirementId: string): Promise<string> {
  const req = await prisma.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: { project: true },
  });
  if (!req.project) throw new Error(`requirement ${req.seq} has no project`);
  const featureName = `feature/REQ-${req.seq}`;
  const git = await ensureRepo(req.project);

  const daily = await createDailyBranch(req.project.id, new Date());
  const dbDaily = await prisma.dailyBranch.findUniqueOrThrow({
    where: { projectId_name: { projectId: req.project.id, name: daily } },
  });

  const remote = await git.listRemote(["--heads", "origin", featureName]);
  if (!remote.trim()) {
    await git.raw(["branch", "-f", featureName, `origin/${daily}`]);
    await git.push("origin", featureName);
  }

  await prisma.requirement.update({
    where: { id: requirementId },
    data: { featureBranch: featureName, dailyBranchId: dbDaily.id },
  });
  logger.info({ req: req.seq, branch: featureName, daily }, "feature branch ready");
  return featureName;
}

export interface MergeResult {
  ok: boolean;
  conflictFiles?: string[];
  diffStat?: string;
  changedFiles?: string[];
}

/** feature → daily 合并（--no-ff）。冲突则 abort 并返回冲突文件。 */
export async function mergeFeatureToDaily(requirementId: string): Promise<MergeResult> {
  const req = await prisma.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: { project: true, dailyBranch: true },
  });
  if (!req.project || !req.featureBranch || !req.dailyBranch) {
    throw new Error(`requirement ${req.seq} missing branch info`);
  }
  const git = await ensureRepo(req.project);
  const daily = req.dailyBranch.name;

  await git.checkout(daily);
  await git.reset(["--hard", `origin/${daily}`]);

  const diffStat = await git.raw(["diff", "--stat", `origin/${daily}...origin/${req.featureBranch}`]);
  const changedFiles = (
    await git.raw(["diff", "--name-only", `origin/${daily}...origin/${req.featureBranch}`])
  )
    .split("\n")
    .filter(Boolean);

  try {
    await git.merge(["--no-ff", `origin/${req.featureBranch}`, "-m", `merge ${req.featureBranch} (REQ-${req.seq})`]);
  } catch {
    const status = await git.status();
    const conflictFiles = status.conflicted;
    await git.merge(["--abort"]).catch(() => {});
    logger.warn({ req: req.seq, conflictFiles }, "merge conflict");
    return { ok: false, conflictFiles };
  }
  await git.push("origin", daily);
  logger.info({ req: req.seq, daily }, "feature merged into daily");
  return { ok: true, diffStat, changedFiles };
}

/** daily → main 合并（管理员分支审查页触发）。 */
export async function mergeDailyToMain(dailyBranchId: string): Promise<MergeResult> {
  const daily = await prisma.dailyBranch.findUniqueOrThrow({
    where: { id: dailyBranchId },
    include: { project: true },
  });
  const git = await ensureRepo(daily.project);
  const main = daily.project.mainBranch;

  await git.checkout(main);
  await git.reset(["--hard", `origin/${main}`]);
  try {
    await git.merge(["--no-ff", `origin/${daily.name}`, "-m", `merge ${daily.name}`]);
  } catch {
    const status = await git.status();
    const conflictFiles = status.conflicted;
    await git.merge(["--abort"]).catch(() => {});
    return { ok: false, conflictFiles };
  }
  await git.push("origin", main);
  await prisma.dailyBranch.update({
    where: { id: dailyBranchId },
    data: { mergedToMain: true, mergedAt: new Date() },
  });
  logger.info({ project: daily.project.name, branch: daily.name }, "daily merged to main");
  return { ok: true };
}

/** 在仓库分支上写文件并 push（docs 日志、测试报告入仓用） */
export async function commitFileToBranch(
  projectId: string,
  branch: string,
  relPath: string,
  content: string,
  message: string,
  append = false,
): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const git = await ensureRepo(project);
  await git.checkout(branch);
  await git.reset(["--hard", `origin/${branch}`]);

  const abs = path.join(REPOS_DIR, project.name, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  const { readFile, writeFile } = await import("fs/promises");
  let final = content;
  if (append) {
    const prev = await readFile(abs, "utf8").catch(() => "");
    final = prev + content;
  }
  await writeFile(abs, final, "utf8");
  await git.add(relPath);
  const status = await git.status();
  if (status.staged.length === 0) return; // 无变化
  await git.commit(message);
  await git.push("origin", branch);
}

/** 读取仓库中的文件（agent-context.md 等）；不存在返回 null */
export async function readRepoFile(projectId: string, relPath: string): Promise<string | null> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const git = await ensureRepo(project);
  try {
    return await git.show([`origin/${project.mainBranch}:${relPath}`]);
  } catch {
    return null;
  }
}
