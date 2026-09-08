// BitSoul PM Bridge — OpenClaw 插件
// 职责（TECH_DESIGN §7）：
//  1. 监听微信 channel（openclaw-weixin）入站消息，HMAC 签名后转发到平台 ingest API（至少一次，带磁盘补发队列）
//  2. 轮询平台 outbox，把平台侧待发消息经本机 Gateway 的 message 工具发回微信会话
//  3. 每分钟心跳
//
// 配置文件 ~/.openclaw/bitsoul-pm-bridge.json：
//   { "platformUrl": "https://pm.bitsouls.cn", "hmacSecret": "<INGEST_HMAC_SECRET>",
//     "gatewayUrl": "http://127.0.0.1:18789", "gatewayToken": "<gateway token>" }
//
// 加载方式见 bridge/openclaw-plugin-bitsoul-pm/README.md

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

interface BridgeConfig {
  platformUrl: string;
  hmacSecret: string;
  gatewayUrl: string;
  gatewayToken: string;
  channelId: string;
}

interface OutMessage {
  msgId: string;
  convId: string;
  convName?: string;
  sender?: string;
  msgType: "text" | "image" | "file";
  text?: string;
  attachmentId?: string;
  ts: number;
}

const CONFIG_PATH = path.join(homedir(), ".openclaw", "bitsoul-pm-bridge.json");
const BACKLOG_PATH = path.join(homedir(), ".openclaw", "bitsoul-pm-bridge.backlog.jsonl");

function loadConfig(): BridgeConfig | null {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (!raw.platformUrl || !raw.hmacSecret) return null;
    return {
      platformUrl: String(raw.platformUrl).replace(/\/$/, ""),
      hmacSecret: String(raw.hmacSecret),
      gatewayUrl: String(raw.gatewayUrl ?? "http://127.0.0.1:18789").replace(/\/$/, ""),
      gatewayToken: String(raw.gatewayToken ?? ""),
      channelId: String(raw.channelId ?? "openclaw-weixin"),
    };
  } catch {
    return null;
  }
}

function sign(secret: string, payload: string): { ts: string; sig: string } {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  return { ts, sig };
}

