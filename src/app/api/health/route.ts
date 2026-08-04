import { prisma } from "@/lib/db";
import { apiOk } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    // db unreachable
  }
  return apiOk({ ok: db, db, ts: new Date().toISOString() }, db ? 200 : 503);
}
