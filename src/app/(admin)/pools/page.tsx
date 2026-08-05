import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { Board, type BoardCard } from "./ui";

export const dynamic = "force-dynamic";

/** 看板覆盖的需求状态（五列：测试中列含 TESTING 与 REVIEWING） */
const BOARD_STATUSES = [
  "READY",
  "DEVELOPING",
  "PENDING_TEST",
  "TESTING",
  "REVIEWING",
  "PENDING_ACCEPT",
] as const;

const HEARTBEAT_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 调度规则：心跳超时 4 小时

function ago(d: Date | null | undefined): string | null {
  if (!d) return null;
  const m = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function fmt(d: Date | null | undefined): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function timeoutHours(d: Date | null | undefined): number | null {
  if (!d) return null;
  const over = Date.now() - d.getTime() - HEARTBEAT_TIMEOUT_MS;
  return over > 0 ? Math.max(1, Math.floor(over / 3600000)) : null;
}

export default async function PoolsPage() {
  const demo = await isDemoMode();
  let cards: BoardCard[];

  if (demo) {
    // 演示数据：开发池 → 待开发/开发中，测试池 → 待测试/测试中
    cards = [
      ...DEMO.devPool.map((r): BoardCard => ({
        id: r.id,
        seq: r.seq,
        title: r.title,
        status: r.status,
        project: r.project,
        priority: r.priority,
        locked: r.locked,
        reason: r.reason,
        complexity: r.complexity,
        rank: r.rank,
        featureBranch: r.status === "DEVELOPING" ? `feature/REQ-${r.seq}` : null,
        userStory: "",
        createdBy: null,
        createdAt: null,
        devAgent: r.agent,
        testAgent: null,
        agent: r.agent,
        heartbeatAgo: r.agent ? "1 分钟前" : null,
        timedOutHours: null,
        claimedAt: null,
        submittedAt: null,
        submitNote: null,
        commits: [],
        conflict: r.conflict,
        caseCount: null,
        passRate: null,
        conclusion: null,
        defectCount: 0,
        events: [],
      })),
      ...DEMO.testPool.map((t): BoardCard => ({
        id: t.id,
        seq: t.seq,
        title: t.title,
        status: t.status === "CLAIMED" ? "TESTING" : "PENDING_TEST",
        project: t.project,
        priority: t.priority,
        locked: false,
        reason: null,
        complexity: "M",
        rank: null,
        featureBranch: `feature/REQ-${t.seq}`,
        userStory: "",
        createdBy: null,
        createdAt: null,
        devAgent: null,
        testAgent: t.agent,
        agent: t.agent,
        heartbeatAgo: t.agent ? "2 分钟前" : null,
        timedOutHours: null,
        claimedAt: null,
        submittedAt: null,
        submitNote: null,
        commits: [],
        conflict: false,
        caseCount: t.caseCount,
        passRate: null,
        conclusion: null,
        defectCount: 0,
        events: [],
      })),
    ];
  } else {
    const rows = await prisma.requirement.findMany({
      where: { status: { in: [...BOARD_STATUSES] } },
      include: {
        project: { select: { name: true } },
        source: { select: { senderName: true } },
        devTask: {
          select: {
            status: true,
            claimedAt: true,
            lastHeartbeat: true,
            submittedAt: true,
            submitNote: true,
            commits: true,
            claimedBy: { select: { username: true } },
          },
        },
        testTasks: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            status: true,
            cases: true,
            lastHeartbeat: true,
            claimedAt: true,
            claimedBy: { select: { username: true } },
            report: { select: { passRate: true, conclusion: true } },
          },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { fromStatus: true, toStatus: true, actor: true, note: true, createdAt: true },
        },
        _count: { select: { defects: true } },
      },
      orderBy: [{ poolRank: "asc" }, { updatedAt: "desc" }],
    });

    cards = rows.map((r): BoardCard => {
      const test = r.testTasks[0] ?? null;
      const inDev = r.status === "READY" || r.status === "DEVELOPING";
      const inTest = r.status === "PENDING_TEST" || r.status === "TESTING";
      const devAgent = r.devTask?.claimedBy?.username ?? null;
      const testAgent = test?.claimedBy?.username ?? null;
      const heartbeat = inTest ? test?.lastHeartbeat : r.devTask?.lastHeartbeat;
      const active = r.status === "DEVELOPING" || r.status === "TESTING";
      return {
        id: r.id,
        seq: r.seq,
        title: r.title,
        status: r.status,
        project: r.project?.name ?? null,
        priority: r.priority,
        locked: r.priorityLocked,
        reason: r.priorityReason,
        complexity: r.complexity,
        rank: r.poolRank,
        featureBranch: r.featureBranch,
        userStory: r.userStory,
        createdBy: r.source?.senderName ?? null,
        createdAt: fmt(r.createdAt),
        devAgent,
        testAgent,
        agent: inDev ? devAgent : inTest ? testAgent : devAgent,
        heartbeatAgo: active ? ago(heartbeat) : null,
        timedOutHours: active ? timeoutHours(heartbeat) : null,
        claimedAt: fmt(inTest ? test?.claimedAt : r.devTask?.claimedAt),
        submittedAt: fmt(r.devTask?.submittedAt),
        submitNote: r.devTask?.submitNote ?? null,
        commits: Array.isArray(r.devTask?.commits) ? (r.devTask.commits as string[]) : [],
        conflict: r.devTask?.status === "CONFLICT",
        caseCount: test ? (test.cases as unknown[]).length : null,
        passRate: test?.report?.passRate ?? null,
        conclusion: test?.report?.conclusion ?? null,
        defectCount: r._count.defects,
        events: r.events.map((e) => ({
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          actor: e.actor,
          note: e.note,
          at: fmt(e.createdAt)!,
        })),
      };
    });
  }

  return <Board cards={cards} />;
}
