import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";
import { dailyBranchName } from "@/lib/git";
import { parseBranchSummary } from "@/lib/branch-summary";

export const dynamic = "force-dynamic";

// 当日分支列表 / 手动创建（PRD #25；git 操作只在 worker 执行，这里只入队）

/** GET ?projectId= → 最近 14 条 DailyBranch（含摘要合计，不触碰 git） */
export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const projectId = req.nextUrl.searchParams.get("projectId")?.trim() || undefined;

  const rows = await prisma.dailyBranch.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 14,
    include: { project: { select: { name: true } }, _count: { select: { requirements: true } } },
  });
  const branches = rows.map((b) => {
    const s = parseBranchSummary(b.reviewSummary);
    return {
      id: b.id,
      name: b.name,
      date: b.date.toISOString(),
      projectId: b.projectId,
      projectName: b.project.name,
      mergedToMain: b.mergedToMain,
      mergedAt: b.mergedAt?.toISOString() ?? null,
      requirementCount: b._count.requirements,
      summary: s
        ? {
            refreshedAt: s.refreshedAt,
            baseCommit: s.baseCommit,
            headCommit: s.headCommit,
            totals: s.totals,
            mergedRequirements: s.perRequirement.filter((p) => p.mergeSha).length,
            error: s.error ?? null,
          }
        : null,
    };
  });
  return apiOk({ branches });
}

const CreateBody = z.object({
  projectId: z.string().min(1),
  /** "YYYY-MM-DD" 或 ISO 时间；缺省今天 */
  date: z.string().optional(),
});

/** 把 "YYYY-MM-DD" 按本地时区解析（避免 UTC 午夜落到前一天） */
function parseDate(input?: string): Date | null {
  if (!input) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** POST {projectId, date?} → 入队 create-daily-branch */
export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const date = parseDate(parsed.data.date);
  if (!date) return apiError("bad_request", "invalid date");

  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
  if (!project) return apiError("not_found", "project not found");
  if (!project.active) return apiError("conflict", "project is inactive");

  const name = dailyBranchName(date);
  const existing = await prisma.dailyBranch.findUnique({
    where: { projectId_name: { projectId: project.id, name } },
  });
  if (existing) return apiError("conflict", `当日分支 ${name} 已存在`);

  await getQueues().git.add(
    "create-daily-branch",
    { kind: "create-daily-branch", projectId: project.id, date: date.toISOString() },
    { attempts: 3, backoff: { type: "exponential", delay: 30_000 } },
  );
  await audit(`admin:${admin.id}`, "create-daily-branch", `${project.name}:${name}`);
  return apiOk({ ok: true, queued: true, name });
}
