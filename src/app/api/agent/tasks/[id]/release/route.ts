import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { authenticateAgent } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 主动放弃认领：任务回池，需求状态回退

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgent(req);
  if (!agent) return apiError("unauthorized", "invalid token");
  const { id } = await ctx.params;

  const dev = await prisma.devTask.findUnique({ where: { id } });
  if (dev && dev.claimedById === agent.id && dev.status === "CLAIMED") {
    await prisma.$transaction([
      prisma.devTask.update({
        where: { id },
        data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null },
      }),
      prisma.requirement.update({ where: { id: dev.requirementId }, data: { status: "READY" } }),
      prisma.reqEvent.create({
        data: {
          requirementId: dev.requirementId,
          fromStatus: "DEVELOPING",
          toStatus: "READY",
          actor: `agent:${agent.username}`,
          note: "放弃认领，任务回池",
        },
      }),
    ]);
    return apiOk({ ok: true });
  }

  const test = await prisma.testTask.findUnique({ where: { id } });
  if (test && test.claimedById === agent.id && test.status === "CLAIMED") {
    await prisma.$transaction([
      prisma.testTask.update({
        where: { id },
        data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null },
      }),
      prisma.requirement.update({ where: { id: test.requirementId }, data: { status: "PENDING_TEST" } }),
      prisma.reqEvent.create({
        data: {
          requirementId: test.requirementId,
          fromStatus: "TESTING",
          toStatus: "PENDING_TEST",
          actor: `agent:${agent.username}`,
          note: "放弃测试认领，任务回池",
        },
      }),
    ]);
    return apiOk({ ok: true });
  }

  return apiError("not_found", "no claimed task with this id");
}
