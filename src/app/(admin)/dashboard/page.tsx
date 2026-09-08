import Link from "next/link";
import { isDemoMode, DEMO_STATS } from "@/lib/demo";
import { getDashboardStats, type DashboardStats } from "@/lib/stats";
import { PageShell, PageHeader, Panel, KpiTile, KpiRow, Table, EmptyRow, Chip, EmptyState, LinkButton, ago, fmtTokens, fmtDateTime, DemoNote, Notice } from "@/components/ui";
import { LineChart, Legend, BarChart, CHART_COLORS } from "@/components/charts";
import { Icon } from "@/components/icons";
import { actorLabel } from "@/components/status";

export const dynamic = "force-dynamic";

// 工作台（设计画布「工作台」画板）：
// 第一行 = 需要人处理的四个数字；项目状态表；近 14 天吞吐；最近动态；智能体在线；LLM 用量；系统状态。
// 真实模式只用 getDashboardStats()，无数据即空态，不再用 MOCK 填充。

function delta(n: number | null | undefined): React.ReactNode {
  if (n == null) return null;
  if (n === 0) return <span className="text-ink-3">较昨日持平</span>;
  return <span className={n > 0 ? "text-ink-2" : "text-ink-3"}>较昨日 {n > 0 ? `+${n}` : n}</span>;
}

