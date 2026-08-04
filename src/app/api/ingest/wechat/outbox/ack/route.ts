import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { verifyIngestSignature } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const Body = z.object({ ids: z.array(z.string()).min(1) });

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const timestamp = req.headers.get("x-ingest-timestamp") || "";
  const signature = req.headers.get("x-ingest-signature") || "";
  if (!verifyIngestSignature(raw, timestamp, signature)) {
    return apiError("unauthorized", "bad signature");
  }
  const parsed = Body.safeParse(JSON.parse(raw));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);

  await prisma.wechatOutbox.updateMany({
    where: { id: { in: parsed.data.ids }, sentAt: null },
    data: { sentAt: new Date() },
  });
  return apiOk({ ok: true });
}
