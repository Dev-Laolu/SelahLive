import { requireAdmin } from "@/lib/server/admin";
import { getLiveAuditLogs } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const logs = await getLiveAuditLogs();
  return Response.json({ logs });
}

