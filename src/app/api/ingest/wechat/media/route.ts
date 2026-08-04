import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual, createHash } from "crypto";
import { apiError, apiOk } from "@/lib/api";
import { config } from "@/lib/config";
import { saveAttachment } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// 媒体上传：二进制 body。签名基于 `${timestamp}.${sha256(body)}`，防篡改与重放。
// Headers: x-ingest-timestamp / x-ingest-signature / x-filename / content-type

export async function POST(req: NextRequest) {
  const body = Buffer.from(await req.arrayBuffer());
  const timestamp = req.headers.get("x-ingest-timestamp") || "";
  const signature = req.headers.get("x-ingest-signature") || "";

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return apiError("unauthorized", "stale timestamp");
  }
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const expected = createHmac("sha256", config.ingestHmacSecret)
    .update(`${timestamp}.${bodyHash}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return apiError("unauthorized", "bad signature");
  }

  const filename = decodeURIComponent(req.headers.get("x-filename") || "file.bin");
  const mime = req.headers.get("content-type") || "application/octet-stream";
  const result = await saveAttachment(filename, mime, body);
  if ("error" in result) return apiError("bad_request", result.error);
  return apiOk({ attachmentId: result.id });
}
