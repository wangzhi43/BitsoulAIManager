import { prisma } from "@/lib/db";
import { MergeButton } from "./ui";

export const dynamic = "force-dynamic";

// 分支审查：当日/近期 daily 分支，按需求分组的变更与测试结论，一键合并 main
export default async function BranchesPage() {
  const branches = await prisma.dailyBranch.findMany({
    include: {
      project: { select: { name: true } },
      requirements: {
        include: {
          devTask: { select: { status: true, submitNote: true, claimedBy: { select: { username: true } } } },
          testTasks: { include: { report: { select: { conclusion: true, passRate: true } } } },
        },
        orderBy: { seq: "asc" },
      },
    },
    orderBy: { date: "desc" },
    take: 14,
  });

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">分支审查</h1>
      <div className="space-y-4">
        {branches.map((b) => {
          const hasConflict = b.requirements.some((r) => r.devTask?.status === "CONFLICT");
          const mergedReqs = b.requirements.filter((r) =>
            ["PENDING_TEST", "TESTING", "TESTED", "REVIEWING", "PENDING_ACCEPT", "ACCEPTED"].includes(r.status),
          );
          return (
            <div
              key={b.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-medium">
                    {b.project.name} <span className="font-mono text-sm opacity-60">{b.name}</span>
                  </h2>
                  <p className="text-xs opacity-50">
                    {b.mergedToMain
                      ? `已合并 main（${b.mergedAt?.toLocaleString("zh-CN")}）`
                      : `${mergedReqs.length} 个需求已并入${hasConflict ? "，存在冲突" : ""}`}
                  </p>
                </div>
                {!b.mergedToMain && (
                  <MergeButton branchId={b.id} disabled={hasConflict || mergedReqs.length === 0} />
                )}
              </div>

              {b.requirements.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {b.requirements.map((r) => {
                    const reports = r.testTasks.map((t) => t.report).filter(Boolean);
                    return (
                      <li key={r.id} className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800/60">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs opacity-50">REQ-{r.seq}</span>
                          <span className="font-medium">{r.title}</span>
                          <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-700">
                            {r.status}
                          </span>
                          {r.devTask?.status === "CONFLICT" && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/50 dark:text-red-300">
                              合并冲突
                            </span>
                          )}
                          {reports.map((rep, i) => (
                            <span
                              key={i}
                              className={`rounded px-1.5 py-0.5 text-xs ${
                                rep!.conclusion === "PASS"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                              }`}
                            >
                              测试{rep!.conclusion}（{Math.round(rep!.passRate * 100)}%）
                            </span>
                          ))}
                        </div>
                        {r.devTask?.submitNote && (
                          <p className="mt-1 text-xs opacity-60">
                            {r.devTask.claimedBy?.username}：{r.devTask.submitNote}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        {branches.length === 0 && <p className="text-sm opacity-50">尚无每日分支（每天 02:00 自动创建）</p>}
      </div>
    </main>
  );
}
