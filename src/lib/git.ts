import { mkdir, stat } from "fs/promises";
import path from "path";
import simpleGit, { type SimpleGit } from "simple-git";
import type { Prisma, Project } from "@prisma/client";
import { prisma } from "./db";
import { config } from "./config";
import { logger } from "./logger";
import {
  emptyBranchSummary,
  mentionsRequirement,
  parseBranchSummary,
  parseNumstat,
  parseReqSeq,
  parseShortStat,
  MAX_COMMITS,
  type BranchSummary,
  type BranchSummaryRequirement,
} from "./branch-summary";

// Git 自动化（TECH_DESIGN §5）：所有分支操作在服务端 clone 上执行后 push GitHub。
// 仅在 worker 进程调用；git 队列 concurrency=1 保证串行，避免并发操作仓库。
// 约定：每个会改动工作区的操作先 checkoutFresh（中止残留的 merge/revert/cherry-pick + reset --hard），
// 失败路径一律 abort + cleanWorkingTree，保证 clone 永远不会停在脏状态。

const REPOS_DIR = process.env.REPOS_DIR || "/data/repos";
/** 提交日志字段分隔符（%s 里可能出现 "|"，用不可打印的 US 更稳） */
const SEP = "\x1f";
/** 单次读取 daily 范围提交的上限 */
const LOG_LIMIT = 2000;

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

/** 中止残留的 merge / revert / cherry-pick 并硬重置，保证从干净状态开始 */
async function cleanWorkingTree(git: SimpleGit): Promise<void> {
  await git.merge(["--abort"]).catch(() => {});
  await git.raw(["revert", "--abort"]).catch(() => {});
  await git.raw(["cherry-pick", "--abort"]).catch(() => {});
  await git.reset(["--hard"]).catch(() => {});
}

/** 切到分支并强制对齐远端（-B：本地分支不存在则创建，存在则重置） */
async function checkoutFresh(git: SimpleGit, branch: string): Promise<void> {
  await cleanWorkingTree(git);
  await git.checkout(["-B", branch, `origin/${branch}`]);
  await git.reset(["--hard", `origin/${branch}`]);
}

