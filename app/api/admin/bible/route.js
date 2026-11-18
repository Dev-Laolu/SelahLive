import { requireAdmin } from "@/lib/server/admin";
import { getStore, unpublishBible, deleteBible } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const store = await getStore();
  return Response.json({ bibles: store.bibles });
}

export async function POST(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  try {
    const { id, action } = await request.json();
    if (action === "unpublish") return Response.json({ bible: await unpublishBible(a, id) });
    if (action === "delete") return Response.json({ deleted: await deleteBible(a, id) });
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

