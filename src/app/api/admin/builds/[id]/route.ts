import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 构建详情（含日志尾部与公开下载链接）

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const r = await prisma.buildRun.findUnique({ where: { id }, include: { project: { select: { name: true } } } });
  if (!r) return apiError("not_found", "build not found");
  return apiOk({
    id: r.id,
    project: r.project.name,
    branch: r.branch,
    command: r.command,
    status: r.status,
    log: r.log ?? "",
    artifactName: r.artifactName,
    artifactSize: r.artifactSize,
    hasArtifact: !!r.artifactPath,
    downloadPath: r.artifactPath ? `/api/public/builds/${r.id}?token=${r.downloadToken}` : null,
    sentTo: r.sentTo,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    createdAt: r.createdAt,
  });
}
