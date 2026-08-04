import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";

export const dynamic = "force-dynamic";

interface ReportContent {
  done: string[];
  inProgress: string[];
  blocked: string[];
  forecast: string;
  risks: string[];
}
interface ReportRow {
  id: string;
  project: string;
  date: Date;
  content: ReportContent;
}

export default async function ReportsPage() {
  const demo = await isDemoMode();

  let rows: ReportRow[];
  if (demo) {
    rows = DEMO.reports;
  } else {
    const reports = await prisma.dailyReport.findMany({
      include: { project: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 30,
    });
    rows = reports.map((r) => ({
      id: r.id,
      project: r.project.name,
      date: r.date,
      content: r.content as unknown as ReportContent,
    }));
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">每日进度报告</h1>
      <div className="space-y-4">
        {rows.map((r) => (
          <article
            key={r.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="flex items-baseline justify-between font-medium">
              {r.project}
              <span className="text-xs font-normal text-zinc-400">{r.date.toISOString().slice(0, 10)}</span>
            </h2>
            {r.content.done.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                  ✓ 今日完成
                </p>
                <ul className="space-y-0.5 text-zinc-600 dark:text-zinc-300">
                  {r.content.done.map((x, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-zinc-300">·</span>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.content.inProgress.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-zinc-500">⚙ 进行中</p>
                <ul className="space-y-0.5 text-zinc-600 dark:text-zinc-300">
                  {r.content.inProgress.map((x, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-zinc-300">·</span>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.content.blocked.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">⚠ 受阻</p>
                <ul className="space-y-0.5 text-zinc-600 dark:text-zinc-300">
                  {r.content.blocked.map((x, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-zinc-300">·</span>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-3 rounded-xl bg-zinc-50 p-2.5 text-xs text-zinc-500 dark:bg-zinc-800/50">
              明日预测：{r.content.forecast}
              {r.content.risks.length > 0 && (
                <span className="mt-1 block text-amber-700 dark:text-amber-400">风险：{r.content.risks.join("；")}</span>
              )}
            </p>
          </article>
        ))}
        {rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
            尚无日报（每晚 21:00 自动生成）
          </p>
        )}
      </div>
    </main>
  );
}
