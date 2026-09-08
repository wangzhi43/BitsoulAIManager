import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import type { BuildRun } from "@prisma/client";

// 体验包产物流式下载（管理员路由与公开带令牌路由共用）

export async function artifactResponse(run: BuildRun): Promise<Response> {
  if (!run.artifactPath) return new Response("no artifact", { status: 404 });
  let size: number;
  try {
    size = (await stat(run.artifactPath)).size;
  } catch {
    return new Response("artifact missing on disk", { status: 410 });
  }
  const name = run.artifactName ?? `${run.id}.tar.gz`;
  const stream = Readable.toWeb(createReadStream(run.artifactPath)) as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/gzip",
      "content-length": String(size),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}
