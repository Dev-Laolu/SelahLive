import { createSupportMessage } from "@/lib/server/store";
import { getClientIp, rateLimit } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const ip = getClientIp(request);
  if (!rateLimit(`support:${ip}`, 5, 5 * 60_000)) {
    return Response.json(
      { error: "You have sent several help messages recently. Please wait a few minutes before sending another." },
      { status: 429 }
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request payload." }, { status: 400 });
  }
  try {
    const ticket = await createSupportMessage(body || {});
    return Response.json({ ok: true, id: ticket.id, createdAt: ticket.createdAt }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message || "Could not send message." }, { status: 400 });
  }
}
