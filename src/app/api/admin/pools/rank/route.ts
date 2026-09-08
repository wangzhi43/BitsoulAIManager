import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// AI 重排（PRD #19）：手动触发项管专家对待开发池重排；projectId 缺省则全部活跃项目

const Body = z.object({ projectId: z.string().min(1).optional() });

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const { projectId } = parsed.data;

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return apiError("not_found", "project not found");
  }

  await getQueues().llm.add("rank-pool", { kind: "rank-pool", projectId });
  await audit(`admin:${admin.id}`, "rank-pool-manual", projectId ? `project:${projectId}` : "all");
  return apiOk({ queued: true });
}
