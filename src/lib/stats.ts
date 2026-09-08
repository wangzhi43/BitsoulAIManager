import { prisma } from "./db";
import { getQueueDepths } from "./queue";
import { getRuntimeNumber, getRuntimeString } from "./runtime-config";

// 看板统计聚合（真实数据路径）。演示模式的对应数据在 demo.ts 的 DEMO_STATS。
// 2026-09 扩展：待办直达数字、昨日对比、项目状态表、在线 Agent、LLM 成本估算、系统状态（UI_REDESIGN §3）。

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

  // ---- 2026-09 扩展 ----
  /** 需要人处理的四个数字（工作台第一行，直达处理页） */
  todo: {
    pendingConfirm: number;
    reviewing: number;
    pendingAccept: number;
    conflicts: number;
    pendingConfirmSources: { wechat: number; manual: number; web: number };
  };
  /** 与昨日同口径对比（今日 - 昨日）；无历史时为 null */
  deltas: { pendingConfirm: number | null; inProgress: number | null; acceptedToday: number | null };
  /** 项目状态表（替代健康分卡片） */
  projectRows: {
    id: string;
    name: string;
    active: boolean;
    pendingConfirm: number;
    ready: number;
    developing: number;
    testing: number;
    pendingAccept: number;
    conflicts: number;
    todayBranch: { id: string; name: string; mergedToMain: boolean } | null;
  }[];
  /** Agent 在线情况：active = 1 小时内有心跳；current = 正在认领的任务 */
  agentsOnline: { username: string; role: string; current: string | null; lastSeenAt: Date | null; active: boolean }[];
  /** 近 7 天 LLM 成本估算（美元，按系统参数 llmPrices 每百万 token 单价）；无单价表为 null */
  llmCost7d: number | null;
  llmTodayTokens: number;
  llmLimit: number;
  system: {
    botLastSeen: string | null;
    botAlert: boolean;
    queue: { llm: number; git: number; failed: number } | null;
    latestReport: { project: string; date: string; createdAt: Date; pushed: boolean } | null;
    usageAlert: { date: string; total: number; limit: number } | null;
  };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() - (n - 1 - i) * 86400_000)));
}

/** 解析 llmPrices：{ model: { input, output } }，非法返回 null */
function parsePrices(raw: string): Record<string, { input: number; output: number }> | null {
  if (!raw.trim()) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, { input?: unknown; output?: unknown }>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out: Record<string, { input: number; output: number }> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v.input === "number" && typeof v.output === "number") out[k] = { input: v.input, output: v.output };
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** 精确匹配优先，其次前缀匹配（如 "claude-sonnet-4" 命中 "claude-sonnet-4-20250514"） */
function priceFor(prices: Record<string, { input: number; output: number }>, model: string) {
  if (prices[model]) return prices[model];
  const key = Object.keys(prices).find((k) => model.startsWith(k) || k.startsWith(model));
  return key ? prices[key] : null;
}

