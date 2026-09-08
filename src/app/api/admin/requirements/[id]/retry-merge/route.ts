import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 合并冲突后重试（PRD #24）：开发 Agent 在 feature 上解决冲突并推送后，管理员点「重试合并」
// 前置：devTask.status === CONFLICT；daily 尚未合入 main

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;

  const r = await prisma.requirement.findUnique({
    where: { id },
    include: { devTask: true, dailyBranch: { select: { mergedToMain: true, name: true } } },
  });
  if (!r) return apiError("not_found", "requirement not found");
  if (!r.devTask) return apiError("conflict", "requirement has no dev task");
  if (r.devTask.status !== "CONFLICT") {
    return apiError("conflict", `dev task is ${r.devTask.status}, only CONFLICT can be retried`);
  }
  if (!r.featureBranch || !r.dailyBranch) return apiError("conflict", "requirement has no branch info");
  if (r.dailyBranch.mergedToMain) return apiError("conflict", `${r.dailyBranch.name} already merged to main`);

  const actor = `admin:${admin.id}`;
  await prisma.$transaction([
    prisma.devTask.update({ where: { requirementId: id }, data: { status: "SUBMITTED" } }),
    prisma.reqEvent.create({
      data: { requirementId: id, fromStatus: r.status, toStatus: r.status, actor, note: "管理员重试合并" },
    }),
  ]);
  await getQueues().git.add(
    "merge-feature-to-daily",
    { kind: "merge-feature-to-daily", requirementId: id },
    { attempts: 2, backoff: { type: "exponential", delay: 20_000 } },
  );
  await audit(actor, "retry-merge", `REQ-${r.seq}`);
  return apiOk({ ok: true, queued: true });
}
