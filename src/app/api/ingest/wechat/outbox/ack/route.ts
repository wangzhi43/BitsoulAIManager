import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { verifyIngestSignature } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// 插件回执（ADR-003 失败态）：
// - 兼容旧格式 { ids }：全部视为发送成功
// - 新格式 { results: [{ id, ok, error? }] }：失败累加 attempts，达到 MAX_ATTEMPTS 置 failedAt 停止下发

const MAX_ATTEMPTS = 5;

const Body = z.object({
  ids: z.array(z.string()).optional(),
  results: z.array(z.object({ id: z.string(), ok: z.boolean(), error: z.string().max(500).optional() })).optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const timestamp = req.headers.get("x-ingest-timestamp") || "";
  const signature = req.headers.get("x-ingest-signature") || "";
  if (!verifyIngestSignature(raw, timestamp, signature)) {
    return apiError("unauthorized", "bad signature");
  }
  const parsed = Body.safeParse(JSON.parse(raw));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);

  const okIds = [...(parsed.data.ids ?? []), ...(parsed.data.results ?? []).filter((r) => r.ok).map((r) => r.id)];
  const failed = (parsed.data.results ?? []).filter((r) => !r.ok);
  if (okIds.length === 0 && failed.length === 0) return apiError("bad_request", "ids or results required");

  if (okIds.length) {
    await prisma.wechatOutbox.updateMany({ where: { id: { in: okIds }, sentAt: null }, data: { sentAt: new Date() } });
  }
  let dead = 0;
  for (const f of failed) {
    const row = await prisma.wechatOutbox.findUnique({ where: { id: f.id } });
    if (!row || row.sentAt) continue;
    const attempts = row.attempts + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    if (giveUp) dead += 1;
    await prisma.wechatOutbox.update({
      where: { id: f.id },
      data: { attempts, lastError: f.error?.slice(0, 500) ?? "send failed", failedAt: giveUp ? new Date() : null },
    });
  }
  if (dead > 0) {
    await prisma.auditLog.create({ data: { actor: "system", action: "wechat-outbox-dead", detail: `${dead} 条微信消息连续 ${MAX_ATTEMPTS} 次发送失败，已停止下发` } }).catch(() => {});
  }
  return apiOk({ ok: true, sent: okIds.length, failed: failed.length, dead });
}
