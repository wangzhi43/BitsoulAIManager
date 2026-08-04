import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 确认需求单：PENDING_CONFIRM → READY，建 DevTask 入待开发池，触发项管重排

const Body = z.object({ projectId: z.string().optional() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => ({})));

  const requirement = await prisma.requirement.findUnique({ where: { id } });
  if (!requirement) return apiError("not_found", "requirement not found");
  if (requirement.status !== "PENDING_CONFIRM") {
    return apiError("conflict", `requirement is ${requirement.status}, not PENDING_CONFIRM`);
  }

  const projectId = body.success && body.data.projectId ? body.data.projectId : requirement.projectId;
  if (!projectId) return apiError("bad_request", "projectId required (requirement has no project)");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || !project.active) return apiError("bad_request", "project not found or inactive");

  await prisma.$transaction([
    prisma.requirement.update({
      where: { id },
      data: { status: "READY", projectId },
    }),
    prisma.devTask.create({ data: { requirementId: id, status: "POOL" } }),
    prisma.reqEvent.create({
      data: {
        requirementId: id,
        fromStatus: "PENDING_CONFIRM",
        toStatus: "READY",
        actor: `admin:${admin.id}`,
        note: "确认进入待开发池",
      },
    }),
  ]);

  await getQueues().llm.add("rank-pool", { kind: "rank-pool", projectId });
  // requirements-log 自动写入（PRD §3.7）
  await getQueues().git.add("append-docs-log", {
    kind: "append-docs-log",
    projectId,
    file: "requirements-log.md",
    content: `\n## ${new Date().toISOString().slice(0, 10)} 新增 REQ-${requirement.seq} ${requirement.title}\n- 用户故事：${requirement.userStory.split("\n")[0]}\n- 复杂度：${requirement.complexity}\n`,
  });
  await audit(`admin:${admin.id}`, "confirm-requirement", `REQ-${requirement.seq}`);
  return apiOk({ ok: true });
}
