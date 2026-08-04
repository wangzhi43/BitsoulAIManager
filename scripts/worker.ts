// BullMQ worker 进程：消费 llm / git / cron 三个队列，注册定时任务。
// 运行：npm run worker（生产：docker compose 中独立容器）

import { Worker, Queue } from "bullmq";
import { createRedis, type LlmJob, type GitJob } from "../src/lib/queue";
import { logger } from "../src/lib/logger";
import { prisma } from "../src/lib/db";
import { parseThread } from "../src/lib/experts/product";
import { aggregateThreads } from "../src/lib/experts/aggregate";
import { rankPool } from "../src/lib/experts/pm";
import { genTestTasks } from "../src/lib/experts/test";
import { generateDailyReport } from "../src/lib/experts/report";
import {
  createDailyBranch,
  createFeatureBranch,
  mergeFeatureToDaily,
  mergeDailyToMain,
  commitFileToBranch,
} from "../src/lib/git";
import { getQueues } from "../src/lib/queue";

const connection = createRedis();

// ---------- 定时任务注册（TECH_DESIGN §8） ----------

const CRON_JOBS: { name: string; pattern: string }[] = [
  { name: "create-daily-branches", pattern: "0 2 * * *" }, // 每日 02:00 建 daily 分支
  { name: "rank-pools", pattern: "0 3 * * *" }, // 每日 03:00 全池重排
  { name: "daily-reports", pattern: "0 21 * * *" }, // 每日 21:00 日报
  { name: "claim-timeout-scan", pattern: "*/10 * * * *" }, // 每 10 分钟超时扫描
  { name: "aggregate-threads", pattern: "* * * * *" }, // 每分钟：消息聚合成需求线索
  { name: "usage-rollup", pattern: "0 4 * * *" }, // 每日 04:00 用量汇总
];

async function registerCronJobs() {
  const cron = new Queue("cron", { connection: createRedis() });
  for (const job of CRON_JOBS) {
    await cron.upsertJobScheduler(job.name, { pattern: job.pattern, tz: "Asia/Shanghai" });
  }
  logger.info({ jobs: CRON_JOBS.map((j) => j.name) }, "cron jobs registered");
}

// ---------- 处理器（M2-M4 逐步填充实现） ----------

const llmWorker = new Worker<LlmJob>(
  "llm",
  async (job) => {
    logger.info({ id: job.id, data: job.data }, "llm job received");
    switch (job.data.kind) {
      case "parse-thread":
        await parseThread(job.data.threadId, job.data.rejectReason);
        return;
      case "rank-pool":
        await rankPool(job.data.projectId);
        return;
      case "gen-test-tasks":
        await genTestTasks(job.data.requirementId);
        return;
      case "daily-report":
        await generateDailyReport(job.data.projectId, job.data.date);
        return;
    }
  },
  { connection, concurrency: 3 },
);