async function refExists(git: SimpleGit, ref: string): Promise<boolean> {
  try {
    await git.raw(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function shortSha(git: SimpleGit, ref: string): Promise<string> {
  return (await git.raw(["rev-parse", "--short", ref])).trim();
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
    // 直接从远端引用推送，不依赖本地分支（避免与当前检出分支冲突）
    await git.push("origin", `origin/${project.mainBranch}:refs/heads/${name}`);
    await git.fetch(["--prune"]);
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
    await git.push("origin", `origin/${daily}:refs/heads/${featureName}`);
    await git.fetch(["--prune"]);
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

  await checkoutFresh(git, daily);

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
    await cleanWorkingTree(git);
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

  await checkoutFresh(git, main);
  try {
    await git.merge(["--no-ff", `origin/${daily.name}`, "-m", `merge ${daily.name}`]);
  } catch {
    const status = await git.status();
    const conflictFiles = status.conflicted;
    await cleanWorkingTree(git);
    logger.warn({ project: daily.project.name, branch: daily.name, conflictFiles }, "daily→main conflict");
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

// ---------- 分支审查摘要 / 剔除 / cherry-pick（PRD #25 #26） ----------

interface RangeCommit {
  sha: string;
  full: string;
  parents: string[];
  message: string;
  author: string;
  date: string;
}

/** 读取范围内提交（新→旧） */
async function listRangeCommits(git: SimpleGit, range: string, limit = LOG_LIMIT): Promise<RangeCommit[]> {
  const out = await git.raw(["log", range, "-n", String(limit), `--format=%h${SEP}%H${SEP}%P${SEP}%s${SEP}%an${SEP}%aI`]);
  return out
    .split("\n")
    .filter((l) => l.includes(SEP))
    .map((line) => {
      const [sha, full, parents, message, author, date] = line.split(SEP);
      return { sha, full, parents: parents ? parents.split(" ").filter(Boolean) : [], message, author, date };
    });
}

/**
 * 解析 daily 相对 main 的比较基线：
 * - daily 尚未入 main：merge-base
 * - daily 已入 main：main 上那次合并提交的第一父提交（否则 main..daily 为空，合并后摘要不可读）
 */
async function resolveBase(git: SimpleGit, mainRef: string, dailyRef: string): Promise<string> {
  const tip = (await git.raw(["rev-parse", dailyRef])).trim();
  const merges = await git
    .raw(["log", mainRef, "--merges", "--first-parent", "-n", "300", `--format=%H${SEP}%P`])
    .catch(() => "");
  for (const line of merges.split("\n")) {
    if (!line.includes(SEP)) continue;
    const [, parents] = line.split(SEP);
    const ps = parents.split(" ").filter(Boolean);
    if (ps.slice(1).includes(tip)) return ps[0];
  }
  return (await git.raw(["merge-base", mainRef, dailyRef])).trim();
}

interface MergeLocation {
  /** 短 sha */
  mergeSha: string | null;
  /** 完整 sha（revert / cherry-pick 用） */
  fullSha: string | null;
  /** 最新相关提交是 revert → 已被剔除 */
  reverted: boolean;
}

/** 在 daily 提交列表（新→旧）中定位某需求的最新合并提交；最新相关提交若是 revert 则视为已剔除 */
function locateMerge(commits: RangeCommit[], seq: number, featureBranch: string | null): MergeLocation {
  for (const c of commits) {
    if (!mentionsRequirement(c.message, seq, featureBranch)) continue;
    if (/^Revert\b/i.test(c.message)) return { mergeSha: null, fullSha: null, reverted: true };
    if (c.parents.length >= 2) return { mergeSha: c.sha, fullSha: c.full, reverted: false };
  }
  return { mergeSha: null, fullSha: null, reverted: false };
}

type DailyWithReqs = Prisma.DailyBranchGetPayload<{
  include: { project: true; requirements: { select: { seq: true; featureBranch: true } } };
}>;

async function computeSummary(daily: DailyWithReqs): Promise<BranchSummary> {
  const git = await ensureRepo(daily.project);
  const mainRef = `origin/${daily.project.mainBranch}`;
  const dailyRef = `origin/${daily.name}`;
  if (!(await refExists(git, dailyRef))) {
    return emptyBranchSummary(`远端不存在分支 ${daily.name}`);
  }

  const base = await resolveBase(git, mainRef, dailyRef);
  const range = `${base}..${dailyRef}`;
  const [baseCommit, headCommit, commits, commitCount, shortstat] = await Promise.all([
    shortSha(git, base),
    shortSha(git, dailyRef),
    listRangeCommits(git, range),
    git.raw(["rev-list", "--count", range]).then((s) => Number(s.trim()) || 0),
    git.raw(["diff", "--shortstat", base, dailyRef]).then(parseShortStat),
  ]);

  const perRequirement: BranchSummaryRequirement[] = [];
  for (const r of daily.requirements) {
    if (!r.featureBranch) continue;
    const loc = locateMerge(commits, r.seq, r.featureBranch);
    let stat = { files: 0, insertions: 0, deletions: 0, changedFiles: [] as string[] };
    if (loc.mergeSha) {
      // 已合入：合并提交相对其第一父提交的差异 = 这次合并真正带入 daily 的改动
      stat = parseNumstat(await git.raw(["diff", "--numstat", `${loc.mergeSha}^1`, loc.mergeSha]));
    } else if (await refExists(git, `origin/${r.featureBranch}`)) {
      // 未合入：feature 相对 daily 的待合并改动
      stat = parseNumstat(await git.raw(["diff", "--numstat", `${dailyRef}...origin/${r.featureBranch}`]));
    }
    perRequirement.push({ seq: r.seq, featureBranch: r.featureBranch, mergeSha: loc.mergeSha, ...stat });
  }

  return {
    refreshedAt: new Date().toISOString(),
    baseCommit,
    headCommit,
    totals: { commits: commitCount, ...shortstat },
    commits: commits.slice(0, MAX_COMMITS).map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      date: c.date,
      reqSeq: parseReqSeq(c.message),
    })),
    perRequirement,
  };
}

/** 用真实 git log / diff 计算 daily 分支摘要并写入 DailyBranch.reviewSummary。仓库不可达时保留上次数据并记录 error。 */
export async function buildBranchSummary(dailyBranchId: string): Promise<BranchSummary> {
  const daily = await prisma.dailyBranch.findUniqueOrThrow({
    where: { id: dailyBranchId },
    include: {
      project: true,
      requirements: { select: { seq: true, featureBranch: true }, orderBy: { seq: "asc" } },
    },
  });
  let summary: BranchSummary;
  try {
    summary = await computeSummary(daily);
    logger.info(
      { project: daily.project.name, branch: daily.name, commits: summary.totals.commits, reqs: summary.perRequirement.length },
      "branch summary refreshed",
    );
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
    logger.warn({ project: daily.project.name, branch: daily.name, err: msg }, "branch summary failed");
    const prev = parseBranchSummary(daily.reviewSummary);
    summary = { ...(prev ?? emptyBranchSummary()), refreshedAt: new Date().toISOString(), error: msg };
  }
  await prisma.dailyBranch.update({
    where: { id: dailyBranchId },
    data: { reviewSummary: summary as unknown as Prisma.InputJsonValue },
  });
  return summary;
}

async function loadRequirementForGit(requirementId: string) {
  const req = await prisma.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: { project: true, dailyBranch: true },
  });
  if (!req.project || !req.featureBranch || !req.dailyBranch) {
    throw new Error(`requirement ${req.seq} missing branch info`);
  }
  return req as typeof req & { project: Project; featureBranch: string; dailyBranch: NonNullable<typeof req.dailyBranch> };
}

