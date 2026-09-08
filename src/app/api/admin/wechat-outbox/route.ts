import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 微信发送队列（ADR-003）：待发 / 失败列表；重试（清零重新下发）或丢弃（标记已发送不再下发）

export async function GET() {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const [pending, failed, sentToday] = await Promise.all([
    prisma.wechatOutbox.findMany({ where: { sentAt: null, failedAt: null }, orderBy: { createdAt: "asc" }, take: 50 }),
    prisma.wechatOutbox.findMany({ where: { sentAt: null, failedAt: { not: null } }, orderBy: { failedAt: "desc" }, take: 50 }),
    prisma.wechatOutbox.count({ where: { sentAt: { gte: new Date(Date.now() - 86400_000) } } }),
  ]);
  return apiOk({ pending, failed, sentToday });
}

const Body = z.object({ id: z.string().min(1), action: z.enum(["retry", "discard"]) });

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const row = await prisma.wechatOutbox.findUnique({ where: { id: parsed.data.id } });
  if (!row) return apiError("not_found", "outbox item not found");
  if (row.sentAt) return apiError("conflict", "already sent");

  if (parsed.data.action === "retry") {
    await prisma.wechatOutbox.update({ where: { id: row.id }, data: { attempts: 0, lastError: null, failedAt: null } });
  } else {
    await prisma.wechatOutbox.update({ where: { id: row.id }, data: { sentAt: new Date(), lastError: `管理员丢弃：${row.lastError ?? ""}`.slice(0, 500) } });
  }
  await audit(`admin:${admin.id}`, `wechat-outbox-${parsed.data.action}`, row.id, row.convId);
  return apiOk({ ok: true });
}