const gitWorker = new Worker<GitJob>(
  "git",
  async (job) => {
    logger.info({ id: job.id, data: job.data }, "git job received");
    // concurrency=1 全局串行，天然满足同项目串行要求
    switch (job.data.kind) {
      case "create-daily-branch":
        await createDailyBranch(job.data.projectId, new Date(job.data.date));
        return;
      case "create-feature-branch":
        await createFeatureBranch(job.data.requirementId);
        return;
      case "merge-feature-to-daily": {
        const requirementId = job.data.requirementId;
        const result = await mergeFeatureToDaily(requirementId);
        if (result.ok) {
          await prisma.$transaction([
            prisma.devTask.update({ where: { requirementId }, data: { status: "MERGED" } }),
            prisma.requirement.update({ where: { id: requirementId }, data: { status: "PENDING_TEST" } }),
            prisma.reqEvent.create({
              data: {
                requirementId,
                fromStatus: "DEVELOPING",
                toStatus: "PENDING_TEST",
                actor: "system",
                note: `已合并到当日分支；变更：${(result.changedFiles ?? []).length} 个文件`,
              },
            }),
          ]);
          await getQueues().llm.add(
            "gen-test-tasks",
            { kind: "gen-test-tasks", requirementId },
            { attempts: 3, backoff: { type: "exponential", delay: 15_000 } },
          );
          // dev-log 自动写入（PRD §3.7）
          const reqFull = await prisma.requirement.findUniqueOrThrow({
            where: { id: requirementId },
            include: { devTask: { include: { claimedBy: true } }, project: true },
          });
          if (reqFull.project) {
            const entry = `\n## ${new Date().toISOString().slice(0, 10)} REQ-${reqFull.seq} ${reqFull.title}\n- 分支：${reqFull.featureBranch}（已并入当日分支）\n- 开发 Agent：${reqFull.devTask?.claimedBy?.username ?? "?"}\n- 变更：${(result.changedFiles ?? []).slice(0, 20).join(", ")}\n- 说明：${reqFull.devTask?.submitNote ?? ""}\n`;
            await getQueues().git.add("append-docs-log", {
              kind: "append-docs-log",
              projectId: reqFull.project.id,
              file: "dev-log.md",
              content: entry,
            });
          }
        } else {
          await prisma.$transaction([
            prisma.devTask.update({ where: { requirementId }, data: { status: "CONFLICT" } }),
            prisma.reqEvent.create({
              data: {
                requirementId,
                fromStatus: "DEVELOPING",
                toStatus: "DEVELOPING",
                actor: "system",
                note: `合并冲突，需人工处理：${(result.conflictFiles ?? []).join(", ").slice(0, 300)}`,
              },
            }),
          ]);
        }
        return;
      }
      case "merge-daily-to-main":
        await mergeDailyToMain(job.data.dailyBranchId);
        return;
      case "append-docs-log": {
        const project = await prisma.project.findUniqueOrThrow({ where: { id: job.data.projectId } });
        const daily = await prisma.dailyBranch.findFirst({
          where: { projectId: project.id },
          orderBy: { date: "desc" },
        });
        await commitFileToBranch(
          project.id,
          daily?.name ?? project.mainBranch,
          `${project.docsDir}/${job.data.file}`,
          job.data.content,
          `docs: update ${job.data.file}`,
          true,
        );
        return;
      }
    }
  },
  { connection: createRedis(), concurrency: 1 },
);

const cronWorker = new Worker(
  "cron",
  async (job) => {
    logger.info({ name: job.name }, "cron tick");
    switch (job.name) {
      case "claim-timeout-scan": {
        // 已实现：释放心跳超时的认领（config.claimTimeoutHours）
        const cutoff = new Date(Date.now() - Number(process.env.CLAIM_TIMEOUT_HOURS || 4) * 3600_000);
        const released = await prisma.devTask.updateMany({
          where: { status: "CLAIMED", lastHeartbeat: { lt: cutoff } },
          data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null },
        });
        const releasedTest = await prisma.testTask.updateMany({
          where: { status: "CLAIMED", lastHeartbeat: { lt: cutoff } },
          data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null },
        });
        if (released.count || releasedTest.count) {
          logger.warn({ dev: released.count, test: releasedTest.count }, "released timed-out claims");
        }
        return;
      }
      case "aggregate-threads":
        await aggregateThreads();
        return;
      case "create-daily-branches": {
        const projects = await prisma.project.findMany({ where: { active: true } });
        const today = new Date().toISOString();
        for (const p of projects) {
          await getQueues().git.add(
            "create-daily-branch",
            { kind: "create-daily-branch", projectId: p.id, date: today },
            { attempts: 3, backoff: { type: "exponential", delay: 30_000 } },
          );
        }
        return;
      }
      case "rank-pools":
        await getQueues().llm.add("rank-pool", { kind: "rank-pool" });
        return;
      case "daily-reports": {
        const projects = await prisma.project.findMany({ where: { active: true } });
        const today = new Date().toISOString();
        for (const p of projects) {
          await getQueues().llm.add(
            "daily-report",
            { kind: "daily-report", projectId: p.id, date: today },
            { attempts: 2, backoff: { type: "exponential", delay: 30_000 } },
          );
        }
        return;
      }
      default:
        // 其余 cron 在对应里程碑接入（M3 分支 / M3 排序 / M5 日报与用量）
        logger.info({ name: job.name }, "cron handler not yet implemented");
    }
  },
  { connection: createRedis(), concurrency: 1 },
);

for (const w of [llmWorker, gitWorker, cronWorker]) {
  w.on("failed", (job, err) => logger.error({ queue: w.name, id: job?.id, err: err.message }, "job failed"));
}

registerCronJobs().catch((e) => {
  logger.error({ err: String(e) }, "failed to register cron jobs");
  process.exit(1);
});

logger.info("worker started (queues: llm, git, cron)");

async function shutdown() {
  logger.info("worker shutting down");
  await Promise.allSettled([llmWorker.close(), gitWorker.close(), cronWorker.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
