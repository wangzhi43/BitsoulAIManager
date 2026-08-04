import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { authenticateAgent } from "@/lib/auth";
import { readRepoFile } from "@/lib/git";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 上下文包：需求全文 + 项目共享上下文（docs/agent-context.md）+ 同项目近期已验收需求摘要 + 提交要求

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgent(req);
  if (!agent) return apiError("unauthorized", "invalid token");
  const { id } = await ctx.params;

  const devTask = await prisma.devTask.findUnique({ where: { id } });
  const testTask = devTask ? null : await prisma.testTask.findUnique({ where: { id } });
  const requirementId = devTask?.requirementId ?? testTask?.requirementId;
  if (!requirementId) return apiError("not_found", "task not found");
  if ((devTask ?? testTask)!.claimedById !== agent.id) {
    return apiError("forbidden", "task not claimed by you");
  }

  const requirement = await prisma.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: {
      project: true,
      source: { select: { channel: true, senderName: true, customerName: true } },
      parent: { select: { seq: true, title: true } },
    },
  });
  if (!requirement.project) return apiError("conflict", "requirement has no project");

  const [agentContext, recentDone] = await Promise.all([
    readRepoFile(requirement.project.id, `${requirement.project.docsDir}/agent-context.md`).catch(
      () => null,
    ),
    prisma.requirement.findMany({
      where: { projectId: requirement.project.id, status: "ACCEPTED" },
      select: { seq: true, title: true, moduleGuess: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  return apiOk({
    req: `REQ-${requirement.seq}`,
    project: {
      name: requirement.project.name,
      repoUrl: requirement.project.repoUrl,
      mainBranch: requirement.project.mainBranch,
    },
    requirement: {
      title: requirement.title,
      userStory: requirement.userStory,
      acceptance: requirement.acceptance,
      complexity: requirement.complexity,
      moduleGuess: requirement.moduleGuess,
      clarifications: requirement.clarifications,
      isDefect: !!requirement.parentId,
      defectOf: requirement.parent ? `REQ-${requirement.parent.seq}: ${requirement.parent.title}` : null,
      customer: requirement.source.customerName ?? requirement.source.senderName,
    },
    branch: requirement.featureBranch,
    sharedContext: agentContext,
    recentAccepted: recentDone.map((r) => `REQ-${r.seq} ${r.title}${r.moduleGuess ? `（${r.moduleGuess}）` : ""}`),
    submitInstructions: devTask
      ? [
          `在分支 ${requirement.featureBranch} 上开发，完成后 push 到 origin`,
          "逐条对照验收标准自测，自测结果写入提交接口的 selfTest 字段",
          "调用 POST /api/agent/tasks/{taskId}/submit 提交，附 note、selfTest、commits（sha 列表）",
          "开发期间每 10 分钟调用一次 heartbeat，超时未心跳任务会被释放",
        ]
      : [
          "在需求所在的当日分支上执行 cases 中的全部用例",
          "调用 POST /api/agent/test-tasks/{taskId}/report 提交结构化报告",
        ],
  });
}
