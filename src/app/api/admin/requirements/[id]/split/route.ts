import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 拆分需求单（PRD #14「拆开」）：仅待确认状态可拆。
// 原单保留 seq 并改写为第一部分；其余部分新建为同来源、同项目的待确认单，澄清问题原样复制。

const Part = z.object({
  title: z.string().min(1).max(200),
  userStory: z.string().min(1),
  acceptance: z.array(z.string().min(1)).min(1),
  complexity: z.enum(["S", "M", "L"]).optional(),
  moduleGuess: z.string().nullable().optional(),
});
const Body = z.object({ parts: z.array(Part).min(2).max(20) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.issues[0]?.message ?? "invalid body");
  const { parts } = parsed.data;

  const original = await prisma.requirement.findUnique({ where: { id } });
  if (!original) return apiError("not_found", "requirement not found");
  if (original.status !== "PENDING_CONFIRM") {
    return apiError("conflict", `requirement is ${original.status}, not PENDING_CONFIRM`);
  }

  const actor = `admin:${admin.id}`;
  const [first, ...rest] = parts;

  const result = await prisma.$transaction(async (tx) => {
    await tx.requirement.update({
      where: { id },
      data: {
        title: first.title,
        userStory: first.userStory,
        acceptance: first.acceptance,
        complexity: first.complexity ?? original.complexity,
        moduleGuess: first.moduleGuess === undefined ? original.moduleGuess : first.moduleGuess,
      },
    });

    const created: { id: string; seq: number }[] = [];
    for (const p of rest) {
      const r = await tx.requirement.create({
        data: {
          projectId: original.projectId,
          sourceId: original.sourceId,
          title: p.title,
          userStory: p.userStory,
          acceptance: p.acceptance,
          complexity: p.complexity ?? original.complexity,
          moduleGuess: p.moduleGuess === undefined ? original.moduleGuess : p.moduleGuess,
          status: "PENDING_CONFIRM",
          clarifications: original.clarifications ?? undefined,
        },
        select: { id: true, seq: true },
      });
      created.push(r);
      await tx.reqEvent.create({
        data: {
          requirementId: r.id,
          fromStatus: null,
          toStatus: "PENDING_CONFIRM",
          actor,
          note: `由 REQ-${original.seq} 拆分`,
        },
      });
    }

    const all = [{ id: original.id, seq: original.seq }, ...created];
    await tx.reqEvent.create({
      data: {
        requirementId: id,
        fromStatus: "PENDING_CONFIRM",
        toStatus: "PENDING_CONFIRM",
        actor,
        note: `拆分为 ${all.length} 单：${all.map((r) => `REQ-${r.seq}`).join(", ")}`,
      },
    });
    return all;
  });

  await audit(actor, "split-requirement", `REQ-${original.seq}`, result.map((r) => `REQ-${r.seq}`).join(","));
  return apiOk({ ids: result.map((r) => r.id), seqs: result.map((r) => r.seq) });
}
