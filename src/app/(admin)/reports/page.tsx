import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { PageShell, PageHeader, StatStrip, Panel, Chip } from "@/components/ui";
import { AreaTrend, HBarList, CHART_COLORS } from "@/components/charts";

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

  // 由日报内容派生的汇总（趋势 / 项目分布），补上旧版 dashboard 裁掉的图表能力
  const totalDone = rows.reduce((s, r) => s + r.content.done.length, 0);
  const totalBlocked = rows.reduce((s, r) => s + r.content.blocked.length, 0);
  const totalRisks = rows.reduce((s, r) => s + r.content.risks.length, 0);
  const projectNames = [...new Set(rows.map((r) => r.project))];

  const byDate = new Map<string, { done: number; inProgress: number }>();
  rows.forEach((r) => {
    const key = r.date.toISOString().slice(5, 10);
    const cur = byDate.get(key) ?? { done: 0, inProgress: 0 };
    cur.done += r.content.done.length;
    cur.inProgress += r.content.inProgress.length;
    byDate.set(key, cur);
  });
  const trendLabels = [...byDate.keys()].sort();
  const trendSeries = [
    { name: "完成项", values: trendLabels.map((k) => byDate.get(k)!.done), color: CHART_COLORS[0] },
    { name: "进行中", values: trendLabels.map((k) => byDate.get(k)!.inProgress), color: CHART_COLORS[1] },
  ];
  const byProject = projectNames
    .map((name) => ({
      label: name,
      value: rows.filter((r) => r.project === name).reduce((s, r) => s + r.content.done.length, 0),
      hint: `${rows.filter((r) => r.project === name).length} 份日报`,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <PageShell>
      <PageHeader title="数据与报表" subtitle="项管专家每晚 21:00 按项目自动生成每日进度报告" />
      <StatStrip
        items={[
          { label: "日报数", value: rows.length, sub: "最近 30 份" },
          { label: "覆盖项目", value: projectNames.length, sub: "有日报产出" },
          { label: "累计完成项", value: totalDone, tone: "green", sub: "日报口径" },
          { label: "受阻 / 风险", value: `${totalBlocked} / ${totalRisks}`, tone: totalBlocked > 0 ? "red" : "default", sub: "待跟进事项" },
        ]}
      />

      <div className="grid items-start gap-4 xl:grid-cols-4">
        <div className="space-y-4 xl:col-span-3">
          <div className="grid gap-4 2xl:grid-cols-2">
            {rows.map((r) => (
              <Panel
                key={r.id}
                title={r.project}
                extra={<span className="text-[11px] tabular-nums text-slate-400">{r.date.toISOString().slice(0, 10)}</span>}
                className="h-full"
              >
                {r.content.done.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1"><Chip tone="green">✓ 今日完成</Chip></p>
                    <ul className="space-y-0.5 text-[13px] text-slate-600">
                      {r.content.done.map((x, i) => (
                        <li key={i} className="flex gap-1.5"><span className="text-slate-300">·</span>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.content.inProgress.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1"><Chip tone="blue">⚙ 进行中</Chip></p>
                    <ul className="space-y-0.5 text-[13px] text-slate-600">
                      {r.content.inProgress.map((x, i) => (
                        <li key={i} className="flex gap-1.5"><span className="text-slate-300">·</span>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.content.blocked.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1"><Chip tone="red">⚠ 受阻</Chip></p>
                    <ul className="space-y-0.5 text-[13px] text-slate-600">
                      {r.content.blocked.map((x, i) => (
                        <li key={i} className="flex gap-1.5"><span className="text-slate-300">·</span>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="rounded-lg bg-slate-50 p-2.5 text-[12px] text-slate-500">
                  明日预测：{r.content.forecast}
                  {r.content.risks.length > 0 && (
                    <span className="mt-1 block text-amber-600">风险：{r.content.risks.join("；")}</span>
                  )}
                </p>
              </Panel>
            ))}
            {rows.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-[13px] text-slate-400 2xl:col-span-2">
                尚无日报（每晚 21:00 自动生成）
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Panel title="产出趋势" extra={<span className="text-[11px] text-slate-400">日报口径</span>}>
            {trendLabels.length >= 2 ? (
              <AreaTrend series={trendSeries} labels={trendLabels} height={130} />
            ) : (
              <p className="py-4 text-center text-[12px] text-slate-400">日报天数不足，暂无趋势</p>
            )}
          </Panel>
          <Panel title="各项目完成量">
            {byProject.length > 0 ? (
              <HBarList data={byProject} color={CHART_COLORS[0]} />
            ) : (
              <p className="py-4 text-center text-[12px] text-slate-400">暂无数据</p>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
