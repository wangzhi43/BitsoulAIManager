import Link from "next/link";
import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { PageShell, PageHeader, StatStrip, Panel, Table } from "@/components/ui";
import { Donut, VBars, CHART_COLORS } from "@/components/charts";
import { PriorityChip } from "@/components/status";
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

  const claiming = devRows.filter((r) => r.status === "DEVELOPING").length;
  const conflicts = devRows.filter((r) => r.conflict).length;
  const byPriority = ["P0", "P1", "P2", "P3"].map((p, i) => ({
    name: p,
    value: devRows.filter((r) => r.priority === p).length,
    color: [CHART_COLORS[3], CHART_COLORS[2], CHART_COLORS[0], "#a1a1aa"][i],
  })).filter((x) => x.value > 0);
  const byComplexity = ["S", "M", "L"].map((c) => ({
    label: c,
    value: devRows.filter((r) => r.complexity === c).length,
  }));

  return (
    <PageShell>
      <PageHeader title="任务池" subtitle="项管专家自动排序，Agent 按序认领；可手动调整并锁定优先级" />
      <StatStrip
        items={[
          { label: "开发池", value: devRows.length, sub: `${claiming} 个开发中`, tone: "indigo" },
          { label: "测试池", value: testRows.length, sub: `${testRows.filter((t) => t.status === "CLAIMED").length} 个测试中` },
          { label: "待验收 / 待裁决", value: `${pendingAccept} / ${reviewing}`, tone: pendingAccept + reviewing > 0 ? "amber" : "default", sub: "在需求列表处理" },
          { label: "合并冲突", value: conflicts, tone: conflicts > 0 ? "red" : "green", sub: conflicts > 0 ? "需人工处理" : "一切正常" },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-4">
        <div className="space-y-3 xl:col-span-3">
          <Panel title={`开发池（${devRows.length}）`}>
            <Table head={["#", "需求", "项目", "复杂度", "状态", "优先级调整"]}>
              {devRows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="py-2.5 pr-2 font-mono text-xs text-zinc-400">
                    {r.rank ? `#${r.rank}` : "—"}
                  </td>
                  <td className="max-w-md py-2.5 pr-3">
                    <p className="flex items-center gap-1.5">
                      <PriorityChip priority={r.priority} />
                      <span className="font-mono text-[11px] text-zinc-400">REQ-{r.seq}</span>
                      <span className="truncate font-medium">{r.title}</span>
                    </p>
                    {r.reason && <p className="mt-0.5 truncate text-[11px] text-zinc-400">{r.reason}</p>}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-zinc-500">{r.project}</td>
                  <td className="py-2.5 pr-3 text-xs">{r.complexity}</td>
                  <td className="py-2.5 pr-3">
                    {r.conflict ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-400">⚠ 冲突</span>
                    ) : r.status === "DEVELOPING" ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700 dark:bg-sky-950/60 dark:text-sky-400">⚙ {r.agent}</span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800">待认领</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <PriorityControls id={r.id} priority={r.priority} locked={r.locked} />
                  </td>
                </tr>
              ))}
              {devRows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-zinc-400">开发池为空</td></tr>
              )}
            </Table>
          </Panel>

          <Panel title={`测试池（${testRows.length}）`}>
            <Table head={["优先级", "需求", "项目", "用例数", "状态"]}>
              {testRows.map((t) => (
                <tr key={t.id}>
                  <td className="py-2.5 pr-2"><PriorityChip priority={t.priority} /></td>
                  <td className="max-w-md py-2.5 pr-3">
                    <span className="font-mono text-[11px] text-zinc-400">REQ-{t.seq}</span>{" "}
                    <span className="font-medium">{t.title}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-zinc-500">{t.project}</td>
                  <td className="py-2.5 pr-3 text-xs tabular-nums">{t.caseCount}</td>
                  <td className="py-2.5 text-right">
                    {t.status === "CLAIMED" ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700 dark:bg-sky-950/60 dark:text-sky-400">⚙ {t.agent}</span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800">待认领</span>
                    )}
                  </td>
                </tr>
              ))}
              {testRows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-zinc-400">测试池为空</td></tr>
              )}
            </Table>
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel title="优先级构成">
            {byPriority.length > 0 ? (
              <Donut data={byPriority} centerLabel="开发池" size={110} />
            ) : (
              <p className="py-4 text-center text-xs text-zinc-400">暂无数据</p>
            )}
          </Panel>
          <Panel title="复杂度分布">
            <VBars data={byComplexity} color={CHART_COLORS[1]} valueLabel={(v) => String(v)} height={110} />
          </Panel>
          <Panel title="调度规则">
            <ul className="space-y-2 text-xs text-zinc-500">
              <li>· Agent 按 # 序认领；P0 为线上缺陷/阻塞</li>
              <li>· 🔒 锁定后项管 Agent 不再改动优先级</li>
              <li>· 心跳超时 4 小时自动释放回池</li>
              <li>· 同一需求的开发与测试不能是同一 Agent</li>
              <li>· 待验收/待裁决在 <Link href="/requirements?status=PENDING_ACCEPT" className="text-indigo-500">需求列表</Link> 处理</li>
            </ul>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
