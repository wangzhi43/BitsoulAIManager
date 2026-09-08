import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 手动生成日报（PRD #35）：入队 daily-report，由 worker 调项管专家生成并按绑定推送

const Body = z.object({
  projectId: z.string().min(1),
  date: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.issues[0]?.message ?? "invalid body");
  const { projectId } = parsed.data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return apiError("not_found", "project not found");

  const date = parsed.data.date ? new Date(parsed.data.date) : new Date();
  if (Number.isNaN(date.getTime())) return apiError("bad_request", "invalid date");
  const iso = date.toISOString();

  await getQueues().llm.add(
    "daily-report",
    { kind: "daily-report", projectId, date: iso },
    { attempts: 2, backoff: { type: "exponential", delay: 30_000 } },
  );
  await audit(`admin:${admin.id}`, "generate-daily-report", `project:${project.name}`, iso.slice(0, 10));
  return apiOk({ queued: true, date: iso });
}
