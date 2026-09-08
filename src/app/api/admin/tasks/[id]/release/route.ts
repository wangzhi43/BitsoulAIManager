import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 管理员强制释放认领：id 可为 DevTask 或 TestTask。
// dev：CLAIMED → POOL，需求 DEVELOPING → READY；test：CLAIMED → POOL，需求 TESTING → PENDING_TEST。

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const actor = `admin:${admin.id}`;
  const clear = { status: "POOL" as const, claimedById: null, claimedAt: null, lastHeartbeat: null };

  const dev = await prisma.devTask.findUnique({
    where: { id },
    include: { claimedBy: { select: { username: true } }, requirement: { select: { seq: true, status: true } } },
  });
  if (dev) {
    if (dev.status !== "CLAIMED") return apiError("conflict", `dev task is ${dev.status}, not CLAIMED`);
    const who = dev.claimedBy?.username ?? "?";
    await prisma.$transaction([
      prisma.devTask.update({ where: { id }, data: clear }),
      prisma.requirement.update({ where: { id: dev.requirementId }, data: { status: "READY" } }),
      prisma.reqEvent.create({
        data: {
          requirementId: dev.requirementId,
          fromStatus: dev.requirement.status,
          toStatus: "READY",
          actor,
          note: `管理员释放认领（原 agent:${who}）`,
        },
      }),
    ]);
    await audit(actor, "force-release", `REQ-${dev.requirement.seq}`, `dev task, agent:${who}`);
    return apiOk({ ok: true, type: "dev", req: `REQ-${dev.requirement.seq}` });
  }

  const test = await prisma.testTask.findUnique({
    where: { id },
    include: { claimedBy: { select: { username: true } }, requirement: { select: { seq: true, status: true } } },
  });
  if (test) {
    if (test.status !== "CLAIMED") return apiError("conflict", `test task is ${test.status}, not CLAIMED`);
    const who = test.claimedBy?.username ?? "?";
    await prisma.$transaction([
      prisma.testTask.update({ where: { id }, data: clear }),
      prisma.requirement.update({ where: { id: test.requirementId }, data: { status: "PENDING_TEST" } }),
      prisma.reqEvent.create({
        data: {
          requirementId: test.requirementId,
          fromStatus: test.requirement.status,
          toStatus: "PENDING_TEST",
          actor,
          note: `管理员释放测试认领（原 agent:${who}）`,
        },
      }),
    ]);
    await audit(actor, "force-release", `REQ-${test.requirement.seq}`, `test task, agent:${who}`);
    return apiOk({ ok: true, type: "test", req: `REQ-${test.requirement.seq}` });
  }

  return apiError("not_found", "task not found");
}
