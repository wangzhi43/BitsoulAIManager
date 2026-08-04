import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { isDemoMode, DEMO } from "@/lib/demo";

export const dynamic = "force-dynamic";

interface ProjectCard {
  id: string;
  name: string;
  active: boolean;
  pendingConfirm: number;
  inProgress: number;
  pendingAccept: number;
}

const AVATAR_BG = ["bg-indigo-500", "bg-teal-500", "bg-amber-500", "bg-rose-500", "bg-sky-500"];

export default async function DashboardPage() {
  const admin = await currentAdmin();
  const demo = await isDemoMode();

  let projects: ProjectCard[] = [];
  let botLastSeen: string | null = null;
  let agentActive = 0;
  let llmTokens7d = 0;

  if (demo) {
    projects = DEMO.dashboard.projects.map((p) => {
      const c = DEMO.dashboard.counts[p.id];
      return { id: p.id, name: p.name, active: p.active, pendingConfirm: c.pendingConfirm, inProgress: c.inProgress, pendingAccept: c.pendingAccept };
    });
    botLastSeen = DEMO.dashboard.botLastSeen;
    agentActive = DEMO.dashboard.agentActive;
    llmTokens7d = DEMO.dashboard.llmTokens7d;
  } else {
    const [dbProjects, counts, botSeen, activeAgents, usage] = await Promise.all([
      prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.requirement.groupBy({ by: ["projectId", "status"], _count: true }),
      prisma.systemConfig.findUnique({ where: { key: "wechatBotLastSeen" } }),
      prisma.agentAccount.count({ where: { enabled: true, lastSeenAt: { gte: new Date(Date.now() - 3600_000) } } }),
      prisma.llmUsageLog.aggregate({
        _sum: { inputTokens: true, outputTokens: true },
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      }),
    ]);
    const count = (pid: string, statuses: string[]) =>
      counts.filter((c) => c.projectId === pid && statuses.includes(c.status)).reduce((s, c) => s + c._count, 0);
    projects = dbProjects.map((p) => ({
      id: p.id,
      name: p.name,
      active: p.active,
      pendingConfirm: count(p.id, ["PENDING_CONFIRM"]),
      inProgress: count(p.id, ["READY", "DEVELOPING", "PENDING_TEST", "TESTING", "REVIEWING"]),
      pendingAccept: count(p.id, ["PENDING_ACCEPT"]),
    }));
    botLastSeen = botSeen?.value ?? null;
    agentActive = activeAgents;
    llmTokens7d = (usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0);
  }

  const totals = projects.reduce(
    (a, p) => ({
      pendingConfirm: a.pendingConfirm + p.pendingConfirm,
      inProgress: a.inProgress + p.inProgress,
      pendingAccept: a.pendingAccept + p.pendingAccept,
    }),
    { pendingConfirm: 0, inProgress: 0, pendingAccept: 0 },
  );
  const botHealthy = botLastSeen && Date.now() - new Date(botLastSeen).getTime() < 5 * 60_000;
  const today = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      {/* 头部 */}
      <header className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-indigo-600 dark:text-indigo-400">BITSOUL AI MANAGER</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">全局看板</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {today} · 你好，{admin?.displayName ?? "管理员"}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            botHealthy
              ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400"
              : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${botHealthy ? "bg-green-500" : "bg-zinc-400"}`} />
          微信 Bot
        </span>
      </header>

      {/* KPI 条 */}
      <section className="mb-5 grid grid-cols-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {[
          { label: "待确认", value: totals.pendingConfirm, href: "/confirm", dot: totals.pendingConfirm > 0 },
          { label: "进行中", value: totals.inProgress, href: "/pools", dot: false },
          { label: "待验收", value: totals.pendingAccept, href: "/pools", dot: totals.pendingAccept > 0 },
        ].map((k, i) => (
          <Link
            key={k.label}
            href={k.href}
            className={`px-4 py-4 text-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
              i > 0 ? "border-l border-zinc-100 dark:border-zinc-800" : ""
            }`}
          >
            <p className="text-[13px] text-zinc-500">{k.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {k.value}
              {k.dot && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-indigo-500 align-top" />}
            </p>
          </Link>
        ))}
      </section>

      {/* 项目卡片 */}
      <section className="space-y-3">
        {projects.map((p, i) => (
          <div
            key={p.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-base font-semibold text-white ${AVATAR_BG[i % AVATAR_BG.length]}`}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-zinc-400">
                  {p.active ? "采集与调度运行中" : "未启用 — 在设置页确认仓库后启用"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  p.active
                    ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {p.active ? "活跃" : "未启用"}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-3 rounded-xl bg-zinc-50 py-2.5 text-center dark:bg-zinc-800/50">
              {[
                { t: "待确认", v: p.pendingConfirm },
                { t: "进行中", v: p.inProgress },
                { t: "待验收", v: p.pendingAccept },
              ].map((s, j) => (
                <div key={s.t} className={j > 0 ? "border-l border-zinc-200/70 dark:border-zinc-700/60" : ""}>
                  <dd className="text-xl font-semibold tabular-nums">{s.v}</dd>
                  <dt className="text-[11px] text-zinc-400">{s.t}</dt>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {projects.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-400 dark:border-zinc-700">
            尚无项目，运行 seed 初始化
          </p>
        )}
      </section>

      {/* 底部统计 */}
      <section className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[13px] text-zinc-500">活跃 Agent（1 小时内）</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{agentActive}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[13px] text-zinc-500">近 7 天 LLM 消耗</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {llmTokens7d >= 10000 ? `${(llmTokens7d / 10000).toFixed(1)} 万` : llmTokens7d}
            <span className="ml-1 text-sm font-normal text-zinc-400">tokens</span>
          </p>
        </div>
      </section>
    </main>
  );
}