/** 在 daily 上定位需求的合并提交（daily 远端不存在或未合入返回空） */
async function findMergeOnDaily(
  git: SimpleGit,
  mainBranch: string,
  dailyName: string,
  seq: number,
  featureBranch: string,
): Promise<MergeLocation> {
  const dailyRef = `origin/${dailyName}`;
  if (!(await refExists(git, dailyRef))) return { mergeSha: null, fullSha: null, reverted: false };
  const base = await resolveBase(git, `origin/${mainBranch}`, dailyRef);
  const commits = await listRangeCommits(git, `${base}..${dailyRef}`);
  return locateMerge(commits, seq, featureBranch);
}

export interface RevertResult {
  ok: boolean;
  /** revert 提交短 sha */
  revertSha?: string;
  /** daily 上本就没有该需求的合并提交（未合并 / 冲突态 / 已剔除），无需 revert */
  notMerged?: boolean;
  conflictFiles?: string[];
}

/** 剔除：在 daily 上 revert 该需求的合并提交并 push（PRD #26）。revert 冲突则 abort 并返回冲突文件。 */
export async function excludeFromDaily(requirementId: string): Promise<RevertResult> {
  const req = await loadRequirementForGit(requirementId);
  const git = await ensureRepo(req.project);
  const dailyName = req.dailyBranch.name;

  const loc = await findMergeOnDaily(git, req.project.mainBranch, dailyName, req.seq, req.featureBranch);
  if (!loc.fullSha) {
    logger.info({ req: req.seq, daily: dailyName, reverted: loc.reverted }, "nothing to revert on daily");
    return { ok: true, notMerged: true };
  }

  await checkoutFresh(git, dailyName);
  try {
    await git.raw(["revert", "-m", "1", "--no-edit", loc.fullSha]);
  } catch (e) {
    const status = await git.status();
    const conflictFiles = status.conflicted;
    await cleanWorkingTree(git);
    if (conflictFiles.length === 0) throw e; // 非冲突错误（网络等）向上抛，让任务失败可见
    logger.warn({ req: req.seq, daily: dailyName, conflictFiles }, "revert conflict");
    return { ok: false, conflictFiles };
  }
  const revertSha = await shortSha(git, "HEAD");
  await git.push("origin", dailyName);
  logger.info({ req: req.seq, daily: dailyName, revertSha, merge: loc.mergeSha }, "requirement excluded from daily");
  return { ok: true, revertSha };
}

