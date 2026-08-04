import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 合并多个待确认需求单为一单：目标单保留，其余关闭并把内容并入目标单

const Body = z.object({
  intoId: z.string().min(1),
  fromIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const { intoId, fromIds } = parsed.data;
  if (fromIds.includes(intoId)) return apiError("bad_request", "intoId cannot be in fromIds");

  const all = await prisma.requirement.findMany({ where: { id: { in: [intoId, ...fromIds] } } });
  const target = all.find((r) => r.id === intoId);
  const sources = all.filter((r) => fromIds.includes(r.id));
  if (!target || sources.length !== fromIds.length) return apiError("not_found", "some requirements not found");
  if (all.some((r) => r.status !== "PENDING_CONFIRM")) {
    return apiError("conflict", "all requirements must be PENDING_CONFIRM");
  }

  const mergedAcceptance = [
    ...(target.acceptance as string[]),
    ...sources.flatMap((s) => s.acceptance as string[]),
  ];
  const mergedStory = [target.userStory, ...sources.map((s) => `（并入 REQ-${s.seq}）${s.userStory}`)].join("\n\n");

  await prisma.$transaction([
    prisma.requirement.update({
      where: { id: intoId },
      data: { userStory: mergedStory, acceptance: mergedAcceptance },
    }),
    ...sources.map((s) =>
      prisma.requirement.update({ where: { id: s.id }, data: { status: "CLOSED" } }),
    ),
    ...sources.map((s) =>
      prisma.reqEvent.create({
        data: {
          requirementId: s.id,
          fromStatus: "PENDING_CONFIRM",
          toStatus: "CLOSED",
          actor: `admin:${admin.id}`,
          note: `并入 REQ-${target.seq}`,
        },
      }),
    ),
    prisma.reqEvent.create({
      data: {
        requirementId: intoId,
        fromStatus: "PENDING_CONFIRM",
        toStatus: "PENDING_CONFIRM",
        actor: `admin:${admin.id}`,
        note: `合并了 ${sources.map((s) => `REQ-${s.seq}`).join(", ")}`,
      },
    }),
  ]);
  return apiOk({ ok: true });
}
