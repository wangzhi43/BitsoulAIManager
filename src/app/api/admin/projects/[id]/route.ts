import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  active: z.boolean().optional(),
  repoUrl: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  buildCommand: z.string().nullable().optional(),
  mainBranch: z.string().min(1).optional(),
  // 仓库内 docs 目录（相对路径，不以 / 开头）
  docsDir: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^/\\][^\\]*$/, "docsDir 需为相对路径，不能以 / 开头")
    .optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.issues[0]?.message ?? parsed.error.message);

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return apiError("not_found", "project not found");

  const data = { ...parsed.data };
  if (data.docsDir) data.docsDir = data.docsDir.replace(/\/+$/, "") || "docs";
  if (data.name && data.name !== project.name) {
    const dup = await prisma.project.findUnique({ where: { name: data.name } });
    if (dup) return apiError("conflict", `project ${data.name} already exists`);
  }

  await prisma.project.update({ where: { id }, data });
  await audit(`admin:${admin.id}`, "update-project", `project:${project.name}`, Object.keys(data).join(","));
  return apiOk({ ok: true });
}

// 删除项目：仅允许没有任何需求与 daily 分支的项目（避免破坏历史链路）；先解绑微信会话
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: { _count: { select: { requirements: true, dailyBranches: true, dailyReports: true } } },
  });
  if (!project) return apiError("not_found", "project not found");
  if (project._count.requirements > 0 || project._count.dailyBranches > 0) {
    return apiError(
      "conflict",
      `project has ${project._count.requirements} requirements and ${project._count.dailyBranches} daily branches; disable it instead`,
    );
  }

  await prisma.$transaction([
    prisma.wechatBinding.updateMany({ where: { projectId: id }, data: { projectId: null } }),
    prisma.dailyReport.deleteMany({ where: { projectId: id } }),
    prisma.project.delete({ where: { id } }),
  ]);
  await audit(`admin:${admin.id}`, "delete-project", `project:${project.name}`, project.repoUrl);
  return apiOk({ ok: true });
}
