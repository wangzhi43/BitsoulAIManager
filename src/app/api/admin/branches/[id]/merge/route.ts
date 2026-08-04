import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 分支审查：daily → main 合并（异步执行，结果看分支状态）

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;

  const daily = await prisma.dailyBranch.findUnique({ where: { id } });
  if (!daily) return apiError("not_found", "daily branch not found");
  if (daily.mergedToMain) return apiError("conflict", "already merged");

  // 有未合并的开发提交时阻止（feature 还没进 daily 的不拦，冲突态要拦）
  const conflicted = await prisma.devTask.count({
    where: { status: "CONFLICT", requirement: { dailyBranchId: id } },
  });
  if (conflicted > 0) {
    return apiError("conflict", `${conflicted} 个需求存在合并冲突，请先处理`);
  }

  await getQueues().git.add(
    "merge-daily-to-main",
    { kind: "merge-daily-to-main", dailyBranchId: id },
    { attempts: 2, backoff: { type: "exponential", delay: 20_000 } },
  );
  await audit(`admin:${admin.id}`, "merge-daily-to-main", daily.name);
  return apiOk({ ok: true, queued: true });
}
