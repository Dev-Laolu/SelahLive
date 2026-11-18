import { requireAdmin } from "@/lib/server/admin";
import { getAnalyticsDashboard } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "30d";
  const data = await getAnalyticsDashboard(range);
  return Response.json(data);
}
