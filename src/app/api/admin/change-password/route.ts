import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin, hashPassword, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, "新密码至少 8 位"),
});

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.issues[0]?.message ?? "invalid body");

  if (!(await verifyPassword(parsed.data.oldPassword, admin.passwordHash))) {
    return apiError("forbidden", "旧密码不正确");
  }
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  return apiOk({ ok: true });
}
