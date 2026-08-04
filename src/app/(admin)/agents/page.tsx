import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { AgentAdmin } from "./ui";

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

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Agent</h1>

      <section className="space-y-2.5">
        {rows.map((a) => (
          <div
            key={a.id}
            className="rounded-2xl border border-zinc-200 bg-white p-3.5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold text-white ${
                  a.role === "TESTER" ? "bg-teal-500" : a.role === "BOTH" ? "bg-amber-500" : "bg-indigo-500"
                }`}
              >
                {a.username.slice(0, 2).toUpperCase()}
              </span>
              <span className="font-medium">{a.username}</span>
              <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {ROLE_LABEL[a.role] ?? a.role}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-xs ${a.enabled ? "text-green-600" : "text-red-500"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${a.enabled ? "bg-green-500" : "bg-red-400"}`} />
                {a.enabled ? "启用" : "禁用"}
              </span>
              <span className="text-xs text-zinc-400">
                开发 {a.devCount} / 测试 {a.testCount}
                {a.lastSeenAt ? ` · 活跃于 ${a.lastSeenAt.toLocaleString("zh-CN")}` : " · 从未登录"}
              </span>
            </div>
            {a.current.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 pl-10 text-xs text-zinc-500">
                {a.current.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
            尚无 Agent 账号，在下方创建
          </p>
        )}
      </section>

      <AgentAdmin
        projects={projects}
        agents={rows.map((a) => ({ id: a.id, username: a.username, enabled: a.enabled }))}
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 font-medium">近 7 天 LLM 用量（专家 Agent）</h2>
        {usage.length === 0 ? (
          <p className="text-xs text-zinc-400">暂无调用</p>
        ) : (
          <ul className="space-y-1.5">
            {usage.map((u) => (
              <li key={u.role} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">
                  {u.role === "PRODUCT" ? "产品专家" : u.role === "PM" ? "项目管理专家" : u.role === "TEST" ? "测试专家" : u.role}
                </span>
                <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
                  输入 {u.input.toLocaleString()} · 输出 {u.output.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
