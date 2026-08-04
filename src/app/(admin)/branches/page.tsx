import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { MergeButton } from "./ui";
import { PageShell, PageHeader, StatStrip } from "@/components/ui";

export const dynamic = "force-dynamic";

interface ReqRow {
  id: string;
  seq: number;
  title: string;
  status: string;
  conflict: boolean;
  submitNote: string | null;
  agent: string | null;
  reports: { conclusion: string; passRate: number }[];
}
interface BranchRow {
  id: string;
  project: string;
  name: string;
  mergedToMain: boolean;
  mergedAt: Date | null;
  requirements: ReqRow[];
}

const MERGED_STATUSES = ["PENDING_TEST", "TESTING", "TESTED", "REVIEWING", "PENDING_ACCEPT", "ACCEPTED"];

export default async function BranchesPage() {
  const demo = await isDemoMode();

  let rows: BranchRow[];
  if (demo) {
    rows = DEMO.branches;
  } else {
    const branches = await prisma.dailyBranch.findMany({
      include: {
        project: { select: { name: true } },
        requirements: {
          include: {
            devTask: {
              select: { status: true, submitNote: true, claimedBy: { select: { username: true } } },
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
      mergedToMain: b.mergedToMain,
      mergedAt: b.mergedAt,
      requirements: b.requirements.map((r) => ({
        id: r.id,
        seq: r.seq,
        title: r.title,
        status: r.status,
        conflict: r.devTask?.status === "CONFLICT",
        submitNote: r.devTask?.submitNote ?? null,
        agent: r.devTask?.claimedBy?.username ?? null,
        reports: r.testTasks
          .map((t) => t.report)
          .filter((x) => !!x)
          .map((x) => ({ conclusion: x!.conclusion as string, passRate: x!.passRate })),
      })),
    }));
  }

  const unmerged = rows.filter((b) => !b.mergedToMain).length;
  const conflictCount = rows.reduce((s2, b) => s2 + b.requirements.filter((r) => r.conflict).length, 0);
  const readyReqs = rows
    .filter((b) => !b.mergedToMain)
    .reduce((s2, b) => s2 + b.requirements.filter((r) => MERGED_STATUSES.includes(r.status)).length, 0);

  return (
    <PageShell>
      <PageHeader title="分支审查" subtitle="每晚检查当日分支的变更与测试结论，确认后合并回 main" />
      <StatStrip
        items={[
          { label: "待合并分支", value: unmerged, tone: unmerged > 0 ? "indigo" : "default", sub: "今晚需要审查" },
          { label: "已并入需求", value: readyReqs, sub: "在待合并分支中" },
          { label: "合并冲突", value: conflictCount, tone: conflictCount > 0 ? "red" : "green", sub: conflictCount > 0 ? "解决后才能合并" : "一切正常" },
        ]}
      />
      <div className="grid gap-3 2xl:grid-cols-2">
        {rows.map((b) => {
          const hasConflict = b.requirements.some((r) => r.conflict);
          const mergedCount = b.requirements.filter((r) => MERGED_STATUSES.includes(r.status)).length;
          return (
            <div
              key={b.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-medium">
                    {b.project}{" "}
                    <span className="ml-1 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {b.name}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {b.mergedToMain
                      ? `✓ 已合并 main（${b.mergedAt?.toLocaleString("zh-CN") ?? ""}）`
                      : `${mergedCount} 个需求已并入${hasConflict ? " · 存在冲突" : ""}`}
                  </p>
                </div>
                {!b.mergedToMain && <MergeButton branchId={b.id} disabled={hasConflict || mergedCount === 0} />}
              </div>

              {b.requirements.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {b.requirements.map((r) => (
                    <li key={r.id} className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-zinc-400">REQ-{r.seq}</span>
                        <span className="font-medium">{r.title}</span>
                        <span className="rounded-md bg-zinc-200/70 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          {r.status}
                        </span>
                        {r.conflict && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950/60 dark:text-red-400">
                            ⚠ 合并冲突
                          </span>
                        )}
                        {r.reports.map((rep, i) => (
                          <span
                            key={i}
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              rep.conclusion === "PASS"
                                ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                            }`}
                          >
                            {rep.conclusion === "PASS" ? "✓" : "✗"} 测试{rep.conclusion}（{Math.round(rep.passRate * 100)}%）
                          </span>
                        ))}
                      </div>
                      {r.submitNote && (
                        <p className="mt-1 text-xs text-zinc-400">
                          {r.agent}：{r.submitNote}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
            尚无每日分支（每天 02:00 自动创建）
          </p>
        )}
      </div>
    </PageShell>
  );
}
