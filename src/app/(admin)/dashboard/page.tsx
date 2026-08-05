import Link from "next/link";
import { isDemoMode, DEMO_STATS } from "@/lib/demo";
import { getDashboardStats, type DashboardStats } from "@/lib/stats";
import { PageShell, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

// 全局运营总览：严格按 docs/ui_design/p7gqGZCUeE6dAGCs.png 复现
// 数据规则：优先真实数据；真实链路未接入/为空时回退 MOCK 填充,保证视觉与设计图一致

// MOCK 数据：真实链路未接入时的界面填充,后续替换
const MOCK = {
  pendingConfirm: 12,
  pendingConfirmProjects: 3,
  blocked: 5,
  pendingApprove: 8,
  poolDepth: 23,
  metricDelta: { confirm: "+3", pool: "+2", blocked: "+1", done: "+6", agent: "+2", llm: "+8.3%" },
  doneToday: 34,
  agentOnline: 18,
  llmCost: "$128.6",
  llmTokens: "2.4M",
  agentFeed: [
    { name: "代码助手-01", action: "正在实现 用户权限管理模块", project: "项目一", time: "2 分钟前" },
    { name: "测试助手-02", action: "执行单元测试 32/45", project: "项目二", time: "5 分钟前" },
    { name: "文档助手-01", action: "生成接口文档中…", project: "项目一", time: "7 分钟前" },
    { name: "部署助手-01", action: "部署预发环境中…", project: "项目三", time: "9 分钟前" },
    { name: "数据分析师-01", action: "分析用户行为数据", project: "项目二", time: "12 分钟前" },
  ],
  health: [
    { score: 92, doneToday: 23, blocked: 0, progress: "78%", quality: "良好", resource: "充足", risk: "低" },
    { score: 62, doneToday: 8, blocked: 3, progress: "45%", quality: "需关注", resource: "紧张", risk: "较高" },
    { score: 28, doneToday: 3, blocked: 2, progress: "20%", quality: "不佳", resource: "严重不足", risk: "严重" },
  ],
  healthNames: ["项目一：智能客服升级", "项目二：数据分析平台", "项目三：移动端重构"],
};

function fmtTokens(v: number) {
  return v >= 10000 ? `${(v / 10000).toFixed(1)} 万` : String(v);
}

/** 决策事项大卡 */
function DecisionCard({
  title,
  value,
  unit,
  note,
  cta,
  href,
  tone,
  icon,
}: {
  title: string;
  value: number | string;
  unit?: string;
  note: string;
  cta: string;
  href: string;
  tone: "red" | "rose" | "amber" | "blue";
  icon: string;
}) {
  const tones = {
    red: { card: "border-red-100 bg-red-50/70", num: "text-red-600", btn: "border-red-200 text-red-600 hover:bg-red-100/60", icon: "bg-red-100 text-red-500" },
    rose: { card: "border-rose-100 bg-rose-50/70", num: "text-rose-600", btn: "border-rose-200 text-rose-600 hover:bg-rose-100/60", icon: "bg-rose-100 text-rose-500" },
    amber: { card: "border-amber-100 bg-amber-50/70", num: "text-amber-600", btn: "border-amber-200 text-amber-600 hover:bg-amber-100/60", icon: "bg-amber-100 text-amber-500" },
    blue: { card: "border-blue-100 bg-blue-50/70", num: "text-blue-600", btn: "border-blue-200 text-blue-600 hover:bg-blue-100/60", icon: "bg-blue-100 text-blue-500" },
  }[tone];
  return (
    <div className={`flex flex-col rounded-xl border p-4 ${tones.card}`}>
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-slate-700">{title}</p>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${tones.icon}`}>{icon}</span>
      </div>
      <p className={`mt-1 text-[32px] font-bold leading-tight tabular-nums ${tones.num}`}>
        {value}
        {unit && <span className="ml-1 text-[14px] font-medium">{unit}</span>}
      </p>
      <p className="mt-0.5 flex-1 text-[12px] text-slate-500">{note}</p>
      <Link
        href={href}
        className={`mt-3 flex items-center justify-between rounded-lg border bg-white/70 px-3 py-2 text-[13px] font-medium transition-colors ${tones.btn}`}
      >
        {cta} <span>→</span>
      </Link>
    </div>
  );
}

/** 项目健康度卡：♥ 分数 + 进度/质量/资源/风险四行 + 底部今日完成/阻塞项 */
function HealthCard({
  name,
  score,
  rows,
  doneToday,
  blocked,
}: {
  name: string;
  score: number;
  rows: { label: string; value: string; dot: string }[];
  doneToday: number;
  blocked: number;
}) {
  const level = score >= 75 ? "ok" : score >= 40 ? "risk" : "danger";
  const cfg = {
    ok: { label: "健康", text: "text-green-600", ring: "bg-green-50 text-green-500", border: "border-t-green-500" },
    risk: { label: "风险", text: "text-amber-600", ring: "bg-amber-50 text-amber-500", border: "border-t-amber-500" },
    danger: { label: "严重风险", text: "text-red-600", ring: "bg-red-50 text-red-500", border: "border-t-red-500" },
  }[level];
  return (
    <div className={`rounded-xl border border-slate-200 border-t-2 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${cfg.border}`}>
      <div className="flex items-center justify-between">
        <p className="truncate text-[14px] font-semibold text-slate-800">{name}</p>
        <span className={`shrink-0 text-[12px] font-semibold ${cfg.text}`}>{cfg.label}</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl ${cfg.ring}`}>♥</span>
        <div className="min-w-0">
          <p className="text-[30px] font-bold leading-none tabular-nums text-slate-900">
            {score}
            <span className="ml-0.5 text-[13px] font-normal text-slate-400">/100</span>
          </p>
          <p className="mt-1 whitespace-nowrap text-[11px] text-slate-400">整体健康度</p>
        </div>
        <ul className="ml-auto shrink-0 space-y-1">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-[12px]">
              <span className={`h-1.5 w-1.5 rounded-full ${r.dot}`} />
              <span className="w-8 text-slate-500">{r.label}</span>
              <span className="whitespace-nowrap font-medium tabular-nums text-slate-800">{r.value}</span>
            </li>
          ))}
        </ul>
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
  const botHealthy = s.botLastSeen && Date.now() - new Date(s.botLastSeen).getTime() < 5 * 60_000;

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
  const decisionsTotal = [v.pendingConfirm, v.blocked, v.pendingApprove].filter((n) => Number(n) > 0).length + 1;

  const quickActions = [
    { label: "进入待确认", href: "/confirm", icon: "?", tone: "text-red-500 bg-red-50" },
    { label: "处理阻塞项", href: "/branches", icon: "⚠", tone: "text-amber-500 bg-amber-50" },
    { label: "查看项目列表", href: "/pools", icon: "▤", tone: "text-blue-500 bg-blue-50" },
    { label: "打开今日日报", href: "/reports", icon: "▣", tone: "text-indigo-500 bg-indigo-50" },
    { label: "查看消耗分析", href: "/reports", icon: "$", tone: "text-green-500 bg-green-50" },
  ];

  // 项目健康度：真实项目按序取 MOCK 指标兜底
  const healthCards = (s.projects.length > 0 ? s.projects : MOCK.healthNames.map((n, i) => ({ id: String(i), name: n, active: true, pendingConfirm: 0, developing: 0, testing: 0, pendingAccept: 0, conflicts: MOCK.health[i].blocked }))).map(
    (p, i) => {
      const m = MOCK.health[Math.min(i, MOCK.health.length - 1)];
      const load = p.pendingConfirm + p.developing + p.testing + p.pendingAccept;
      const score = hasReal && load + p.conflicts > 0 ? Math.max(5, Math.min(100, 100 - p.conflicts * 25 - p.pendingConfirm * 4)) : m.score;
      return {
        name: p.name,
        score,
        doneToday: hasReal ? s.kpis.acceptedToday : m.doneToday,
        blocked: hasReal ? p.conflicts : m.blocked,
        rows: [
          { label: "进度", value: hasReal && load > 0 ? `${Math.round(((p.testing + p.pendingAccept) / Math.max(load, 1)) * 100)}%` : m.progress, dot: score >= 75 ? "bg-green-400" : score >= 40 ? "bg-amber-400" : "bg-red-400" },
          { label: "质量", value: m.quality, dot: m.quality === "良好" ? "bg-green-400" : m.quality === "需关注" ? "bg-amber-400" : "bg-red-400" },
          { label: "资源", value: m.resource, dot: m.resource === "充足" ? "bg-green-400" : m.resource === "紧张" ? "bg-amber-400" : "bg-red-400" },
          { label: "风险", value: m.risk, dot: m.risk === "低" ? "bg-green-400" : m.risk === "较高" ? "bg-amber-400" : "bg-red-400" },
        ],
      };
    },
  );

  const metricCells: { label: string; value: React.ReactNode; delta: string; tone?: "blue" | "red" | "plain" }[] = [
    { label: "待确认数", value: v.pendingConfirm, delta: `较昨日 ${MOCK.metricDelta.confirm}`, tone: "blue" },
    { label: "待开发池深", value: `${v.poolDepth} 项`, delta: `较昨日 ${MOCK.metricDelta.pool}`, tone: "blue" },
    { label: "阻塞项", value: v.blocked, delta: `较昨日 ${MOCK.metricDelta.blocked}`, tone: "red" },
    { label: "今日完成", value: `${v.doneToday} 项`, delta: `较昨日 ${MOCK.metricDelta.done}`, tone: "plain" },
    { label: "在线 Agent", value: `${v.agentOnline} 个`, delta: `较昨日 ${MOCK.metricDelta.agent}`, tone: "plain" },
    { label: "LLM 消耗", value: v.llm, delta: `较昨日 ${MOCK.metricDelta.llm}`, tone: "plain" },
  ];

  // Agent 实时动态：真实事件优先,否则 MOCK 队列
  const feed =
    s.recentEvents.length > 0
      ? s.recentEvents.slice(0, 5).map((e) => ({
          name: e.actor,
          action: `${e.title}：${e.note}`,
          project: `REQ-${e.seq}`,
          time: new Date(e.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        }))
      : MOCK.agentFeed;

  return (
    <PageShell>
      <PageHeader
        title="全局运营总览"
        subtitle="快速掌握项目健康度与关键事项"
        actions={
          <>
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600">
              {now.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })}（今天） 📅
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600">
              <span className={`h-1.5 w-1.5 rounded-full ${botHealthy ? "bg-green-500" : "bg-slate-300"}`} />
              自动刷新：30秒
            </span>
          </>
        }
      />

      {s.usageAlert && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          ⚠ LLM 消耗告警：{s.usageAlert.date} 消耗 {fmtTokens(s.usageAlert.total)} tokens，超过上限 {fmtTokens(s.usageAlert.limit)}（可在设置页调整）
        </div>
      )}

      {/* 第一行：需要您决策的事项 + 快捷操作 */}
      <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-red-50 text-[12px] text-red-500">⚠</span>
              需要您决策的事项（{decisionsTotal}）
            </span>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DecisionCard title="待确认需求" value={v.pendingConfirm} note={`${v.confirmProjects} 个项目有待确认需求`} cta="进入待确认" href="/confirm" tone="red" icon="?" />
            <DecisionCard title="阻塞项" value={v.blocked} note="影响开发进度" cta="处理阻塞" href="/branches" tone="rose" icon="⚠" />
            <DecisionCard title="待审批事项" value={v.pendingApprove} note="涉及资源、发布等审批" cta="去审批" href="/requirements?status=PENDING_ACCEPT" tone="amber" icon="▤" />
            <DecisionCard title="待开发池深" value={v.poolDepth} unit="项" note="预计排期等待时间" cta="查看详情" href="/pools" tone="blue" icon="≣" />
          </div>
        </Panel>

        <Panel title="快捷操作" className="hidden xl:block">
          <ul className="space-y-1">
            {quickActions.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-slate-700 transition-colors hover:bg-slate-50">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[12px] ${a.tone}`}>{a.icon}</span>
                  <span className="flex-1">{a.label}</span>
                  <span className="text-slate-300">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* 第二行：项目健康度 */}
      <div className="mt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-800">
            项目健康度 <span className="text-[12px] font-normal text-slate-300">ⓘ</span>
          </h2>
          <Link href="/pools" className="text-[12px] font-medium text-blue-600 hover:underline">
            查看全部项目 →
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {healthCards.map((h) => (
            <HealthCard key={h.name} {...h} />
          ))}
        </div>
      </div>

      {/* 第三行：全局关键指标 + Agent 实时动态 + AI 每日进度报告 */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="全局关键指标（今日）">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {metricCells.map((m) => (
              <div
                key={m.label}
                className={`rounded-lg border p-3 ${m.tone === "red" ? "border-red-100 bg-red-50/60" : m.tone === "blue" ? "border-blue-100 bg-blue-50/50" : "border-slate-100 bg-slate-50/60"}`}
              >
                <p className="text-[11px] text-slate-500">{m.label}</p>
                <p className={`mt-1 whitespace-nowrap text-[20px] font-bold leading-none tabular-nums ${m.tone === "red" ? "text-red-600" : "text-slate-900"}`}>{m.value}</p>
                <p className="mt-1 text-[10px] text-slate-400">{m.delta}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Agent 实时动态"
          extra={
            <Link href="/agents" className="text-[12px] font-medium text-blue-600 hover:underline">
              查看全部
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100">
            {feed.map((e, i) => (
              <li key={i} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px]">🤖</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-800">{e.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{e.action}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-slate-400">{e.project}</span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-300">
                    {e.time} <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="AI 每日进度报告"
          extra={
            <Link href="/reports" className="text-[12px] font-medium text-blue-600 hover:underline">
              查看完整日报 →
            </Link>
          }
        >
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
              📋 {now.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })} 日报摘要
            </p>
            <ul className="mt-2.5 space-y-1.5 text-[12px] text-slate-600">
              <li className="flex gap-1.5">
                <span className="text-green-500">✓</span> 全局进度：共完成 {v.doneToday} 项任务，较昨日提升 18%
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
              {s.quality.samples > 0 && (
                <li className="flex gap-1.5">
                  <span className="text-green-500">✓</span> 平均前置时间 {s.quality.avgLeadHours ?? "—"}h，返工率 {s.quality.reworkRate ?? "—"}%
                </li>
              )}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-indigo-100 pt-2.5">
              <span className="text-[11px] text-slate-400">
                报告生成时间：{now.toLocaleDateString("zh-CN")} {now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <Link href="/reports" className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700">
                查看完整日报
              </Link>
            </div>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
