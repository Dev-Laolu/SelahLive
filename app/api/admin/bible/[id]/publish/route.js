import { requireAdmin } from "@/lib/server/admin";
import { publishBible } from "@/lib/server/store";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const res = await publishBible(a, id, body);
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

