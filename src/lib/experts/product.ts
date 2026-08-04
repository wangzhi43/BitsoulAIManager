import { readFile } from "fs/promises";
import { prisma } from "../db";
import { logger } from "../logger";
import { completeForRole, type ChatContent } from "../llm";
import {
  PRODUCT_SYSTEM_PROMPT,
  PRODUCT_OUTPUT_SCHEMA,
  type ProductParseOutput,
} from "../llm/prompts/product";
import { isImageMime } from "../uploads";

// 产品专家：把需求线索（RequirementSource）拆解为需求单。
// 幂等策略：重复执行会先关闭该线索下未定稿的旧需求单再重建（用于驳回重拆）。

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

interface RawMessage {
  msgId: string;
  type: string;
  text?: string;
  attachmentId?: string;
  ts: string;
}

export async function parseThread(threadId: string, rejectReason?: string): Promise<void> {
  const source = await prisma.requirementSource.findUnique({
    where: { threadId },
    include: { attachments: true },
  });
  if (!source) throw new Error(`thread not found: ${threadId}`);

  const projects = await prisma.project.findMany({ where: { active: true } });
  const binding = source.wechatConvId
    ? await prisma.wechatBinding.findUnique({ where: { convId: source.wechatConvId } })
    : null;

  // 组装消息内容（文本 + 图片，文档只附文件名提示）
  const msgs = (source.rawMessages as unknown as RawMessage[]) ?? [];
  const lines: string[] = [];
  const images: ChatContent[] = [];
  for (const m of msgs) {
    if (m.type === "text" && m.text) {
      lines.push(`[${m.ts}] ${m.text}`);
    } else if (m.attachmentId) {
      const att = source.attachments.find((a) => a.id === m.attachmentId)
        ?? (await prisma.attachment.findUnique({ where: { id: m.attachmentId } }));
      if (!att) continue;
      if (isImageMime(att.mime) && images.length < MAX_IMAGES && att.size <= MAX_IMAGE_BYTES) {
        try {
          const data = await readFile(att.path);
          images.push({ type: "image", mediaType: att.mime, base64: data.toString("base64") });
          lines.push(`[${m.ts}] （发送了图片 ${att.filename}，见附图 ${images.length}）`);
        } catch (e) {
          logger.warn({ att: att.id, err: String(e) }, "failed to read image attachment");
          lines.push(`[${m.ts}] （图片 ${att.filename} 读取失败）`);
        }
      } else {
        lines.push(`[${m.ts}] （发送了文件：${att.filename}，类型 ${att.mime}）`);
      }
    }
  }
  if (lines.length === 0) throw new Error(`thread ${threadId} has no parsable content`);

  const projectList = projects
    .map((p) => `- ${p.name}：${p.description ?? "（无描述）"}`)
    .join("\n");
  const bindingHint = binding?.projectId
    ? `\n该会话默认绑定项目：${projects.find((p) => p.id === binding.projectId)?.name ?? "未知"}（除非内容明显属于其他项目，否则采用绑定项目）`
    : "";
  const rejectHint = rejectReason
    ? `\n\n【重新整理】上一版拆分被管理员驳回，原因：${rejectReason}\n请针对该原因调整拆分结果。`
    : "";

  const userText = `候选项目列表：
${projectList || "（暂无活跃项目）"}${bindingHint}

需求来源：${source.channel === "WECHAT" ? `微信会话（发送人：${source.senderName ?? "未知"}）` : "人工导入"}${source.customerName ? `，客户：${source.customerName}` : ""}

<原始需求内容>
${lines.join("\n")}
</原始需求内容>${rejectHint}`;

  const result = await completeForRole(
    "PRODUCT",
    {
      system: PRODUCT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: userText }, ...images] }],
      schema: PRODUCT_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 16000,
    },
    { projectId: binding?.projectId ?? undefined },
  );

  const parsed = result.parsed as ProductParseOutput | undefined;
  if (!parsed || !Array.isArray(parsed.requirements) || parsed.requirements.length === 0) {
    throw new Error(`product expert returned unusable output for ${threadId}: ${result.text.slice(0, 300)}`);
  }

  const projectId =
    binding?.projectId ??
    projects.find((p) => p.name === parsed.projectName)?.id ??
    null;

  await prisma.$transaction(async (tx) => {
    // 驳回重拆：关闭该线索下所有未进入开发的旧需求单
    const stale = await tx.requirement.findMany({
      where: { sourceId: source.id, status: { in: ["PARSING", "PENDING_CONFIRM"] } },
    });
    for (const r of stale) {
      await tx.requirement.update({ where: { id: r.id }, data: { status: "CLOSED" } });
      await tx.reqEvent.create({
        data: {
          requirementId: r.id,
          fromStatus: r.status,
          toStatus: "CLOSED",
          actor: "expert:PRODUCT",
          note: "重新拆解，旧单作废",
        },
      });
    }

    for (const item of parsed.requirements) {
      const req = await tx.requirement.create({
        data: {
          projectId,
          sourceId: source.id,
          title: item.title.slice(0, 200),
          userStory: item.userStory,
          acceptance: item.acceptance,
          complexity: item.complexity,
          moduleGuess: item.moduleGuess,
          status: "PENDING_CONFIRM",
          clarifications: parsed.clarifications.map((q) => ({ question: q, answer: null })),
        },
      });
      await tx.reqEvent.create({
        data: {
          requirementId: req.id,
          fromStatus: null,
          toStatus: "PENDING_CONFIRM",
          actor: "expert:PRODUCT",
          note: rejectReason ? "驳回后重新拆解" : "自动拆解",
        },
      });
    }
  });

  logger.info(
    { threadId, count: parsed.requirements.length, projectId },
    "thread parsed into requirements",
  );
}
