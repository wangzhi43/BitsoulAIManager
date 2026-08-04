import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { verifyIngestSignature } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// OpenClaw Bot → 平台：单条微信消息入库（至少一次投递，按 msgId 幂等）
// Headers: x-ingest-timestamp（unix 秒）、x-ingest-signature（hmac-sha256 hex）

const Body = z.object({
  msgId: z.string().min(1),
  convId: z.string().min(1),
  convName: z.string().optional(),
  sender: z.string().optional(),
  msgType: z.enum(["text", "image", "file"]),
  text: z.string().optional(),
  attachmentId: z.string().optional(),
  ts: z.number(), // unix 秒
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
  const m = parsed.data;

  // 白名单：只接受已绑定且未暂停的会话
  const binding = await prisma.wechatBinding.findUnique({ where: { convId: m.convId } });
  if (!binding || binding.paused) return apiOk({ accepted: false, reason: "conv not bound or paused" });

  await prisma.inboxMessage.upsert({
    where: { msgId: m.msgId },
    update: {},
    create: {
      msgId: m.msgId,
      convId: m.convId,
      convName: m.convName,
      senderName: m.sender,
      msgType: m.msgType,
      text: m.text,
      attachmentId: m.attachmentId,
      ts: new Date(m.ts * 1000),
    },
  });

  return apiOk({ accepted: true });
}
