import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 验收 / 人工裁决：
// - PENDING_ACCEPT → ACCEPTED（验收通过）
// - REVIEWING → PENDING_ACCEPT（部分通过但接受）或 READY（退回重做）
// - PENDING_ACCEPT → READY（验收退回：DevTask 回池，附原因）

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
    if (r.projectId) {
      const { getQueues } = await import("@/lib/queue");
      await getQueues().git.add("append-docs-log", {
        kind: "append-docs-log",
        projectId: r.projectId,
        file: "requirements-log.md",
        content: `\n- ${new Date().toISOString().slice(0, 10)} **已验收** REQ-${r.seq} ${r.title}\n`,
      });
    }
    await audit(actor, "accept-requirement", `REQ-${r.seq}`, note);
    return apiOk({ ok: true });
  }

  if (action === "approve_partial") {
    if (r.status !== "REVIEWING") return apiError("conflict", `requirement is ${r.status}`);
    await prisma.$transaction([
      prisma.requirement.update({ where: { id }, data: { status: "PENDING_ACCEPT" } }),
      prisma.reqEvent.create({
        data: { requirementId: id, fromStatus: "REVIEWING", toStatus: "PENDING_ACCEPT", actor, note: note ?? "部分通过，裁决放行" },
      }),
    ]);
  } else {
    // send_back：裁决退回（REVIEWING）或验收退回（PENDING_ACCEPT），均回待开发池
    if (r.status !== "REVIEWING" && r.status !== "PENDING_ACCEPT") {
      return apiError("conflict", `requirement is ${r.status}`);
    }
    const fromStatus = r.status;
    await prisma.$transaction([
      prisma.requirement.update({ where: { id }, data: { status: "READY" } }),
      prisma.devTask.updateMany({
        where: { requirementId: id },
        data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null, submittedAt: null },
      }),
      prisma.reqEvent.create({
        data: {
          requirementId: id,
          fromStatus,
          toStatus: "READY",
          actor,
          note: note ?? (fromStatus === "PENDING_ACCEPT" ? "验收退回" : "裁决退回重做"),
        },
      }),
    ]);
  }
  await audit(actor, action === "approve_partial" ? "approve-partial" : "send-back", `REQ-${r.seq}`, note);
  return apiOk({ ok: true });
}
