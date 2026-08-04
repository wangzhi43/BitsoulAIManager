import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 需求手动状态管理（PRD 状态机补充规则）：
// close  任意非终态 → CLOSED（释放认领中的任务）
// hold   任意非终态 → ON_HOLD（释放认领中的任务）
// resume ON_HOLD/CLOSED → READY（曾有开发任务）或 PENDING_CONFIRM

const Body = z.object({
  action: z.enum(["close", "hold", "resume"]),
  note: z.string().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const { action, note } = parsed.data;

  const r = await prisma.requirement.findUnique({ where: { id }, include: { devTask: true } });
  if (!r) return apiError("not_found", "requirement not found");

  const actor = `admin:${admin.id}`;
  let toStatus: "CLOSED" | "ON_HOLD" | "READY" | "PENDING_CONFIRM";

  if (action === "resume") {
    if (r.status !== "ON_HOLD" && r.status !== "CLOSED") {
      return apiError("conflict", `cannot resume from ${r.status}`);
    }
    toStatus = r.devTask ? "READY" : "PENDING_CONFIRM";
  } else {
    if (r.status === "ACCEPTED") return apiError("conflict", "already accepted");
    if (action === "close" && r.status === "CLOSED") return apiError("conflict", "already closed");
    if (action === "hold" && (r.status === "ON_HOLD" || r.status === "CLOSED")) {
      return apiError("conflict", `cannot hold from ${r.status}`);
    }
    toStatus = action === "close" ? "CLOSED" : "ON_HOLD";
  }

  await prisma.$transaction(async (tx) => {
    await tx.requirement.update({ where: { id }, data: { status: toStatus } });
    // 释放进行中的认领
    if (toStatus === "CLOSED" || toStatus === "ON_HOLD") {
      await tx.devTask.updateMany({
        where: { requirementId: id, status: "CLAIMED" },
        data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null },
      });
      await tx.testTask.updateMany({
        where: { requirementId: id, status: { in: ["POOL", "CLAIMED"] } },
        data: { status: "DONE", claimedById: null },
      });
    }
    if (toStatus === "READY" && r.devTask) {
      await tx.devTask.update({
        where: { requirementId: id },
        data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null, submittedAt: null },
      });
    }
    await tx.reqEvent.create({
      data: {
        requirementId: id,
        fromStatus: r.status,
        toStatus,
        actor,
        note:
          note ??
          (action === "close" ? "管理员关闭" : action === "hold" ? "管理员挂起" : "管理员恢复"),
      },
    });
  });

  await audit(actor, `requirement-${action}`, `REQ-${r.seq}`, note);
  return apiOk({ ok: true, status: toStatus });
}
