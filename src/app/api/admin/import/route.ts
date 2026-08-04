import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";

export const dynamic = "force-dynamic";

// 手动导入需求（PRD 入口 B）：粘贴文本 + 可选附件（先经 /api/admin/upload 上传拿 id）

const Body = z.object({
  text: z.string().min(1),
  customerName: z.string().optional(),
  attachmentIds: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const { text, customerName, attachmentIds } = parsed.data;

  const threadId = `manual-${randomUUID()}`;
  const now = new Date().toISOString();

  const source = await prisma.requirementSource.create({
    data: {
      channel: "MANUAL",
      senderName: admin.displayName,
      customerName,
      threadId,
      rawMessages: [
        { msgId: threadId, type: "text", text, ts: now },
        ...attachmentIds.map((id, i) => ({
          msgId: `${threadId}-att${i}`,
          type: "file",
          attachmentId: id,
          ts: now,
        })),
      ],
    },
  });
  if (attachmentIds.length) {
    await prisma.attachment.updateMany({
      where: { id: { in: attachmentIds } },
      data: { sourceId: source.id },
    });
  }

  await getQueues().llm.add(
    "parse-thread",
    { kind: "parse-thread", threadId },
    { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
  );

  return apiOk({ threadId, sourceId: source.id });
}