/** redis 不可用时 ioredis 会无限重试，这里加超时避免拖住整页 */
async function safeQueueDepths(): Promise<{ llm: number; git: number; failed: number } | null> {
  try {
    return await Promise.race([
      getQueueDepths(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
  } catch {
    return null;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const since14 = new Date(Date.now() - 14 * 86400_000);
  const since7 = new Date(Date.now() - 7 * 86400_000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 86400_000);

  const [
    statusCounts,
    projects,
    reqEvents14,
    conflicts,
    agents,
    llmLogs,
    recent,
    botSeen,
    botAlertRow,
    acceptedReqs,
    alertRow,
    pendingSources,
    todayBranches,
    latestReport,
    queue,
    llmLimit,
    pricesRaw,
    botAlertMinutes,
  ] = await Promise.all([
    prisma.requirement.groupBy({ by: ["projectId", "status"], _count: true }),
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.reqEvent.findMany({
      where: { createdAt: { gte: since14 }, toStatus: { in: ["PENDING_CONFIRM", "ACCEPTED", "READY", "DEVELOPING"] } },
      select: { toStatus: true, createdAt: true },
    }),
    prisma.devTask.groupBy({ by: ["requirementId"], where: { status: "CONFLICT" }, _count: true }),
    prisma.agentAccount.findMany({
      where: { enabled: true },
      select: {
        username: true,
        role: true,
        lastSeenAt: true,
        _count: { select: { devTasks: true, testTasks: true } },
        devTasks: { where: { status: "CLAIMED" }, select: { requirement: { select: { seq: true } } }, take: 1 },
        testTasks: { where: { status: "CLAIMED" }, select: { requirement: { select: { seq: true } } }, take: 1 },
      },
    }),
    prisma.llmUsageLog.findMany({
      where: { createdAt: { gte: since7 } },
      select: { createdAt: true, inputTokens: true, outputTokens: true, expertRole: true, model: true },
    }),
    prisma.reqEvent.findMany({
      include: { requirement: { select: { seq: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.systemConfig.findUnique({ where: { key: "wechatBotLastSeen" } }),
    prisma.systemConfig.findUnique({ where: { key: "wechatBotAlert" } }),
    prisma.requirement.findMany({
      where: { status: "ACCEPTED", updatedAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
      include: { events: { select: { toStatus: true, createdAt: true } } },
      take: 100,
    }),
    prisma.systemConfig.findUnique({ where: { key: "usageAlert" } }),
    prisma.requirement.findMany({
      where: { status: "PENDING_CONFIRM" },
      select: { source: { select: { channel: true } } },
    }),
    prisma.dailyBranch.findMany({
      where: { date: { gte: todayStart } },
      select: { id: true, name: true, projectId: true, mergedToMain: true, date: true },
      orderBy: { date: "desc" },
    }),
    prisma.dailyReport.findFirst({
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true } } },
    }),
    safeQueueDepths(),
    getRuntimeNumber("dailyTokenLimit"),
    getRuntimeString("llmPrices"),
    getRuntimeNumber("botHeartbeatAlertMinutes"),
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
  const conflictsOf = (projectId: string) => [...conflictReqIds].filter((id) => reqProjectMap.get(id) === projectId).length;

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

  // 昨日对比（近似口径：按事件流入计数，今日 - 昨日；14 天内没有该类事件则视为无历史）
  const countEvents = (statuses: string[], from: Date, to: Date) =>
    reqEvents14.filter((e) => statuses.includes(e.toStatus) && e.createdAt >= from && e.createdAt < to).length;
  const tomorrow = new Date(todayStart.getTime() + 86400_000);
  const delta = (statuses: string[]) => {
    const any = reqEvents14.some((e) => statuses.includes(e.toStatus));
    if (!any) return null;
    return countEvents(statuses, todayStart, tomorrow) - countEvents(statuses, yesterdayStart, todayStart);
  };

  const days7 = lastNDays(7);
  const llmByDay = new Map(days7.map((d) => [d, 0]));
  const llmByRole = new Map<string, number>();
  const prices = parsePrices(pricesRaw);
  let cost7d = 0;
  let llmTodayTokens = 0;
  for (const l of llmLogs) {
    const k = dayKey(l.createdAt);
    const t = l.inputTokens + l.outputTokens;
    if (llmByDay.has(k)) llmByDay.set(k, (llmByDay.get(k) ?? 0) + t);
    const role = l.expertRole ?? "其他";
    llmByRole.set(role, (llmByRole.get(role) ?? 0) + t);
    if (l.createdAt >= todayStart) llmTodayTokens += t;
    if (prices) {
      const p = priceFor(prices, l.model);
      if (p) cost7d += (l.inputTokens / 1e6) * p.input + (l.outputTokens / 1e6) * p.output;
    }
  }

  const acceptedToday = recent.filter((e) => e.toStatus === "ACCEPTED" && e.createdAt >= todayStart).length;

  const usageAlert = (() => {
    try {
      return alertRow ? (JSON.parse(alertRow.value) as { date: string; total: number; limit: number }) : null;
    } catch {
      return null;
    }
  })();

  const botLastSeen = botSeen?.value ?? null;
  const botAlertFlag = !!botAlertRow && !["", "0", "false", "null"].includes(botAlertRow.value.trim().toLowerCase());
  const botStale = (() => {
    if (!botLastSeen) return false;
    const t = new Date(botLastSeen).getTime();
    return Number.isFinite(t) && Date.now() - t > botAlertMinutes * 60_000;
  })();

  const todayBranchOf = (projectId: string) => {
    const b = todayBranches.find((x) => x.projectId === projectId);
    return b ? { id: b.id, name: b.name, mergedToMain: b.mergedToMain } : null;
  };

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
      conflicts: conflictsOf(p.id),
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
    botLastSeen,
    agentActive: agents.filter((a) => a.lastSeenAt && a.lastSeenAt.getTime() >= Date.now() - 3600_000).length,
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
    usageAlert,

    todo: {
      pendingConfirm: countBy(["PENDING_CONFIRM"]),
      reviewing: countBy(["REVIEWING"]),
      pendingAccept: countBy(["PENDING_ACCEPT"]),
      conflicts: conflictReqIds.size,
      pendingConfirmSources: {
        wechat: pendingSources.filter((r) => r.source.channel === "WECHAT").length,
        manual: pendingSources.filter((r) => r.source.channel === "MANUAL").length,
        web: pendingSources.filter((r) => r.source.channel === "WEB_FORM").length,
      },
    },
    deltas: {
      pendingConfirm: delta(["PENDING_CONFIRM"]),
      inProgress: delta(["READY", "DEVELOPING"]),
      acceptedToday: delta(["ACCEPTED"]),
    },
    projectRows: projects.map((p) => ({
      id: p.id,
      name: p.name,
      active: p.active,
      pendingConfirm: countBy(["PENDING_CONFIRM"], p.id),
      ready: countBy(["READY"], p.id),
      developing: countBy(["DEVELOPING"], p.id),
      testing: countBy(["PENDING_TEST", "TESTING"], p.id),
      pendingAccept: countBy(["REVIEWING", "PENDING_ACCEPT"], p.id),
      conflicts: conflictsOf(p.id),
      todayBranch: todayBranchOf(p.id),
    })),
    agentsOnline: agents
      .map((a) => {
        const dev = a.devTasks[0]?.requirement.seq;
        const test = a.testTasks[0]?.requirement.seq;
        return {
          username: a.username,
          role: a.role,
          current: dev ? `开发中 REQ-${dev}` : test ? `测试中 REQ-${test}` : null,
          lastSeenAt: a.lastSeenAt,
          active: !!a.lastSeenAt && a.lastSeenAt.getTime() >= Date.now() - 3600_000,
        };
      })
      .sort((x, y) => (y.lastSeenAt?.getTime() ?? 0) - (x.lastSeenAt?.getTime() ?? 0)),
    llmCost7d: prices ? Math.round(cost7d * 100) / 100 : null,
    llmTodayTokens,
    llmLimit,
    system: {
      botLastSeen,
      botAlert: botAlertFlag || botStale,
      queue,
      latestReport: latestReport
        ? {
            project: latestReport.project.name,
            date: latestReport.date.toISOString().slice(0, 10),
            createdAt: latestReport.createdAt,
            pushed: latestReport.pushed,
          }
        : null,
      usageAlert,
    },
  };
}
