import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import type { ReqStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ReqStatus | null;
  const projectId = url.searchParams.get("projectId");

  const requirements = await prisma.requirement.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
    },
    include: {
      project: { select: { id: true, name: true } },
      source: { select: { channel: true, senderName: true, customerName: true, wechatConvId: true } },
    },
    orderBy: { seq: "desc" },
    take: 200,
  });
  return apiOk({ requirements });
}
