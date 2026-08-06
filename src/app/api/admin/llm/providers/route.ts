import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { audit } from "@/lib/audit";

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
  // 便捷接入:尚未配置模型的专家角色自动指向新供应商的首个模型(可在设置页随时改)
  const roles = ["PRODUCT", "PM", "TEST"] as const;
  const existingConfigs = await prisma.agentRoleModelConfig.findMany({ select: { role: true } });
  const configured = new Set(existingConfigs.map((c) => c.role));
  const autoFilled: string[] = [];
  for (const role of roles) {
    if (!configured.has(role)) {
      await prisma.agentRoleModelConfig.create({ data: { role, providerId: p.id, model: d.models[0] } });
      autoFilled.push(role);
    }
  }

  const adminUser = await currentAdmin();
  await audit(`admin:${adminUser?.id}`, "create-llm-provider", d.name, d.kind);
  if (autoFilled.length > 0) {
    await audit(`admin:${adminUser?.id}`, "auto-config-expert-roles", autoFilled.join(","), `${d.name}/${d.models[0]}`);
  }
  return apiOk({ id: p.id, autoConfiguredRoles: autoFilled }, 201);
}
