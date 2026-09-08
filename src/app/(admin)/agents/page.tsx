import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { PageShell, PageHeader, KpiRow, KpiTile, Panel, EmptyState, DemoNote, fmtTokens } from "@/components/ui";
import { Donut, HBarList, CHART_COLORS } from "@/components/charts";
import { AgentTable, CreateAgentForm, type AgentRow } from "./ui";

export const dynamic = "force-dynamic";

// 智能体：账号表（编辑角色/项目/密码、启停、强制释放）+ 创建账号 + 排行 / 用量

const ROLE_LABEL: Record<string, string> = { DEVELOPER: "开发", TESTER: "测试", BOTH: "全能" };

export default async function AgentsPage() {
  const demo = await isDemoMode();
  let rows: AgentRow[];
  let projects: { id: string; name: string }[];
  let usage: { role: string; input: number; output: number }[];

  if (demo) {
    rows = DEMO.agents.map((a) => ({
      id: a.id,
      username: a.username,
      role: a.role,
      enabled: a.enabled,
      projectIds: ["demo-p1", "demo-p2"],
      hasGitToken: a.username === "dev-agent-1",
      lastSeenAt: a.lastSeenAt.toISOString(),
      devCount: a.devCount,
      testCount: a.testCount,
      current: a.current.map((c) => ({ taskId: `${a.id}-task`, label: c.replace(/：.*$/, ""), reqId: "demo-t1", reqSeq: Number(c.match(/REQ-(\d+)/)?.[1] ?? 0), title: c.replace(/^.*?REQ-\d+ /, "") })),
    }));
    projects = DEMO.dashboard.projects.map((p) => ({ id: p.id, name: p.name }));
    usage = DEMO.usage7d;
  } else {
    const [agents, dbProjects, usageRaw] = await Promise.all([
      prisma.agentAccount.findMany({
        include: {
          devTasks: { where: { status: "CLAIMED" }, include: { requirement: { select: { id: true, seq: true, title: true } } } },
          testTasks: { where: { status: "CLAIMED" }, include: { requirement: { select: { id: true, seq: true, title: true } } } },
          _count: { select: { devTasks: true, testTasks: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.project.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
      prisma.llmUsageLog.groupBy({ by: ["expertRole"], _sum: { inputTokens: true, outputTokens: true }, where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }),
    ]);
    rows = agents.map((a) => ({
      id: a.id,
      username: a.username,
      role: a.role,
      enabled: a.enabled,
      projectIds: a.projectIds,
      hasGitToken: !!a.gitTokenEnc,
      lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
      devCount: a._count.devTasks,
      testCount: a._count.testTasks,
      current: [
        ...a.devTasks.map((t) => ({ taskId: t.id, label: "开发中", reqId: t.requirement.id, reqSeq: t.requirement.seq, title: t.requirement.title })),
        ...a.testTasks.map((t) => ({ taskId: t.id, label: "测试中", reqId: t.requirement.id, reqSeq: t.requirement.seq, title: t.requirement.title })),
      ],
    }));
    projects = dbProjects;
    usage = usageRaw.map((u) => ({ role: u.expertRole ?? "其他", input: u._sum.inputTokens ?? 0, output: u._sum.outputTokens ?? 0 }));
  }

  const enabled = rows.filter((a) => a.enabled).length;
  const activeNow = rows.filter((a) => a.lastSeenAt && Date.now() - new Date(a.lastSeenAt).getTime() < 3600_000).length;
  const working = rows.reduce((s, a) => s + a.current.length, 0);
  const rank = rows
    .map((a) => ({ label: a.username, value: a.devCount + a.testCount, hint: ROLE_LABEL[a.role] }))
    .filter((x) => x.value > 0)
    .sort((x, y) => y.value - x.value)
    .slice(0, 6);
  const roleName = (r: string) => (r === "PRODUCT" ? "产品专家" : r === "PM" ? "项管专家" : r === "TEST" ? "测试专家" : r);
  const usageDonut = usage.map((u, i) => ({ name: roleName(u.role), value: u.input + u.output, color: CHART_COLORS[i % CHART_COLORS.length] })).filter((x) => x.value > 0);

  return (
    <PageShell>
      <PageHeader title="智能体" subtitle="外部终端 Agent 的账号、当前任务与产出" />
      {demo && <DemoNote />}
      <KpiRow cols={4}>
        <KpiTile label="账号总数" value={rows.length} sub={`${enabled} 个启用`} />
        <KpiTile label="1 小时内活跃" value={activeNow} sub="有心跳或请求" tone={activeNow > 0 ? "ok" : "default"} />
        <KpiTile label="执行中任务" value={working} sub="已认领的开发 / 测试" />
        <KpiTile label="历史完成" value={rows.reduce((s, a) => s + a.devCount + a.testCount, 0)} sub="开发 + 测试任务数" />
      </KpiRow>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="flex flex-col gap-4">
          <Panel title="Agent 列表" pad={false} extra={<span className="num text-[12px] text-ink-3">{rows.length} 个账号</span>}>
            {rows.length === 0 ? <EmptyState compact icon="bot" title="尚无 Agent 账号" desc="在右侧创建账号后，把接入指引投喂给 Claude Code 等终端即可自动认领任务。" /> : <AgentTable rows={rows} projects={projects} demo={demo} />}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <CreateAgentForm projects={projects} demo={demo} />
          <Panel title="完成量排行">{rank.length > 0 ? <HBarList data={rank} color={CHART_COLORS[0]} /> : <p className="py-3 text-center text-[12px] text-ink-3">暂无完成记录</p>}</Panel>
          <Panel title="近 7 天 LLM 用量" extra={<span className="text-[12px] text-ink-3">专家角色</span>}>
            {usageDonut.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-ink-3">近 7 天无调用</p>
            ) : (
              <>
                <Donut data={usageDonut} centerLabel="tokens" size={100} />
                <ul className="mt-3 divide-y divide-line text-[12px]">
                  {usage.map((u) => (
                    <li key={u.role} className="flex justify-between py-1.5">
                      <span className="text-ink-2">{roleName(u.role)}</span>
                      <span className="num text-ink-3">
                        入 {fmtTokens(u.input)} · 出 {fmtTokens(u.output)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
