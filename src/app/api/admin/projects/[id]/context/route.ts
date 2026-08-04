import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { readRepoFile } from "@/lib/git";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 项目共享上下文（docs/agent-context.md，PRD §3.7）：
// GET 读取仓库当前内容；PUT 提交新内容（经 git 队列 commit 到当日分支）

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return apiError("not_found", "project not found");

  let content: string | null = null;
  let readable = true;
  try {
    content = await readRepoFile(id, `${project.docsDir}/agent-context.md`);
  } catch {
    readable = false; // 仓库不可达（PAT 未配或 remote 不存在）
  }
  return apiOk({ content, readable });
}

const PutBody = z.object({ content: z.string().max(50_000) });

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return apiError("not_found", "project not found");

  await getQueues().git.add("write-repo-file", {
    kind: "write-repo-file",
    projectId: id,
    file: "agent-context.md",
    content: parsed.data.content,
  });
  await audit(`admin:${admin.id}`, "update-agent-context", `project:${project.name}`);
  return apiOk({ ok: true, queued: true });
}
