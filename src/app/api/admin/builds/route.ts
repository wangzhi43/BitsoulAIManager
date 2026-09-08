import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 体验包（PRD #27 / ADR-003）：列表 + 发起构建

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const branch = url.searchParams.get("branch") ?? undefined;
  const runs = await prisma.buildRun.findMany({
    where: { ...(projectId ? { projectId } : {}), ...(branch ? { branch } : {}) },
    include: { project: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return apiOk({
    builds: runs.map((r) => ({
      id: r.id,
      project: r.project.name,
      projectId: r.projectId,
      branch: r.branch,
      status: r.status,
      requirementIds: r.requirementIds,
      artifactName: r.artifactName,
      artifactSize: r.artifactSize,
      hasArtifact: !!r.artifactPath,
      sentTo: r.sentTo,
      createdAt: r.createdAt,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    })),
  });
}

const Body = z.object({
  projectId: z.string().min(1),
  branch: z.string().min(1).max(200),
  requirementIds: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const { projectId, branch, requirementIds } = parsed.data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return apiError("not_found", "project not found");
  if (!project.buildCommand?.trim()) return apiError("conflict", "项目未配置构建命令，请先在设置页填写");
  if (!/^[\w./-]+$/.test(branch)) return apiError("bad_request", "invalid branch name");

  const running = await prisma.buildRun.count({ where: { projectId, status: { in: ["QUEUED", "RUNNING"] } } });
  if (running > 0) return apiError("conflict", "该项目已有构建在排队或进行中");

  const run = await prisma.buildRun.create({
    data: { projectId, branch, command: project.buildCommand, requirementIds, requestedBy: `admin:${admin.id}` },
  });
  await getQueues().git.add("run-build", { kind: "run-build", buildRunId: run.id }, { attempts: 1 });
  await audit(`admin:${admin.id}`, "build-package", `${project.name}@${branch}`, run.id);
  return apiOk({ id: run.id, queued: true }, 201);
}