export default async function DashboardPage() {
  const demo = await isDemoMode();
  const s: DashboardStats = demo ? (DEMO_STATS as unknown as DashboardStats) : await getDashboardStats();
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;

  const rows = s.projectRows ?? [];
  const noProjects = rows.length === 0;
  const feed = s.recentEvents.slice(0, 8);
  const llmTotal7d = s.llm7d.byDay.reduce((a, d) => a + d.value, 0);
  const qualityItems = [
    { label: "需求前置时间", value: s.quality.avgLeadHours != null ? `${s.quality.avgLeadHours} 小时` : "—" },
    { label: "开发时长", value: s.quality.avgDevHours != null ? `${s.quality.avgDevHours} 小时` : "—" },
    { label: "返工率", value: s.quality.reworkRate != null ? `${s.quality.reworkRate}%` : "—" },
  ];

  return (
    <PageShell>
      <PageHeader
        title="工作台"
        subtitle="今日待办 · 项目状态 · 系统健康"
        actions={
          <>
            <span className="num flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[12px] text-ink-2">
              <Icon name="calendar" size={13} />
              {dateStr}
            </span>
            <LinkButton href="/dashboard" icon="refresh">
              刷新
            </LinkButton>
          </>
        }
      />
      {demo && <DemoNote />}

      {s.system?.usageAlert && (
        <Notice tone="danger">
          LLM 消耗告警：{s.system.usageAlert.date} 消耗 {fmtTokens(s.system.usageAlert.total)} tokens，超过上限 {fmtTokens(s.system.usageAlert.limit)}。可在设置页调整上限。
        </Notice>
      )}
      {s.system?.botAlert && (
        <Notice tone="warn">
          微信机器人心跳超时（最近一次 {s.system.botLastSeen ? ago(s.system.botLastSeen) : "从未"}），采集可能中断。请检查 OpenClaw 插件；期间可用「采集箱 → 手动导入」兜底。
        </Notice>
      )}

      {/* 第一行：需要人处理的事 */}
      <KpiRow cols={4}>
        <KpiTile
          label="待确认需求"
          value={s.todo.pendingConfirm}
          sub={
            s.todo.pendingConfirm > 0
              ? `微信 ${s.todo.pendingConfirmSources.wechat} · 手动 ${s.todo.pendingConfirmSources.manual}${s.todo.pendingConfirmSources.web ? ` · 表单 ${s.todo.pendingConfirmSources.web}` : ""}`
              : "队列已清空"
          }
          tone={s.todo.pendingConfirm > 0 ? "default" : "default"}
          href={s.todo.pendingConfirm > 0 ? "/confirm" : undefined}
        />
        <KpiTile label="待裁决（部分通过）" value={s.todo.reviewing} sub={s.todo.reviewing > 0 ? "测试部分通过，需人工判断" : "无"} tone={s.todo.reviewing > 0 ? "warn" : "default"} href={s.todo.reviewing > 0 ? "/requirements?status=REVIEWING" : undefined} />
        <KpiTile label="待验收" value={s.todo.pendingAccept} sub={s.todo.pendingAccept > 0 ? "测试全部通过，等你验收" : "无"} tone={s.todo.pendingAccept > 0 ? "warn" : "default"} href={s.todo.pendingAccept > 0 ? "/branches" : undefined} />
        <KpiTile label="合并冲突" value={s.todo.conflicts} sub={s.todo.conflicts > 0 ? "feature → daily 合并失败" : "无"} tone={s.todo.conflicts > 0 ? "alert" : "default"} href={s.todo.conflicts > 0 ? "/branches" : undefined} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Panel
            title="项目状态"
            pad={false}
            extra={
              <Link href="/pools" className="flex items-center gap-0.5 text-[12px] text-accent hover:underline">
                执行看板 <Icon name="chevronRight" size={12} />
              </Link>
            }
          >
            <Table head={["项目", "待确认", "待开发", "开发中", "测试中", "待验收", "冲突", "今日分支", "晚间合并"]}>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-ink">
                    <Link href={`/pools?project=${p.id}`} className="hover:text-accent hover:underline">
                      {p.name}
                    </Link>
                    {!p.active && <Chip tone="slate" className="ml-2">未启用</Chip>}
                  </td>
                  <td className="num">{p.pendingConfirm}</td>
                  <td className="num">{p.ready}</td>
                  <td className="num">{p.developing}</td>
                  <td className="num">{p.testing}</td>
                  <td className="num">{p.pendingAccept}</td>
                  <td className={`num ${p.conflicts > 0 ? "font-semibold text-danger" : ""}`}>{p.conflicts}</td>
                  <td className="font-mono text-[12px] text-ink-2">{p.todayBranch ? p.todayBranch.name : <span className="text-ink-3">未创建</span>}</td>
                  <td>{p.todayBranch ? p.todayBranch.mergedToMain ? <Chip tone="green">已合并 main</Chip> : <Chip tone="amber">未合并</Chip> : <span className="text-ink-3">—</span>}</td>
                </tr>
              ))}
              {noProjects && (
                <EmptyRow colSpan={9}>
                  还没有项目。
                  <Link href="/settings" className="ml-1 text-accent hover:underline">
                    去设置页添加
                  </Link>
                </EmptyRow>
              )}
            </Table>
          </Panel>

          <Panel
            title="近 14 天吞吐"
            extra={
              <Legend
                items={[
                  { name: "新增需求", color: CHART_COLORS[0] },
                  { name: "验收完成", color: CHART_COLORS[1] },
                ]}
              />
            }
          >
            {s.trend14d.created.some((v) => v > 0) || s.trend14d.accepted.some((v) => v > 0) ? (
              <LineChart
                labels={s.trend14d.labels}
                series={[
                  { name: "新增需求", values: s.trend14d.created, color: CHART_COLORS[0] },
                  { name: "验收完成", values: s.trend14d.accepted, color: CHART_COLORS[1] },
                ]}
              />
            ) : (
              <EmptyState compact icon="chart" title="近 14 天没有需求流转" desc="需求进入待确认后会在这里出现。" />
            )}
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
              {qualityItems.map((q) => (
                <div key={q.label} className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-ink-3">{q.label}</span>
                  <span className="num text-[15px] font-semibold text-ink">{q.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-3">质量指标基于近 30 天已验收需求（样本 {s.quality.samples}）：前置时间 = 流入到验收；返工 = 测试失败回池。</p>
          </Panel>
        </div>

        <Panel
          title="最近动态"
          extra={
            <Link href="/requirements" className="flex items-center gap-0.5 text-[12px] text-accent hover:underline">
              全部需求 <Icon name="chevronRight" size={12} />
            </Link>
          }
        >
          {feed.length === 0 ? (
            <EmptyState compact icon="clock" title="暂无动态" desc="需求确认、认领、提交、测试等事件会实时出现。" />
          ) : (
            <ul className="divide-y divide-line">
              {feed.map((e, i) => {
                const tone = /冲突|不通过|受阻|驳回/.test(e.note) ? "bg-danger" : /验收|通过/.test(e.note) ? "bg-ok" : "bg-accent";
                return (
                  <li key={i} className="flex gap-2.5 py-2.5 first:pt-0 last:pb-0">
                    <span className={`mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full ${tone}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link href={`/requirements?q=REQ-${e.seq}`} className="truncate text-[13px] font-medium text-ink hover:text-accent">
                          REQ-{e.seq} {e.title}
                        </Link>
                        <span className="shrink-0 text-[11px] text-ink-3">{ago(e.at)}</span>
                      </div>
                      <p className="truncate text-[12px] text-ink-2">
                        <span className="font-mono text-ink-3">{actorLabel(e.actor)}</span> · {e.note}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel
          title="智能体在线"
          extra={
            <span className="num text-[12px] text-ink-3">
              {s.agentsOnline.filter((a) => a.active).length} / {s.agentsOnline.length} 活跃
            </span>
          }
        >
          {s.agentsOnline.length === 0 ? (
            <EmptyState compact icon="bot" title="尚无智能体账号" action={<LinkButton href="/agents" size="sm">去创建</LinkButton>} />
          ) : (
            <ul className="divide-y divide-line">
              {s.agentsOnline.slice(0, 6).map((a) => (
                <li key={a.username} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                  <span className={`h-[7px] w-[7px] rounded-full ${a.active ? "bg-ok" : "bg-line-strong"}`} />
                  <span className="flex-1 truncate font-mono text-[12px] text-ink">{a.username}</span>
                  <span className="truncate text-[12px] text-ink-2">{a.current ?? (a.lastSeenAt ? `${ago(a.lastSeenAt)}在线` : "从未连接")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="LLM 用量（7 天）">
          {llmTotal7d === 0 ? (
            <EmptyState compact icon="zap" title="近 7 天没有调用" desc="拆解、排序、出题时记录 token 用量。" />
          ) : (
            <div className="flex flex-col gap-2">
              <BarChart data={s.llm7d.byDay} showValues />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-2">
                <span>
                  合计 <b className="num text-ink">{fmtTokens(llmTotal7d)}</b> tokens
                  {s.llmCost7d != null && (
                    <span className="ml-1 text-ink-3">
                      · 约 ${s.llmCost7d.toFixed(2)}
                    </span>
                  )}
                </span>
                <span className="text-ink-3">
                  今日 {fmtTokens(s.llmTodayTokens)}
                  {s.llmLimit > 0 ? ` / 上限 ${fmtTokens(s.llmLimit)}` : " · 未设上限"}
                </span>
              </div>
              {s.llm7d.byRole.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px] text-ink-3">
                  {s.llm7d.byRole.map((r) => (
                    <span key={r.name}>
                      {r.name} <b className="num text-ink-2">{fmtTokens(r.value)}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="系统状态">
          <ul className="divide-y divide-line text-[13px]">
            <li className="flex items-center justify-between gap-2 py-2 first:pt-0">
              <span>微信 Bot 心跳</span>
              <span className="flex items-center gap-2">
                <span className="text-[12px] text-ink-2">{s.system.botLastSeen ? ago(s.system.botLastSeen) : "未接入"}</span>
                {s.system.botLastSeen ? s.system.botAlert ? <Chip tone="red">超时</Chip> : <Chip tone="green">正常</Chip> : <Chip tone="slate">未接入</Chip>}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2 py-2">
              <span>队列积压</span>
              <span className="flex items-center gap-2">
                {s.system.queue ? (
                  <>
                    <span className="num text-[12px] text-ink-2">
                      llm {s.system.queue.llm} · git {s.system.queue.git}
                      {s.system.queue.failed > 0 ? ` · 失败 ${s.system.queue.failed}` : ""}
                    </span>
                    {s.system.queue.failed > 0 ? <Chip tone="red">有失败</Chip> : s.system.queue.llm + s.system.queue.git > 20 ? <Chip tone="amber">积压</Chip> : <Chip tone="green">正常</Chip>}
                  </>
                ) : (
                  <Chip tone="red">Redis 不可达</Chip>
                )}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2 py-2">
              <span>最近日报</span>
              <span className="flex items-center gap-2">
                {s.system.latestReport ? (
                  <>
                    <Link href="/reports" className="text-[12px] text-ink-2 hover:text-accent">
                      {s.system.latestReport.project} · {fmtDateTime(s.system.latestReport.createdAt)}
                    </Link>
                    {s.system.latestReport.pushed ? <Chip tone="green">已推送</Chip> : <Chip tone="slate">未推送</Chip>}
                  </>
                ) : (
                  <Chip tone="slate">尚未生成</Chip>
                )}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2 py-2 last:pb-0">
              <span>活跃项目</span>
              <span className="num text-[12px] text-ink-2">
                {rows.filter((p) => p.active).length} / {rows.length}
              </span>
            </li>
          </ul>
        </Panel>
      </div>
    </PageShell>
  );
}
