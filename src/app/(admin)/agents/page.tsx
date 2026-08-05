import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { AgentAdmin } from "./ui";
import { PageShell, PageHeader, StatStrip, Panel, Chip } from "@/components/ui";
import { Donut, HBarList, CHART_COLORS } from "@/components/charts";

export const dynamic = "force-dynamic";

interface AgentRow {
  id: string;
  username: string;
  role: string;
  enabled: boolean;
  lastSeenAt: Date | null;
  devCount: number;
  testCount: number;
  current: string[];
}

const ROLE_LABEL: Record<string, string> = { DEVELOPER: "开发", TESTER: "测试", BOTH: "开发+测试" };

export default async function AgentsPage() {
  const demo = await isDemoMode();

  let rows: AgentRow[];
  let projects: { id: string; name: string }[];
  let usage: { role: string; input: number; output: number }[];

  if (demo) {
    rows = DEMO.agents;
    projects = DEMO.dashboard.projects.map((p) => ({ id: p.id, name: p.name }));
    usage = DEMO.usage7d;
  } else {
    const [agents, dbProjects, usageRaw] = await Promise.all([
      prisma.agentAccount.findMany({
        include: {
          devTasks: {
            where: { status: { in: ["CLAIMED", "SUBMITTED"] } },
            include: { requirement: { select: { seq: true, title: true } } },
          },
          testTasks: {
            where: { status: "CLAIMED" },
            include: { requirement: { select: { seq: true, title: true } } },
          },
          _count: { select: { devTasks: true, testTasks: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.project.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
      prisma.llmUsageLog.groupBy({
        by: ["expertRole"],
        _sum: { inputTokens: true, outputTokens: true },
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      }),
    ]);
    rows = agents.map((a) => ({
      id: a.id,
      username: a.username,
      role: a.role,
      enabled: a.enabled,
      lastSeenAt: a.lastSeenAt,
      devCount: a._count.devTasks,
      testCount: a._count.testTasks,
      current: [
        ...a.devTasks.map((t) => `开发中：REQ-${t.requirement.seq} ${t.requirement.title}`),
        ...a.testTasks.map((t) => `测试中：REQ-${t.requirement.seq} ${t.requirement.title}`),
      ],
    }));
    projects = dbProjects;
    usage = usageRaw.map((u) => ({
      role: u.expertRole ?? "其他",
      input: u._sum.inputTokens ?? 0,
      output: u._sum.outputTokens ?? 0,
    }));
  }

  const enabled = rows.filter((a) => a.enabled).length;
  const activeNow = rows.filter((a) => a.lastSeenAt && Date.now() - new Date(a.lastSeenAt).getTime() < 3600_000).length;
  const working = rows.filter((a) => a.current.length > 0).length;
  const byRole = [
    { name: "开发", value: rows.filter((a) => a.role === "DEVELOPER").length, color: CHART_COLORS[0] },
    { name: "测试", value: rows.filter((a) => a.role === "TESTER").length, color: CHART_COLORS[1] },
    { name: "全能", value: rows.filter((a) => a.role === "BOTH").length, color: CHART_COLORS[2] },
  ].filter((x) => x.value > 0);
  const rank = rows
    .map((a) => ({ label: a.username, value: a.devCount + a.testCount, hint: ROLE_LABEL[a.role] }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 6);

  return (
    <PageShell>
      <PageHeader title="智能体管理" subtitle="外部终端智能体的账号、当前任务与产出" />
      <StatStrip
        items={[
          { label: "账号总数", value: rows.length, sub: `${enabled} 个启用` },
          { label: "1 小时内活跃", value: activeNow, tone: "green", sub: "有心跳/请求" },
          { label: "执行中", value: working, tone: working > 0 ? "blue" : "default", sub: "已认领任务" },
          { label: "历史完成", value: rows.reduce((s2, a) => s2 + a.devCount + a.testCount, 0), sub: "开发+测试任务数" },
        ]}
      />
      <div className="grid items-start gap-4 xl:grid-cols-4">
        <div className="space-y-4 xl:col-span-3">
          <Panel title="Agent 列表" extra={<span className="text-[11px] text-slate-400">{rows.length} 个账号</span>}>
            <div className="space-y-2.5">
              {rows.map((a) => (
                <div key={a.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-semibold text-white ${
                        a.role === "TESTER" ? "bg-teal-500" : a.role === "BOTH" ? "bg-amber-500" : "bg-blue-600"
                      }`}
                    >
                      {a.username.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-[13px] font-semibold text-slate-800">{a.username}</span>
                    <Chip tone="slate">{ROLE_LABEL[a.role] ?? a.role}</Chip>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${a.enabled ? "text-green-600" : "text-red-500"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${a.enabled ? "bg-green-500" : "bg-red-400"}`} />
                      {a.enabled ? "启用" : "禁用"}
                    </span>
                    <span className="text-[11px] tabular-nums text-slate-400">
                      开发 {a.devCount} / 测试 {a.testCount}
                      {a.lastSeenAt ? ` · 活跃于 ${a.lastSeenAt.toLocaleString("zh-CN")}` : " · 从未登录"}
                    </span>
                  </div>
                  {a.current.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 pl-10 text-[12px] text-slate-500">
                      {a.current.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {rows.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-[13px] text-slate-400">
                  尚无 Agent 账号，在下方创建
                </p>
              )}
            </div>
          </Panel>

          <AgentAdmin
            projects={projects}
            agents={rows.map((a) => ({ id: a.id, username: a.username, enabled: a.enabled }))}
          />
        </div>

        <div className="space-y-4">
          <Panel title="完成量排行">
            {rank.length > 0 ? <HBarList data={rank} color={CHART_COLORS[1]} /> : <p className="py-4 text-center text-[12px] text-slate-400">暂无数据</p>}
          </Panel>
          <Panel title="角色构成">
            {byRole.length > 0 ? <Donut data={byRole} centerLabel="Agent" size={104} /> : <p className="py-4 text-center text-[12px] text-slate-400">暂无数据</p>}
          </Panel>
          <Panel title="近 7 天 LLM 用量" extra={<span className="text-[11px] text-slate-400">专家 Agent</span>}>
            {usage.length === 0 ? (
              <p className="text-[12px] text-slate-400">暂无调用</p>
            ) : (
              <ul className="space-y-1.5">
                {usage.map((u) => (
                  <li key={u.role} className="flex items-center justify-between text-[12px]">
                    <span className="text-slate-500">
                      {u.role === "PRODUCT" ? "产品专家" : u.role === "PM" ? "项目管理专家" : u.role === "TEST" ? "测试专家" : u.role}
                    </span>
                    <span className="tabular-nums text-slate-600">
                      输入 {u.input.toLocaleString()} · 输出 {u.output.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
