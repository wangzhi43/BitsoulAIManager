import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { verifyIngestSignature } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// 反向通道（TECH_DESIGN §7）：Bot 轮询取走待发微信消息。
// GET 请求签名基于 `${timestamp}.outbox`

export async function GET(req: NextRequest) {
  const timestamp = req.headers.get("x-ingest-timestamp") || "";
  const signature = req.headers.get("x-ingest-signature") || "";
  if (!verifyIngestSignature("outbox", timestamp, signature)) {
    return apiError("unauthorized", "bad signature");
  }

  const items = await prisma.wechatOutbox.findMany({
    where: { sentAt: null },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  return apiOk({ items: items.map((i) => ({ id: i.id, convId: i.convId, content: i.content })) });
}
