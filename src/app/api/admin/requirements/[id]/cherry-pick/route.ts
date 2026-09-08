import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 单需求提前进 main（PRD #26）：cherry-pick daily 上的合并提交（未合入 daily 则直接合并 feature）。
// 允许：需求 ∈ {PENDING_ACCEPT, ACCEPTED} 且 daily 尚未合入 main。结果由 worker 写 ReqEvent。

const ALLOWED_REQ = new Set(["PENDING_ACCEPT", "ACCEPTED"]);

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;

  const r = await prisma.requirement.findUnique({
    where: { id },
    include: { dailyBranch: { select: { mergedToMain: true, name: true } } },
  });
  if (!r) return apiError("not_found", "requirement not found");
  if (!r.featureBranch || !r.dailyBranchId || !r.dailyBranch) {
    return apiError("conflict", "requirement has no branch info");
  }
  if (!ALLOWED_REQ.has(r.status)) return apiError("conflict", `cannot cherry-pick from ${r.status}`);
  if (r.dailyBranch.mergedToMain) return apiError("conflict", `${r.dailyBranch.name} already merged to main`);

  const actor = `admin:${admin.id}`;
  await prisma.reqEvent.create({
    data: { requirementId: id, fromStatus: r.status, toStatus: r.status, actor, note: "管理员发起单独合入 main，等待 git 执行" },
  });
  await getQueues().git.add(
    "cherry-pick-to-main",
    { kind: "cherry-pick-to-main", requirementId: id },
    { attempts: 1, removeOnComplete: true, removeOnFail: 50 },
  );
  await audit(actor, "cherry-pick-to-main", `REQ-${r.seq}`);
  return apiOk({ ok: true, queued: true });
}
