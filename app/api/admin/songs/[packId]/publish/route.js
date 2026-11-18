import { requireAdmin } from "@/lib/server/admin";
import { publishSongPack } from "@/lib/server/store";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  try {
    const { packId } = await params;
    const body = await request.json().catch(() => ({}));
    const res = await publishSongPack(a, packId, body);
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

