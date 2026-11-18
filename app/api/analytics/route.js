import { recordAnalyticsEvent } from "@/lib/server/store";

export const runtime = "nodejs";

// Anonymous event intake (install / app_open / visit / download). Never records which verses or songs are shown.
export async function POST(request) {
  try {
    const body = await request.json();
    const { event, uid, email, name, churchName, packId } = body || {};
    if (!["install", "app_open", "visit", "download"].includes(event)) {
      return new Response(null, { status: 400 });
    }
    await recordAnalyticsEvent({ event, uid, email, name, churchName, packId });
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
