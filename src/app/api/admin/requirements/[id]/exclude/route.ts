import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 剔除（PRD #26）：revert 该需求在当日分支上的合并提交，需求回待开发池。
// 状态变更由 worker 在 git 成功后落库；这里只校验 + 入队 + 审计。
// 允许：devTask ∈ {MERGED, CONFLICT, SUBMITTED} 且
//   需求 ∈ {PENDING_TEST, TESTING, TESTED, REVIEWING, PENDING_ACCEPT}，或 DEVELOPING 且 devTask=CONFLICT

const ALLOWED_DEV = new Set(["MERGED", "CONFLICT", "SUBMITTED"]);
const ALLOWED_REQ = new Set(["PENDING_TEST", "TESTING", "TESTED", "REVIEWING", "PENDING_ACCEPT"]);

const Body = z.object({ note: z.string().max(300).optional() }).optional();

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const note = parsed.data?.note?.trim();

  const r = await prisma.requirement.findUnique({
    where: { id },
    include: { devTask: true, dailyBranch: { select: { mergedToMain: true, name: true } } },
  });
  if (!r) return apiError("not_found", "requirement not found");
  if (!r.featureBranch || !r.dailyBranchId || !r.dailyBranch) {
    return apiError("conflict", "requirement has no branch info");
  }
  if (r.dailyBranch.mergedToMain) return apiError("conflict", `${r.dailyBranch.name} already merged to main`);
  if (!r.devTask || !ALLOWED_DEV.has(r.devTask.status)) {
    return apiError("conflict", `dev task is ${r.devTask?.status ?? "missing"}, cannot exclude`);
  }
  const reqOk = ALLOWED_REQ.has(r.status) || (r.status === "DEVELOPING" && r.devTask.status === "CONFLICT");
  if (!reqOk) return apiError("conflict", `cannot exclude from ${r.status}`);

  const actor = `admin:${admin.id}`;
  await prisma.reqEvent.create({
    data: {
      requirementId: id,
      fromStatus: r.status,
      toStatus: r.status,
      actor,
      note: `管理员发起剔除，等待 git 执行${note ? `：${note}` : ""}`,
    },
  });
  await getQueues().git.add(
    "exclude-from-daily",
    { kind: "exclude-from-daily", requirementId: id },
    { attempts: 1, removeOnComplete: true, removeOnFail: 50 },
  );
  await audit(actor, "exclude-from-daily", `REQ-${r.seq}`, note);
  return apiOk({ ok: true, queued: true });
}
