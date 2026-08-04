import { prisma } from "../db";
import { logger } from "../logger";
import { completeForRole } from "../llm";
import { PM_SYSTEM_PROMPT, PM_OUTPUT_SCHEMA, type PmRankOutput } from "../llm/prompts/pm";

// 项目管理专家：对 READY 状态（待开发池）需求全量重排。
// projectId 缺省时对所有活跃项目分别执行。

export async function rankPool(projectId?: string): Promise<void> {
  const projects = projectId
    ? await prisma.project.findMany({ where: { id: projectId } })
    : await prisma.project.findMany({ where: { active: true } });

  for (const project of projects) {
    const pool = await prisma.requirement.findMany({
      where: { projectId: project.id, status: "READY" },
      include: { parent: { select: { seq: true } }, source: { select: { customerName: true, channel: true } } },
      orderBy: { seq: "asc" },
    });
    if (pool.length === 0) continue;
    if (pool.every((r) => r.priorityLocked)) continue;

    const lines = pool.map((r) =>
      JSON.stringify({
        seq: r.seq,
        title: r.title,
        userStory: r.userStory.slice(0, 300),
        complexity: r.complexity,
        isDefect: !!r.parentId,
        defectOf: r.parent?.seq ?? null,
        customer: r.source.customerName ?? (r.source.channel === "WECHAT" ? "外部微信客户" : "内部"),
        locked: r.priorityLocked,
        currentPriority: r.priority,
      }),
    );

    const result = await completeForRole(
      "PM",
      {
        system: PM_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `项目：${project.name}\n待开发池（每行一个 JSON）：\n${lines.join("\n")}`,
              },
            ],
          },
        ],
        schema: PM_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 8000,
      },
      { projectId: project.id },
    );

    const parsed = result.parsed as PmRankOutput | undefined;
    if (!parsed?.rankings) {
      logger.warn({ project: project.name }, "pm expert returned unusable output");
      continue;
    }

    const bySeq = new Map(pool.map((r) => [r.seq, r]));
    for (const item of parsed.rankings) {
      const req = bySeq.get(item.seq);
      if (!req || req.priorityLocked) continue;
      await prisma.requirement.update({
        where: { id: req.id },
        data: { priority: item.priority, poolRank: item.rank, priorityReason: item.reason },
      });
    }
    logger.info({ project: project.name, ranked: parsed.rankings.length }, "pool ranked");
  }
}
