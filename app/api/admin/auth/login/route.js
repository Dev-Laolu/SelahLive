import {
  authenticateAdminCredentials,
  getClientIp,
  makeSessionCookie,
} from "@/lib/server/admin";
import { logAudit } from "@/lib/server/store";

export const runtime = "nodejs";

export async function POST(request) {
  const ip = getClientIp(request);
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { username, password, code } = body || {};
  const result = await authenticateAdminCredentials({ username, password, code, ip });

  if (!result.ok) {
    await logAudit({ uid: username || "unknown" }, "admin.login_failed", `IP: ${ip}`).catch(() => {});
    return Response.json({ error: result.error }, { status: result.status || 401 });
  }

  await logAudit({ uid: result.session.uid }, "admin.login_success", `IP: ${ip}`).catch(() => {});

  return new Response(
    JSON.stringify({
      ok: true,
      admin: { username: result.session.uid },
      csrfToken: result.session.csrfToken,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": makeSessionCookie(result.token),
        "cache-control": "no-store",
      },
    }
  );
}

