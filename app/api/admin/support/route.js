import { requireAdmin } from "@/lib/server/admin";
import { getSupportMessages, updateSupportMessage } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const messages = await getSupportMessages();
  const openCount = messages.filter((m) => m.status === "open").length;
  return Response.json({ messages, openCount });
}

export async function POST(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  try {
    const body = await request.json();
    const updated = await updateSupportMessage(a, body || {});
    const messages = await getSupportMessages();
    const openCount = messages.filter((m) => m.status === "open").length;
    return Response.json({ updated, messages, openCount });
  } catch (e) {
    return Response.json({ error: e.message || "Action failed." }, { status: 400 });
  }
}
