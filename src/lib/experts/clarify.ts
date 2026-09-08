import { prisma } from "../db";
import { logger } from "../logger";
import { completeForRole } from "../llm";
import { getQueues } from "../queue";
import { CLARIFY_SYSTEM_PROMPT, CLARIFY_OUTPUT_SCHEMA, type ClarifyOutput } from "../llm/prompts/clarify";

// 客户答复自动关联（PRD #17）：微信会话里存在待确认且有未答澄清问题的需求单时，
// 新线索先交产品专家判断是否为答复；是则回填答案，否则回落常规拆解（parse-thread）。
// 线索（RequirementSource）本身保留，作为答复证据。

interface RawMessage {
  msgId: string;
  type: string;
  text?: string;
  attachmentId?: string;
  ts: string;
}
interface Clarification {
  question: string;
  answer: string | null;
}

const MAX_CANDIDATES = 10;

async function fallbackToParse(threadId: string, reason: string): Promise<void> {
  logger.info({ threadId, reason }, "clarification not applicable, fallback to parse-thread");
  await getQueues().llm.add(
    "parse-thread",
    { kind: "parse-thread", threadId },
    { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
  );
}

/** 同一微信会话下、待确认且仍有未答澄清问题的需求单（最近 N 单） */
export async function openClarificationRequirements(wechatConvId: string, take = MAX_CANDIDATES) {
  const rows = await prisma.requirement.findMany({
    where: { status: "PENDING_CONFIRM", source: { wechatConvId } },
    orderBy: { seq: "desc" },
    take: 50,
  });
  return rows
    .filter((r) => {
      const cs = (r.clarifications as Clarification[] | null) ?? [];
      return Array.isArray(cs) && cs.some((c) => c && !c.answer);
    })
    .slice(0, take)
    .reverse();
}

export async function applyClarification(threadId: string): Promise<void> {
  const source = await prisma.requirementSource.findUnique({ where: { threadId } });
  if (!source) throw new Error(`thread not found: ${threadId}`);
  if (!source.wechatConvId) {
    await fallbackToParse(threadId, "source has no wechatConvId");
    return;
  }

  const candidates = await openClarificationRequirements(source.wechatConvId);
  if (candidates.length === 0) {
    await fallbackToParse(threadId, "no open clarifications in conv");
    return;
  }

  const msgs = (source.rawMessages as unknown as RawMessage[]) ?? [];
  const lines = msgs.map((m) =>
    m.type === "text" && m.text ? `[${m.ts}] ${m.text}` : `[${m.ts}] （发送了${m.type === "image" ? "图片" : "文件"}）`,
  );
  if (lines.length === 0) {
    await fallbackToParse(threadId, "thread has no content");
    return;
  }

  const questionBlock = candidates
    .map((r) => {
      const cs = (r.clarifications as unknown as Clarification[]) ?? [];
      const open = cs
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !c.answer)
        .map(({ c, i }) => `  - questionIndex=${i}：${c.question}`)
        .join("\n");
      return `REQ-${r.seq}「${r.title}」（requirementSeq=${r.seq}）\n${open}`;
    })
    .join("\n\n");

  const userText = `待客户答复的澄清问题：
${questionBlock}

客户在该微信会话的新消息（发送人：${source.senderName ?? "未知"}）：
<客户消息>
${lines.join("\n")}
</客户消息>`;

  const result = await completeForRole(
    "PRODUCT",
    {
      system: CLARIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
      schema: CLARIFY_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 4000,
    },
    { projectId: candidates[0].projectId ?? undefined, requirementId: candidates[0].id },
  );

  const parsed = result.parsed as ClarifyOutput | undefined;
  if (!parsed || typeof parsed.isAnswer !== "boolean") {
    throw new Error(`clarify expert returned unusable output for ${threadId}: ${result.text.slice(0, 300)}`);
  }
  if (!parsed.isAnswer) {
    await fallbackToParse(threadId, `expert says not an answer: ${parsed.note?.slice(0, 120) ?? ""}`);
    return;
  }

  // 按需求单归并答案，只回填仍为空的问题
  const bySeq = new Map(candidates.map((r) => [r.seq, r]));
  const updates = new Map<string, { seq: number; cs: Clarification[]; filled: string[] }>();
  for (const a of parsed.answers ?? []) {
    const r = bySeq.get(a.requirementSeq);
    if (!r || !a.answer?.trim()) continue;
    const entry =
      updates.get(r.id) ??
      { seq: r.seq, cs: ((r.clarifications as unknown as Clarification[]) ?? []).map((c) => ({ ...c })), filled: [] };
    const target = entry.cs[a.questionIndex];
    if (!target || target.answer) continue;
    target.answer = a.answer.trim();
    entry.filled.push(`${target.question} → ${target.answer}`);
    updates.set(r.id, entry);
  }

  if (updates.size === 0) {
    // 模型判定为答复但无法对应到具体问题：留痕不丢，管理员在详情页手动补充
    await prisma.reqEvent.create({
      data: {
        requirementId: candidates[candidates.length - 1].id,
        fromStatus: "PENDING_CONFIRM",
        toStatus: "PENDING_CONFIRM",
        actor: "expert:PRODUCT",
        note: `客户回复未能对应到澄清问题，请人工查看线索 ${threadId}：${lines.join(" / ").slice(0, 200)}`,
      },
    });
    logger.warn({ threadId, note: parsed.note }, "clarification answers could not be mapped");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const [id, u] of updates) {
      await tx.requirement.update({ where: { id }, data: { clarifications: u.cs as object[] } });
      await tx.reqEvent.create({
        data: {
          requirementId: id,
          fromStatus: "PENDING_CONFIRM",
          toStatus: "PENDING_CONFIRM",
          actor: "expert:PRODUCT",
          note: `客户答复澄清问题：${u.filled.join("；")}`.slice(0, 1000),
        },
      });
    }
  });
  logger.info(
    { threadId, requirements: [...updates.values()].map((u) => u.seq), note: parsed.note },
    "clarification answers applied",
  );
  if (parsed.note && /新需求|新的需求|新功能/.test(parsed.note)) {
    logger.info({ threadId, note: parsed.note }, "clarification reply also carries new requirement content");
  }
}
