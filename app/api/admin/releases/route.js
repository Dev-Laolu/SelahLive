import { requireAdmin } from "@/lib/server/admin";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const store = await getStore();
  return Response.json({ releases: store.releases });
}

