import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "./db";
import { config } from "./config";
import { sha256 } from "./crypto";

const ADMIN_COOKIE = "bsam_session";

function jwtKey() {
  return new TextEncoder().encode(config.jwtSecret);
}

// ---------- 管理员（JWT in httpOnly cookie） ----------

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function createAdminSession(adminId: string): Promise<void> {
  const token = await new SignJWT({ sub: adminId, typ: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${config.adminJwtHours}h`)
    .sign(jwtKey());
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: config.adminJwtHours * 3600,
    path: "/",
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

/** 返回当前登录管理员，未登录返回 null */
export async function currentAdmin() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtKey());
    if (payload.typ !== "admin" || !payload.sub) return null;
    const admin = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
    return admin?.enabled ? admin : null;
  } catch {
    return null;
  }
}

// ---------- Agent（Bearer token） ----------

export async function issueAgentToken(agentId: string): Promise<string> {
  const { newToken } = await import("./crypto");
  const token = newToken();
  await prisma.agentToken.create({
    data: {
      agentId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + config.agentTokenDays * 86400_000),
    },
  });
  return token;
}

/** 校验 Agent 请求的 Bearer token，返回 AgentAccount 或 null */
export async function authenticateAgent(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const record = await prisma.agentToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { agent: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
  if (!record.agent.enabled) return null;
  await prisma.agentAccount.update({
    where: { id: record.agentId },
    data: { lastSeenAt: new Date() },
  });
  return record.agent;
}
