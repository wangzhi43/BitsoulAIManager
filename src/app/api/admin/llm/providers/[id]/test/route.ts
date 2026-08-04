import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 连通性测试：发一条最小请求验证 key 与 baseUrl 可用

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const { id } = await ctx.params;
  const provider = await prisma.llmProvider.findUnique({ where: { id } });
  if (!provider) return apiError("not_found", "provider not found");

  const apiKey = decryptSecret(provider.apiKeyEnc);
  const model = (provider.models as string[])[0];
  const started = Date.now();

  try {
    if (provider.kind === "ANTHROPIC_SDK") {
      const client = new Anthropic({
        apiKey,
        ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
        maxRetries: 0,
        timeout: 30_000,
      });
      await client.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      });
    } else {
      const res = await fetch(`${(provider.baseUrl ?? "").replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return apiOk({ ok: true, model, latencyMs: Date.now() - started });
  } catch (e) {
    return apiOk({ ok: false, model, error: String(e).slice(0, 300) });
  }
}
