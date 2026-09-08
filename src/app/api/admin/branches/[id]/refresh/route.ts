import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";

export const dynamic = "force-dynamic";

// 分支审查页「刷新 diff」：入队 refresh-branch-summary，worker 用真实 git 数据重写 reviewSummary（PRD #25）

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;

  const daily = await prisma.dailyBranch.findUnique({ where: { id }, select: { id: true } });
  if (!daily) return apiError("not_found", "daily branch not found");

  await getQueues().git.add(
    "refresh-branch-summary",
    { kind: "refresh-branch-summary", dailyBranchId: id },
    { deduplication: { id: `refresh-branch-summary:${id}`, keepLastIfActive: true }, removeOnComplete: true, removeOnFail: 50 },
  );
  return apiOk({ ok: true, queued: true });
}
