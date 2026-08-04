import { prisma } from "../db";
import { logger } from "../logger";
import { completeForRole } from "../llm";
import { TEST_SYSTEM_PROMPT, TEST_OUTPUT_SCHEMA, type TestGenOutput } from "../llm/prompts/test";

// 测试专家：开发合并完成后为需求生成测试任务（幂等：已有未完成测试任务则跳过）

export async function genTestTasks(requirementId: string): Promise<void> {
  const req = await prisma.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: { project: true, devTask: true, parent: { select: { seq: true, title: true } } },
  });
  if (!req.devTask || req.devTask.status !== "MERGED") {
    throw new Error(`REQ-${req.seq} dev task not merged yet`);
  }
  const existing = await prisma.testTask.findFirst({
    where: { requirementId, status: { in: ["POOL", "CLAIMED"] } },
  });
  if (existing) {
    logger.info({ req: req.seq }, "test task already exists, skip");
    return;
  }

  const userText = `需求 REQ-${req.seq}（项目：${req.project?.name}，复杂度 ${req.complexity}${req.parentId ? `，缺陷修复，原需求 REQ-${req.parent?.seq}` : ""}，优先级 ${req.priority ?? "未定"}）

标题：${req.title}

用户故事：
${req.userStory}

验收标准：
${(req.acceptance as string[]).map((a, i) => `${i + 1}. ${a}`).join("\n")}

开发提交说明：${req.devTask.submitNote ?? "（无）"}
开发自测结果：${req.devTask.selfTest ?? "（无）"}
提交 commits：${JSON.stringify(req.devTask.commits ?? [])}`;

  const result = await completeForRole(
    "TEST",
    {
      system: TEST_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
      schema: TEST_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 8000,
    },
    { projectId: req.projectId ?? undefined, requirementId },
  );

  const parsed = result.parsed as TestGenOutput | undefined;
  if (!parsed?.cases?.length) {
    throw new Error(`test expert returned unusable output for REQ-${req.seq}`);
  }

  await prisma.$transaction([
    prisma.testTask.create({
      data: {
        requirementId,
        cases: parsed.cases,
        tags: [...new Set(parsed.cases.map((c) => c.tag))],
        priority: parsed.taskPriority,
        status: "POOL",
      },
    }),
    prisma.reqEvent.create({
      data: {
        requirementId,
        fromStatus: "PENDING_TEST",
        toStatus: "PENDING_TEST",
        actor: "expert:TEST",
        note: `生成测试任务：${parsed.cases.length} 条用例`,
      },
    }),
  ]);
  logger.info({ req: req.seq, cases: parsed.cases.length }, "test task generated");
}
