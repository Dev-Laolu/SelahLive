import { requireAdmin } from "@/lib/server/admin";
import { getLiveUsers, performUserAction } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const users = await getLiveUsers();
  return Response.json({ users });
}

export async function POST(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  try {
    const body = await request.json();
    const user = await performUserAction(a, body);
    const users = await getLiveUsers();
    return Response.json({ user, users });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

