import { requireAdmin } from "@/lib/server/admin";
import { getStore, saveStore, syncManifestFromStore, logAudit } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const store = await getStore();
  return Response.json({
    manifestVersion: store.manifestVersion || 1,
    settings: store.settings,
    bibles: store.bibles.filter((b) => b.status === "published").map((b) => ({ id: b.id, name: b.name, code: b.code })),
    songPacks: store.songPacks.filter((s) => s.status === "published").map((s) => ({ id: s.id, name: s.name })),
  });
}

export async function POST(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  try {
    const patch = await request.json();
    const store = await getStore();
    store.settings = {
      ...store.settings,
      defaultBibleId: patch.defaultBibleId ?? store.settings.defaultBibleId,
      starterSongPackId: patch.starterSongPackId ?? store.settings.starterSongPackId,
      announcement: patch.announcement ?? store.settings.announcement,
    };
    await syncManifestFromStore(store);
    await logAudit(a, "settings.update", "Updated default packs / announcement banner", store);
    await saveStore(store);
    return Response.json({ settings: store.settings, manifestVersion: store.manifestVersion });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

