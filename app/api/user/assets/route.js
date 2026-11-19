import crypto from "node:crypto";
import { getAdminAuth } from "@/lib/server/admin";
import { uploadPackToS3, hasS3Config } from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function verifyUser(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  const auth = getAdminAuth();
  if (!auth) return null;
  try {
    return await auth.verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function POST(request) {
  const user = await verifyUser(request);
  if (!user?.uid) {
    return Response.json({ error: "Sign in required to sync images." }, { status: 401 });
  }
  if (!hasS3Config()) {
    return Response.json({ error: "Neon object storage is not configured on this server." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const kind = body.kind === "logo" ? "logo" : "background";
  const maxBytes = kind === "logo" ? 2 * 1024 * 1024 : 1 * 1024 * 1024;
  const dataUrl = String(body.dataUrl || "");
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) {
    return Response.json({ error: "Only PNG, JPEG, or WebP images are allowed." }, { status: 400 });
  }

  const mime = m[1];
  const ext = ALLOWED_MIME[mime];
  const buf = Buffer.from(m[2], "base64");
  if (buf.byteLength > maxBytes) {
    return Response.json(
      { error: `Image exceeds ${(maxBytes / (1024 * 1024)).toFixed(0)} MB limit.` },
      { status: 413 }
    );
  }

  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32);
  const fileName = `${hash}.${ext}`;
  const key = `users/${user.uid}/assets/${fileName}`;
  const uploaded = await uploadPackToS3(key, buf, mime);
  if (!uploaded) {
    return Response.json({ error: "Could not store image in Neon object storage." }, { status: 502 });
  }

  return Response.json({
    ok: true,
    assetId: body.assetId || hash.slice(0, 24),
    fileName,
    mime,
    sizeBytes: buf.byteLength,
    url: `/api/user/assets/${user.uid}/${fileName}`,
  });
}
