import { getAdminAuth } from "@/lib/server/admin";
import { getPackFromS3 } from "@/lib/server/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_UID = /^[A-Za-z0-9_-]{4,128}$/;
const SAFE_FILE = /^[a-f0-9]{16,64}\.(png|jpg|webp)$/i;

export async function GET(request, context) {
  const params = await context.params;
  const uid = String(params?.uid || "");
  const file = String(params?.file || "");
  if (!SAFE_UID.test(uid) || !SAFE_FILE.test(file)) {
    return Response.json({ error: "Invalid asset path." }, { status: 400 });
  }

  // Verify owner Firebase ID token
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  const auth = getAdminAuth();
  if (!auth) {
    return Response.json({ error: "Auth service unavailable." }, { status: 503 });
  }
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return Response.json({ error: "Invalid session token." }, { status: 401 });
  }
  if (decoded.uid !== uid) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const obj = await getPackFromS3(`users/${uid}/assets/${file}`);
  if (!obj?.buffer) {
    return Response.json({ error: "Asset not found." }, { status: 404 });
  }

  return new Response(obj.buffer, {
    status: 200,
    headers: {
      "content-type": obj.contentType || "image/png",
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
