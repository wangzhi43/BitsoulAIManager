import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ReportContent {
  done: string[];
  inProgress: string[];
  blocked: string[];
  forecast: string;
  risks: string[];
}

export default async function ReportsPage() {
  const reports = await prisma.dailyReport.findMany({
    include: { project: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 30,
  });

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">每日进度报告</h1>
      <div className="space-y-4">
        {reports.map((r) => {
          const c = r.content as unknown as ReportContent;
          return (
            <article
              key={r.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="font-medium">
                {r.project.name}{" "}
                <span className="text-xs font-normal opacity-50">{r.date.toISOString().slice(0, 10)}</span>
              </h2>
              {c.done.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">今日完成</p>
                  <ul className="ml-4 list-disc">{c.done.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              {c.inProgress.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium opacity-70">进行中</p>
                  <ul className="ml-4 list-disc">{c.inProgress.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              {c.blocked.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">受阻</p>
                  <ul className="ml-4 list-disc">{c.blocked.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              <p className="mt-2 opacity-70">明日预测：{c.forecast}</p>
              {c.risks.length > 0 && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">风险：{c.risks.join("；")}</p>
              )}
            </article>
          );
        })}
        {reports.length === 0 && (
          <p className="text-sm opacity-50">尚无日报（每晚 21:00 自动生成）</p>
        )}
      </div>
    </main>
  );
}
