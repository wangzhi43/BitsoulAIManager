import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { config } from "./config";

// AES-256-GCM：用于 LLM API Key 等敏感配置入库前加密
// 密文格式：base64(iv[12] + tag[16] + ciphertext)

function key(): Buffer {
  const k = Buffer.from(config.masterKey, "hex");
  if (k.length !== 32) throw new Error("MASTER_KEY must be 32 bytes hex (64 hex chars)");
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

/** Ingest 通道 HMAC 签名校验（微信 Bot → 平台） */
export function verifyIngestSignature(rawBody: string, timestamp: string, signature: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false; // ±5 分钟防重放
  const expected = createHmac("sha256", config.ingestHmacSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
