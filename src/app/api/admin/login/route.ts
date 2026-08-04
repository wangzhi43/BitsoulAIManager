import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { createAdminSession, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({ username: z.string().min(1), password: z.string().min(1) });

// 登录限流：单进程内存计数（部署为单实例，见 TECH_DESIGN §10）
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function limited(key: string): boolean {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || cur.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", "username/password required");
  const { username, password } = parsed.data;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(`${username}|${ip}`)) return apiError("too_many_attempts", "try again later");

  const admin = await prisma.adminUser.findUnique({ where: { username } });
  if (!admin || !admin.enabled || !(await verifyPassword(password, admin.passwordHash))) {
    return apiError("unauthorized", "invalid credentials");
  }

  await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await createAdminSession(admin.id);
  return apiOk({ id: admin.id, username: admin.username, displayName: admin.displayName });
}
