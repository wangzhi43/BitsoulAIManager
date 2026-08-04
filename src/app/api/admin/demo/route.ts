import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { DEMO_COOKIE } from "@/lib/demo";

export const dynamic = "force-dynamic";

// 前端展示模式开关：on=true 各页面渲染示例数据（仅影响当前浏览器）

const Body = z.object({ on: z.boolean() });

export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return apiError("unauthorized", "not logged in");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", "on: boolean required");

  const res = NextResponse.json({ ok: true, demo: parsed.data.on });
  if (parsed.data.on) {
    res.cookies.set(DEMO_COOKIE, "1", { httpOnly: true, sameSite: "lax", maxAge: 86400, path: "/" });
  } else {
    res.cookies.delete(DEMO_COOKIE);
  }
  return res;
}
