import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { artifactResponse } from "@/lib/build-download";

export const dynamic = "force-dynamic";

// 管理员下载产物（登录态）

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const r = await prisma.buildRun.findUnique({ where: { id } });
  if (!r) return apiError("not_found", "build not found");
  return artifactResponse(r);
}
