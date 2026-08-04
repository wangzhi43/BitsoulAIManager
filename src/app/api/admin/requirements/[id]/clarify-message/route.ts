import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 澄清问题 → 微信文案（PRD #17 前半）：
// 生成可直接转发的提问文案；来源是微信会话时同时写入 outbox 由 Bot 回发客户

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;

  const r = await prisma.requirement.findUnique({ where: { id }, include: { source: true } });
  if (!r) return apiError("not_found", "requirement not found");
  const clarifications = (r.clarifications as { question: string; answer: string | null }[] | null) ?? [];
  const open = clarifications.filter((c) => !c.answer);
  if (open.length === 0) return apiError("bad_request", "该需求没有待澄清问题");

  const message = `您好，关于您提的需求「${r.title}」，有${open.length > 1 ? "几个" : "个"}小问题想和您确认一下：
${open.map((c, i) => `${i + 1}. ${c.question}`).join("\n")}
您方便时回复即可，我们确认后马上安排开发～`;

  let sentToWechat = false;
  if (r.source.channel === "WECHAT" && r.source.wechatConvId) {
    await prisma.wechatOutbox.create({
      data: { convId: r.source.wechatConvId, content: message },
    });
    sentToWechat = true;
  }

  await audit(`admin:${admin.id}`, "send-clarify-message", `REQ-${r.seq}`, sentToWechat ? "已入微信发送队列" : "仅生成文案");
  return apiOk({ message, sentToWechat });
}
