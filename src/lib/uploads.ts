import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "./db";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/data/uploads";
const MAX_SIZE = 50 * 1024 * 1024; // 50MB（TECH_DESIGN §10）

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
]);

export async function saveAttachment(
  filename: string,
  mime: string,
  data: Buffer,
): Promise<{ id: string } | { error: string }> {
  if (data.length === 0) return { error: "empty file" };
  if (data.length > MAX_SIZE) return { error: "file too large (max 50MB)" };
  if (!ALLOWED_MIME.has(mime)) return { error: `mime not allowed: ${mime}` };

  const sha = createHash("sha256").update(data).digest("hex");
  const safeBase = path.basename(filename).replace(/[^\w.\-一-龥]/g, "_").slice(0, 120);
  const rel = path.join(sha.slice(0, 2), `${sha.slice(0, 16)}_${safeBase}`);
  const abs = path.join(UPLOAD_DIR, rel);

  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);

  const att = await prisma.attachment.create({
    data: { filename: safeBase, mime, size: data.length, sha256: sha, path: abs },
  });
  return { id: att.id };
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}
