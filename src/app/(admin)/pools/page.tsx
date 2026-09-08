import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { claimTimeoutMs } from "@/lib/runtime-config";
import { PageShell, PageHeader, DemoNote } from "@/components/ui";
import { Board, type BoardCard } from "./ui";

export const dynamic = "force-dynamic";

// 执行看板（设计画布「执行看板」画板）：待开发 → 待验收 五列；按项目筛选即项目看板（/projects/[id]/board 重定向到这里）

const BOARD_STATUSES = ["READY", "DEVELOPING", "PENDING_TEST", "TESTING", "REVIEWING", "PENDING_ACCEPT"] as const;

export default async function PoolsPage({ searchParams }: { searchParams: Promise<{ project?: string; priority?: string; agent?: string; q?: string }> }) {
  const { project = "", priority = "", agent = "", q = "" } = await searchParams;
  const demo = await isDemoMode();
  let cards: BoardCard[];
  let projects: { id: string; name: string }[];
  let agents: string[];
  let timeoutHours: number;

  if (demo) {
    timeoutHours = 4;
    const now = Date.now();
    cards = [
      ...DEMO.devPool.map(
        (r): BoardCard => ({
          id: r.id,
          seq: r.seq,
          title: r.title,
          status: r.status,
          project: r.project,
          projectId: DEMO.dashboard.projects.find((p) => p.name === r.project)?.id ?? null,
          priority: r.priority,
          priorityReason: r.reason,
          locked: r.locked,
          complexity: r.complexity,
          rank: r.rank,
          featureBranch: r.status === "DEVELOPING" ? `feature/REQ-${r.seq}` : null,
          daily: r.status === "DEVELOPING" ? `daily/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}` : null,
          isDefect: r.seq === 96,
          dev: r.agent ? { taskId: `${r.id}-dt`, status: r.conflict ? "CONFLICT" : "CLAIMED", agent: r.agent, heartbeatAt: new Date(now - (r.conflict ? 5 : 0.03) * 3600_000).toISOString(), claimedAt: new Date(now - 20 * 3600_000).toISOString(), commits: r.conflict ? 3 : 1 } : { taskId: `${r.id}-dt`, status: "POOL", agent: null, heartbeatAt: null, claimedAt: null, commits: 0 },
          test: null,
          report: null,
          timedOut: r.conflict,
          updatedAt: new Date(now - 3600_000).toISOString(),
        }),
      ),
      ...DEMO.testPool.map(
        (r): BoardCard => ({
          id: r.id,
          seq: r.seq,
          title: r.title,
          status: r.status === "CLAIMED" ? "TESTING" : "PENDING_TEST",
          project: r.project,
          projectId: DEMO.dashboard.projects.find((p) => p.name === r.project)?.id ?? null,
          priority: r.priority,
          priorityReason: null,
          locked: false,
          complexity: "M",
          rank: null,
          featureBranch: `feature/REQ-${r.seq}`,
          daily: `daily/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
          isDefect: false,
          dev: { taskId: `${r.id}-dt`, status: "MERGED", agent: "dev-agent-1", heartbeatAt: null, claimedAt: null, commits: 2 },
          test: { taskId: `${r.id}-tt`, status: r.status, agent: r.agent, heartbeatAt: r.agent ? new Date(now - 60_000).toISOString() : null, caseCount: r.caseCount },
          report: null,
          timedOut: false,
          updatedAt: new Date(now - 1800_000).toISOString(),
        }),
      ),
      {
        id: "demo-x1",
        seq: 94,
        title: "导出按钮权限修复",
        status: "PENDING_ACCEPT",
        project: "BitSoulClaw",
        projectId: "demo-p1",
        priority: "P1",
        priorityReason: null,
        locked: false,
        complexity: "S",
        rank: null,
        featureBranch: "feature/REQ-94",
        daily: `daily/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
        isDefect: false,
        dev: { taskId: "demo-x1-dt", status: "MERGED", agent: "dev-agent-3", heartbeatAt: null, claimedAt: null, commits: 1 },
        test: { taskId: "demo-x1-tt", status: "DONE", agent: "test-agent-1", heartbeatAt: null, caseCount: 5 },
        report: { conclusion: "PASS", passRate: 1 },
        timedOut: false,
        updatedAt: new Date(now - 5 * 3600_000).toISOString(),
      },
    ];
    projects = DEMO.dashboard.projects.map((p) => ({ id: p.id, name: p.name }));
    agents = DEMO.agents.map((a) => a.username);
  } else {
    const timeout = await claimTimeoutMs();
    timeoutHours = Math.round(timeout / 3600_000);
    const [reqs, dbProjects, dbAgents] = await Promise.all([
      prisma.requirement.findMany({
        where: { status: { in: [...BOARD_STATUSES] }, ...(project ? { projectId: project } : {}) },
        include: {
          project: { select: { id: true, name: true } },
          dailyBranch: { select: { name: true } },
          devTask: { include: { claimedBy: { select: { username: true } } } },
          testTasks: { include: { report: { select: { conclusion: true, passRate: true } }, claimedBy: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
        },
        orderBy: [{ poolRank: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.project.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
      prisma.agentAccount.findMany({ select: { username: true }, orderBy: { username: "asc" } }),
    ]);
    const now = Date.now();
    cards = reqs.map((r): BoardCard => {
      const t = r.testTasks.at(-1) ?? null;
      const rep = [...r.testTasks].reverse().map((x) => x.report).find(Boolean) ?? null;
      const devHb = r.devTask?.status === "CLAIMED" ? r.devTask.lastHeartbeat : null;
      const testHb = t?.status === "CLAIMED" ? t.lastHeartbeat : null;
      const hb = devHb ?? testHb;
      return {
        id: r.id,
        seq: r.seq,
        title: r.title,
        status: r.status,
        project: r.project?.name ?? null,
        projectId: r.projectId,
        priority: r.priority,
        priorityReason: r.priorityReason,
        locked: r.priorityLocked,
        complexity: r.complexity,
        rank: r.poolRank,
        featureBranch: r.featureBranch,
        daily: r.dailyBranch?.name ?? null,
        isDefect: !!r.parentId,
        dev: r.devTask
          ? { taskId: r.devTask.id, status: r.devTask.status, agent: r.devTask.claimedBy?.username ?? null, heartbeatAt: r.devTask.lastHeartbeat?.toISOString() ?? null, claimedAt: r.devTask.claimedAt?.toISOString() ?? null, commits: ((r.devTask.commits as string[] | null) ?? []).length }
          : null,
        test: t ? { taskId: t.id, status: t.status, agent: t.claimedBy?.username ?? null, heartbeatAt: t.lastHeartbeat?.toISOString() ?? null, caseCount: ((t.cases as unknown[]) ?? []).length } : null,
        report: rep ? { conclusion: rep.conclusion, passRate: rep.passRate } : null,
        timedOut: !!hb && now - hb.getTime() > timeout,
        updatedAt: r.updatedAt.toISOString(),
      };
    });
    projects = dbProjects;
    agents = dbAgents.map((a) => a.username);
  }

  // 服务端筛选（优先级 / Agent / 关键词）
  const seqMatch = q.match(/REQ-?(\d+)/i);
  cards = cards.filter((c) => {
    if (priority && c.priority !== priority) return false;
    if (agent && c.dev?.agent !== agent && c.test?.agent !== agent) return false;
    if (q) {
      if (seqMatch) return c.seq === Number(seqMatch[1]);
      if (!c.title.toLowerCase().includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <PageShell>
      <PageHeader title="执行看板" subtitle={project ? `${projects.find((p) => p.id === project)?.name ?? "项目"} · 待开发 → 待验收` : "待开发 → 待验收 全链路"} />
      {demo && <DemoNote />}
      <Board cards={cards} projects={projects} agents={agents} filters={{ project, priority, agent, q }} timeoutHours={timeoutHours} demo={demo} />
    </PageShell>
  );
}
