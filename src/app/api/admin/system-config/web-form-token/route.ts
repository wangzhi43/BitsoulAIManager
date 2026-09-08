import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { invalidateRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

// 生成/轮换 Web 表单入口令牌（PRD #10）：32 位 base64url，旧令牌立即失效

export async function POST() {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");

  const token = randomBytes(24).toString("base64url"); // 24 字节 → 32 字符
  await prisma.systemConfig.upsert({
    where: { key: "webFormToken" },
    update: { value: token },
    create: { key: "webFormToken", value: token },
  });
  invalidateRuntimeConfig();
  await audit(`admin:${admin.id}`, "rotate-web-form-token");
  return apiOk({ token, url: `/submit?token=${token}` });
}
