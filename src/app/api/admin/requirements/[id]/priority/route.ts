import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 手动调整/锁定优先级（锁定后项管 Agent 不再改动）

const Body = z.object({
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  locked: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);

  const r = await prisma.requirement.findUnique({ where: { id } });
  if (!r) return apiError("not_found", "requirement not found");

  await prisma.requirement.update({
    where: { id },
    data: {
      ...(parsed.data.priority ? { priority: parsed.data.priority, priorityReason: "管理员手动设置" } : {}),
      ...(parsed.data.locked !== undefined ? { priorityLocked: parsed.data.locked } : {}),
    },
  });
  return apiOk({ ok: true });
}
