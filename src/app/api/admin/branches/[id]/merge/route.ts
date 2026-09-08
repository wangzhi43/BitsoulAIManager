import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";
import { parseBranchSummary } from "@/lib/branch-summary";

export const dynamic = "force-dynamic";

// 分支审查：daily → main 合并（异步执行，结果看分支状态）
// 门禁：
//  1. 无冲突态开发任务
//  2. 每个已合入 daily 的需求（devTask=MERGED 或摘要里 mergeSha 非空）最新测试报告必须 PASS；
//     已进入待验收/已验收的需求视为人工已裁决，不再卡报告
//  ?force=1 跳过第 2 条（审计记录 force 与缺报告清单）

/** 已通过人工审核 / 验收，不再要求 PASS 报告 */
const REVIEWED_STATUSES = new Set(["PENDING_ACCEPT", "ACCEPTED"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const force = req.nextUrl.searchParams.get("force") === "1";

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

  // 已合入需求的测试报告门禁（原「无报告=通过」bug）
  const reqs = await prisma.requirement.findMany({
    where: { dailyBranchId: id },
    select: {
      seq: true,
      status: true,
      devTask: { select: { status: true } },
      testTasks: { select: { report: { select: { conclusion: true, createdAt: true } } } },
    },
  });
  const summary = parseBranchSummary(daily.reviewSummary);
  const mergedSeqs = new Set(summary?.perRequirement.filter((p) => p.mergeSha).map((p) => p.seq) ?? []);
  const lacking = reqs
    .filter((r) => r.devTask?.status === "MERGED" || mergedSeqs.has(r.seq))
    .filter((r) => !REVIEWED_STATUSES.has(r.status))
    .filter((r) => {
      const latest = r.testTasks
        .flatMap((t) => (t.report ? [t.report] : []))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return latest?.conclusion !== "PASS";
    })
    .map((r) => `REQ-${r.seq}`);
  if (lacking.length > 0 && !force) {
    return apiError("conflict", `以下需求已合入当日分支但尚无通过的测试报告：${lacking.join(", ")}（可剔除后再合并，或 ?force=1 强制合并）`);
  }

  await getQueues().git.add(
    "merge-daily-to-main",
    { kind: "merge-daily-to-main", dailyBranchId: id },
    { attempts: 2, backoff: { type: "exponential", delay: 20_000 } },
  );
  await audit(
    `admin:${admin.id}`,
    "merge-daily-to-main",
    daily.name,
    force ? `force=1${lacking.length ? `；缺通过报告：${lacking.join(", ")}` : ""}` : undefined,
  );
  return apiOk({ ok: true, queued: true, forced: force, lackingReports: lacking });
}
