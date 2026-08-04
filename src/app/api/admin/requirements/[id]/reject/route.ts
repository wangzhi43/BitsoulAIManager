import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { getQueues } from "@/lib/queue";

export const dynamic = "force-dynamic";

// 驳回：reparse=true 时整个线索重拆（同线索所有待确认单作废重建），否则仅关闭本单

const Body = z.object({
  reason: z.string().min(1),
  reparse: z.boolean().default(false),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const { reason, reparse } = parsed.data;

  const requirement = await prisma.requirement.findUnique({
    where: { id },
    include: { source: true },
  });
  if (!requirement) return apiError("not_found", "requirement not found");
  if (requirement.status !== "PENDING_CONFIRM") {
    return apiError("conflict", `requirement is ${requirement.status}, not PENDING_CONFIRM`);
  }

  await prisma.$transaction([
    prisma.requirement.update({ where: { id }, data: { status: "CLOSED" } }),
    prisma.reqEvent.create({
      data: {
        requirementId: id,
        fromStatus: "PENDING_CONFIRM",
        toStatus: "CLOSED",
        actor: `admin:${admin.id}`,
        note: `驳回：${reason}`,
      },
    }),
  ]);

  if (reparse) {
    await getQueues().llm.add(
      "parse-thread",
      { kind: "parse-thread", threadId: requirement.source.threadId, rejectReason: reason },
      { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
    );
  }
  return apiOk({ ok: true, reparsing: reparse });
}