export interface CherryPickResult {
  ok: boolean;
  /** main 上新提交短 sha */
  sha?: string;
  /** cherry-pick：daily 上的合并提交；merge：feature 从未合入 daily，直接 --no-ff 合并 feature */
  via: "cherry-pick" | "merge";
  conflictFiles?: string[];
}

/** 单需求提前进 main（PRD #26）：cherry-pick daily 上的合并提交；未合入 daily 则直接合并 feature。冲突则 abort。 */
export async function cherryPickToMain(requirementId: string): Promise<CherryPickResult> {
  const req = await loadRequirementForGit(requirementId);
  const git = await ensureRepo(req.project);
  const main = req.project.mainBranch;
  const featureRef = `origin/${req.featureBranch}`;

  const loc = await findMergeOnDaily(git, main, req.dailyBranch.name, req.seq, req.featureBranch);
  const via: CherryPickResult["via"] = loc.fullSha ? "cherry-pick" : "merge";
  if (!loc.fullSha && !(await refExists(git, featureRef))) {
    throw new Error(`REQ-${req.seq} 既未合入 ${req.dailyBranch.name}，远端也不存在 ${req.featureBranch}`);
  }

  await checkoutFresh(git, main);
  try {
    if (loc.fullSha) {
      await git.raw(["cherry-pick", "-m", "1", loc.fullSha]);
    } else {
      await git.merge(["--no-ff", featureRef, "-m", `merge ${req.featureBranch} (REQ-${req.seq}) into ${main}`]);
    }
  } catch (e) {
    const status = await git.status();
    const conflictFiles = status.conflicted;
    await cleanWorkingTree(git);
    if (conflictFiles.length === 0) throw e;
    logger.warn({ req: req.seq, main, via, conflictFiles }, "cherry-pick to main conflict");
    return { ok: false, via, conflictFiles };
  }
  const sha = await shortSha(git, "HEAD");
  await git.push("origin", main);
  logger.info({ req: req.seq, main, via, sha }, "requirement cherry-picked to main");
  return { ok: true, via, sha };
}

// ---------- 仓库维护 ----------

/** 增量 fetch（cron fetch-repos）：首次会 clone */
export async function fetchRepo(project: Project): Promise<void> {
  await ensureRepo(project);
  logger.debug({ project: project.name }, "repo fetched");
}

/** 远端是否可达（ls-remote，15 秒超时）；设置页 / 项目健康检查用 */
export async function repoReachable(project: Pick<Project, "repoUrl">): Promise<boolean> {
  try {
    await simpleGit({ timeout: { block: 15_000 } }).listRemote(["--heads", authenticatedUrl(project.repoUrl)]);
    return true;
  } catch (e) {
    logger.warn({ repoUrl: project.repoUrl, err: String(e instanceof Error ? e.message : e).slice(0, 200) }, "repo unreachable");
    return false;
  }
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
  await checkoutFresh(git, branch);

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

/** 读取仓库中的文件（agent-context.md 等）：先读最新 daily 分支（写入侧在 daily），无则回落 main；都不存在返回 null（#33） */
export async function readRepoFile(projectId: string, relPath: string): Promise<string | null> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const git = await ensureRepo(project);
  const latestDaily = await prisma.dailyBranch.findFirst({
    where: { projectId },
    orderBy: { date: "desc" },
    select: { name: true },
  });
  const refs = [latestDaily ? `origin/${latestDaily.name}` : null, `origin/${project.mainBranch}`].filter(
    (r): r is string => !!r,
  );
  for (const ref of refs) {
    try {
      return await git.show([`${ref}:${relPath}`]);
    } catch {
      // 该分支没有此文件，尝试下一个
    }
  }
  return null;
}
