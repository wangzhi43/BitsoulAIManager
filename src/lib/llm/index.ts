import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import { logger } from "../logger";
import type { ExpertRole } from "@prisma/client";
import { estimateLlmCost, getLlmPrices } from "../runtime-config";

// 多供应商 LLM 抽象层（TECH_DESIGN §6）。
// 业务代码一律经由 completeForRole()，禁止直连 SDK。

export type ChatContent =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; base64: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: ChatContent[];
}

export interface CompleteRequest {
  system: string;
  messages: ChatMessage[];
  /** 传入 JSON Schema 则要求结构化输出并解析 */
  schema?: Record<string, unknown>;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  parsed?: unknown;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmClient {
  complete(req: CompleteRequest): Promise<CompleteResult>;
}

// ---------- Anthropic ----------

class AnthropicClient implements LlmClient {
  constructor(
    private apiKey: string,
    private model: string,
    private effort?: string,
    private baseUrl?: string,
  ) {}

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const client = new Anthropic({
      apiKey: this.apiKey,
      ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
    });
    const messages = req.messages.map((m) => ({
      role: m.role,
      content: m.content.map((c) =>
        c.type === "text"
          ? ({ type: "text", text: c.text } as const)
          : ({
              type: "image",
              source: {
                type: "base64",
                media_type: c.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                data: c.base64,
              },
            } as const),
      ),
    }));

    const params: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages,
      ...(this.effort ? { output_config: { effort: this.effort as "low" | "medium" | "high" } } : {}),
      ...(req.schema
        ? { output_config: { format: { type: "json_schema" as const, schema: req.schema }, ...(this.effort ? { effort: this.effort as "low" | "medium" | "high" } : {}) } }
        : {}),
    };

    const stream = client.messages.stream(params);
    const msg = await stream.finalMessage();
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let parsed: unknown;
    if (req.schema) {
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        logger.warn({ err: String(e) }, "anthropic structured output parse failed");
      }
    }
    return {
      text,
      parsed,
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    };
  }
}

// ---------- OpenAI 兼容（DeepSeek / Qwen / 自定义） ----------

class OpenAICompatClient implements LlmClient {
  constructor(
    private apiKey: string,
    private model: string,
    private baseUrl: string,
  ) {}

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    // DeepSeek 等 json_object 模式要求提示词包含 "json" 字样与目标结构示例,
    // 且不支持 json_schema —— 把 schema 附进 system 提示保证结构化输出可用
    const system = req.schema
      ? `${req.system}\n\n输出要求：仅输出一个合法的 json 对象，不要输出任何其他文字或代码块标记。json 必须严格符合以下 JSON Schema：\n${JSON.stringify(req.schema)}`
      : req.system;
    const body = {
      model: this.model,
      max_tokens: req.maxTokens ?? 8000,
      messages: [
        { role: "system", content: system },
        ...req.messages.map((m) => ({
          role: m.role,
          content: m.content
            .map((c) => (c.type === "text" ? c.text : "[image omitted: provider lacks vision support]"))
            .join("\n"),
        })),
      ],
      ...(req.schema ? { response_format: { type: "json_object" } } : {}),
    };
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`LLM provider error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    if (req.schema) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }
    return {
      text,
      parsed,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}

// ---------- 角色 → 客户端解析 + 用量记录 ----------

export async function completeForRole(
  role: ExpertRole,
  req: CompleteRequest,
  attribution?: { projectId?: string; requirementId?: string },
): Promise<CompleteResult> {
  const cfg = await prisma.agentRoleModelConfig.findUnique({ where: { role } });
  if (!cfg) throw new Error(`No model configured for expert role ${role} — configure it in /settings`);
  const provider = await prisma.llmProvider.findUnique({ where: { id: cfg.providerId } });
  if (!provider || !provider.enabled) {
    throw new Error(`LLM provider for role ${role} missing or disabled`);
  }
  const apiKey = decryptSecret(provider.apiKeyEnc);

  const client: LlmClient =
    provider.kind === "ANTHROPIC_SDK"
      ? new AnthropicClient(apiKey, cfg.model, cfg.effort ?? undefined, provider.baseUrl ?? undefined)
      : new OpenAICompatClient(apiKey, cfg.model, provider.baseUrl ?? "");

  const result = await client.complete(req);

  // 成本按写入时的单价表估算（ADR-003）；单价表为空则 null，看板会按当前单价补算
  const costEstimate = estimateLlmCost(await getLlmPrices().catch(() => null), cfg.model, result.usage.inputTokens, result.usage.outputTokens);
  await prisma.llmUsageLog.create({
    data: {
      providerName: provider.name,
      model: cfg.model,
      expertRole: role,
      projectId: attribution?.projectId,
      requirementId: attribution?.requirementId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costEstimate,
    },
  });

  return result;
}
