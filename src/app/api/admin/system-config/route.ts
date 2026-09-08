import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  RUNTIME_KEYS,
  CRON_KEYS,
  STRING_KEYS,
  getRuntimeConfigSnapshot,
  invalidateRuntimeConfig,
} from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

// 系统参数（PRD #39）：可编辑键全部来自 runtime-config 登记表；空值删除行（回落 env/默认值）。
// 只读状态键（usageAlert / wechatBotLastSeen / wechatBotAlert）随 GET 一并返回，供设置页与工作台展示。

const NUMBER_KEYS = Object.keys(RUNTIME_KEYS);
const CRON_KEY_LIST = Object.keys(CRON_KEYS);
const STRING_KEY_LIST = Object.keys(STRING_KEYS);
const EDITABLE_KEYS = [...NUMBER_KEYS, ...CRON_KEY_LIST, ...STRING_KEY_LIST];
const READONLY_KEYS = ["usageAlert", "wechatBotLastSeen", "wechatBotAlert"] as const;

/** 返回错误文案；null 表示合法 */
function validateValue(key: string, value: string): string | null {
  if (value === "") return null; // 空 = 删除覆盖
  if (NUMBER_KEYS.includes(key)) {
    return /^\d{1,12}$/.test(value) ? null : "需为非负整数（留空表示使用默认值）";
  }
  if (CRON_KEY_LIST.includes(key)) {
    const fields = value.trim().split(/\s+/);
    if (fields.length !== 5) return "cron 表达式需为 5 段（分 时 日 月 周）";
    return fields.every((f) => /^[\d*\/,\-]+$/.test(f)) ? null : "cron 字段只能包含数字、* / , -";
  }
  switch (key) {
    case "wechatBotName":
      return value.length <= 40 ? null : "机器人昵称不超过 40 字";
    case "webFormToken":
      return /^[A-Za-z0-9_-]{0,64}$/.test(value) ? null : "令牌只能包含字母、数字、_ -，且不超过 64 位";
    case "llmPrices": {
      let obj: unknown;
      try {
        obj = JSON.parse(value);
      } catch {
        return "单价表需为合法 JSON";
      }
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "单价表需为 JSON 对象";
      for (const [model, price] of Object.entries(obj as Record<string, unknown>)) {
        const p = price as { input?: unknown; output?: unknown } | null;
        if (
          !p ||
          typeof p !== "object" ||
          typeof p.input !== "number" ||
          typeof p.output !== "number" ||
          p.input < 0 ||
          p.output < 0
        ) {
          return `模型 ${model} 需为 { "input": 数字, "output": 数字 }（每百万 token 美元）`;
        }
      }
      return null;
    }
    default:
      return null;
  }
}

export async function GET() {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const [snapshot, readonlyRows] = await Promise.all([
    getRuntimeConfigSnapshot(),
    prisma.systemConfig.findMany({ where: { key: { in: [...READONLY_KEYS] } } }),
  ]);
  const ro = Object.fromEntries(readonlyRows.map((r) => [r.key, r.value]));
  // config：全部键的生效值（字符串），兼容旧设置页 config[key] 读法
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries(snapshot.numbers)) config[k] = String(v);
  for (const [k, v] of Object.entries(snapshot.crons)) config[k] = v;
  for (const [k, v] of Object.entries(snapshot.strings)) config[k] = v;
  for (const k of READONLY_KEYS) if (ro[k] != null) config[k] = ro[k];

  return apiOk({
    config,
    snapshot,
    keys: { numbers: NUMBER_KEYS, crons: CRON_KEY_LIST, strings: STRING_KEY_LIST },
    usageAlert: ro.usageAlert ?? null,
    wechatBotLastSeen: ro.wechatBotLastSeen ?? null,
    wechatBotAlert: ro.wechatBotAlert ?? null,
  });
}

const PutBody = z.object({
  key: z.string().min(1),
  value: z.string().max(20_000),
});

export async function PUT(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.issues[0]?.message ?? "invalid");
  const { key } = parsed.data;
  const value = parsed.data.value.trim();
  if (!EDITABLE_KEYS.includes(key)) return apiError("bad_request", `unknown config key: ${key}`);
  const err = validateValue(key, value);
  if (err) return apiError("bad_request", err);

  if (value === "") {
    await prisma.systemConfig.deleteMany({ where: { key } });
  } else {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  invalidateRuntimeConfig();
  await audit(`admin:${admin.id}`, "update-system-config", key, key === "webFormToken" ? (value ? "(set)" : "(cleared)") : value);
  return apiOk({ ok: true });
}
