import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// SSE（TECH_DESIGN §4.4）：每 4 秒用一条 SQL 取各表最新变更时间拼指纹，变化即推 change 事件；
// 前端收到后再拉数据，避免 30 秒盲轮询。每 20 秒发注释行保活；请求中断即停。

const TICK_MS = 4_000;
const PING_MS = 20_000;

interface FingerprintRow {
  req_event: Date | null;
  audit: Date | null;
  dev_task: Date | null;
  test_task: Date | null;
  requirement: Date | null;
  inbox_pending: bigint | number;
  build: Date | null;
  build_count: bigint | number;
}

async function fingerprint(): Promise<string> {
  const rows = await prisma.$queryRaw<FingerprintRow[]>(Prisma.sql`
    SELECT
      (SELECT MAX("createdAt") FROM "ReqEvent") AS req_event,
      (SELECT MAX("createdAt") FROM "AuditLog") AS audit,
      (SELECT MAX("updatedAt") FROM "DevTask") AS dev_task,
      (SELECT MAX("updatedAt") FROM "TestTask") AS test_task,
      (SELECT MAX("updatedAt") FROM "Requirement") AS requirement,
      (SELECT COUNT(*) FROM "InboxMessage" WHERE "threadedAt" IS NULL) AS inbox_pending,
      (SELECT MAX(COALESCE("finishedAt", "startedAt", "createdAt")) FROM "BuildRun") AS build,
      (SELECT COUNT(*) FROM "BuildRun") AS build_count
  `);
  const r = rows[0];
  if (!r) return "";
  const t = (d: Date | null) => (d ? d.getTime() : 0);
  return [t(r.req_event), t(r.audit), t(r.dev_task), t(r.test_task), t(r.requirement), String(r.inbox_pending), t(r.build), String(r.build_count)].join("|");
}

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");

  const encoder = new TextEncoder();
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const stop = () => {
        if (closed) return;
        closed = true;
        if (tickTimer) clearInterval(tickTimer);
        if (pingTimer) clearInterval(pingTimer);
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      };
      req.signal.addEventListener("abort", stop);

      let last = "";
      try {
        last = await fingerprint();
      } catch (e) {
        logger.warn({ err: String(e) }, "sse initial fingerprint failed");
      }
      send(`: connected\nretry: 5000\n\n`);

      let busy = false;
      tickTimer = setInterval(async () => {
        if (busy || closed) return;
        busy = true;
        try {
          const fp = await fingerprint();
          if (fp !== last) {
            last = fp;
            send(`event: change\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
          }
        } catch (e) {
          logger.warn({ err: String(e) }, "sse fingerprint failed");
        } finally {
          busy = false;
        }
      }, TICK_MS);
      pingTimer = setInterval(() => send(": ping\n\n"), PING_MS);
    },
    cancel() {
      closed = true;
      if (tickTimer) clearInterval(tickTimer);
      if (pingTimer) clearInterval(pingTimer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
