import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { authenticateAgent } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { config } from "@/lib/config";
import { decryptSecret } from "@/lib/crypto";
import { getRuntimeNumber } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

// 认领任务（dev 或 test，按 taskId 自动识别）。原子操作：仅当任务仍在池中才成功。
// dev：触发 feature 分支创建（分支名确定性返回，稍候可 push）
// test：校验开发/测试不同 Agent 互斥

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgent(req);
  if (!agent) return apiError("unauthorized", "invalid token");
  const { id } = await ctx.params;
  const now = new Date();

  // ---- dev task ----
  const devTask = await prisma.devTask.findUnique({
    where: { id },
    include: { requirement: { include: { project: true } } },
  });
  if (devTask) {
    if (agent.role === "TESTER") return apiError("forbidden", "tester cannot claim dev tasks");
    if (!devTask.requirement.projectId || !agent.projectIds.includes(devTask.requirement.projectId)) {
      return apiError("forbidden", "project not accessible");
    }
    const updated = await prisma.devTask.updateMany({
      where: { id, status: "POOL", claimedById: null },
      data: { status: "CLAIMED", claimedById: agent.id, claimedAt: now, lastHeartbeat: now },
    });
    if (updated.count === 0) return apiError("conflict", "task already claimed");

    await prisma.$transaction([
      prisma.requirement.update({
        where: { id: devTask.requirementId },
        data: { status: "DEVELOPING" },
      }),
      prisma.reqEvent.create({
        data: {
          requirementId: devTask.requirementId,
          fromStatus: "READY",
          toStatus: "DEVELOPING",
          actor: `agent:${agent.username}`,
          note: "认领开发",
        },
      }),
    ]);
    await getQueues().git.add(
      "create-feature-branch",
      { kind: "create-feature-branch", requirementId: devTask.requirementId },
      { attempts: 3, backoff: { type: "exponential", delay: 15_000 } },
    );

    const featureBranch = `feature/REQ-${devTask.requirement.seq}`;
    return apiOk({
      claimed: true,
      type: "dev",
      req: `REQ-${devTask.requirement.seq}`,
      repoUrl: devTask.requirement.project!.repoUrl,
      featureBranch,
      note: "分支正在创建（约 1 分钟内可用）；push 权限凭据见 credentials",
      // 优先下发本 Agent 自己的 PAT（ADR-003），未配置回退全局 bot PAT
      credentials: agent.gitTokenEnc
        ? { kind: "github_pat", token: decryptSecret(agent.gitTokenEnc) }
        : config.githubBotPat
          ? { kind: "shared_bot_pat", token: config.githubBotPat }
          : { kind: "none", token: null },
      heartbeatEveryMinutes: 10,
      claimTimeoutHours: await getRuntimeNumber("claimTimeoutHours"),
    });
  }

  // ---- test task ----
  const testTask = await prisma.testTask.findUnique({
    where: { id },
    include: { requirement: { include: { project: true, devTask: true } } },
  });
  if (testTask) {
    if (agent.role === "DEVELOPER") return apiError("forbidden", "developer cannot claim test tasks");
    if (!testTask.requirement.projectId || !agent.projectIds.includes(testTask.requirement.projectId)) {
      return apiError("forbidden", "project not accessible");
    }
    // 开发与测试互斥（PRD §3.6，系统参数 devTestExclusive 可关）
    const exclusive = (await getRuntimeNumber("devTestExclusive")) !== 0;
    if (exclusive && testTask.requirement.devTask?.claimedById === agent.id) {
      return apiError("conflict", "developer of this requirement cannot test it");
    }
    const updated = await prisma.testTask.updateMany({
      where: { id, status: "POOL", claimedById: null },
      data: { status: "CLAIMED", claimedById: agent.id, claimedAt: now, lastHeartbeat: now },
    });
    if (updated.count === 0) return apiError("conflict", "task already claimed");

    await prisma.$transaction([
      prisma.requirement.update({
        where: { id: testTask.requirementId },
        data: { status: "TESTING" },
      }),
      prisma.reqEvent.create({
        data: {
          requirementId: testTask.requirementId,
          fromStatus: "PENDING_TEST",
          toStatus: "TESTING",
          actor: `agent:${agent.username}`,
          note: "认领测试",
        },
      }),
    ]);

    return apiOk({
      claimed: true,
      type: "test",
      req: `REQ-${testTask.requirement.seq}`,
      repoUrl: testTask.requirement.project!.repoUrl,
      branch: testTask.requirement.dailyBranchId
        ? (await prisma.dailyBranch.findUnique({ where: { id: testTask.requirement.dailyBranchId } }))?.name
        : null,
      cases: testTask.cases,
      heartbeatEveryMinutes: 10,
      claimTimeoutHours: await getRuntimeNumber("claimTimeoutHours"),
    });
  }

  return apiError("not_found", "task not found");
}
