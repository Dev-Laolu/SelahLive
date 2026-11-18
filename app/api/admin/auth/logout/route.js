import {
  destroyAdminSession,
  getClientIp,
  makeSessionCookie,
  verifyAdminSessionCookie,
} from "@/lib/server/admin";
import { logAudit } from "@/lib/server/store";

export const runtime = "nodejs";

export async function POST(request) {
  const ip = getClientIp(request);
  const sess = await verifyAdminSessionCookie(request, false);
  await destroyAdminSession(request);
  if (sess) {
    await logAudit({ uid: sess.uid }, "admin.logout", `IP: ${ip}`).catch(() => { });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": makeSessionCookie("", 0),
      "cache-control": "no-store",
    },
  });
}

