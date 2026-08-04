import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 验收 / 人工裁决：
// - PENDING_ACCEPT → ACCEPTED（验收通过）
// - REVIEWING → PENDING_ACCEPT（部分通过但接受）或 READY（退回重做）

const Body = z.object({
  action: z.enum(["accept", "approve_partial", "send_back"]),
  note: z.string().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const { action, note } = parsed.data;

  const r = await prisma.requirement.findUnique({ where: { id } });
  if (!r) return apiError("not_found", "requirement not found");

  const actor = `admin:${admin.id}`;
  if (action === "accept") {
    if (r.status !== "PENDING_ACCEPT") return apiError("conflict", `requirement is ${r.status}`);
    await prisma.$transaction([
      prisma.requirement.update({ where: { id }, data: { status: "ACCEPTED" } }),
      prisma.reqEvent.create({
        data: { requirementId: id, fromStatus: "PENDING_ACCEPT", toStatus: "ACCEPTED", actor, note: note ?? "验收通过" },
      }),
    ]);
    return apiOk({ ok: true });
  }

  if (r.status !== "REVIEWING") return apiError("conflict", `requirement is ${r.status}`);
  if (action === "approve_partial") {
    await prisma.$transaction([
      prisma.requirement.update({ where: { id }, data: { status: "PENDING_ACCEPT" } }),
      prisma.reqEvent.create({
        data: { requirementId: id, fromStatus: "REVIEWING", toStatus: "PENDING_ACCEPT", actor, note: note ?? "部分通过，裁决放行" },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.requirement.update({ where: { id }, data: { status: "READY" } }),
      prisma.devTask.update({
        where: { requirementId: id },
        data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null, submittedAt: null },
      }),
      prisma.reqEvent.create({
        data: { requirementId: id, fromStatus: "REVIEWING", toStatus: "READY", actor, note: note ?? "裁决退回重做" },
      }),
    ]);
  }
  return apiOk({ ok: true });
}
