import Link from "next/link";
import { isDemoMode, DEMO_STATS } from "@/lib/demo";
import { getDashboardStats, type DashboardStats } from "@/lib/stats";
import { PageShell, PageHeader, Panel } from "@/components/ui";
import { Sparkline, AreaTrend, GroupedBars, CHART_COLORS } from "@/components/charts";

export const dynamic = "force-dynamic";

// 全局运营总览：严格按 docs/ui_design 0806 新版参考图复现
// 布局：待处理事项 + 快捷操作 / 项目健康度(3 卡 + 指标对比) /
//       全局关键指标 + 项目进度趋势 + AI 每日进度趋势 /
//       Agent 实时动态 + 资源使用情况 + 项目类型分布 + AI 每日报告摘要
// 数据规则：优先真实数据；真实链路未接入/为空时回退 MOCK 填充

// MOCK 数据：真实链路未接入时的界面填充,后续替换
const MOCK = {
  pendingConfirm: 12,
  pendingConfirmProjects: 3,
  blocked: 5,
  pendingApprove: 8,
  poolDepth: 23,
  delta: { confirm: "+3", blocked: "+1", approve: "+2", pool: "较昨日 +2", confirmD: "较昨日 +3", blockedD: "较昨日 +1", done: "较昨日 +6", agent: "较昨日 +2", llm: "较昨日 +8.3%" },
  doneToday: 34,
  agentOnline: 18,
  llmCost: "$128.6",
  llmTokens: "2.4M",
  agentFeed: [
    { name: "代码助手-01", action: "正在处理 用户权限管理模块", time: "2 分钟前" },
    { name: "测试助手-02", action: "执行单元测试 32/45", time: "5 分钟前" },
    { name: "文档助手-01", action: "生成接口文档中…", time: "7 分钟前" },
    { name: "数据分析师-01", action: "分析用户行为数据", time: "12 分钟前" },
  ],
  health: [
    { score: 92, doneToday: 23, blocked: 0, progress: 78, quality: "良好", resource: "充足", risk: "低", spark: [55, 62, 58, 70, 66, 78, 74, 85, 80, 92] },
    { score: 62, doneToday: 8, blocked: 3, progress: 45, quality: "需关注", resource: "紧张", risk: "较高", spark: [70, 64, 68, 58, 62, 52, 58, 50, 56, 62] },
    { score: 28, doneToday: 3, blocked: 2, progress: 20, quality: "不佳", resource: "严重不足", risk: "严重", spark: [52, 45, 48, 40, 42, 35, 38, 30, 34, 28] },
  ],
  healthNames: ["BitSoulClaw", "bitsoulofficial", "minsheng-worklog-mp"],
  // 指标对比：进度/质量/资源 分数化;风险越低越好
  compare: [
    [78, 66, 52, 25],
    [45, 60, 40, 15],
    [68, 45, 30, 62],
  ],
  progressTrend: {
    labels: ["07/31", "08/01", "08/02", "08/03", "08/04", "08/05", "08/06"],
    series: [
      [15, 30, 38, 52, 60, 68, 78],
      [8, 16, 24, 30, 36, 41, 45],
      [4, 7, 10, 13, 16, 18, 20],
    ],
  },
  dailyDone: [42, 75, 58, 85, 62, 88, 60],
  resources: [
    { icon: "🖥", tone: "bg-blue-50 text-blue-600", name: "计算资源", pct: 68, detail: "6.8 / 10 核", bar: "#2563EB" },
    { icon: "💾", tone: "bg-green-50 text-green-600", name: "存储资源", pct: 45, detail: "225 / 500 GB", bar: "#16A34A" },
    { icon: "🧠", tone: "bg-violet-50 text-violet-600", name: "内存资源", pct: 72, detail: "14.4 / 20 GB", bar: "#8B5CF6" },
    { icon: "🌐", tone: "bg-amber-50 text-amber-600", name: "网络资源", pct: 45, detail: "320 / 1000 Mbps", bar: "#F59E0B" },
  ],
  projectTypes: [
    { name: "AI 应用开发", count: 8, pct: 44, color: "#2563EB" },
    { name: "数据分析", count: 5, pct: 28, color: "#16A34A" },
    { name: "平台开发", count: 3, pct: 17, color: "#F59E0B" },
    { name: "其他", count: 2, pct: 11, color: "#8B5CF6" },
  ],
  reportTime: "01:33",
};

function fmtTokens(v: number) {
  return v >= 10000 ? `${(v / 10000).toFixed(1)} 万` : String(v);
}

