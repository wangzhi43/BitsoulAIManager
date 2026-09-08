import { spawn } from "child_process";
import { mkdir, readdir, rm, stat } from "fs/promises";
import path from "path";
import { prisma } from "./db";
import { config } from "./config";
import { logger } from "./logger";
import { ensureRepo, REPOS_DIR } from "./git";

// 体验包构建（PRD #27 / ADR-003）。仅 worker 调用（git 队列串行）。
// 约定：在仓库根目录执行 Project.buildCommand，产物写到 $BUILD_OUT；结束后打成 <id>.tar.gz。

const LOG_TAIL_BYTES = 200 * 1024;

function tail(buf: string): string {
  return buf.length > LOG_TAIL_BYTES ? `…（已截断，仅保留尾部 200KB）\n${buf.slice(-LOG_TAIL_BYTES)}` : buf;
}

/** 以 shell 执行命令，收集输出，超时 kill；返回退出码 */
function runShell(cmd: string, cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, onOutput: (chunk: string) => void): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-lc", cmd], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => onOutput(d.toString()));
    child.stderr.on("data", (d: Buffer) => onOutput(d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      onOutput(`\n[spawn error] ${String(e)}\n`);
      resolve({ code: -1, timedOut: false });
    });
  });
}

async function dirHasFiles(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function runBuild(buildRunId: string): Promise<void> {
  const run = await prisma.buildRun.findUniqueOrThrow({ where: { id: buildRunId }, include: { project: true } });
  if (run.status !== "QUEUED") {
    logger.info({ buildRunId, status: run.status }, "build run not queued, skip");
    return;
  }
  await prisma.buildRun.update({ where: { id: buildRunId }, data: { status: "RUNNING", startedAt: new Date() } });

  const outRoot = path.join(config.buildsDir, buildRunId);
  const outDir = path.join(outRoot, "out");
  const artifactPath = path.join(config.buildsDir, `${buildRunId}.tar.gz`);
  let log = "";
  const append = (chunk: string) => {
    log = tail(log + chunk);
  };

  try {
    await mkdir(outDir, { recursive: true });
    const git = await ensureRepo(run.project);
    append(`$ git checkout ${run.branch} (reset to origin/${run.branch})\n`);
    await git.checkout(run.branch).catch(async () => {
      await git.checkoutBranch(run.branch, `origin/${run.branch}`);
    });
    await git.reset(["--hard", `origin/${run.branch}`]);
    const head = (await git.revparse(["--short", "HEAD"])).trim();
    append(`HEAD ${head}\n$ ${run.command}\n`);

    const repoDir = path.join(REPOS_DIR, run.project.name);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BUILD_OUT: outDir,
      BUILD_RUN_ID: buildRunId,
      BUILD_BRANCH: run.branch,
      CI: "true",
      // 不把平台密钥暴露给项目构建脚本
      DATABASE_URL: undefined,
      REDIS_URL: undefined,
      MASTER_KEY: undefined,
      JWT_SECRET: undefined,
      INGEST_HMAC_SECRET: undefined,
      GITHUB_BOT_PAT: undefined,
    };
    const { code, timedOut } = await runShell(run.command, repoDir, env, config.buildTimeoutMinutes * 60_000, append);
    if (timedOut) append(`\n[超时 ${config.buildTimeoutMinutes} 分钟，已终止]\n`);
    if (code !== 0) {
      await prisma.buildRun.update({ where: { id: buildRunId }, data: { status: "FAILED", finishedAt: new Date(), log } });
      logger.warn({ buildRunId, code, timedOut }, "build failed");
      return;
    }

    let artifact: { path: string; name: string; size: number } | null = null;
    if (await dirHasFiles(outDir)) {
      const tarName = `${run.project.name}-${run.branch.replace(/[^\w.-]+/g, "_")}-${head}.tar.gz`;
      append(`\n$ tar -czf ${artifactPath} -C ${outDir} .\n`);
      const tarRes = await runShell(`tar -czf "${artifactPath}" -C "${outDir}" .`, outRoot, process.env, 10 * 60_000, append);
      if (tarRes.code === 0) {
        const st = await stat(artifactPath);
        artifact = { path: artifactPath, name: tarName, size: st.size };
        append(`产物 ${tarName}（${(st.size / 1024 / 1024).toFixed(1)} MB）\n`);
      } else {
        append("[打包失败]\n");
      }
    } else {
      append("\n[提示] $BUILD_OUT 目录为空：构建命令没有把产物写到 $BUILD_OUT，无可下载产物。\n");
    }
    await prisma.buildRun.update({
      where: { id: buildRunId },
      data: { status: "SUCCESS", finishedAt: new Date(), log, artifactPath: artifact?.path ?? null, artifactName: artifact?.name ?? null, artifactSize: artifact?.size ?? null },
    });
    logger.info({ buildRunId, artifact: artifact?.name ?? null }, "build finished");
  } catch (e) {
    append(`\n[error] ${String(e)}\n`);
    await prisma.buildRun.update({ where: { id: buildRunId }, data: { status: "FAILED", finishedAt: new Date(), log } });
    logger.error({ buildRunId, err: String(e) }, "build error");
  } finally {
    // 清理解包目录，只保留 tar.gz
    await rm(outRoot, { recursive: true, force: true }).catch(() => {});
  }
}
