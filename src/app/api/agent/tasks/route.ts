import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { authenticateAgent } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 可认领任务列表。dev 任务按项管排序（poolRank/priority）排列。
// ?type=dev|test（缺省按角色返回全部可见类型）&projectId=

export async function GET(req: NextRequest) {
  const agent = await authenticateAgent(req);
  if (!agent) return apiError("unauthorized", "invalid token");

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const projectFilter = url.searchParams.get("projectId");
  const projectIds = projectFilter
    ? agent.projectIds.filter((p) => p === projectFilter)
    : agent.projectIds;

  const wantDev = (type === "dev" || !type) && (agent.role === "DEVELOPER" || agent.role === "BOTH");
  const wantTest = (type === "test" || !type) && (agent.role === "TESTER" || agent.role === "BOTH");

  const [devTasks, testTasks] = await Promise.all([
    wantDev
      ? prisma.devTask.findMany({
          where: { status: "POOL", requirement: { projectId: { in: projectIds }, status: "READY" } },
          include: {
            requirement: {
              select: {
                seq: true,
                title: true,
                complexity: true,
                priority: true,
                poolRank: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    wantTest
      ? prisma.testTask.findMany({
          where: { status: "POOL", requirement: { projectId: { in: projectIds } } },
          include: {
            requirement: {
              select: {
                seq: true,
                title: true,
                priority: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const dev = devTasks
    .map((t) => ({
      taskId: t.id,
      type: "dev" as const,
      req: `REQ-${t.requirement.seq}`,
      title: t.requirement.title,
      project: t.requirement.project?.name,
      projectId: t.requirement.project?.id,
      priority: t.requirement.priority,
      rank: t.requirement.poolRank,
      complexity: t.requirement.complexity,
    }))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));

  const test = testTasks.map((t) => ({
    taskId: t.id,
    type: "test" as const,
    req: `REQ-${t.requirement.seq}`,
    title: t.requirement.title,
    project: t.requirement.project?.name,
    projectId: t.requirement.project?.id,
    priority: t.priority,
  }));

  return apiOk({ devTasks: dev, testTasks: test });
}
