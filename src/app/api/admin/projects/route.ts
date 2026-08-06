import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "asc" } });
  return apiOk({ projects });
}

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  repoUrl: z.string().min(1),
  mainBranch: z.string().min(1).default("main"),
  description: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const d = parsed.data;

  const existing = await prisma.project.findUnique({ where: { name: d.name } });
  if (existing) return apiError("conflict", `project ${d.name} already exists`);

  const p = await prisma.project.create({
    data: { name: d.name, repoUrl: d.repoUrl, mainBranch: d.mainBranch, description: d.description },
  });
  await audit(`admin:${admin.id}`, "create-project", d.name, d.repoUrl);
  return apiOk({ id: p.id }, 201);
}
