import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiOk } from "@/lib/api";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    // db unreachable
  }
  // 结构化访问日志（REQ-1）：时间戳由 logger 输出，另附来源 IP/状态/耗时
  logger.info(
    {
      route: "/api/health",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown",
      status: db ? "ok" : "db",
      durationMs: Date.now() - startedAt,
    },
    "health check accessed",
  );
  return apiOk({ ok: db, db, ts: new Date().toISOString() }, db ? 200 : 503);
}
