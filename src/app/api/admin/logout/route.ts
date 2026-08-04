import { apiOk } from "@/lib/api";
import { clearAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearAdminSession();
  return apiOk({ ok: true });
}
