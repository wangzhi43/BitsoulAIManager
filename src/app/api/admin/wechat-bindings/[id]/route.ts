import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  paused: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  captureMode: z.enum(["ALL", "MENTION", "HASHTAG"]).optional(),
  convName: z.string().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);

  const binding = await prisma.wechatBinding.findUnique({ where: { id } });
  if (!binding) return apiError("not_found", "binding not found");

  await prisma.wechatBinding.update({ where: { id }, data: parsed.data });
  return apiOk({ ok: true });
}
