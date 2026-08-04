import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const bindings = await prisma.wechatBinding.findMany({
    include: { project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const lastSeen = await prisma.systemConfig.findUnique({ where: { key: "wechatBotLastSeen" } });
  return apiOk({ bindings, botLastSeen: lastSeen?.value ?? null });
}

const CreateBody = z.object({
  convId: z.string().min(1),
  convName: z.string().optional(),
  projectId: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  captureMode: z.enum(["ALL", "MENTION", "HASHTAG"]).default("ALL"),
});

export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const d = parsed.data;

  const existing = await prisma.wechatBinding.findUnique({ where: { convId: d.convId } });
  if (existing) return apiError("conflict", "convId already bound");

  const b = await prisma.wechatBinding.create({
    data: {
      convId: d.convId,
      convName: d.convName,
      projectId: d.projectId ?? null,
      customerName: d.customerName ?? null,
      captureMode: d.captureMode,
      paused: false,
    },
  });
  return apiOk({ id: b.id }, 201);
}
