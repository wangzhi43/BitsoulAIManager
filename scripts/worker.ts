// BullMQ worker 进程：消费 llm / git / cron 三个队列，注册定时任务。
// 运行：npm run worker（生产：docker compose 中独立容器）

import { Worker } from "bullmq";
import { createRedis, getQueues, CRON_NAMES, type LlmJob, type GitJob, type CronName } from "../src/lib/queue";
import { logger } from "../src/lib/logger";
import { prisma } from "../src/lib/db";
import { audit } from "../src/lib/audit";
import {
  CRON_KEYS,
  claimTimeoutMs,
  getCronPattern,
  getRuntimeNumber,
  invalidateRuntimeConfig,
  type CronKey,
} from "../src/lib/runtime-config";
import { parseThread } from "../src/lib/experts/product";
import { aggregateThreads } from "../src/lib/experts/aggregate";
import { rankPool } from "../src/lib/experts/pm";
import { genTestTasks } from "../src/lib/experts/test";
import { generateDailyReport } from "../src/lib/experts/report";
import { applyClarification } from "../src/lib/experts/clarify";
import { runBuild } from "../src/lib/build";
import {
  createDailyBranch,
  createFeatureBranch,
  mergeFeatureToDaily,
  mergeDailyToMain,
  commitFileToBranch,
  buildBranchSummary,
  excludeFromDaily,
  cherryPickToMain,
  fetchRepo,
} from "../src/lib/git";

const connection = createRedis();

// ---------- 定时任务注册（TECH_DESIGN §8） ----------
// 四个可配项（cronDailyBranch / cronRankPools / cronDailyReport / cronUsageRollup）读 SystemConfig；
// 其余固定。reload-cron 每 5 分钟使缓存失效并重新 upsert（同 id + 新 pattern 即替换）。

const FIXED_CRON: Partial<Record<CronName, string>> = {
  "claim-timeout-scan": "*/10 * * * *", // 每 10 分钟超时扫描
  "aggregate-threads": "* * * * *", // 每分钟：消息聚合成需求线索
  "fetch-repos": "*/5 * * * *", // 每 5 分钟仓库增量 fetch
  "bot-heartbeat-check": "*/5 * * * *", // 每 5 分钟 Bot 心跳检查
  "reload-cron": "*/5 * * * *", // 每 5 分钟重载 cron 配置
};

async function resolveCronPattern(name: CronName): Promise<string> {
  const key = (Object.keys(CRON_KEYS) as CronKey[]).find((k) => CRON_KEYS[k].job === name);
  if (key) return getCronPattern(key);
  const fixed = FIXED_CRON[name];
  if (!fixed) throw new Error(`no cron pattern defined for ${name}`);
  return fixed;
}

const registeredPatterns = new Map<CronName, string>();

/** upsert 全部调度器；pattern 未变化的跳过（首次启动全部注册） */
async function registerCronJobs(): Promise<void> {
  const cron = getQueues().cron;
  const changed: string[] = [];
  for (const name of CRON_NAMES) {
    const pattern = await resolveCronPattern(name);
    if (registeredPatterns.get(name) === pattern) continue;
    await cron.upsertJobScheduler(name, { pattern, tz: "Asia/Shanghai" }, { name });
    registeredPatterns.set(name, pattern);
    changed.push(`${name}=${pattern}`);
  }
  if (changed.length) logger.info({ changed }, "cron schedulers upserted");
}

// ---------- 通用入队 ----------

/** 刷新分支摘要：同一 daily 去重（等待中的不重复加；执行中的结束后再补一次） */
async function enqueueRefreshSummary(dailyBranchId: string | null | undefined): Promise<void> {
  if (!dailyBranchId) return;
  await getQueues().git.add(
    "refresh-branch-summary",
    { kind: "refresh-branch-summary", dailyBranchId },
    { deduplication: { id: `refresh-branch-summary:${dailyBranchId}`, keepLastIfActive: true }, removeOnComplete: true, removeOnFail: 50 },
  );
}

/** 向项目负责人会话（pushDailyReport=true 且未暂停）投递微信消息 */
async function notifyProjectOwners(projectId: string, text: string): Promise<number> {
  const receivers = await prisma.wechatBinding.findMany({
    where: { projectId, pushDailyReport: true, paused: false },
  });
  for (const b of receivers) {
    await prisma.wechatOutbox.create({ data: { convId: b.convId, content: text } });
  }
  return receivers.length;
}

