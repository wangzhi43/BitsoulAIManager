import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { artifactResponse } from "@/lib/build-download";

export const dynamic = "force-dynamic";

// 客户下载体验包：不需登录，凭每次构建独立的随机令牌（ADR-003）

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return new Response("missing token", { status: 401 });
  const r = await prisma.buildRun.findUnique({ where: { id } });
  if (!r || r.downloadToken !== token) return new Response("not found", { status: 404 });
  return artifactResponse(r);
}
