import { prisma } from "./db";
import { config } from "./config";

// 运行期可调参数（PRD #39）：SystemConfig 优先，env 兜底，60 秒内存缓存。
// 管理界面「系统参数」写入的键在这里被真正消费；新增键先在 KEYS 登记再用。

export const RUNTIME_KEYS = {
  /** 微信聚合窗口（分钟） */
  aggWindowMinutes: { env: "AGG_WINDOW_MINUTES", fallback: 30 },
  /** 认领心跳超时（小时） */
  claimTimeoutHours: { env: "CLAIM_TIMEOUT_HOURS", fallback: 4 },
  /** LLM 日消耗上限（tokens，0=不限） */
  dailyTokenLimit: { env: "DAILY_TOKEN_LIMIT", fallback: 0 },
  /** 同一需求开发/测试互斥（1=开） */
  devTestExclusive: { env: "DEV_TEST_EXCLUSIVE", fallback: 1 },
  /** Bot 心跳告警阈值（分钟） */
  botHeartbeatAlertMinutes: { env: "BOT_HEARTBEAT_ALERT_MINUTES", fallback: 5 },
} as const;
export type RuntimeNumberKey = keyof typeof RUNTIME_KEYS;

/** 定时任务 cron 表达式（可在系统参数覆盖） */
export const CRON_KEYS = {
  cronDailyBranch: { job: "create-daily-branches", fallback: "0 2 * * *" },
  cronRankPools: { job: "rank-pools", fallback: "0 3 * * *" },
  cronDailyReport: { job: "daily-reports", fallback: "0 21 * * *" },
  cronUsageRollup: { job: "usage-rollup", fallback: "0 4 * * *" },
} as const;
export type CronKey = keyof typeof CRON_KEYS;

/** 字符串型参数 */
export const STRING_KEYS = {
  /** 微信机器人昵称（MENTION 触发模式匹配 @昵称） */
  wechatBotName: { fallback: "" },
  /** Web 表单入口令牌（空=关闭入口） */
  webFormToken: { fallback: "" },
  /** LLM 单价表 JSON：{ "model": { "input": 每百万 token 美元, "output": ... } } */
  llmPrices: { fallback: "" },
} as const;
export type StringKey = keyof typeof STRING_KEYS;

const TTL_MS = 60_000;
let cache: { at: number; rows: Map<string, string> } | null = null;

async function rows(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const keys = [...Object.keys(RUNTIME_KEYS), ...Object.keys(CRON_KEYS), ...Object.keys(STRING_KEYS)];
  const found = await prisma.systemConfig.findMany({ where: { key: { in: keys } } });
  cache = { at: Date.now(), rows: new Map(found.map((r) => [r.key, r.value])) };
  return cache.rows;
}

/** 使缓存失效（系统参数保存后调用） */
export function invalidateRuntimeConfig(): void {
  cache = null;
}

export async function getRuntimeNumber(key: RuntimeNumberKey): Promise<number> {
  const r = await rows();
  const v = r.get(key);
  if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  const spec = RUNTIME_KEYS[key];
  const env = process.env[spec.env];
  if (env != null && env !== "" && !Number.isNaN(Number(env))) return Number(env);
  return spec.fallback;
}

export async function getCronPattern(key: CronKey): Promise<string> {
  const r = await rows();
  const v = r.get(key)?.trim();
  return v && v.split(/\s+/).length === 5 ? v : CRON_KEYS[key].fallback;
}

export async function getRuntimeString(key: StringKey): Promise<string> {
  const r = await rows();
  return r.get(key) ?? STRING_KEYS[key].fallback;
}

/** 一次性读取全部（设置页展示用） */
export async function getRuntimeConfigSnapshot(): Promise<{
  numbers: Record<RuntimeNumberKey, number>;
  crons: Record<CronKey, string>;
  strings: Record<StringKey, string>;
  overridden: string[];
}> {
  const r = await rows();
  const numbers = {} as Record<RuntimeNumberKey, number>;
  for (const k of Object.keys(RUNTIME_KEYS) as RuntimeNumberKey[]) numbers[k] = await getRuntimeNumber(k);
  const crons = {} as Record<CronKey, string>;
  for (const k of Object.keys(CRON_KEYS) as CronKey[]) crons[k] = await getCronPattern(k);
  const strings = {} as Record<StringKey, string>;
  for (const k of Object.keys(STRING_KEYS) as StringKey[]) strings[k] = await getRuntimeString(k);
  return { numbers, crons, strings, overridden: [...r.keys()] };
}

// ---------- LLM 单价表（ADR-003：写入 LlmUsageLog.costEstimate 与看板估算共用） ----------

export type PriceTable = Record<string, { input: number; output: number }>;

/** 解析 llmPrices：{ model: { input, output } }（每百万 token 美元），非法返回 null */
export function parseLlmPrices(raw: string): PriceTable | null {
  if (!raw.trim()) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, { input?: unknown; output?: unknown }>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out: PriceTable = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v.input === "number" && typeof v.output === "number") out[k] = { input: v.input, output: v.output };
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** 精确匹配优先，其次前缀匹配（如 "claude-sonnet-5" 命中 "claude-sonnet-5-20260101"） */
export function priceFor(prices: PriceTable, model: string): { input: number; output: number } | null {
  if (prices[model]) return prices[model];
  const key = Object.keys(prices).find((k) => model.startsWith(k) || k.startsWith(model));
  return key ? prices[key] : null;
}

/** 按单价表估算一次调用成本（美元）；无单价返回 null */
export function estimateLlmCost(prices: PriceTable | null, model: string, inputTokens: number, outputTokens: number): number | null {
  if (!prices) return null;
  const p = priceFor(prices, model);
  if (!p) return null;
  return Math.round(((inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output) * 1e6) / 1e6;
}

export async function getLlmPrices(): Promise<PriceTable | null> {
  return parseLlmPrices(await getRuntimeString("llmPrices"));
}

/** 认领超时毫秒数（供 API/worker 复用） */
export async function claimTimeoutMs(): Promise<number> {
  return (await getRuntimeNumber("claimTimeoutHours")) * 3600_000;
}

// 保持对旧 config 的引用，避免未使用告警；env 读取仍由 config 统一
void config;
