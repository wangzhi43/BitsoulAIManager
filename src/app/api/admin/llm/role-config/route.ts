import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 专家角色 ↔ 供应商/模型 映射（PRODUCT / PM / TEST）

export async function GET() {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const configs = await prisma.agentRoleModelConfig.findMany();
  return apiOk({ configs });
}

const PutBody = z.object({
  role: z.enum(["PRODUCT", "PM", "TEST"]),
  providerId: z.string().min(1),
  model: z.string().min(1),
  effort: z.enum(["low", "medium", "high", "xhigh"]).nullable().optional(),
});

export async function PUT(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const d = parsed.data;

  const provider = await prisma.llmProvider.findUnique({ where: { id: d.providerId } });
  if (!provider) return apiError("not_found", "provider not found");
  if (!(provider.models as string[]).includes(d.model)) {
    return apiError("bad_request", `model ${d.model} not in provider's model list`);
  }

  await prisma.agentRoleModelConfig.upsert({
    where: { role: d.role },
    update: { providerId: d.providerId, model: d.model, effort: d.effort ?? null },
    create: { role: d.role, providerId: d.providerId, model: d.model, effort: d.effort ?? null },
  });
  return apiOk({ ok: true });
}
