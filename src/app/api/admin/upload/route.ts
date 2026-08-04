import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api";
import { currentAdmin } from "@/lib/auth";
import { saveAttachment } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// 管理端附件上传（multipart form-data，字段名 file）

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return apiError("unauthorized", "not logged in");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("bad_request", "file field required");

  const result = await saveAttachment(
    file.name,
    file.type || "application/octet-stream",
    Buffer.from(await file.arrayBuffer()),
  );
  if ("error" in result) return apiError("bad_request", result.error);
  return apiOk({ attachmentId: result.id });
}
