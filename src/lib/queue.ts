import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config";

// 队列定义（TECH_DESIGN §1/§8）。
// - llm:   专家 Agent 调用（拆解/排序/出题/摘要/澄清回填）
// - git:   分支操作，worker 侧串行执行
// - cron:  定时任务（repeatable jobs 注册在 scripts/worker.ts）

export type LlmJob =
  | { kind: "parse-thread"; threadId: string; rejectReason?: string }
  | { kind: "rank-pool"; projectId?: string }
  | { kind: "gen-test-tasks"; requirementId: string }
  | { kind: "daily-report"; projectId: string; date: string }
  /** 微信客户对澄清问题的答复 → 回填到需求单（PRD #17）；判定为新需求时回落 parse-thread */
  | { kind: "apply-clarification"; threadId: string };

export type GitJob =
  | { kind: "create-daily-branch"; projectId: string; date: string }
  | { kind: "create-feature-branch"; requirementId: string }
  | { kind: "merge-feature-to-daily"; requirementId: string }
  | { kind: "merge-daily-to-main"; dailyBranchId: string }
  | { kind: "append-docs-log"; projectId: string; file: string; content: string }
  | { kind: "write-repo-file"; projectId: string; file: string; content: string }
  /** 用真实 git diff/log 刷新 DailyBranch.reviewSummary（分支审查页数据源） */
  | { kind: "refresh-branch-summary"; dailyBranchId: string }
  /** 剔除：revert 该需求在 daily 上的合并提交，需求回待开发池（PRD #26） */
  | { kind: "exclude-from-daily"; requirementId: string }
  /** 单需求 cherry-pick 到 main（PRD #26） */
  | { kind: "cherry-pick-to-main"; requirementId: string }
  /** 所有活跃项目仓库增量 fetch（TECH_DESIGN §8 每 5 分钟） */
  | { kind: "fetch-repos" }
  /** 体验包构建（ADR-003）：在服务端 clone 上执行 buildCommand 并打包 $BUILD_OUT */
  | { kind: "run-build"; buildRunId: string };

/** cron 队列的 job name 列表（worker 注册；时间可在 SystemConfig 覆盖） */
export const CRON_NAMES = [
  "create-daily-branches",
  "rank-pools",
  "daily-reports",
  "claim-timeout-scan",
  "aggregate-threads",
  "usage-rollup",
  "fetch-repos",
  "bot-heartbeat-check",
  "reload-cron",
] as const;
export type CronName = (typeof CRON_NAMES)[number];

export function createRedis() {
  return new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
}

let queues: { llm: Queue<LlmJob>; git: Queue<GitJob>; cron: Queue } | null = null;

export function getQueues() {
  if (!queues) {
    const connection = createRedis();
    queues = {
      llm: new Queue<LlmJob>("llm", { connection }),
      git: new Queue<GitJob>("git", { connection }),
      cron: new Queue("cron", { connection }),
    };
  }
  return queues;
}

/** 队列积压概览（工作台「系统状态」用） */
export async function getQueueDepths(): Promise<{ llm: number; git: number; failed: number }> {
  const q = getQueues();
  const [llmW, llmA, gitW, gitA, llmF, gitF] = await Promise.all([
    q.llm.getWaitingCount(),
    q.llm.getActiveCount(),
    q.git.getWaitingCount(),
    q.git.getActiveCount(),
    q.llm.getFailedCount(),
    q.git.getFailedCount(),
  ]);
  return { llm: llmW + llmA, git: gitW + gitA, failed: llmF + gitF };
}
