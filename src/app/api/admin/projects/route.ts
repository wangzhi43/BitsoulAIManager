import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "asc" } });
  return apiOk({ projects });
}