// ---------- 处理器 ----------

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
      case "daily-report": {
        await generateDailyReport(job.data.projectId, job.data.date);
        // 推送到勾选了日报的微信会话（PRD #36）
        const proj = await prisma.project.findUnique({ where: { id: job.data.projectId } });
        const dayStart = new Date(job.data.date); dayStart.setHours(0, 0, 0, 0);
        const rep = await prisma.dailyReport.findUnique({
          where: { projectId_date: { projectId: job.data.projectId, date: dayStart } },
        });
        if (proj && rep) {
          const c = rep.content as { done: string[]; inProgress: string[]; blocked: string[]; forecast: string; risks: string[] };
          const text = [
            `【${proj.name}】${dayStart.toISOString().slice(0, 10)} 进度日报`,
            c.done.length ? `✅ 今日完成
${c.done.map((x) => `· ${x}`).join("\n")}` : "",
            c.inProgress.length ? `⚙️ 进行中
${c.inProgress.map((x) => `· ${x}`).join("\n")}` : "",
            c.blocked.length ? `⚠️ 受阻
${c.blocked.map((x) => `· ${x}`).join("\n")}` : "",
            `📅 明日预测：${c.forecast}`,
            c.risks.length ? `❗ 风险：${c.risks.join("；")}` : "",
          ].filter(Boolean).join("\n\n");
          const n = await notifyProjectOwners(proj.id, text);
          if (n > 0) {
            await prisma.dailyReport.update({ where: { id: rep.id }, data: { pushed: true } });
            logger.info({ project: proj.name, receivers: n }, "daily report queued to wechat");
          }
        }
        return;
      }
      case "apply-clarification":
        // 微信客户答复澄清问题 → 回填需求单；判定为新需求时模块内部回落 parse-thread
        await applyClarification(job.data.threadId);
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
      case "create-daily-branch": {
        const { projectId } = job.data;
        const name = await createDailyBranch(projectId, new Date(job.data.date));
        const daily = await prisma.dailyBranch.findUnique({ where: { projectId_name: { projectId, name } } });
        await enqueueRefreshSummary(daily?.id); // 让审查页立刻有 baseCommit
        return;
      }
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
          await enqueueRefreshSummary(reqFull.dailyBranchId);
        } else {
          const files = result.conflictFiles ?? [];
          await prisma.$transaction([
            prisma.devTask.update({ where: { requirementId }, data: { status: "CONFLICT" } }),
            prisma.reqEvent.create({
              data: {
                requirementId,
                fromStatus: "DEVELOPING",
                toStatus: "DEVELOPING",
                actor: "system",
                note: `合并冲突，需人工处理：${files.join(", ").slice(0, 300)}`,
              },
            }),
          ]);
          // 冲突告警推送到负责人会话（PRD #24）
          const reqC = await prisma.requirement.findUniqueOrThrow({
            where: { id: requirementId },
            include: { project: true },
          });
          if (reqC.project) {
            const shown = files.slice(0, 8).join("、") + (files.length > 8 ? ` 等 ${files.length} 个文件` : "");
            const n = await notifyProjectOwners(
              reqC.project.id,
              `【${reqC.project.name}】REQ-${reqC.seq} ${reqC.title} 合并冲突：${shown || "（无冲突文件列表）"}，请管理员到分支审查页处理`,
            );
            logger.warn({ req: reqC.seq, receivers: n }, "merge conflict notified");
          }
        }
        return;
      }
      case "merge-daily-to-main": {
        const { dailyBranchId } = job.data;
        const result = await mergeDailyToMain(dailyBranchId);
        if (!result.ok) {
          const daily = await prisma.dailyBranch.findUnique({ where: { id: dailyBranchId } });
          await audit(
            "system",
            "merge-daily-to-main-conflict",
            daily?.name ?? dailyBranchId,
            `冲突文件：${(result.conflictFiles ?? []).join(", ").slice(0, 400)}`,
          );
        }
        await enqueueRefreshSummary(dailyBranchId);
        return;
      }
      case "refresh-branch-summary":
        await buildBranchSummary(job.data.dailyBranchId);
        return;
      case "exclude-from-daily": {
        const { requirementId } = job.data;
        const req = await prisma.requirement.findUniqueOrThrow({
          where: { id: requirementId },
          include: { devTask: true },
        });
        let result;
        try {
          result = await excludeFromDaily(requirementId);
        } catch (e) {
          const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
          await prisma.reqEvent.create({
            data: { requirementId, fromStatus: req.status, toStatus: req.status, actor: "system", note: `剔除失败：${msg}` },
          });
          throw e;
        }
        if (result.ok) {
          const note = result.revertSha
            ? `已从当日分支剔除（revert ${result.revertSha}），回待开发池`
            : "当日分支上无该需求的合并提交，无需 revert；回待开发池";
          await prisma.$transaction(async (tx) => {
            await tx.requirement.update({ where: { id: requirementId }, data: { status: "READY" } });
            if (req.devTask) {
              await tx.devTask.update({
                where: { requirementId },
                data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null, submittedAt: null },
              });
            }
            await tx.testTask.updateMany({
              where: { requirementId, status: { in: ["POOL", "CLAIMED"] } },
              data: { status: "DONE", claimedById: null },
            });
            await tx.reqEvent.create({
              data: { requirementId, fromStatus: req.status, toStatus: "READY", actor: "system", note },
            });
          });
        } else {
          await prisma.reqEvent.create({
            data: {
              requirementId,
              fromStatus: req.status,
              toStatus: req.status,
              actor: "system",
              note: `剔除失败，revert 冲突需人工处理：${(result.conflictFiles ?? []).join(", ").slice(0, 300)}`,
            },
          });
        }
        await enqueueRefreshSummary(req.dailyBranchId);
        return;
      }
      case "cherry-pick-to-main": {
        const { requirementId } = job.data;
        const req = await prisma.requirement.findUniqueOrThrow({ where: { id: requirementId } });
        let result;
        try {
          result = await cherryPickToMain(requirementId);
        } catch (e) {
          const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
          await prisma.reqEvent.create({
            data: { requirementId, fromStatus: req.status, toStatus: req.status, actor: "system", note: `单独合入 main 失败：${msg}` },
          });
          throw e;
        }
        await prisma.reqEvent.create({
          data: {
            requirementId,
            fromStatus: req.status,
            toStatus: req.status,
            actor: "system",
            note: result.ok
              ? `已单独合入 main（${result.sha}${result.via === "merge" ? "，直接合并 feature" : ""}）`
              : `单独合入 main 冲突需人工处理：${(result.conflictFiles ?? []).join(", ").slice(0, 300)}`,
          },
        });
        await enqueueRefreshSummary(req.dailyBranchId);
        return;
      }
      case "run-build":
        // 体验包构建（ADR-003）：与其它 git 操作同队列串行，避免构建期间仓库被切分支
        await runBuild(job.data.buildRunId);
        return;
      case "fetch-repos": {
        const projects = await prisma.project.findMany({ where: { active: true } });
        for (const p of projects) {
          try {
            await fetchRepo(p);
          } catch (e) {
            logger.warn({ project: p.name, err: String(e instanceof Error ? e.message : e).slice(0, 200) }, "fetch repo failed");
          }
        }
        return;
      }
      case "write-repo-file": {
        const proj = await prisma.project.findUniqueOrThrow({ where: { id: job.data.projectId } });
        const latestDaily = await prisma.dailyBranch.findFirst({
          where: { projectId: proj.id },
          orderBy: { date: "desc" },
        });
        await commitFileToBranch(
          proj.id,
          latestDaily?.name ?? proj.mainBranch,
          `${proj.docsDir}/${job.data.file}`,
          job.data.content,
          `docs: update ${job.data.file}`,
          false,
        );
        return;
      }
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
    switch (job.name as CronName) {
      case "claim-timeout-scan": {
        // 释放心跳超时的认领，并把需求状态一起回退（之前只翻任务行，需求状态会卡在开发中/测试中）
        const cutoff = new Date(Date.now() - (await claimTimeoutMs()));
        const devTasks = await prisma.devTask.findMany({
          where: { status: "CLAIMED", lastHeartbeat: { lt: cutoff } },
          include: { requirement: { select: { status: true } } },
        });
        for (const t of devTasks) {
          await prisma.$transaction([
            prisma.devTask.update({
              where: { id: t.id },
              data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null },
            }),
            prisma.requirement.updateMany({
              where: { id: t.requirementId, status: "DEVELOPING" },
              data: { status: "READY" },
            }),
            prisma.reqEvent.create({
              data: {
                requirementId: t.requirementId,
                fromStatus: t.requirement.status,
                toStatus: "READY",
                actor: "system",
                note: "心跳超时，自动释放回池",
              },
            }),
          ]);
        }
        const testTasks = await prisma.testTask.findMany({
          where: { status: "CLAIMED", lastHeartbeat: { lt: cutoff } },
          include: { requirement: { select: { status: true } } },
        });
        for (const t of testTasks) {
          await prisma.$transaction([
            prisma.testTask.update({
              where: { id: t.id },
              data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null },
            }),
            prisma.requirement.updateMany({
              where: { id: t.requirementId, status: "TESTING" },
              data: { status: "PENDING_TEST" },
            }),
            prisma.reqEvent.create({
              data: {
                requirementId: t.requirementId,
                fromStatus: t.requirement.status,
                toStatus: "PENDING_TEST",
                actor: "system",
                note: "测试任务心跳超时，自动释放回池",
              },
            }),
          ]);
        }
        if (devTasks.length || testTasks.length) {
          logger.warn({ dev: devTasks.length, test: testTasks.length }, "released timed-out claims");
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
      case "usage-rollup": {
        const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        const yStart = new Date(dayStart.getTime() - 86400_000);
        const agg = await prisma.llmUsageLog.aggregate({
          _sum: { inputTokens: true, outputTokens: true },
          where: { createdAt: { gte: yStart, lt: dayStart } },
        });
        const total = (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
        const limit = await getRuntimeNumber("dailyTokenLimit");
        if (limit > 0 && total > limit) {
          const value = JSON.stringify({ date: yStart.toISOString().slice(0, 10), total, limit });
          await prisma.systemConfig.upsert({
            where: { key: "usageAlert" },
            update: { value },
            create: { key: "usageAlert", value },
          });
          await audit("system", "usage-limit-exceeded", undefined, `昨日 ${total.toLocaleString()} tokens，超过上限 ${limit.toLocaleString()}`);
          logger.warn({ total, limit }, "daily token usage exceeded limit");
        }
        logger.info({ total }, "usage rollup done");
        return;
      }
      case "fetch-repos":
        // 走 git 队列，与其他 git 操作串行
        await getQueues().git.add(
          "fetch-repos",
          { kind: "fetch-repos" },
          { deduplication: { id: "fetch-repos" }, removeOnComplete: true, removeOnFail: 20 },
        );
        return;
      case "bot-heartbeat-check": {
        // 心跳超阈值（或从未心跳但存在启用的微信绑定）→ 写 wechatBotAlert；恢复则删除；首次进入告警写审计
        const [lastSeenRow, alertRow, activeBindings, thresholdMin] = await Promise.all([
          prisma.systemConfig.findUnique({ where: { key: "wechatBotLastSeen" } }),
          prisma.systemConfig.findUnique({ where: { key: "wechatBotAlert" } }),
          prisma.wechatBinding.count({ where: { paused: false } }),
          getRuntimeNumber("botHeartbeatAlertMinutes"),
        ]);
        const lastSeen = lastSeenRow ? new Date(lastSeenRow.value) : null;
        const validLastSeen = lastSeen && !Number.isNaN(lastSeen.getTime()) ? lastSeen : null;
        const stale = validLastSeen
          ? Date.now() - validLastSeen.getTime() > thresholdMin * 60_000
          : activeBindings > 0;
        if (stale) {
          const value = JSON.stringify({ since: validLastSeen?.toISOString() ?? null, checkedAt: new Date().toISOString() });
          await prisma.systemConfig.upsert({
            where: { key: "wechatBotAlert" },
            update: { value },
            create: { key: "wechatBotAlert", value },
          });
          if (!alertRow) {
            await audit(
              "system",
              "wechat-bot-offline",
              undefined,
              validLastSeen ? `最后心跳 ${validLastSeen.toISOString()}，超过 ${thresholdMin} 分钟` : "从未收到心跳",
            );
            logger.warn({ lastSeen: validLastSeen?.toISOString() ?? null, thresholdMin }, "wechat bot offline");
          }
        } else if (alertRow) {
          await prisma.systemConfig.delete({ where: { key: "wechatBotAlert" } }).catch(() => {});
          logger.info("wechat bot back online");
        }
        return;
      }
      case "reload-cron":
        invalidateRuntimeConfig();
        await registerCronJobs();
        return;
      default:
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
