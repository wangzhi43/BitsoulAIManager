import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { authenticateAgent } from "@/lib/auth";
import { getQueues } from "@/lib/queue";

export const dynamic = "force-dynamic";

// 开发提交：CLAIMED → SUBMITTED，触发 feature → daily 合并（worker），
// 合并成功后需求进入 PENDING_TEST 并生成测试任务

const Body = z.object({
  note: z.string().min(1),
  selfTest: z.string().min(1),
  commits: z.array(z.string().min(7)).min(1),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgent(req);
  if (!agent) return apiError("unauthorized", "invalid token");
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);

  const task = await prisma.devTask.findUnique({ where: { id }, include: { requirement: true } });
  if (!task) return apiError("not_found", "task not found");
  if (task.claimedById !== agent.id) return apiError("forbidden", "task not claimed by you");
  if (task.status !== "CLAIMED") return apiError("conflict", `task is ${task.status}`);

  await prisma.$transaction([
    prisma.devTask.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        submitNote: parsed.data.note,
        selfTest: parsed.data.selfTest,
        commits: parsed.data.commits,
      },
    }),
    prisma.reqEvent.create({
      data: {
        requirementId: task.requirementId,
        fromStatus: "DEVELOPING",
        toStatus: "DEVELOPING",
        actor: `agent:${agent.username}`,
        note: `开发提交：${parsed.data.note.slice(0, 100)}`,
      },
    }),
  ]);

  await getQueues().git.add(
    "merge-feature-to-daily",
    { kind: "merge-feature-to-daily", requirementId: task.requirementId },
    { attempts: 2, backoff: { type: "exponential", delay: 20_000 } },
  );

  return apiOk({ ok: true, next: "平台正在合并到当日分支并生成测试任务" });
}
