import { prisma } from "./db";

// 看板统计聚合（真实数据路径）。演示模式的对应数据在 demo.ts 的 DEMO.stats。

export interface DashboardStats {
  kpis: {
    pendingConfirm: number;
    inProgress: number;
    pendingAccept: number;
    acceptedToday: number;
    spark: { created: number[]; accepted: number[] }; // 近 7 天
  };
  trend14d: { labels: string[]; created: number[]; accepted: number[] };
  statusDist: { name: string; value: number }[];
  projects: {
    id: string;
    name: string;
    active: boolean;
    pendingConfirm: number;
    developing: number;
    testing: number;
    pendingAccept: number;
    conflicts: number;
  }[];
  agentRank: { label: string; value: number; hint?: string }[];
  llm7d: { byDay: { label: string; value: number }[]; byRole: { name: string; value: number }[] };
  recentEvents: { seq: number; title: string; note: string; actor: string; at: Date }[];
  botLastSeen: string | null;
  agentActive: number;
  quality: { avgLeadHours: number | null; avgDevHours: number | null; reworkRate: number | null; samples: number };
  usageAlert: { date: string; total: number; limit: number } | null;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() - (n - 1 - i) * 86400_000)));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const since14 = new Date(Date.now() - 14 * 86400_000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [statusCounts, projects, reqEvents14, conflicts, agents, llmLogs, recent, botSeen, agentActive, acceptedReqs, alertRow] =
    await Promise.all([
      prisma.requirement.groupBy({ by: ["projectId", "status"], _count: true }),
      prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.reqEvent.findMany({
        where: { createdAt: { gte: since14 }, toStatus: { in: ["PENDING_CONFIRM", "ACCEPTED"] } },
        select: { toStatus: true, createdAt: true },
      }),
      prisma.devTask.groupBy({ by: ["requirementId"], where: { status: "CONFLICT" }, _count: true }),
      prisma.agentAccount.findMany({
        where: { enabled: true },
        select: { username: true, role: true, _count: { select: { devTasks: true, testTasks: true } } },
      }),
      prisma.llmUsageLog.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
        select: { createdAt: true, inputTokens: true, outputTokens: true, expertRole: true },
      }),
      prisma.reqEvent.findMany({
        include: { requirement: { select: { seq: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.systemConfig.findUnique({ where: { key: "wechatBotLastSeen" } }),
      prisma.agentAccount.count({ where: { enabled: true, lastSeenAt: { gte: new Date(Date.now() - 3600_000) } } }),
      prisma.requirement.findMany({
        where: { status: "ACCEPTED", updatedAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
        include: { events: { select: { toStatus: true, createdAt: true } } },
        take: 100,
      }),
      prisma.systemConfig.findUnique({ where: { key: "usageAlert" } }),
    ]);

  const countBy = (statuses: string[], projectId?: string) =>
    statusCounts
      .filter((c) => statuses.includes(c.status) && (!projectId || c.projectId === projectId))
      .reduce((s, c) => s + c._count, 0);

  const conflictReqIds = new Set(conflicts.map((c) => c.requirementId));
  const reqProjectMap = new Map<string, string | null>();
  // conflicts per project：需要 requirement→project 映射，仅冲突集合，量小
  if (conflictReqIds.size > 0) {
    const rs = await prisma.requirement.findMany({
      where: { id: { in: [...conflictReqIds] } },
      select: { id: true, projectId: true },
    });
    rs.forEach((r) => reqProjectMap.set(r.id, r.projectId));
  }

  const days14 = lastNDays(14);
  const createdByDay = new Map(days14.map((d) => [d, 0]));
  const acceptedByDay = new Map(days14.map((d) => [d, 0]));
  for (const e of reqEvents14) {
    const k = dayKey(e.createdAt);
    if (e.toStatus === "PENDING_CONFIRM" && createdByDay.has(k)) createdByDay.set(k, (createdByDay.get(k) ?? 0) + 1);
    if (e.toStatus === "ACCEPTED" && acceptedByDay.has(k)) acceptedByDay.set(k, (acceptedByDay.get(k) ?? 0) + 1);
  }
  const created14 = days14.map((d) => createdByDay.get(d) ?? 0);
  const accepted14 = days14.map((d) => acceptedByDay.get(d) ?? 0);

  const days7 = lastNDays(7);
  const llmByDay = new Map(days7.map((d) => [d, 0]));
  const llmByRole = new Map<string, number>();
  for (const l of llmLogs) {
    const k = dayKey(l.createdAt);
    const t = l.inputTokens + l.outputTokens;
    if (llmByDay.has(k)) llmByDay.set(k, (llmByDay.get(k) ?? 0) + t);
    const role = l.expertRole ?? "其他";
    llmByRole.set(role, (llmByRole.get(role) ?? 0) + t);
  }

  const acceptedToday = recent.filter((e) => e.toStatus === "ACCEPTED" && e.createdAt >= todayStart).length;

  return {
    kpis: {
      pendingConfirm: countBy(["PENDING_CONFIRM"]),
      inProgress: countBy(["READY", "DEVELOPING", "PENDING_TEST", "TESTING", "REVIEWING"]),
      pendingAccept: countBy(["PENDING_ACCEPT"]),
      acceptedToday,
      spark: { created: created14.slice(-7), accepted: accepted14.slice(-7) },
    },
    trend14d: { labels: days14.map((d) => d.slice(5)), created: created14, accepted: accepted14 },
    statusDist: [
      { name: "待确认", value: countBy(["PENDING_CONFIRM"]) },
      { name: "待开发", value: countBy(["READY"]) },
      { name: "开发中", value: countBy(["DEVELOPING"]) },
      { name: "测试中", value: countBy(["PENDING_TEST", "TESTING"]) },
      { name: "待验收", value: countBy(["REVIEWING", "PENDING_ACCEPT"]) },
    ],
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      active: p.active,
      pendingConfirm: countBy(["PENDING_CONFIRM"], p.id),
      developing: countBy(["READY", "DEVELOPING"], p.id),
      testing: countBy(["PENDING_TEST", "TESTING"], p.id),
      pendingAccept: countBy(["REVIEWING", "PENDING_ACCEPT"], p.id),
      conflicts: [...conflictReqIds].filter((id) => reqProjectMap.get(id) === p.id).length,
    })),
    agentRank: agents
      .map((a) => ({
        label: a.username,
        value: a._count.devTasks + a._count.testTasks,
        hint: a.role === "TESTER" ? "测试" : a.role === "BOTH" ? "全能" : "开发",
      }))
      .sort((x, y) => y.value - x.value)
      .slice(0, 6),
    llm7d: {
      byDay: days7.map((d) => ({ label: d.slice(8), value: llmByDay.get(d) ?? 0 })),
      byRole: [...llmByRole.entries()].map(([name, value]) => ({
        name: name === "PRODUCT" ? "产品专家" : name === "PM" ? "项管专家" : name === "TEST" ? "测试专家" : name,
        value,
      })),
    },
    recentEvents: recent.map((e) => ({
      seq: e.requirement.seq,
      title: e.requirement.title,
      note: e.note ?? `${e.fromStatus ?? ""}→${e.toStatus}`,
      actor: e.actor,
      at: e.createdAt,
    })),
    botLastSeen: botSeen?.value ?? null,
    agentActive,
    quality: (() => {
      const leads: number[] = [];
      const devs: number[] = [];
      let rework = 0;
      for (const r of acceptedReqs) {
        const first = r.events[0]?.createdAt ?? r.createdAt;
        const accepted = r.events.filter((e) => e.toStatus === "ACCEPTED").at(-1)?.createdAt;
        const devStart = r.events.find((e) => e.toStatus === "DEVELOPING")?.createdAt;
        const testStart = r.events.find((e) => e.toStatus === "PENDING_TEST")?.createdAt;
        if (accepted) leads.push((accepted.getTime() - first.getTime()) / 3600_000);
        if (devStart && testStart) devs.push((testStart.getTime() - devStart.getTime()) / 3600_000);
        // 返工：测试失败回池（TESTING/REVIEWING → READY）
        if (r.events.some((e, i) => e.toStatus === "READY" && i > 0 && ["TESTING", "REVIEWING"].includes(r.events[i - 1]?.toStatus ?? ""))) rework++;
      }
      const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
      return {
        avgLeadHours: avg(leads),
        avgDevHours: avg(devs),
        reworkRate: acceptedReqs.length ? Math.round((rework / acceptedReqs.length) * 100) : null,
        samples: acceptedReqs.length,
      };
    })(),
    usageAlert: (() => {
      try {
        return alertRow ? (JSON.parse(alertRow.value) as { date: string; total: number; limit: number }) : null;
      } catch {
        return null;
      }
    })(),
  };
}
