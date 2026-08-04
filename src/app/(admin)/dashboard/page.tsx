import Link from "next/link";
import { currentAdmin } from "@/lib/auth";
import { isDemoMode, DEMO_STATS } from "@/lib/demo";
import { getDashboardStats, type DashboardStats } from "@/lib/stats";
import { Sparkline, AreaTrend, Donut, VBars, HBarList, CHART_COLORS } from "@/components/charts";
import { PageShell } from "@/components/ui";

export const dynamic = "force-dynamic";

const AVATAR_BG = ["bg-indigo-500", "bg-teal-500", "bg-amber-500", "bg-rose-500", "bg-sky-500"];

function Panel({ title, extra, children, className = "" }: { title: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <span className="h-3.5 w-1 rounded-full bg-indigo-500" />
          {title}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const admin = await currentAdmin();
  const demo = await isDemoMode();
  const s: DashboardStats = demo ? (DEMO_STATS as unknown as DashboardStats) : await getDashboardStats();

  const botHealthy = s.botLastSeen && Date.now() - new Date(s.botLastSeen).getTime() < 5 * 60_000;
  const fmtWan = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}w` : String(v));
  const now = new Date();

  const kpiCards = [
    { label: "待确认需求", value: s.kpis.pendingConfirm, spark: s.kpis.spark.created, color: CHART_COLORS[0], href: "/confirm", trendLabel: "近 7 天流入" },
    { label: "进行中", value: s.kpis.inProgress, spark: s.kpis.spark.created.map((v, i) => v + s.kpis.spark.accepted[i]), color: CHART_COLORS[4], href: "/pools", trendLabel: "开发/测试/审核" },
    { label: "待验收", value: s.kpis.pendingAccept, spark: s.kpis.spark.accepted, color: CHART_COLORS[2], href: "/requirements?status=PENDING_ACCEPT", trendLabel: "等你验收" },
    { label: "今日已验收", value: s.kpis.acceptedToday, spark: s.kpis.spark.accepted, color: CHART_COLORS[1], href: "/requirements?status=ACCEPTED", trendLabel: "近 7 天验收" },
  ];

  return (
    <PageShell>
      {/* 头部 */}
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">全局看板</h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            {now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })} · 你好，{admin?.displayName ?? "管理员"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${botHealthy ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400" : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${botHealthy ? "bg-green-500" : "bg-zinc-400"}`} />
            微信 Bot {botHealthy ? "在线" : "离线"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            ⚡ {s.agentActive} 个 Agent 活跃
          </span>
        </div>
      </header>

      {s.usageAlert && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          ⚠ LLM 消耗告警：{s.usageAlert.date} 消耗 {(s.usageAlert.total / 10000).toFixed(1)} 万 tokens，超过上限 {(s.usageAlert.limit / 10000).toFixed(1)} 万（可在设置页调整上限）
        </div>
      )}

      {/* KPI 行 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-xs text-zinc-400">{k.label}</p>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p className="text-[28px] font-semibold leading-none tabular-nums tracking-tight">{k.value}</p>
              <Sparkline values={k.spark} color={k.color} />
            </div>
            <p className="mt-1.5 text-[10px] text-zinc-300 dark:text-zinc-600">{k.trendLabel}</p>
          </Link>
        ))}
      </div>

      {/* 第二行：趋势 + 状态分布 */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Panel title="需求吞吐（近 14 天）" className="lg:col-span-2">
          <AreaTrend
            labels={s.trend14d.labels}
            series={[
              { name: "新增需求", values: s.trend14d.created, color: CHART_COLORS[0] },
              { name: "完成验收", values: s.trend14d.accepted, color: CHART_COLORS[1] },
            ]}
          />
        </Panel>
        <Panel title="需求状态分布">
          <Donut data={s.statusDist} centerLabel="在途需求" />
        </Panel>
      </div>

      {/* 第三行：项目健康表 + 动态流 */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Panel title="项目健康" className="lg:col-span-2" extra={<Link href="/pools" className="text-xs text-indigo-500">任务池 →</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-zinc-400">
                  <th className="pb-2 font-normal">项目</th>
                  <th className="pb-2 text-center font-normal">待确认</th>
                  <th className="pb-2 text-center font-normal">开发</th>
                  <th className="pb-2 text-center font-normal">测试</th>
                  <th className="pb-2 text-center font-normal">待验收</th>
                  <th className="pb-2 text-center font-normal">冲突</th>
                  <th className="pb-2 text-right font-normal">状态</th>
                </tr>
              </thead>
              <tbody>
                {s.projects.map((p, i) => (
                  <tr key={p.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-semibold text-white ${AVATAR_BG[i % AVATAR_BG.length]}`}>
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="max-w-40 truncate font-medium">{p.name}</span>
                      </span>
                    </td>
                    <td className="text-center tabular-nums">{p.pendingConfirm}</td>
                    <td className="text-center tabular-nums">{p.developing}</td>
                    <td className="text-center tabular-nums">{p.testing}</td>
                    <td className="text-center tabular-nums">{p.pendingAccept}</td>
                    <td className="text-center">
                      {p.conflicts > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/60 dark:text-red-400">
                          ⚠ {p.conflicts}
                        </span>
                      ) : (
                        <span className="text-zinc-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${p.active ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"}`}>
                        {p.active ? "活跃" : "未启用"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="最新动态" extra={<Link href="/requirements" className="text-xs text-indigo-500">全部 →</Link>}>
          <ul className="space-y-2.5">
            {s.recentEvents.slice(0, 6).map((e, i) => (
              <li key={i} className="flex gap-2 text-[12px]">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-mono text-[10px] text-zinc-400">REQ-{e.seq}</span>{" "}
                    <span className="font-medium">{e.title}</span>
                  </p>
                  <p className="truncate text-[11px] text-zinc-400">{e.note}</p>
                  <p className="text-[10px] text-zinc-300 dark:text-zinc-600">
                    {new Date(e.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {e.actor}
                  </p>
                </div>
              </li>
            ))}
            {s.recentEvents.length === 0 && <p className="py-4 text-center text-xs text-zinc-400">暂无动态</p>}
          </ul>
        </Panel>
      </div>

      {/* 第四行：Agent 排行 + LLM 消耗 + 交付质量 */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Panel title="Agent 完成量排行" extra={<Link href="/agents" className="text-xs text-indigo-500">管理 →</Link>}>
          {s.agentRank.length > 0 ? (
            <HBarList data={s.agentRank} color={CHART_COLORS[1]} />
          ) : (
            <p className="py-4 text-center text-xs text-zinc-400">尚无 Agent</p>
          )}
        </Panel>
        <Panel title="LLM 消耗（近 7 天 · tokens）">
          <VBars data={s.llm7d.byDay} color={CHART_COLORS[0]} valueLabel={fmtWan} />
        </Panel>
        <Panel title="交付质量（近 30 天已验收）">
          {s.quality.samples > 0 ? (
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between">
                <dt className="text-xs text-zinc-400">平均前置时间（流入→验收）</dt>
                <dd className="text-xl font-semibold tabular-nums">{s.quality.avgLeadHours ?? "—"}<span className="ml-0.5 text-xs font-normal text-zinc-400">h</span></dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-xs text-zinc-400">平均开发时长</dt>
                <dd className="text-xl font-semibold tabular-nums">{s.quality.avgDevHours ?? "—"}<span className="ml-0.5 text-xs font-normal text-zinc-400">h</span></dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-xs text-zinc-400">返工率（测试打回）</dt>
                <dd className="text-xl font-semibold tabular-nums">{s.quality.reworkRate ?? "—"}<span className="ml-0.5 text-xs font-normal text-zinc-400">%</span></dd>
              </div>
              <p className="text-[10px] text-zinc-300 dark:text-zinc-600">样本：{s.quality.samples} 个已验收需求</p>
            </dl>
          ) : (
            <p className="py-4 text-center text-xs text-zinc-400">暂无已验收需求</p>
          )}
        </Panel>
        <Panel title="消耗构成（按专家角色）">
          {s.llm7d.byRole.length > 0 ? (
            <Donut
              data={s.llm7d.byRole.map((r, i) => ({
                name: r.name,
                value: Math.max(Math.round(r.value / 10000), 1),
                color: CHART_COLORS[i % CHART_COLORS.length],
              }))}
              centerLabel="万 tokens"
              size={116}
            />
          ) : (
            <p className="py-4 text-center text-xs text-zinc-400">暂无调用</p>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
