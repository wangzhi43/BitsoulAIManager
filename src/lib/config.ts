// 环境变量集中读取。缺失必填项在首次使用时报错，而非启动时静默。
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get redisUrl() {
    return process.env.REDIS_URL || "redis://127.0.0.1:6379";
  },
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  /** API Key 等敏感配置的加密主密钥（32 字节 hex） */
  get masterKey() {
    return required("MASTER_KEY");
  },
  get ingestHmacSecret() {
    return required("INGEST_HMAC_SECRET");
  },
  get githubBotPat() {
    return process.env.GITHUB_BOT_PAT || "";
  },
  /** 需求线索聚合窗口（分钟） */
  aggregationWindowMinutes: Number(process.env.AGG_WINDOW_MINUTES || 30),
  /** 认领心跳超时（小时） */
  claimTimeoutHours: Number(process.env.CLAIM_TIMEOUT_HOURS || 4),
  /** 体验包产物目录（ADR-003） */
  buildsDir: process.env.BUILDS_DIR || "/data/builds",
  /** 体验包构建超时（分钟） */
  buildTimeoutMinutes: Number(process.env.BUILD_TIMEOUT_MINUTES || 30),
  adminJwtHours: 12,
  agentTokenDays: 7,
};
