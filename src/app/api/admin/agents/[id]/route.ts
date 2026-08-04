import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  enabled: z.boolean().optional(),
  role: z.enum(["DEVELOPER", "TESTER", "BOTH"]).optional(),
  projectIds: z.array(z.string()).min(1).optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const d = parsed.data;

  const agent = await prisma.agentAccount.findUnique({ where: { id } });
  if (!agent) return apiError("not_found", "agent not found");

  await prisma.$transaction([
    prisma.agentAccount.update({
      where: { id },
      data: {
        ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
        ...(d.role ? { role: d.role } : {}),
        ...(d.projectIds ? { projectIds: d.projectIds } : {}),
        ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}),
      },
    }),
    // 禁用或改密时吊销全部 token
    ...(d.enabled === false || d.password
      ? [prisma.agentToken.updateMany({ where: { agentId: id, revokedAt: null }, data: { revokedAt: new Date() } })]
      : []),
  ]);
  return apiOk({ ok: true });
}
