import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin, hashPassword } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const agents = await prisma.agentAccount.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      projectIds: true,
      enabled: true,
      lastSeenAt: true,
      gitTokenEnc: true,
      _count: { select: { devTasks: true, testTasks: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return apiOk({ agents: agents.map(({ gitTokenEnc, ...a }) => ({ ...a, hasGitToken: !!gitTokenEnc })) });
}

const CreateBody = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/),
  password: z.string().min(8),
  role: z.enum(["DEVELOPER", "TESTER", "BOTH"]),
  projectIds: z.array(z.string()).min(1),
  /** 该 Agent 自己的 GitHub PAT（可选，ADR-003） */
  gitToken: z.string().min(20).max(200).optional(),
});

export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const d = parsed.data;

  const exists = await prisma.agentAccount.findUnique({ where: { username: d.username } });
  if (exists) return apiError("conflict", "username taken");

  const projects = await prisma.project.findMany({ where: { id: { in: d.projectIds } } });
  if (projects.length !== d.projectIds.length) return apiError("bad_request", "some projects not found");

  const agent = await prisma.agentAccount.create({
    data: {
      username: d.username,
      passwordHash: await hashPassword(d.password),
      role: d.role,
      projectIds: d.projectIds,
      gitTokenEnc: d.gitToken ? encryptSecret(d.gitToken) : null,
    },
  });
  const adminUser = await currentAdmin();
  await audit(`admin:${adminUser?.id}`, "create-agent", `agent:${d.username}`, d.role);
  return apiOk({ id: agent.id }, 201);
}
