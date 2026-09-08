import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { PageShell, PageHeader, KpiRow, KpiTile, Panel, Chip, EmptyState, DemoNote, fmtDate, fmtDateTime } from "@/components/ui";
import { BarChart, HBarList, CHART_COLORS } from "@/components/charts";
import { GenerateReportButton } from "./ui";

export const dynamic = "force-dynamic";

// 日报：项管专家每晚 21:00 按项目生成；支持手动立即生成；显示是否已推送微信

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
  createdAt: Date;
  pushed: boolean;
  content: ReportContent;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project = "" } = await searchParams;
  const demo = await isDemoMode();
  let rows: ReportRow[];
  let projects: { id: string; name: string }[];

  if (demo) {
    rows = DEMO.reports.map((r) => ({ ...r, createdAt: r.date, pushed: r.id === "demo-rep1" }));
    projects = DEMO.dashboard.projects.map((p) => ({ id: p.id, name: p.name }));
  } else {
    const [reports, dbProjects] = await Promise.all([
      prisma.dailyReport.findMany({
        where: { date: { gte: new Date(Date.now() - 30 * 86400_000) }, ...(project ? { projectId: project } : {}) },
        include: { project: { select: { name: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    ]);
    rows = reports.map((r) => ({ id: r.id, project: r.project.name, date: r.date, createdAt: r.createdAt, pushed: r.pushed, content: r.content as unknown as ReportContent }));
    projects = dbProjects;
  }

  const totalDone = rows.reduce((s, r) => s + r.content.done.length, 0);
  const totalBlocked = rows.reduce((s, r) => s + r.content.blocked.length, 0);
  const totalRisks = rows.reduce((s, r) => s + r.content.risks.length, 0);
  const projectNames = [...new Set(rows.map((r) => r.project))];

  // 近 14 天完成项（日报口径）
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400_000);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const doneByDay = new Map(days.map((d) => [d, 0]));
  rows.forEach((r) => {
    const k = fmtDate(r.date).slice(5);
    if (doneByDay.has(k)) doneByDay.set(k, (doneByDay.get(k) ?? 0) + r.content.done.length);
  });
  const trend = days.map((d) => ({ label: d.slice(3), value: doneByDay.get(d) ?? 0 }));
  const byProject = projectNames
    .map((name) => ({ label: name, value: rows.filter((r) => r.project === name).reduce((s, r) => s + r.content.done.length, 0), hint: `${rows.filter((r) => r.project === name).length} 份` }))
    .sort((a, b) => b.value - a.value);

  const groups = new Map<string, ReportRow[]>();
  rows.forEach((r) => {
    const k = fmtDate(r.date);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });

  return (
    <PageShell>
      <PageHeader
        title="日报"
        subtitle="项目管理专家每晚 21:00 按项目生成"
        actions={
          <>
            <form method="get" action="/reports">
              <select name="project" defaultValue={project} className="ctl w-auto min-w-[130px]" onChange={undefined}>
                <option value="">全部项目</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </form>
            <GenerateReportButton projects={projects} demo={demo} />
          </>
        }
      />
      {demo && <DemoNote />}
      <KpiRow cols={4}>
        <KpiTile label="日报数" value={rows.length} sub="最近 30 天" />
        <KpiTile label="覆盖项目" value={projectNames.length} sub={`活跃项目 ${projects.length}`} />
        <KpiTile label="累计完成项" value={totalDone} sub="日报口径" tone={totalDone > 0 ? "ok" : "default"} />
        <KpiTile label="受阻 / 风险" value={`${totalBlocked} / ${totalRisks}`} sub="待跟进事项" tone={totalBlocked > 0 ? "warn" : "default"} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="flex flex-col gap-4">
          {rows.length === 0 && (
            <div className="rounded-lg border border-line bg-surface">
              <EmptyState icon="chart" title="尚无日报" desc="每晚 21:00 项目管理专家按项目自动生成，也可以立即生成一份。" action={<GenerateReportButton projects={projects} demo={demo} />} />
            </div>
          )}
          {[...groups.entries()].map(([date, list]) => (
            <div key={date} className="flex flex-col gap-3">
              <h2 className="num text-[13px] font-semibold text-ink-2">{date}</h2>
              {list.map((r) => (
                <Panel
                  key={r.id}
                  title={r.project}
                  extra={
                    <>
                      <span className="num text-[12px] text-ink-3">生成于 {fmtDateTime(r.createdAt)}</span>
                      {r.pushed ? <Chip tone="green">已推送</Chip> : <Chip tone="slate">未推送</Chip>}
                    </>
                  }
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Section title="今日完成" items={r.content.done} dot="bg-ok" empty="无" />
                    <Section title="进行中" items={r.content.inProgress} dot="bg-accent" empty="无" />
                    {r.content.blocked.length > 0 && <Section title="受阻" items={r.content.blocked} dot="bg-danger" />}
                    {r.content.risks.length > 0 && <Section title="风险" items={r.content.risks} dot="bg-warn" />}
                  </div>
                  <p className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">
                    <span className="font-medium text-ink">明日预测：</span>
                    {r.content.forecast || "—"}
                  </p>
                </Panel>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="产出趋势（14 天）">{trend.some((t) => t.value > 0) ? <BarChart data={trend} showValues /> : <p className="py-3 text-center text-[12px] text-ink-3">暂无数据</p>}</Panel>
          <Panel title="各项目完成量">{byProject.length > 0 ? <HBarList data={byProject} color={CHART_COLORS[1]} /> : <p className="py-3 text-center text-[12px] text-ink-3">暂无数据</p>}</Panel>
        </div>
      </div>
    </PageShell>
  );
}

function Section({ title, items, dot, empty }: { title: string; items: string[]; dot: string; empty?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">
        {title}（{items.length}）
      </span>
      {items.length === 0 ? (
        <span className="text-[12px] text-ink-3">{empty ?? "无"}</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((x, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink">
              <span className={`mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full ${dot}`} />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
