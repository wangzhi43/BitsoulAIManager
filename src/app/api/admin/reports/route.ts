import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 日报列表：?projectId=&days=30（默认 30 天）

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const daysRaw = Number(url.searchParams.get("days") ?? 30);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : 30;
  const since = new Date(Date.now() - days * 86400_000);
  since.setHours(0, 0, 0, 0);

  const rows = await prisma.dailyReport.findMany({
    where: { date: { gte: since }, ...(projectId ? { projectId } : {}) },
    include: { project: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return apiOk({
    reports: rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      project: r.project.name,
      date: r.date.toISOString().slice(0, 10),
      content: r.content,
      pushed: r.pushed,
      createdAt: r.createdAt,
    })),
  });
}
