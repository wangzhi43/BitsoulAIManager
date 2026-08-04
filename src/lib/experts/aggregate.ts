import { randomUUID } from "crypto";
import { prisma } from "../db";
import { logger } from "../logger";
import { config } from "../config";
import { getQueues } from "../queue";

// 消息聚合（PRD §3.2）：同一会话静默超过聚合窗口后，把未归档消息合并为一个需求线索。
// 每分钟由 cron 调用。MENTION/HASHTAG 模式下，窗口内无触发词则整批丢弃（仅归档不建线索）。

export async function aggregateThreads(): Promise<void> {
  const windowMs = config.aggregationWindowMinutes * 60_000;
  const cutoff = new Date(Date.now() - windowMs);

  const groups = await prisma.inboxMessage.groupBy({
    by: ["convId"],
    where: { threadedAt: null },
    _max: { ts: true },
  });

  for (const g of groups) {
    if (!g._max.ts || g._max.ts > cutoff) continue; // 会话还在活跃，继续等

    const messages = await prisma.inboxMessage.findMany({
      where: { convId: g.convId, threadedAt: null },
      orderBy: { ts: "asc" },
    });
    if (messages.length === 0) continue;

    const binding = await prisma.wechatBinding.findUnique({ where: { convId: g.convId } });
    const mode = binding?.captureMode ?? "ALL";
    const triggered =
      mode === "ALL" ||
      messages.some((m) =>
        mode === "HASHTAG" ? (m.text ?? "").includes("#需求") : (m.text ?? "").includes("@"),
      );

    const now = new Date();
    if (!triggered) {
      await prisma.inboxMessage.updateMany({
        where: { id: { in: messages.map((m) => m.id) } },
        data: { threadedAt: now },
      });
      logger.info({ convId: g.convId, count: messages.length, mode }, "messages discarded (no trigger)");
      continue;
    }

    const threadId = `wx-${randomUUID()}`;
    const senderCounts = new Map<string, number>();
    for (const m of messages) {
      if (m.senderName) senderCounts.set(m.senderName, (senderCounts.get(m.senderName) ?? 0) + 1);
    }
    const mainSender = [...senderCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    await prisma.$transaction(async (tx) => {
      const source = await tx.requirementSource.create({
        data: {
          channel: "WECHAT",
          wechatConvId: g.convId,
          senderName: mainSender,
          customerName: binding?.customerName,
          threadId,
          rawMessages: messages.map((m) => ({
            msgId: m.msgId,
            type: m.msgType,
            text: m.text ?? undefined,
            attachmentId: m.attachmentId ?? undefined,
            ts: m.ts.toISOString(),
          })),
        },
      });
      const attIds = messages.map((m) => m.attachmentId).filter((x): x is string => !!x);
      if (attIds.length) {
        await tx.attachment.updateMany({
          where: { id: { in: attIds } },
          data: { sourceId: source.id },
        });
      }
      await tx.inboxMessage.updateMany({
        where: { id: { in: messages.map((m) => m.id) } },
        data: { threadedAt: now },
      });
    });

    await getQueues().llm.add(
      "parse-thread",
      { kind: "parse-thread", threadId },
      { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
    );
    logger.info({ convId: g.convId, threadId, count: messages.length }, "thread created and queued");
  }
}
