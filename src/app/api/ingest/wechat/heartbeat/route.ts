import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { verifyIngestSignature } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// Bot 心跳：每分钟一次；看板据 SystemConfig.wechatBotLastSeen 判断通道健康

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const timestamp = req.headers.get("x-ingest-timestamp") || "";
  const signature = req.headers.get("x-ingest-signature") || "";
  if (!verifyIngestSignature(raw, timestamp, signature)) {
    return apiError("unauthorized", "bad signature");
  }
  await prisma.systemConfig.upsert({
    where: { key: "wechatBotLastSeen" },
    update: { value: new Date().toISOString() },
    create: { key: "wechatBotLastSeen", value: new Date().toISOString() },
  });
  return apiOk({ ok: true });
}
