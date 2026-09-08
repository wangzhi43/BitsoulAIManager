import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { getQueues } from "@/lib/queue";
import { getRuntimeString } from "@/lib/runtime-config";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Web 表单入口（PRD #10）：公开页面 /submit?token= 提交需求 → WEB_FORM 线索 → 产品专家拆解。
// 令牌来自 SystemConfig.webFormToken（空 = 入口关闭）。单 IP 每分钟 10 次限流（单实例内存计数）。

const Body = z.object({
  token: z.string().min(1).max(64),
  project: z.string().max(80).optional(),
  customerName: z.string().max(60).optional(),
  contact: z.string().max(120).optional(),
  text: z.string().min(10, "需求描述至少 10 个字").max(5000, "需求描述不超过 5000 字"),
});

const hits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 60_000;

function limited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  const cur = hits.get(ip);
  if (!cur || cur.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > LIMIT;
}

async function tokenOk(token: string | null): Promise<boolean> {
  const expected = await getRuntimeString("webFormToken");
  return !!expected && !!token && token === expected;
}

/** 页面初始化：令牌是否有效 + 可选项目名列表 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await tokenOk(token))) return apiOk({ ok: false, projects: [] });
  const projects = await prisma.project.findMany({
    where: { active: true },
    select: { name: true },
    orderBy: { createdAt: "asc" },
  });
  return apiOk({ ok: true, projects: projects.map((p) => p.name) });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return apiError("too_many_attempts", "提交过于频繁，请稍后再试");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.issues[0]?.message ?? "invalid body");
  const d = parsed.data;
  if (!(await tokenOk(d.token))) return apiError("forbidden", "入口未开放或令牌无效");

  const customerName = d.customerName?.trim() || undefined;
  const contact = d.contact?.trim();
  const projectName = d.project?.trim();
  const project = projectName
    ? await prisma.project.findFirst({ where: { name: projectName, active: true }, select: { name: true } })
    : null;

  const threadId = `web-${randomUUID()}`;
  const now = new Date().toISOString();
  const text = `${project ? `【项目：${project.name}】` : ""}${contact ? `联系方式：${contact}\n` : ""}${d.text.trim()}`;

  await prisma.requirementSource.create({
    data: {
      channel: "WEB_FORM",
      senderName: customerName,
      customerName,
      threadId,
      rawMessages: [{ msgId: threadId, type: "text", text, ts: now }],
    },
  });
  await getQueues().llm.add(
    "parse-thread",
    { kind: "parse-thread", threadId },
    { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
  );
  logger.info({ threadId, ip, project: project?.name ?? null }, "web form submission queued");
  return apiOk({ ok: true, threadId });
}
