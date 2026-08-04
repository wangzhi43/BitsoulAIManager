import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");
  return apiOk({ id: admin.id, username: admin.username, displayName: admin.displayName });
}