/** 待处理事项卡：淡色渐变底 + 大数字 + 增量 + 3D 图标位 + 底部链接 */
function TodoCard({
  title,
  value,
  unit,
  delta,
  note,
  cta,
  href,
  tone,
  icon,
}: {
  title: string;
  value: number | string;
  unit?: string;
  delta?: string;
  note: string;
  cta: string;
  href: string;
  tone: "red" | "rose" | "amber" | "blue";
  icon: string;
}) {
  const tones = {
    red: { card: "from-red-50/90", num: "text-red-600", icon: "bg-red-100/80" },
    rose: { card: "from-rose-50/90", num: "text-rose-600", icon: "bg-rose-100/80" },
    amber: { card: "from-amber-50/90", num: "text-amber-600", icon: "bg-amber-100/80" },
    blue: { card: "from-blue-50/90", num: "text-blue-600", icon: "bg-blue-100/80" },
  }[tone];
  return (
    <div className={`flex flex-col rounded-xl border border-slate-200 bg-gradient-to-br to-white p-4 ${tones.card}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-slate-700">{title}</p>
          <p className={`mt-1.5 text-[32px] font-bold leading-none tabular-nums ${tones.num}`}>
            {value}
            {unit && <span className="ml-1 text-[14px] font-medium">{unit}</span>}
          </p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-[20px] shadow-sm ${tones.icon}`}>{icon}</span>
      </div>
      <p className="mt-1.5 flex-1 text-[12px] text-slate-500">
        {note}
        {delta && <span className="ml-1.5 font-semibold text-red-500">{delta}</span>}
      </p>
      <Link href={href} className="mt-3 flex items-center gap-1 border-t border-slate-200/70 pt-2.5 text-[13px] font-medium text-blue-600 hover:underline">
        {cta} <span>→</span>
      </Link>
    </div>
  );
}

