import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  enabled: z.boolean().optional(),
  apiKey: z.string().min(8).optional(),
  baseUrl: z.string().url().nullable().optional(),
  models: z.array(z.string().min(1)).min(1).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const d = parsed.data;

  const provider = await prisma.llmProvider.findUnique({ where: { id } });
  if (!provider) return apiError("not_found", "provider not found");

  await prisma.llmProvider.update({
    where: { id },
    data: {
      ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
      ...(d.apiKey ? { apiKeyEnc: encryptSecret(d.apiKey) } : {}),
      ...(d.baseUrl !== undefined ? { baseUrl: d.baseUrl } : {}),
      ...(d.models ? { models: d.models } : {}),
    },
  });
  return apiOk({ ok: true });
}
