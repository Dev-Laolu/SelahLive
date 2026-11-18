import { getPublicManifest } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const manifest = await getPublicManifest();
  return Response.json(manifest, { headers: { "cache-control": "no-store" } });
}
