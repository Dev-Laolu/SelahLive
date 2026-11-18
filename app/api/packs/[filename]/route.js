import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getPackFromS3 } from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_PACK_NAME = /^[a-z0-9][a-z0-9._-]*\.json\.gz$/i;

export async function GET(_request, context) {
  const params = await context.params;
  const filename = String(params?.filename || "");
  if (!SAFE_PACK_NAME.test(filename) || filename.includes("..")) {
    return Response.json({ error: "Invalid pack filename." }, { status: 400 });
  }

  // 1. Fetch from private S3-compatible object storage (Neon Storage) using signed SigV4 GET
  const s3Obj = await getPackFromS3(`packs/${filename}`);
  if (s3Obj?.buffer) {
    return new Response(s3Obj.buffer, {
      status: 200,
      headers: {
        "content-type": "application/gzip",
        "content-length": String(s3Obj.buffer.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  }

  // 2. Fallback to local disk (local dev or warm serverless tmpdir)
  const candidates = [
    path.join(process.cwd(), "public", "data", "packs", filename),
    path.join(process.cwd(), "public", "data", filename),
    path.join(os.tmpdir(), "selah-live", "packs", filename),
  ];
  for (const p of candidates) {
    try {
      const buf = await fs.readFile(p);
      return new Response(buf, {
        status: 200,
        headers: {
          "content-type": "application/gzip",
          "content-length": String(buf.byteLength),
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    } catch { }
  }

  return Response.json({ error: "Pack not found." }, { status: 404 });
}
