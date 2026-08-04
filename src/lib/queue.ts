import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config";

// 队列定义（TECH_DESIGN §1/§8）。
// - llm:   专家 Agent 调用（拆解/排序/出题/摘要）
// - git:   分支操作，按 projectId 串行（worker 侧用分组锁保证）
// - cron:  定时任务（repeatable jobs 注册在 scripts/worker.ts）

export type LlmJob =
  | { kind: "parse-thread"; threadId: string }
  | { kind: "rank-pool"; projectId?: string }
  | { kind: "gen-test-tasks"; requirementId: string }
  | { kind: "daily-report"; projectId: string; date: string };

export type GitJob =
  | { kind: "create-daily-branch"; projectId: string; date: string }
  | { kind: "create-feature-branch"; requirementId: string }
  | { kind: "merge-feature-to-daily"; requirementId: string }
  | { kind: "merge-daily-to-main"; dailyBranchId: string }
  | { kind: "append-docs-log"; projectId: string; file: string; content: string };

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
