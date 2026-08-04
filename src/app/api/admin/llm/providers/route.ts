import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

function maskKey(len = 4) {
  return `****${"·".repeat(0)}`.slice(0, 4); // 列表不回传密钥，仅表示已配置
}

export async function GET() {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const providers = await prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } });
  return apiOk({
    providers: providers.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      models: p.models,
      enabled: p.enabled,
      apiKey: maskKey(),
    })),
  });
}

const CreateBody = z.object({
  name: z.string().min(1),
  kind: z.enum(["ANTHROPIC_SDK", "OPENAI_COMPAT"]),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(8),
  models: z.array(z.string().min(1)).min(1),
});

export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const d = parsed.data;
  if (d.kind === "OPENAI_COMPAT" && !d.baseUrl) {
    return apiError("bad_request", "baseUrl required for OPENAI_COMPAT provider");
  }
  const existing = await prisma.llmProvider.findUnique({ where: { name: d.name } });
  if (existing) return apiError("conflict", `provider ${d.name} already exists`);

  const p = await prisma.llmProvider.create({
    data: {
      name: d.name,
      kind: d.kind,
      baseUrl: d.baseUrl,
      apiKeyEnc: encryptSecret(d.apiKey),
      models: d.models,
    },
  });
  return apiOk({ id: p.id }, 201);
}
