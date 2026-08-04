import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  active: z.boolean().optional(),
  repoUrl: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  buildCommand: z.string().nullable().optional(),
  mainBranch: z.string().min(1).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return apiError("not_found", "project not found");

  await prisma.project.update({ where: { id }, data: parsed.data });
  return apiOk({ ok: true });
}
