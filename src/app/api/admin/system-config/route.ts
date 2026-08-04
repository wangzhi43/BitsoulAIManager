import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 系统参数（白名单键）：日 token 上限、聚合窗口等
const EDITABLE_KEYS = ["dailyTokenLimit", "aggWindowMinutes", "claimTimeoutHours"] as const;

export async function GET() {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: [...EDITABLE_KEYS, "usageAlert", "wechatBotLastSeen"] } },
  });
  return apiOk({ config: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}

const PutBody = z.object({
  key: z.enum(EDITABLE_KEYS),
  value: z.string().regex(/^\d{0,12}$/, "需为非负整数（留空表示不限制）"),
});

export async function PUT(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.issues[0]?.message ?? "invalid");

  if (parsed.data.value === "") {
    await prisma.systemConfig.deleteMany({ where: { key: parsed.data.key } });
  } else {
    await prisma.systemConfig.upsert({
      where: { key: parsed.data.key },
      update: { value: parsed.data.value },
      create: { key: parsed.data.key, value: parsed.data.value },
    });
  }
  await audit(`admin:${admin.id}`, "update-system-config", parsed.data.key, parsed.data.value);
  return apiOk({ ok: true });
}
