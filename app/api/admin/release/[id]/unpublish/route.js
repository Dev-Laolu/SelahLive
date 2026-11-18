import { requireAdmin } from "@/lib/server/admin";
import { unpublishRelease } from "@/lib/server/store";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  try {
    const { id } = await params;
    const rel = await unpublishRelease(a, id);
    return Response.json({ release: rel });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

