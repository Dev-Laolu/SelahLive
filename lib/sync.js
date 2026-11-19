"use client";
// Offline-first bidirectional account sync (V1.2 §5.1 & §5.3).
// Syncs profile/settings, custom templates, saved texts, custom songs, favourites, stats, recent items via Firestore,
// and syncs user images (logos <= 2 MB, backgrounds <= 1 MB) via Neon S3 (/api/user/assets).
// NEVER syncs OBS password, pairId, or library packs.
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "./firebase";
import { setKey, allStoreEntries } from "./db";
import { sanitizeTheme } from "./themes";

async function getIdToken() {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

function toTs(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : 0;
}

// Upload a dataUrl image to Neon S3 via authenticated API route
export async function uploadUserAssetToNeon(assetId, dataUrl, kind = "background") {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  const token = await getIdToken();
  if (!token) return null;
  try {
    const r = await fetch("/api/user/assets", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ assetId, dataUrl, kind }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Download a user asset from Neon S3 into a dataUrl for offline IndexedDB storage
export async function downloadUserAssetFromNeon(remoteUrl) {
  if (!remoteUrl || !remoteUrl.startsWith("/api/user/assets/")) return null;
  const token = await getIdToken();
  if (!token) return null;
  try {
    const r = await fetch(remoteUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function runAccountSync(localState) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { status: "offline", remoteChanged: false };
  }
  const auth = getFirebaseAuth();
  const fsDb = getFirebaseDb();
  const user = auth?.currentUser;
  if (!user?.uid || !fsDb) {
    return { status: "local", remoteChanged: false };
  }

  const uid = user.uid;
  let remoteChanged = false;
  const merged = {};

  try {
    // 1. Sync user profile & display settings (never OBS password or pairId, never base64 images)
    const userRef = doc(fsDb, "users", uid);
    const snap = await getDoc(userRef);
    const remote = snap.exists() ? snap.data() : {};

    // Upload local logo / watermark / theme background assets to Neon S3 if not yet uploaded
    const assetRefs = { ...(remote.assetRefs || {}) };
    const localAssets = await allStoreEntries("assets");
    for (const a of localAssets) {
      if (a?.assetId && a.dataUrl && !a.remoteUrl) {
        const res = await uploadUserAssetToNeon(a.assetId, a.dataUrl, "background");
        if (res?.url) {
          a.remoteUrl = res.url;
          await setKey("assets", a.assetId, a);
          assetRefs[a.assetId] = { url: res.url, mime: res.mime, kind: "background" };
        }
      } else if (a?.assetId && a.remoteUrl) {
        assetRefs[a.assetId] = { url: a.remoteUrl, mime: a.mime || "image/png", kind: "background" };
      }
    }

    // Upload church logo / watermark if present as dataUrl
    if (localState.style?.logo?.startsWith("data:image/")) {
      const res = await uploadUserAssetToNeon("church-logo", localState.style.logo, "logo");
      if (res?.url) assetRefs["church-logo"] = { url: res.url, mime: res.mime, kind: "logo" };
    }
    if (localState.style?.watermark?.startsWith("data:image/")) {
      const res = await uploadUserAssetToNeon("church-watermark", localState.style.watermark, "logo");
      if (res?.url) assetRefs["church-watermark"] = { url: res.url, mime: res.mime, kind: "logo" };
    }

    // Download any remote assets missing locally
    const localAssetMap = new Map(localAssets.map((a) => [a.assetId, a]));
    const downloadedAssets = {};
    for (const [aid, info] of Object.entries(assetRefs)) {
      if (!info?.url) continue;
      if (aid === "church-logo" && !localState.style?.logo) {
        const durl = await downloadUserAssetFromNeon(info.url);
        if (durl) { merged.logoDataUrl = durl; remoteChanged = true; }
      } else if (aid === "church-watermark" && !localState.style?.watermark) {
        const durl = await downloadUserAssetFromNeon(info.url);
        if (durl) { merged.watermarkDataUrl = durl; remoteChanged = true; }
      } else if (!localAssetMap.has(aid) && aid !== "church-logo" && aid !== "church-watermark") {
        const durl = await downloadUserAssetFromNeon(info.url);
        if (durl) {
          const rec = { assetId: aid, mime: info.mime || "image/png", dataUrl: durl, remoteUrl: info.url };
          await setKey("assets", aid, rec);
          downloadedAssets[aid] = durl;
          remoteChanged = true;
        }
      }
    }
    if (Object.keys(downloadedAssets).length > 0) merged.downloadedAssets = downloadedAssets;

    const localUpdated = toTs(localState.updatedAt);
    const remoteUpdated = toTs(remote.updatedAt);
    const cleanDisplay = { ...(localState.style || {}) };
    delete cleanDisplay.logo;
    delete cleanDisplay.watermark;

    if (remoteUpdated > localUpdated && remote.displaySettings) {
      merged.style = {
        ...localState.style,
        ...remote.displaySettings,
        logo: merged.logoDataUrl || localState.style?.logo || "",
        watermark: merged.watermarkDataUrl || localState.style?.watermark || "",
      };
      if (remote.activeThemeIds) merged.activeThemeIds = remote.activeThemeIds;
      if (Array.isArray(remote.favSongs)) merged.favSongs = remote.favSongs;
      if (remote.songStats && typeof remote.songStats === "object") merged.songStats = remote.songStats;
      if (Array.isArray(remote.customSongs)) merged.customSongs = remote.customSongs;
      if (Array.isArray(remote.recent)) merged.recent = remote.recent;
      if (Array.isArray(remote.pinned)) merged.pinned = remote.pinned;
      if (remote.songThemeOverrides) merged.songThemeOverrides = remote.songThemeOverrides;
      remoteChanged = true;
    } else {
      await setDoc(
        userRef,
        {
          churchName: localState.style?.churchName || "",
          displaySettings: cleanDisplay,
          activeThemeIds: localState.activeThemeIds || {},
          favSongs: (localState.favSongs || []).slice(0, 500),
          songStats: localState.songStats || {},
          customSongs: (localState.customSongs || []).slice(0, 150),
          recent: (localState.recent || []).slice(0, 20),
          pinned: (localState.pinned || []).slice(0, 20),
          songThemeOverrides: localState.songThemeOverrides || {},
          assetRefs,
          updatedAt: localState.updatedAt || new Date().toISOString(),
        },
        { merge: true }
      );
    }

    // 2. Sync Saved Texts (users/{uid}/savedTexts/{id}) — LWW with tombstones
    const stCol = collection(fsDb, "users", uid, "savedTexts");
    const stSnaps = await getDocs(stCol);
    const remoteTexts = new Map();
    stSnaps.forEach((d) => remoteTexts.set(d.id, { id: d.id, ...d.data() }));

    const localTexts = new Map((localState.savedTexts || []).map((t) => [t.id, t]));
    const allTextIds = new Set([...remoteTexts.keys(), ...localTexts.keys()]);
    const mergedTexts = [];

    for (const id of allTextIds) {
      const loc = localTexts.get(id);
      const rem = remoteTexts.get(id);
      if (loc && (!rem || toTs(loc.updatedAt) >= toTs(rem.updatedAt))) {
        mergedTexts.push(loc);
        if (!rem || toTs(loc.updatedAt) > toTs(rem.updatedAt)) {
          await setDoc(doc(fsDb, "users", uid, "savedTexts", id), {
            id: loc.id,
            title: String(loc.title || "Untitled").slice(0, 100),
            body: String(loc.body || "").slice(0, 10000),
            tags: Array.isArray(loc.tags) ? loc.tags.slice(0, 20) : [],
            favourite: !!loc.favourite,
            templateId: loc.templateId || "",
            useCount: Number(loc.useCount) || 0,
            lastUsedAt: loc.lastUsedAt || "",
            createdAt: loc.createdAt || new Date().toISOString(),
            updatedAt: loc.updatedAt || new Date().toISOString(),
            deleted: !!loc.deleted,
          });
        }
      } else if (rem) {
        mergedTexts.push(rem);
        await setKey("savedTexts", rem.id, rem);
        remoteChanged = true;
      }
    }
    merged.savedTexts = mergedTexts;

    // 3. Sync Custom Templates (users/{uid}/customTemplates/{id}) — LWW with tombstones
    const tplCol = collection(fsDb, "users", uid, "customTemplates");
    const tplSnaps = await getDocs(tplCol);
    const remoteTpls = new Map();
    tplSnaps.forEach((d) => remoteTpls.set(d.id, sanitizeTheme({ id: d.id, ...d.data(), builtIn: false })));

    const localCustomTpls = new Map(
      (localState.customThemes || []).filter((t) => !t.builtIn).map((t) => [t.id, t])
    );
    const allTplIds = new Set([...remoteTpls.keys(), ...localCustomTpls.keys()]);
    const mergedCustomTpls = [];

    for (const id of allTplIds) {
      const loc = localCustomTpls.get(id);
      const rem = remoteTpls.get(id);
      if (loc && (!rem || toTs(loc.updatedAt) >= toTs(rem.updatedAt))) {
        mergedCustomTpls.push(loc);
        if (!rem || toTs(loc.updatedAt) > toTs(rem.updatedAt)) {
          // Strip inline dataUrl before writing to Firestore (Neon S3 assetId is synced instead)
          const clean = sanitizeTheme({ ...loc, builtIn: false });
          if (clean.lowerThird.bgImageDataUrl) clean.lowerThird.bgImageDataUrl = "";
          if (clean.fullScreen.bgImageDataUrl) clean.fullScreen.bgImageDataUrl = "";
          await setDoc(doc(fsDb, "users", uid, "customTemplates", id), clean);
        }
      } else if (rem) {
        mergedCustomTpls.push(rem);
        await setKey("themes", rem.id, rem);
        remoteChanged = true;
      }
    }
    merged.customThemes = mergedCustomTpls;

    return { status: "synced", remoteChanged, merged, syncedAt: new Date().toISOString() };
  } catch (e) {
    return { status: "error", error: e?.message || "Sync failed", remoteChanged: false };
  }
}
