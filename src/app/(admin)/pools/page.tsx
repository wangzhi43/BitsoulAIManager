import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { PriorityControls } from "./ui";

export const dynamic = "force-dynamic";

interface DevRow {
  id: string;
  seq: number;
  title: string;
  project?: string | null;
  rank: number | null;
  priority: string | null;
  locked: boolean;
  reason: string | null;
  status: string;
  agent: string | null;
  conflict: boolean;
  complexity: string;
}
interface TestRow {
  id: string;
  seq: number;
  title: string;
  project?: string | null;
  priority: string;
  status: string;
  agent: string | null;
  caseCount: number;
}

const PRIORITY_STYLE: Record<string, string> = {
  P0: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
  P1: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  P2: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  P3: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
};

export default async function PoolsPage() {
  const demo = await isDemoMode();

  let devRows: DevRow[];
  let testRows: TestRow[];
  let pendingAccept: number;
  let reviewing: number;

  if (demo) {
    devRows = DEMO.devPool;
    testRows = DEMO.testPool;
    pendingAccept = DEMO.poolSummary.pendingAccept;
    reviewing = DEMO.poolSummary.reviewing;
  } else {
    const [devPool, testPool, pa, rv] = await Promise.all([
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
    devRows = devPool.map((r) => ({
      id: r.id,
      seq: r.seq,
      title: r.title,
      project: r.project?.name,
      rank: r.poolRank,
      priority: r.priority,
      locked: r.priorityLocked,
      reason: r.priorityReason,
      status: r.status,
      agent: r.devTask?.claimedBy?.username ?? null,
      conflict: r.devTask?.status === "CONFLICT",
      complexity: r.complexity,
    }));
    testRows = testPool.map((t) => ({
      id: t.id,
      seq: t.requirement.seq,
      title: t.requirement.title,
      project: t.requirement.project?.name,
      priority: t.priority,
      status: t.status,
      agent: t.claimedBy?.username ?? null,
      caseCount: (t.cases as unknown[]).length,
    }));
    pendingAccept = pa;
    reviewing = rv;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">任务池</h1>
        <p className="mt-1 text-sm text-zinc-500">
          待验收 {pendingAccept} · 待裁决 {reviewing}
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">开发池（{devRows.length}）</h2>
        <ul className="space-y-2.5">
          {devRows.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-zinc-200 bg-white p-3.5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center gap-2">
                {r.priority && (
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${PRIORITY_STYLE[r.priority] ?? ""}`}>
                    {r.priority}
                  </span>
                )}
                <span className="font-mono text-xs text-zinc-400">
                  {r.rank ? `#${r.rank}` : "—"} · REQ-{r.seq}
                </span>
                <span className="font-medium">{r.title}</span>
                <span className="text-xs text-zinc-400">{r.project}</span>
                {r.status === "DEVELOPING" && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950/60 dark:text-sky-400">
                    ⚙ 开发中 {r.agent}
                  </span>
                )}
                {r.conflict && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950/60 dark:text-red-400">
                    ⚠ 合并冲突
                  </span>
                )}
              </div>
              {r.reason && <p className="mt-1.5 text-xs text-zinc-400">{r.reason}</p>}
              <div className="mt-2.5">
                <PriorityControls id={r.id} priority={r.priority} locked={r.locked} />
              </div>
            </li>
          ))}
          {devRows.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
              开发池为空
            </p>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">测试池（{testRows.length}）</h2>
        <ul className="space-y-2.5">
          {testRows.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-zinc-200 bg-white p-3.5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${PRIORITY_STYLE[t.priority] ?? ""}`}>
                  {t.priority}
                </span>
                <span className="font-mono text-xs text-zinc-400">REQ-{t.seq}</span>
                <span className="font-medium">{t.title}</span>
                <span className="text-xs text-zinc-400">{t.project}</span>
                {t.status === "CLAIMED" && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950/60 dark:text-sky-400">
                    ⚙ 测试中 {t.agent}
                  </span>
                )}
                <span className="text-xs text-zinc-400">{t.caseCount} 条用例</span>
              </div>
            </li>
          ))}
          {testRows.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
              测试池为空
            </p>
          )}
        </ul>
      </section>
    </main>
  );
}
