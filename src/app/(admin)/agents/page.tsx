import { prisma } from "@/lib/db";
import { AgentAdmin } from "./ui";

export const dynamic = "force-dynamic";

// Agent 看板 + 账号管理
export default async function AgentsPage() {
  const [agents, projects, usage] = await Promise.all([
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

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Agent</h1>

      <section className="space-y-2">
        {agents.map((a) => (
          <div
            key={a.id}
            className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.username}</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{a.role}</span>
              <span className={`text-xs ${a.enabled ? "text-green-600" : "text-red-500"}`}>
                {a.enabled ? "启用" : "禁用"}
              </span>
              <span className="text-xs opacity-50">
                历史 开发{a._count.devTasks} / 测试{a._count.testTasks}
                {a.lastSeenAt ? ` · 最近活跃 ${a.lastSeenAt.toLocaleString("zh-CN")}` : " · 从未登录"}
              </span>
            </div>
            {(a.devTasks.length > 0 || a.testTasks.length > 0) && (
              <ul className="mt-1 text-xs opacity-70">
                {a.devTasks.map((t) => (
                  <li key={t.id}>开发中：REQ-{t.requirement.seq} {t.requirement.title}</li>
                ))}
                {a.testTasks.map((t) => (
                  <li key={t.id}>测试中：REQ-{t.requirement.seq} {t.requirement.title}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {agents.length === 0 && <p className="text-sm opacity-50">尚无 Agent 账号，在下方创建</p>}
      </section>

      <AgentAdmin projects={projects} agents={agents.map((a) => ({ id: a.id, username: a.username, enabled: a.enabled }))} />

      <section className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 font-medium">近 7 天 LLM 用量（专家 Agent）</h2>
        {usage.length === 0 ? (
          <p className="text-xs opacity-50">暂无调用</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {usage.map((u) => (
              <li key={u.expertRole ?? "other"}>
                {u.expertRole ?? "其他"}：输入 {(u._sum.inputTokens ?? 0).toLocaleString()} / 输出{" "}
                {(u._sum.outputTokens ?? 0).toLocaleString()} tokens
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
