import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { currentAdmin } from "@/lib/auth";
import { ReviewCenter, type BranchItem } from "./ui";
import { PageShell, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// 晚间审查与验收中心（docs/ui_design/XA9hhmonfsFrGAye.png）
// 服务端负责取数（DailyBranch + Requirement + DevTask + TestReport），表现层在 ./ui.tsx

// MOCK 数据：真实链路未接入时的界面填充，后续替换（通知计数未接入消息中心）
const MOCK_NOTIFY_COUNT = 3;

export default async function BranchesPage() {
  const demo = await isDemoMode();
  const admin = await currentAdmin();

  let rows: BranchItem[];
  if (demo) {
    rows = DEMO.branches.map((b) => ({
      id: b.id,
      project: b.project,
      name: b.name,
      date: null,
      createdAt: null,
      mergedToMain: b.mergedToMain,
      mergedAt: b.mergedAt ? b.mergedAt.toISOString() : null,
      requirements: b.requirements.map((r) => ({
        id: r.id,
        seq: r.seq,
        title: r.title,
        status: r.status,
        conflict: r.conflict,
        submitNote: r.submitNote,
        agent: r.agent,
        featureBranch: `feature/REQ-${r.seq}`,
        commits: [],
        submittedAt: null,
        reports: r.reports,
      })),
    }));
  } else {
    const branches = await prisma.dailyBranch.findMany({
      include: {
        project: { select: { name: true } },
        requirements: {
          include: {
            devTask: {
              select: {
                status: true,
                submitNote: true,
                commits: true,
                submittedAt: true,
                claimedBy: { select: { username: true } },
              },
            },
            testTasks: { include: { report: { select: { conclusion: true, passRate: true } } } },
          },
          orderBy: { seq: "asc" },
        },
      },
      orderBy: { date: "desc" },
      take: 14,
    });
    rows = branches.map((b) => ({
      id: b.id,
      project: b.project.name,
      name: b.name,
      date: b.date.toISOString(),
      createdAt: b.createdAt.toISOString(),
      mergedToMain: b.mergedToMain,
      mergedAt: b.mergedAt?.toISOString() ?? null,
      requirements: b.requirements.map((r) => ({
        id: r.id,
        seq: r.seq,
        title: r.title,
        status: r.status,
        conflict: r.devTask?.status === "CONFLICT",
        submitNote: r.devTask?.submitNote ?? null,
        agent: r.devTask?.claimedBy?.username ?? null,
        featureBranch: r.featureBranch,
        commits: Array.isArray(r.devTask?.commits) ? (r.devTask!.commits as string[]) : [],
        submittedAt: r.devTask?.submittedAt?.toISOString() ?? null,
        reports: r.testTasks
          .map((t) => t.report)
          .filter((x) => !!x)
          .map((x) => ({ conclusion: x!.conclusion as string, passRate: x!.passRate })),
      })),
    }));
  }

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[14px]">🌙</span>
            晚间审查与验收中心
          </span>
        }
        subtitle="每日闭环：审查分支 → 验收需求 → 安全合并"
        actions={
          <>
            {/* MOCK：通知计数未接入消息中心 */}
            <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-[16px] text-slate-500 hover:bg-slate-100" title="通知（接入中）">
              🔔
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {MOCK_NOTIFY_COUNT}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg px-2 py-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[12px] font-semibold text-blue-600">
                {(admin?.displayName ?? "Admin").slice(0, 1)}
              </span>
              <span className="text-left leading-tight">
                <span className="block text-[12px] font-medium text-slate-700">{admin?.displayName ?? "Admin"}</span>
                <span className="block text-[10px] text-slate-400">管理员</span>
              </span>
            </span>
            <span className="text-[12px] text-blue-600" title="使用指南编写中">
              ◎ 使用指南
            </span>
          </>
        }
      />
      <ReviewCenter branches={rows} demo={demo} />
    </PageShell>
  );
}
