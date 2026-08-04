import { prisma } from "../db";
import { logger } from "../logger";
import { completeForRole } from "../llm";

// 每日进度报告（PRD §3.8）：按项目汇总当日事件，PM 角色生成结构化日报

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    done: { type: "array", items: { type: "string" } },
    inProgress: { type: "array", items: { type: "string" } },
    blocked: { type: "array", items: { type: "string" } },
    forecast: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["done", "inProgress", "blocked", "forecast", "risks"],
  additionalProperties: false,
} as const;

interface ReportOutput {
  done: string[];
  inProgress: string[];
  blocked: string[];
  forecast: string;
  risks: string[];
}

export async function generateDailyReport(projectId: string, dateIso: string): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const date = new Date(dateIso);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const [events, statusCounts, pool] = await Promise.all([
    prisma.reqEvent.findMany({
      where: { createdAt: { gte: dayStart }, requirement: { projectId } },
      include: { requirement: { select: { seq: true, title: true } } },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    prisma.requirement.groupBy({ by: ["status"], where: { projectId }, _count: true }),
    prisma.requirement.findMany({
      where: { projectId, status: { in: ["READY", "DEVELOPING", "TESTING", "PENDING_TEST"] } },
      select: { seq: true, title: true, status: true, priority: true },
      orderBy: { poolRank: "asc" },
      take: 30,
    }),
  ]);

  const eventLines = events.map(
    (e) =>
      `${e.createdAt.toISOString().slice(11, 16)} REQ-${e.requirement.seq}「${e.requirement.title}」${e.fromStatus ?? ""}→${e.toStatus} ${e.note ?? ""}`,
  );

  const userText = `项目：${project.name}
日期：${dayStart.toISOString().slice(0, 10)}

今日事件流水：
${eventLines.join("\n") || "（今日无事件）"}

当前状态分布：${statusCounts.map((s) => `${s.status}:${s._count}`).join(" ")}

进行中/待办任务：
${pool.map((r) => `REQ-${r.seq}[${r.status}${r.priority ? "/" + r.priority : ""}] ${r.title}`).join("\n") || "（空）"}

请生成当日进度日报：done 写今日完成项（含 REQ 编号），inProgress 写进行中，blocked 写受阻项（合并冲突、测试不通过、长期无人认领等），forecast 一两句预测明日进展，risks 列风险提示。没有内容的字段给空数组。用中文。`;

  const result = await completeForRole(
    "PM",
    {
      system: "你是项目管理专家，负责给项目负责人写每日进度报告。内容基于事实，简洁、可扫读，不写空话。",
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
      schema: REPORT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 4000,
    },
    { projectId },
  );

  const parsed = result.parsed as ReportOutput | undefined;
  if (!parsed) throw new Error(`daily report unusable output for ${project.name}`);

  await prisma.dailyReport.upsert({
    where: { projectId_date: { projectId, date: dayStart } },
    update: { content: parsed as object },
    create: { projectId, date: dayStart, content: parsed as object },
  });
  logger.info({ project: project.name }, "daily report generated");
}
