import { prisma } from "@/lib/db";
import { PriorityControls } from "./ui";

export const dynamic = "force-dynamic";

// 任务池：待开发池（项管排序 + 手动锁定）与测试池
export default async function PoolsPage() {
  const [devPool, testPool, pendingAccept, reviewing] = await Promise.all([
    prisma.requirement.findMany({
      where: { status: { in: ["READY", "DEVELOPING"] } },
      include: {
        project: { select: { name: true } },
        devTask: { select: { status: true, claimedBy: { select: { username: true } } } },
      },
      orderBy: [{ status: "asc" }, { poolRank: "asc" }],
    }),
    prisma.testTask.findMany({
      where: { status: { in: ["POOL", "CLAIMED"] } },
      include: {
        requirement: { select: { seq: true, title: true, project: { select: { name: true } } } },
        claimedBy: { select: { username: true } },
      },
      orderBy: { priority: "asc" },
    }),
    prisma.requirement.count({ where: { status: "PENDING_ACCEPT" } }),
    prisma.requirement.count({ where: { status: "REVIEWING" } }),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">任务池</h1>
      <p className="text-sm opacity-60">
        待验收 {pendingAccept} · 待裁决 {reviewing}
      </p>

      <section>
        <h2 className="mb-2 font-medium">开发池（{devPool.length}）</h2>
        <ul className="space-y-2">
          {devPool.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs opacity-50">
                  {r.poolRank ? `#${r.poolRank}` : "—"} REQ-{r.seq}
                </span>
                <span className="font-medium">{r.title}</span>
                <span className="text-xs opacity-50">{r.project?.name}</span>
                {r.status === "DEVELOPING" && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    开发中 {r.devTask?.claimedBy?.username}
                  </span>
                )}
                {r.devTask?.status === "CONFLICT" && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/50 dark:text-red-300">
                    冲突
                  </span>
                )}
              </div>
              {r.priorityReason && <p className="mt-1 text-xs opacity-50">{r.priorityReason}</p>}
              <div className="mt-2">
                <PriorityControls id={r.id} priority={r.priority} locked={r.priorityLocked} />
              </div>
            </li>
          ))}
          {devPool.length === 0 && <p className="text-sm opacity-50">开发池为空</p>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-medium">测试池（{testPool.length}）</h2>
        <ul className="space-y-2">
          {testPool.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{t.priority}</span>
                <span className="font-mono text-xs opacity-50">REQ-{t.requirement.seq}</span>
                <span className="font-medium">{t.requirement.title}</span>
                <span className="text-xs opacity-50">{t.requirement.project?.name}</span>
                {t.status === "CLAIMED" && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    测试中 {t.claimedBy?.username}
                  </span>
                )}
                <span className="text-xs opacity-50">{(t.cases as unknown[]).length} 条用例</span>
              </div>
            </li>
          ))}
          {testPool.length === 0 && <p className="text-sm opacity-50">测试池为空</p>}
        </ul>
      </section>
    </main>
  );
}
