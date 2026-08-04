import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { issueAgentToken, verifyPassword } from "@/lib/auth";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const Body = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", "username/password required");

  const agent = await prisma.agentAccount.findUnique({
    where: { username: parsed.data.username },
  });
  if (!agent || !agent.enabled || !(await verifyPassword(parsed.data.password, agent.passwordHash))) {
    return apiError("unauthorized", "invalid credentials");
  }

  const token = await issueAgentToken(agent.id);
  return apiOk({
    token,
    expiresInDays: config.agentTokenDays,
    agent: { id: agent.id, username: agent.username, role: agent.role, projectIds: agent.projectIds },
  });
}
