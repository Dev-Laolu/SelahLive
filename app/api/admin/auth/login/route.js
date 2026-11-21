import {
  verifyAdminPasswordStep,
  verifyAdminMfaStep,
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

  const { step = "password", username, password, preAuthToken, code } = body || {};

  // Step 1: Verify Username & Password
  if (step === "password") {
    const res = await verifyAdminPasswordStep({ username, password, ip });
    if (!res.ok) {
      await logAudit({ uid: username || "unknown" }, "admin.login_failed", `Step 1 (IP: ${ip})`).catch(() => {});
      return Response.json({ error: res.error }, { status: res.status || 401 });
    }
    return Response.json(
      {
        ok: true,
        nextStep: res.nextStep,
        preAuthToken: res.preAuthToken,
        mfaSetup: res.mfaSetup,
      },
      { headers: { "cache-control": "no-store" } }
    );
  }

  // Step 2: Verify MFA TOTP / Recovery Code (and finalize MFA setup if first time)
  if (step === "mfa") {
    const res = await verifyAdminMfaStep({ preAuthToken, code, ip });
    if (!res.ok) {
      await logAudit({ uid: res.uid || "admin" }, "admin.mfa_failed", `Step 2 (IP: ${ip})`).catch(() => {});
      return Response.json({ error: res.error }, { status: res.status || 401 });
    }
    if (res.wasFirstSetup) {
      await logAudit({ uid: res.session.uid }, "admin.mfa_setup", `Authenticator MFA enrolled (IP: ${ip})`).catch(() => {});
    }
    await logAudit({ uid: res.session.uid }, "admin.login_success", `MFA verified (${res.session.role || "admin"}, IP: ${ip})`).catch(() => {});
    return new Response(
      JSON.stringify({
        ok: true,
        admin: { username: res.session.uid, role: res.session.role || "owner" },
        csrfToken: res.session.csrfToken,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": makeSessionCookie(res.token),
          "cache-control": "no-store",
        },
      }
    );
  }

  return Response.json({ error: "Unknown login step." }, { status: 400 });
}
