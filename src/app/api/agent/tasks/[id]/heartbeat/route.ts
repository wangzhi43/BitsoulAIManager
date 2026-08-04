import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { authenticateAgent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgent(req);
  if (!agent) return apiError("unauthorized", "invalid token");
  const { id } = await ctx.params;
  const now = new Date();

  const dev = await prisma.devTask.updateMany({
    where: { id, claimedById: agent.id, status: "CLAIMED" },
    data: { lastHeartbeat: now },
  });
  if (dev.count > 0) return apiOk({ ok: true });

  const test = await prisma.testTask.updateMany({
    where: { id, claimedById: agent.id, status: "CLAIMED" },
    data: { lastHeartbeat: now },
  });
  if (test.count > 0) return apiOk({ ok: true });

  return apiError("not_found", "no claimed task with this id");
}