async function postJson(cfg: BridgeConfig, apiPath: string, body: unknown): Promise<boolean> {
  const raw = JSON.stringify(body);
  const { ts, sig } = sign(cfg.hmacSecret, raw);
  try {
    const res = await fetch(`${cfg.platformUrl}${apiPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-timestamp": ts,
        "x-ingest-signature": sig,
      },
      body: raw,
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function uploadMedia(cfg: BridgeConfig, filePath: string, mime: string): Promise<string | null> {
  try {
    const data = readFileSync(filePath);
    const bodyHash = createHash("sha256").update(data).digest("hex");
    const { ts, sig } = sign(cfg.hmacSecret, bodyHash);
    const res = await fetch(`${cfg.platformUrl}/api/ingest/wechat/media`, {
      method: "POST",
      headers: {
        "content-type": mime,
        "x-filename": encodeURIComponent(path.basename(filePath)),
        "x-ingest-timestamp": ts,
        "x-ingest-signature": sig,
      },
      body: new Uint8Array(data),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { attachmentId?: string };
    return json.attachmentId ?? null;
  } catch {
    return null;
  }
}

function appendBacklog(msg: OutMessage): void {
  try {
    mkdirSync(path.dirname(BACKLOG_PATH), { recursive: true });
    const prev = existsSync(BACKLOG_PATH) ? readFileSync(BACKLOG_PATH, "utf8") : "";
    writeFileSync(BACKLOG_PATH, prev + JSON.stringify(msg) + "\n");
  } catch {
    // 落盘失败只能丢弃（平台 msgId 幂等，重复无害）
  }
}

async function flushBacklog(cfg: BridgeConfig): Promise<void> {
  if (!existsSync(BACKLOG_PATH)) return;
  const lines = readFileSync(BACKLOG_PATH, "utf8").split("\n").filter(Boolean);
  if (lines.length === 0) return;
  const remaining: string[] = [];
  for (const line of lines) {
    let ok = false;
    try {
      ok = await postJson(cfg, "/api/ingest/wechat/message", JSON.parse(line));
    } catch {
      ok = false;
    }
    if (!ok) remaining.push(line);
  }
  writeFileSync(BACKLOG_PATH, remaining.length ? remaining.join("\n") + "\n" : "");
}

function guessMime(p: string): string {
  const ext = path.extname(p).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".md": "text/markdown",
  };
  return map[ext] ?? "application/octet-stream";
}

/** 从入站事件 metadata 里尽力找出媒体本地路径（openclaw-weixin 注入 MediaPath） */
function extractMediaPaths(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return [];
  const found: string[] = [];
  const scan = (v: unknown): void => {
    if (typeof v === "string") {
      if (/[\\/]/.test(v) && /\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|txt|md|mp4|amr|silk|wav)$/i.test(v) && existsSync(v)) {
        found.push(v);
      }
    } else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === "object") Object.values(v).forEach(scan);
  };
  scan(metadata);
  return [...new Set(found)].slice(0, 5);
}

async function sendViaGateway(cfg: BridgeConfig, convId: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.gatewayUrl}/tools/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cfg.gatewayToken ? { authorization: `Bearer ${cfg.gatewayToken}` } : {}),
      },
      body: JSON.stringify({
        tool: "message",
        args: { action: "send", channel: cfg.channelId, target: convId, message },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default definePluginEntry({
  id: "bitsoul-pm-bridge",
  name: "BitSoul PM Bridge",
  register(api: {
    on: (
      name: string,
      handler: (event: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<void> | void,
      opts?: { priority?: number; timeoutMs?: number },
    ) => void;
  }) {
    const cfg = loadConfig();
    if (!cfg) {
      console.error(`[bitsoul-pm-bridge] config missing or invalid: ${CONFIG_PATH} — bridge disabled`);
      return;
    }
    console.log(`[bitsoul-pm-bridge] active → ${cfg.platformUrl} (channel ${cfg.channelId})`);

    // ---- 入站：微信消息 → 平台 ----
    api.on(
      "message_received",
      async (event, ctx) => {
        if (ctx.channelId !== cfg.channelId) return;
        const convId = String(ctx.conversationId ?? event.from ?? "");
        if (!convId) return;

        const base = {
          convId,
          sender: String(event.senderId ?? event.from ?? ""),
          ts: Math.floor(Number(event.timestamp ?? Date.now()) / (Number(event.timestamp) > 1e12 ? 1000 : 1)),
        };

        const messages: OutMessage[] = [];
        const text = typeof event.content === "string" ? event.content.trim() : "";
        const msgId = String(event.messageId ?? randomUUID());
        if (text) {
          messages.push({ ...base, msgId, msgType: "text", text });
        }
        for (const mediaPath of extractMediaPaths(event.metadata as Record<string, unknown> | undefined)) {
          const attachmentId = await uploadMedia(cfg, mediaPath, guessMime(mediaPath));
          if (attachmentId) {
            messages.push({
              ...base,
              msgId: `${msgId}-m-${path.basename(mediaPath).slice(0, 24)}`,
              msgType: guessMime(mediaPath).startsWith("image/") ? "image" : "file",
              attachmentId,
            });
          }
        }

        for (const m of messages) {
          const ok = await postJson(cfg, "/api/ingest/wechat/message", m);
          if (!ok) appendBacklog(m);
        }
      },
      { priority: 10, timeoutMs: 90_000 },
    );

    // ---- 反向：outbox 轮询回发 + 心跳 + 补发 ----
    const tick = async (): Promise<void> => {
      await flushBacklog(cfg);
      await postJson(cfg, "/api/ingest/wechat/heartbeat", { ts: Date.now() });

      try {
        const { ts, sig } = sign(cfg.hmacSecret, "outbox");
        const res = await fetch(`${cfg.platformUrl}/api/ingest/wechat/outbox`, {
          headers: { "x-ingest-timestamp": ts, "x-ingest-signature": sig },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return;
        const { items } = (await res.json()) as { items: { id: string; convId: string; content: string }[] };
        // 成功与失败都回执：平台按失败次数决定是否继续下发（ADR-003）
        const results: { id: string; ok: boolean; error?: string }[] = [];
        for (const item of items ?? []) {
          const ok = await sendViaGateway(cfg, item.convId, item.content);
          results.push(ok ? { id: item.id, ok: true } : { id: item.id, ok: false, error: "gateway send failed (no context token or gateway error)" });
        }
        if (results.length) await postJson(cfg, "/api/ingest/wechat/outbox/ack", { results });
      } catch {
        // 下轮重试
      }
    };
    const timer = setInterval(() => void tick(), 60_000);
    // 允许进程正常退出
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    void tick();
  },
});
