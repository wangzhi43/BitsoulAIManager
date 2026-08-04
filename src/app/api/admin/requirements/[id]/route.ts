import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const requirement = await prisma.requirement.findUnique({
    where: { id },
    include: {
      project: true,
      source: { include: { attachments: true } },
      events: { orderBy: { createdAt: "asc" } },
      devTask: true,
      testTasks: { include: { report: true } },
      defects: { select: { id: true, seq: true, title: true, status: true } },
    },
  });
  if (!requirement) return apiError("not_found", "requirement not found");
  return apiOk({ requirement });
}

// 编辑需求单（仅待确认/待开发状态可编辑内容）
const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  userStory: z.string().min(1).optional(),
  acceptance: z.array(z.string().min(1)).min(1).optional(),
  complexity: z.enum(["S", "M", "L"]).optional(),
  projectId: z.string().nullable().optional(),
  moduleGuess: z.string().nullable().optional(),
  clarifications: z
    .array(z.object({ question: z.string(), answer: z.string().nullable() }))
    .optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);

  const requirement = await prisma.requirement.findUnique({ where: { id } });
  if (!requirement) return apiError("not_found", "requirement not found");
  if (!["PENDING_CONFIRM", "READY"].includes(requirement.status)) {
    return apiError("conflict", `cannot edit requirement in status ${requirement.status}`);
  }
  if (parsed.data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
    if (!project) return apiError("bad_request", "project not found");
  }

  await prisma.$transaction([
    prisma.requirement.update({ where: { id }, data: parsed.data }),
    prisma.reqEvent.create({
      data: {
        requirementId: id,
        fromStatus: requirement.status,
        toStatus: requirement.status,
        actor: `admin:${admin.id}`,
        note: "编辑需求单",
      },
    }),
  ]);
  return apiOk({ ok: true });
}
