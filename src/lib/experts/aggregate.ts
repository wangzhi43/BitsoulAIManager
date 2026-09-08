import { randomUUID } from "crypto";
import { prisma } from "../db";
import { logger } from "../logger";
import { getQueues } from "../queue";
import { getRuntimeNumber, getRuntimeString } from "../runtime-config";
import { openClarificationRequirements } from "./clarify";

// 消息聚合（PRD §3.2）：同一会话静默超过聚合窗口后，把未归档消息合并为一个需求线索。
// 每分钟由 cron 调用。MENTION/HASHTAG 模式下，窗口内无触发词则整批丢弃（仅归档不建线索）。
// 线索建好后：若该会话有待答澄清问题且 48h 内发过澄清文案，先走 apply-clarification（PRD #17），否则 parse-thread。

const CLARIFY_WINDOW_MS = 48 * 3600_000;

/** MENTION 模式触发词：@机器人昵称（系统参数 wechatBotName）或 @所有人；昵称未配置时退化为任意 @ */
function mentionTriggered(text: string, botName: string): boolean {
  if (text.includes("@所有人")) return true;
  return botName ? text.includes(`@${botName}`) : text.includes("@");
}

export async function aggregateThreads(): Promise<void> {
  const windowMs = (await getRuntimeNumber("aggWindowMinutes")) * 60_000;
  const cutoff = new Date(Date.now() - windowMs);
  const botName = (await getRuntimeString("wechatBotName")).trim();

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
        mode === "HASHTAG" ? (m.text ?? "").includes("#需求") : mentionTriggered(m.text ?? "", botName),
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

    const kind = (await shouldApplyClarification(g.convId)) ? "apply-clarification" : "parse-thread";
    await getQueues().llm.add(
      kind,
      { kind, threadId },
      { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
    );
    logger.info({ convId: g.convId, threadId, count: messages.length, kind }, "thread created and queued");
  }
}

/** 会话内有未答澄清问题，且 48h 内向该会话发过澄清文案 → 新消息优先按答复处理 */
async function shouldApplyClarification(convId: string): Promise<boolean> {
  const open = await openClarificationRequirements(convId, 1);
  if (open.length === 0) return false;
  const recentOutbox = await prisma.wechatOutbox.findFirst({
    where: { convId, createdAt: { gte: new Date(Date.now() - CLARIFY_WINDOW_MS) } },
    select: { id: true },
  });
  return !!recentOutbox;
}
