import { makeSessionCookie, verifyAdminSessionCookie, IDLE_TIMEOUT_MS } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const sess = await verifyAdminSessionCookie(request);
  if (!sess) {
    // Return 200 with authenticated: false to avoid noisy console 401 on initial login check
    return Response.json(
      {
        authenticated: false,
        idleTimeoutMs: IDLE_TIMEOUT_MS,
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }
  return new Response(
    JSON.stringify({
      authenticated: true,
      admin: { username: sess.uid, email: sess.email },
      csrfToken: sess.csrfToken,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": makeSessionCookie(sess.refreshedToken),
        "cache-control": "no-store",
      },
    }
  );
}
