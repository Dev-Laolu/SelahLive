import { verifyAdminSessionCookie } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const sess = await verifyAdminSessionCookie(request, true);
  if (!sess) {
    return Response.json(
      {
        authenticated: false,
        mfaEnforced: process.env.ADMIN_ENFORCE_MFA === "true",
      },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }
  return Response.json(
    {
      authenticated: true,
      admin: { username: sess.uid, email: sess.email },
      csrfToken: sess.csrfToken,
      mfaEnforced: process.env.ADMIN_ENFORCE_MFA === "true",
    },
    { headers: { "cache-control": "no-store" } }
  );
}