/** 项目健康度卡：分数 + 趋势线 + 进度/质量/资源/风险四列 + 底部完成/阻塞 */
function HealthCard({
  name,
  score,
  spark,
  metrics,
  doneToday,
  blocked,
}: {
  name: string;
  score: number;
  spark: number[];
  metrics: { label: string; value: string; dot: string }[];
  doneToday: number;
  blocked: number;
}) {
  const level = score >= 75 ? "ok" : score >= 40 ? "risk" : "danger";
  const cfg = {
    ok: { label: "健康", text: "text-green-600", line: "#16A34A" },
    risk: { label: "风险", text: "text-amber-600", line: "#F59E0B" },
    danger: { label: "严重风险", text: "text-red-600", line: "#EF4444" },
  }[level];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[14px] font-semibold text-slate-800">{name}</p>
        <span className={`shrink-0 text-[12px] font-semibold ${cfg.text}`}>{cfg.label}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="shrink-0">
          <p className="text-[30px] font-bold leading-none tabular-nums text-slate-900">
            {score}
            <span className="ml-0.5 text-[13px] font-normal text-slate-400">/100</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-400">整体健康度</p>
        </div>
        <Sparkline values={spark} color={cfg.line} width={150} height={44} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1">
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="flex items-center gap-1 text-[11px] text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
              {m.label}
            </p>
            <p className="mt-0.5 whitespace-nowrap text-[12px] font-semibold tabular-nums text-slate-800">{m.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[12px]">
        <span className="text-slate-500">
          今日完成 <b className="tabular-nums text-slate-800">{doneToday}</b> 项
        </span>
        <span className={blocked > 0 ? "font-medium text-red-500" : "text-slate-400"}>
          阻塞项 <b className="tabular-nums">{blocked}</b>
        </span>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const demo = await isDemoMode();
  const s: DashboardStats = demo ? (DEMO_STATS as unknown as DashboardStats) : await getDashboardStats();

  const now = new Date();
  const dateStr = now.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });

  // 真实值优先,为空回退 MOCK
  const conflictsReal = s.projects.reduce((acc, p) => acc + p.conflicts, 0);
  const readyReal = s.statusDist.find((d) => d.name === "待开发")?.value ?? 0;
  const llmTodayReal = s.llm7d.byDay.at(-1)?.value ?? 0;
  const hasReal = s.kpis.pendingConfirm + s.kpis.inProgress + s.kpis.pendingAccept + readyReal > 0;

  const v = {
    pendingConfirm: hasReal ? s.kpis.pendingConfirm : MOCK.pendingConfirm,
    confirmProjects: hasReal ? s.projects.filter((p) => p.pendingConfirm > 0).length : MOCK.pendingConfirmProjects,
    blocked: hasReal ? conflictsReal : MOCK.blocked,
    pendingApprove: hasReal ? s.kpis.pendingAccept : MOCK.pendingApprove,
    poolDepth: hasReal ? readyReal : MOCK.poolDepth,
    doneToday: hasReal ? s.kpis.acceptedToday : MOCK.doneToday,
    agentOnline: s.agentActive > 0 ? s.agentActive : MOCK.agentOnline,
    llm: llmTodayReal > 0 ? fmtTokens(llmTodayReal) : MOCK.llmCost,
    llmWeek: (() => {
      const t = s.llm7d.byDay.reduce((acc, d) => acc + d.value, 0);
      return t > 0 ? fmtTokens(t) : MOCK.llmTokens;
    })(),
  };

  const quickActions = [
    { label: "进入待确认", href: "/confirm", icon: "❓", tone: "bg-red-50 text-red-500" },
    { label: "处理阻塞项", href: "/branches", icon: "⚠️", tone: "bg-amber-50 text-amber-500" },
    { label: "查看项目列表", href: "/pools", icon: "▤", tone: "bg-blue-50 text-blue-600" },
    { label: "打开今日日报", href: "/reports", icon: "▣", tone: "bg-indigo-50 text-indigo-600" },
    { label: "查看消耗分析", href: "/reports", icon: "$", tone: "bg-green-50 text-green-600" },
    { label: "智能体管理", href: "/agents", icon: "⬡", tone: "bg-violet-50 text-violet-600" },
    { label: "创建新项目", href: "/settings", icon: "＋", tone: "bg-sky-50 text-sky-600" },
    { label: "更多功能", href: "/more", icon: "▦", tone: "bg-purple-50 text-purple-600" },
  ];

  // 项目健康度：真实项目按序,MOCK 指标兜底
  const projectList = s.projects.length > 0 ? s.projects : MOCK.healthNames.map((n, i) => ({ id: String(i), name: n, active: true, pendingConfirm: 0, developing: 0, testing: 0, pendingAccept: 0, conflicts: MOCK.health[i].blocked }));
  // 健康卡渲染全部项目(网格自动换行);mock 指标按索引循环兜底
  const healthCards = projectList.map((p, i) => {
    const m = MOCK.health[i % MOCK.health.length];
    const load = p.pendingConfirm + p.developing + p.testing + p.pendingAccept;
    const score = hasReal && load + p.conflicts > 0 ? Math.max(5, Math.min(100, 100 - p.conflicts * 25 - p.pendingConfirm * 4)) : m.score;
    const progress = hasReal && load > 0 ? Math.round(((p.testing + p.pendingAccept) / Math.max(load, 1)) * 100) : m.progress;
    const dotFor = (good: boolean, mid: boolean) => (good ? "bg-green-400" : mid ? "bg-amber-400" : "bg-red-400");
    return {
      name: p.name,
      score,
      spark: m.spark,
      doneToday: hasReal ? s.kpis.acceptedToday : m.doneToday,
      blocked: hasReal ? p.conflicts : m.blocked,
      metrics: [
        { label: "进度", value: `${progress}%`, dot: dotFor(progress >= 60, progress >= 35) },
        { label: "质量", value: m.quality, dot: dotFor(m.quality === "良好", m.quality === "需关注") },
        { label: "资源", value: m.resource, dot: dotFor(m.resource === "充足", m.resource === "紧张") },
        { label: "风险", value: m.risk, dot: dotFor(m.risk === "低", m.risk === "较高") },
      ],
    };
  });

  const metricCells = [
    { label: "待确认数", value: v.pendingConfirm, delta: MOCK.delta.confirmD, icon: "📋", cell: "border-blue-100 bg-blue-50/50" },
    { label: "待开发资源", value: `${v.poolDepth} 项`, delta: MOCK.delta.pool, icon: "🗂", cell: "border-indigo-100 bg-indigo-50/50" },
    { label: "阻塞项", value: v.blocked, delta: MOCK.delta.blockedD, icon: "⚠️", cell: "border-red-100 bg-red-50/50", alert: true },
    { label: "今日完成", value: `${v.doneToday} 项`, delta: MOCK.delta.done, icon: "✅", cell: "border-slate-100 bg-slate-50/60" },
    { label: "在线 Agent", value: `${v.agentOnline} 个`, delta: MOCK.delta.agent, icon: "🤖", cell: "border-slate-100 bg-slate-50/60" },
    { label: "LLM 消耗", value: v.llm, delta: MOCK.delta.llm, icon: "💠", cell: "border-slate-100 bg-slate-50/60" },
  ];

  // Agent 实时动态：真实事件优先,否则 MOCK
  const feed =
    s.recentEvents.length > 0
      ? s.recentEvents.slice(0, 4).map((e) => ({
          name: e.actor,
          action: `REQ-${e.seq} ${e.title}：${e.note}`,
          time: new Date(e.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        }))
      : MOCK.agentFeed;

  // 图表区最多取前 6 个项目保证可读性(健康卡不受限)
  const chartProjects = projectList.slice(0, 6);
  const trendColors = ["#16A34A", "#F59E0B", "#EF4444", "#2563EB", "#8B5CF6", "#14B8A6"];

  return (
    <PageShell>
      <PageHeader
        title="全局运营总览"
        subtitle="AI 驱动的项目健康度与关键指标总览"
        actions={
          <>
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600">{dateStr}（今天） 📅</span>
            <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600">
              ⟳ 自动刷新：30秒 <span className="text-slate-300">∨</span>
            </span>
          </>
        }
      />

      {s.usageAlert && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          ⚠ LLM 消耗告警：{s.usageAlert.date} 消耗 {fmtTokens(s.usageAlert.total)} tokens，超过上限 {fmtTokens(s.usageAlert.limit)}（可在设置页调整）
        </div>
      )}

      {/* 第一行：待处理事项 + 快捷操作 */}
      <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
        <Panel title="待处理事项">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TodoCard title="待确认需求" value={v.pendingConfirm} delta={MOCK.delta.confirm} note={`${v.confirmProjects} 个项目有待确认需求`} cta="进入待确认" href="/confirm" tone="red" icon="📥" />
            <TodoCard title="阻塞项" value={v.blocked} delta={MOCK.delta.blocked} note="影响开发进度" cta="处理阻塞" href="/branches" tone="rose" icon="⛰" />
            <TodoCard title="待审批事项" value={v.pendingApprove} delta={MOCK.delta.approve} note="涉及资源、发布等审批" cta="去审批" href="/requirements?status=PENDING_ACCEPT" tone="amber" icon="👤" />
            <TodoCard title="待开发资源" value={v.poolDepth} unit="项" note="预计排期等待时间" cta="查看详情" href="/pools" tone="blue" icon="🗂" />
          </div>
        </Panel>

        <Panel title="快捷操作" className="hidden xl:block">
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {quickActions.map((a) => (
              <Link key={a.label} href={a.href} className="group flex flex-col items-center gap-1.5">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-[17px] transition-transform group-hover:scale-105 ${a.tone}`}>
                  {a.icon}
                </span>
                <span className="text-center text-[11px] leading-tight text-slate-600">{a.label}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      {/* 第二行：项目健康度（3 卡 + 指标对比） */}
      <div className="mt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-800">
            项目健康度 <span className="text-[12px] font-normal text-slate-300">ⓘ</span>
          </h2>
          <Link href="/pools" className="text-[12px] font-medium text-blue-600 hover:underline">
            查看全部项目 →
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {healthCards.map((h) => (
            <HealthCard key={h.name} {...h} />
          ))}
          <Panel title="项目关键指标对比">
            {/* MOCK：质量/资源/风险分数未量化,对比数据为示例 */}
            <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1">
              {[
                { n: "进度(%)", c: "#16A34A" },
                { n: "质量(%)", c: "#2563EB" },
                { n: "资源(%)", c: "#F59E0B" },
                { n: "风险(越低越好)", c: "#EF4444" },
              ].map((l) => (
                <span key={l.n} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.c }} />
                  {l.n}
                </span>
              ))}
            </div>
            <GroupedBars
              groups={chartProjects.map((p, i) => ({ label: p.name, values: MOCK.compare[i % MOCK.compare.length] }))}
              colors={["#16A34A", "#2563EB", "#F59E0B", "#EF4444"]}
            />
          </Panel>
        </div>
      </div>

      {/* 第三行：全局关键指标 + 项目进度趋势 + AI 每日进度趋势 */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="全局关键指标（今日）">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {metricCells.map((m) => (
              <div key={m.label} className={`rounded-lg border p-3 ${m.cell}`}>
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="text-[13px]">{m.icon}</span>
                  {m.label}
                </p>
                <p className={`mt-1.5 whitespace-nowrap text-[20px] font-bold leading-none tabular-nums ${m.alert ? "text-red-600" : "text-slate-900"}`}>{m.value}</p>
                <p className="mt-1 text-[10px] text-slate-400">{m.delta}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="项目进度趋势" extra={<span className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">近7天 ∨</span>}>
          {/* MOCK：项目级进度历史未落库,趋势为示例;项目名取真实项目 */}
          <AreaTrend
            labels={MOCK.progressTrend.labels}
            series={chartProjects.map((p, i) => ({ name: p.name, values: MOCK.progressTrend.series[i % MOCK.progressTrend.series.length], color: trendColors[i % trendColors.length] }))}
            height={140}
          />
        </Panel>

        <Panel
          title="AI 每日进度趋势"
          extra={
            <span className="flex items-center gap-2">
              <Link href="/reports" className="text-[12px] font-medium text-blue-600 hover:underline">
                查看历史报告 →
              </Link>
              <span className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">近7天 ∨</span>
            </span>
          }
        >
          {/* 真实数据优先：近 7 天验收完成数;全为 0 时回退 MOCK 曲线 */}
          <p className="mb-1 text-[10px] text-slate-400">完成事项数（个）</p>
          <AreaTrend
            labels={MOCK.progressTrend.labels}
            series={[
              {
                name: "完成事项数",
                values: s.kpis.spark.accepted.some((x) => x > 0) ? s.kpis.spark.accepted : MOCK.dailyDone,
                color: CHART_COLORS[0],
              },
            ]}
            height={132}
          />
        </Panel>
      </div>

      {/* 第四行：Agent 实时动态 + 资源使用情况 + 项目类型分布 + AI 每日报告摘要 */}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel
          title="Agent 实时动态"
          extra={
            <Link href="/agents" className="text-[12px] font-medium text-blue-600 hover:underline">
              查看全部 →
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100">
            {feed.map((e, i) => (
              <li key={i} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px]">🤖</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-800">{e.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{e.action}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-300">
                  {e.time} <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="资源使用情况">
          {/* MOCK：主机资源监控未接入,示例数据 */}
          <ul className="space-y-3.5">
            {MOCK.resources.map((r) => (
              <li key={r.name}>
                <div className="flex items-center gap-2">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[12px] ${r.tone}`}>{r.icon}</span>
                  <span className="w-14 text-[12px] text-slate-600">{r.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full" style={{ width: `${r.pct}%`, background: r.bar }} />
                  </span>
                  <span className="w-9 text-right text-[12px] font-medium tabular-nums text-slate-700">{r.pct}%</span>
                </div>
                <p className="mt-0.5 pl-8 text-right text-[10px] text-slate-400">{r.detail}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="项目类型分布">
          {/* MOCK：项目类型字段未落库,示例分布 */}
          <ul className="space-y-3.5">
            {MOCK.projectTypes.map((t) => (
              <li key={t.name} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                <span className="w-20 truncate text-[12px] text-slate-600">{t.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full" style={{ width: `${t.pct}%`, background: t.color }} />
                </span>
                <span className="w-14 text-right text-[12px] tabular-nums text-slate-600">
                  {t.count} <span className="text-slate-400">({t.pct}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="AI 每日报告摘要">
          <p className="text-[14px] font-bold text-slate-900">{dateStr}</p>
          <ul className="mt-2.5 space-y-1.5 text-[12px] text-slate-600">
            <li className="flex gap-1.5">
              <span className="text-amber-500">✓</span> 全局进度：共完成 {v.doneToday} 项任务，较昨日提升 18%
            </li>
            <li className="flex gap-1.5">
              <span className="text-green-500">✓</span> 待确认需求 {v.pendingConfirm} 项，待审批 {v.pendingApprove} 项
            </li>
            <li className="flex gap-1.5">
              <span className={Number(v.blocked) > 0 ? "text-red-500" : "text-green-500"}>{Number(v.blocked) > 0 ? "!" : "✓"}</span>
              {Number(v.blocked) > 0 ? `有 ${v.blocked} 个阻塞项需要优先处理` : "当前无阻塞项"}
            </li>
            <li className="flex gap-1.5">
              <span className="text-green-500">✓</span> 共消耗 LLM Token {v.llmWeek}，费用 {llmTodayReal > 0 ? "以账单为准" : MOCK.llmCost}
            </li>
          </ul>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
            <span className="text-[10px] text-slate-400">
              报告生成时间：{dateStr} {MOCK.reportTime}
            </span>
            <Link href="/reports" className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700">
              查看完整日报
            </Link>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
