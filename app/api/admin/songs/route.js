import { requireAdmin } from "@/lib/server/admin";
import { getStore, nextSongPackDefaultName, saveSongPackDraft, unpublishSongPack, deleteSongPack } from "@/lib/server/store";
import { validateSongs } from "@/lib/server/parsers";
import { parseSong } from "@/lib/songs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const store = await getStore();
  const suggestedName = await nextSongPackDefaultName();
  return Response.json({ songPacks: store.songPacks, suggestedName });
}

export async function POST(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  try {
    const body = await request.json();
    const { action, id, meta, songs } = body;
    if (action === "unpublish") return Response.json({ pack: await unpublishSongPack(a, id) });
    if (action === "delete") return Response.json({ deleted: await deleteSongPack(a, id) });
    if (action === "draft") {
      const rep = validateSongs(songs || [], parseSong);
      if (!rep.ok) {
        return Response.json({ error: rep.errors[0] || rep.problems[0]?.msg || "Validation failed.", report: rep }, { status: 400 });
      }
      const draft = await saveSongPackDraft(a, meta || {}, rep.songs);
      return Response.json({ draft, report: rep });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

