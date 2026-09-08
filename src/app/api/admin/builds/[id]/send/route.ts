import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 把体验包下载链接发给客户（写入 WechatOutbox，机器人回发；ADR-002 尽力送达）

const Body = z.object({ convId: z.string().min(1), note: z.string().max(300).optional() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);

  const r = await prisma.buildRun.findUnique({ where: { id }, include: { project: { select: { name: true } } } });
  if (!r) return apiError("not_found", "build not found");
  if (r.status !== "SUCCESS" || !r.artifactPath) return apiError("conflict", "构建未成功或无产物");
  const binding = await prisma.wechatBinding.findUnique({ where: { convId: parsed.data.convId } });
  if (!binding) return apiError("not_found", "wechat conversation not bound");

  const base = (process.env.PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/$/, "");
  const link = `${base}/api/public/builds/${r.id}?token=${r.downloadToken}`;
  const reqs = r.requirementIds.length
    ? await prisma.requirement.findMany({ where: { id: { in: r.requirementIds } }, select: { seq: true, title: true }, orderBy: { seq: "asc" } })
    : [];
  const text = [
    `【${r.project.name}】体验包已就绪（分支 ${r.branch}）`,
    reqs.length ? `本次包含：\n${reqs.map((x) => `· REQ-${x.seq} ${x.title}`).join("\n")}` : "",
    parsed.data.note ?? "",
    `下载：${link}`,
    "体验后有任何反馈，直接回复本会话即可。",
  ]
    .filter(Boolean)
    .join("\n\n");

  await prisma.wechatOutbox.create({ data: { convId: binding.convId, content: text } });
  const sentTo = [...((r.sentTo as { convId: string; at: string }[] | null) ?? []), { convId: binding.convId, at: new Date().toISOString() }];
  await prisma.buildRun.update({ where: { id }, data: { sentTo } });
  await audit(`admin:${admin.id}`, "send-build-package", `${r.project.name}@${r.branch}`, binding.convName ?? binding.convId);
  return apiOk({ ok: true, queued: true, link });
}
