import { recordAnalyticsEvent } from "@/lib/server/store";

export const runtime = "nodejs";

// Anonymous event intake (install / app_open / visit / download). Never records which verses or songs are shown.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  const { event, uid, email, name, churchName, packId } = body || {};
  if (!["install", "app_open", "visit", "download"].includes(event)) {
    return new Response(null, { status: 204 });
  }
  await recordAnalyticsEvent({ event, uid, email, name, churchName, packId }).catch(() => { });
  return new Response(null, { status: 204 });
}
