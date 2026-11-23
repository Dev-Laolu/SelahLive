"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ObsClient, isSelah } from "@/lib/obs";
import { getKey, setKey, delKey, allPacks, allStoreEntries, db } from "@/lib/db";
import { DEFAULT_STYLE } from "@/lib/defaults";
import { DEFAULT_THEMES, sanitizeTheme, migrateThemeToV2, isTemplateNameTaken } from "@/lib/themes";
import { unifiedSearch } from "@/lib/search";
import { runAccountSync } from "@/lib/sync";
import { VoiceProvider } from "@/src/voice/VoiceContext";
import { gunzipSync, unzipSync } from "fflate";

const Ctx = createContext(/** @type {any} */ (null));
/** @returns {any} */
export const useApp = () => useContext(Ctx);
const APP_VERSION = "2.0.0";

const STARTER_SAVED_TEXTS = [
  {
    id: "starter-offering",
    title: "Offering today",
    body: "Thank you for your generous giving.\nGive online or via our church app.",
    tags: ["Service", "Giving"],
    favourite: true,
    templateId: "tpl-offering",
    useCount: 0,
    lastUsedAt: "",
    createdAt: "2026-11-01T09:00:00.000Z",
    updatedAt: "2026-11-01T09:00:00.000Z",
    deleted: false,
  },
  {
    id: "starter-welcome",
    title: "Welcome",
    body: "Welcome home! We are so glad you joined us today.\nSay hello in the chat and let us pray with you.",
    tags: ["Service", "Welcome"],
    favourite: true,
    templateId: "tpl-welcome",
    useCount: 0,
    lastUsedAt: "",
    createdAt: "2026-11-01T09:01:00.000Z",
    updatedAt: "2026-11-01T09:01:00.000Z",
    deleted: false,
  },
  {
    id: "starter-prayer",
    title: "Prayer",
    body: "Let us bow our heads and lift our hearts together in prayer.",
    tags: ["Service", "Prayer"],
    favourite: false,
    templateId: "tpl-prayer-moment",
    useCount: 0,
    lastUsedAt: "",
    createdAt: "2026-11-01T09:02:00.000Z",
    updatedAt: "2026-11-01T09:02:00.000Z",
    deleted: false,
  },
];
const rid = () => {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  return Math.random().toString(36).slice(2, 10).toUpperCase();
};

async function sha256Hex(bytes) {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function AppProvider({ children }) {
  const obs = useRef(null);
  if (!obs.current && typeof window !== "undefined") obs.current = new ObsClient();
  const bc = useRef(null);
  const seqRef = useRef(0);
  const ackedAssetsRef = useRef(new Set());
  const debounceTimerRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [style, setStyleState] = useState(DEFAULT_STYLE);
  const [themes, setThemes] = useState(DEFAULT_THEMES);
  const [activeThemeIds, setActiveThemeIds] = useState({
    scripture: "default-scripture",
    songs: "default-songs",
    text: "default-text",
  });
  const [assetsMap, setAssetsMap] = useState({}); // assetId -> dataUrl
  const [obsConf, setObsConf] = useState({ host: "localhost", port: 4455, password: "", pairId: "", scene: "" });
  const [obsStatus, setObsStatus] = useState("disconnected");
  const [obsError, setObsError] = useState("");
  const [online, setOnline] = useState(true);
  const [packs, setPacks] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [live, setLive] = useState(null);
  const [liveFollow, setLiveFollowState] = useState(true); // V1.1 §1.2 default ON
  const [mode, setModeState] = useState("lowerThird");
  const [activeBibleId, setActiveBibleId] = useState("");
  const [lyricsLinesPerSlide, setLyricsLinesPerSlideState] = useState(2);
  const [scriptureRangeSplit, setScriptureRangeSplitState] = useState(false);
  const [recent, setRecent] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [favSongs, setFavSongs] = useState([]);
  const [songStats, setSongStats] = useState({});
  const [songThemeOverrides, setSongThemeOverrides] = useState({});
  const [customSongs, setCustomSongs] = useState([]);
  const [recentTexts, setRecentTexts] = useState([]);
  const [savedTexts, setSavedTexts] = useState([]);
  const [syncStatus, setSyncStatus] = useState("local"); // synced | syncing | offline | local | error
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [notices, setNotices] = useState([]);
  const [setupDone, setSetupDone] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [downloads, setDownloads] = useState({});

  const liveRef = useRef(null);
  const liveFollowRef = useRef(true);
  const modeRef = useRef("lowerThird");
  const styleRef = useRef(DEFAULT_STYLE);
  const themesRef = useRef(DEFAULT_THEMES);
  const activeThemeIdsRef = useRef(activeThemeIds);
  const packsRef = useRef([]);
  const customSongsRef = useRef([]);
  const favSongsRef = useRef([]);
  const songStatsRef = useRef({});
  const songThemeOverridesRef = useRef({});
  const recentRef = useRef([]);
  const pinnedRef = useRef([]);
  const recentTextsRef = useRef([]);
  const savedTextsRef = useRef([]);
  const activeBibleIdRef = useRef("");
  const recentItems = useRef([]);
  const obsConfRef = useRef(obsConf);
  const localUpdatedAtRef = useRef("");
  const syncTimerRef = useRef(null);

  useEffect(() => { liveRef.current = live; }, [live]);
  useEffect(() => { liveFollowRef.current = liveFollow; }, [liveFollow]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { styleRef.current = style; }, [style]);
  useEffect(() => { themesRef.current = themes; }, [themes]);
  useEffect(() => { activeThemeIdsRef.current = activeThemeIds; }, [activeThemeIds]);
  useEffect(() => { packsRef.current = packs; }, [packs]);
  useEffect(() => { customSongsRef.current = customSongs; }, [customSongs]);
  useEffect(() => { favSongsRef.current = favSongs; }, [favSongs]);
  useEffect(() => { songStatsRef.current = songStats; }, [songStats]);
  useEffect(() => { songThemeOverridesRef.current = songThemeOverrides; }, [songThemeOverrides]);
  useEffect(() => { recentRef.current = recent; }, [recent]);
  useEffect(() => { pinnedRef.current = pinned; }, [pinned]);
  useEffect(() => { recentTextsRef.current = recentTexts; }, [recentTexts]);
  useEffect(() => { savedTextsRef.current = savedTexts; }, [savedTexts]);
  useEffect(() => { activeBibleIdRef.current = activeBibleId; }, [activeBibleId]);
  useEffect(() => { obsConfRef.current = obsConf; }, [obsConf]);

  // ---- boot: load everything from IndexedDB
  useEffect(() => {
    (async () => {
      const [
        st, oc, rc, pn, fv, cs, rt, sd, th, sess, lf,
        savedThemes, savedActiveThemes, savedAssets, lps, srs,
        stStats, stOverrides, loadedSavedTexts, savedUpdatedAt
      ] = await Promise.all([
        getKey("settings", "style", DEFAULT_STYLE),
        getKey("settings", "obs", null),
        getKey("lists", "recent", []),
        getKey("lists", "pinned", []),
        getKey("lists", "favSongs", []),
        getKey("lists", "customSongs", []),
        getKey("lists", "recentTexts", []),
        getKey("settings", "setupDone", false),
        getKey("settings", "theme", "dark"),
        getKey("settings", "session", null),
        getKey("settings", "liveFollow", true),
        allStoreEntries("themes"),
        getKey("settings", "activeThemeIds", null),
        allStoreEntries("assets"),
        getKey("settings", "lyricsLinesPerSlide", 2),
        getKey("settings", "scriptureRangeSplit", false),
        getKey("lists", "songStats", {}),
        getKey("lists", "songThemeOverrides", {}),
        allStoreEntries("savedTexts"),
        getKey("settings", "localUpdatedAt", ""),
      ]);
      const mergedStyle = { ...DEFAULT_STYLE, ...st };
      setStyleState(mergedStyle);
      setModeState(mergedStyle.layout || "lowerThird");
      setObsConf(oc || { host: "localhost", port: 4455, password: "", pairId: rid(), scene: "" });
      if (!oc) setKey("settings", "obs", { host: "localhost", port: 4455, password: "", pairId: "", scene: "" });
      setRecent(rc); setPinned(pn); setFavSongs(fv); setCustomSongs(cs); setRecentTexts(rt);
      setSongStats(stStats || {});
      setSongThemeOverrides(stOverrides || {});
      setSetupDone(sd); setTheme(th); setLiveFollowState(lf !== false);
      setLyricsLinesPerSlideState(Number(lps) || 2);
      setScriptureRangeSplitState(!!srs);
      localUpdatedAtRef.current = savedUpdatedAt || "";

      // Seed starter saved texts on first boot if none exist (V1.2 §5.1)
      if (!loadedSavedTexts || loadedSavedTexts.length === 0) {
        for (const item of STARTER_SAVED_TEXTS) await setKey("savedTexts", item.id, item);
        setSavedTexts(STARTER_SAVED_TEXTS);
      } else {
        setSavedTexts(loadedSavedTexts);
      }

      // Migrate v1.1 themes automatically to v2 (built-in templates are always read-only)
      const builtInIds = new Set(DEFAULT_THEMES.map((t) => t.id));
      const merged = [...DEFAULT_THEMES];
      if (savedThemes && savedThemes.length > 0) {
        for (const rawT of savedThemes) {
          if (!rawT || rawT.deleted || builtInIds.has(rawT.id)) continue;
          const v2 = migrateThemeToV2({ ...rawT, builtIn: false });
          if (rawT.version !== 2) await setKey("themes", v2.id, v2);
          merged.push(v2);
        }
      }
      setThemes(merged);
      if (savedActiveThemes) setActiveThemeIds((prev) => ({ ...prev, ...savedActiveThemes }));
      if (savedAssets && savedAssets.length > 0) {
        const am = {};
        savedAssets.forEach((a) => { if (a.assetId && a.dataUrl) am[a.assetId] = a.dataUrl; });
        setAssetsMap(am);
      }

      const loadedPacks = await allPacks();
      setPacks(loadedPacks);
      const firstBible = loadedPacks.find((p) => p.type === "bible");
      if (firstBible) setActiveBibleId(firstBible.id);

      setOnline(navigator.onLine);
      setReady(true);

      if (navigator.onLine) {
        fetch("/api/analytics", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event: "app_open",
            uid: sess?.uid,
            email: sess?.email,
            name: sess?.name,
            churchName: mergedStyle.churchName,
          }),
        }).catch(() => { });
      }
    })();
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => { });
    bc.current = "BroadcastChannel" in window ? new BroadcastChannel("selah-live") : null;
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (ready && !obsConf.pairId) {
      const c = { ...obsConf, pairId: rid() };
      setObsConf(c);
      setKey("settings", "obs", c);
    }
  }, [ready, obsConf]);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
  }, [theme]);

  // ---- emit helper (always includes increasing `seq`)
  const emit = useCallback((type, payload = {}) => {
    const seq = ++seqRef.current;
    const pairId = obsConfRef.current.pairId;
    const msg = { app: "selah-live", v: 1, pairId, type, seq, ...payload };
    try { bc.current && bc.current.postMessage(msg); } catch { }
    if (obs.current && obs.current.connected) {
      obs.current.send(type, pairId, { seq, ...payload }).catch(() => { });
    }
    return seq;
  }, []);

  // ---- Resolve active theme for a content kind ("scripture" | "songs" | "text")
  const getThemeForKind = useCallback((kind = "scripture") => {
    const slot = kind === "song" ? "songs" : kind === "text" ? "text" : "scripture";
    const tid = activeThemeIdsRef.current[slot];
    return themesRef.current.find((t) => t.id === tid) || themesRef.current.find((t) => t.slot === slot) || DEFAULT_THEMES[0];
  }, []);

  // ---- Chunked asset streaming to overlay (`selah:asset`, ~256 KB chunks)
  const streamAssetToOverlay = useCallback(async (assetId, dataUrl, mime = "image/png", force = false) => {
    if (!assetId || !dataUrl) return;
    if (!force && ackedAssetsRef.current.has(assetId)) return;
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const CHUNK_SIZE = 240 * 1024; // ~240 KB base64 (~180 KB raw) per chunk
    const total = Math.max(1, Math.ceil(base64.length / CHUNK_SIZE));
    for (let index = 0; index < total; index++) {
      const data = base64.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      emit("selah:asset", { assetId, index, total, mime, data });
      if (total > 1) await new Promise((r) => setTimeout(r, 25));
    }
  }, [emit]);

  const syncAllAssetsToOverlay = useCallback(async (force = false) => {
    const all = await allStoreEntries("assets");
    for (const a of all) {
      if (a.assetId && a.dataUrl) {
        await streamAssetToOverlay(a.assetId, a.dataUrl, a.mime || "image/png", force);
      }
    }
  }, [streamAssetToOverlay]);

  const saveAsset = useCallback(async ({ dataUrl, mime, width, height, sizeBytes }) => {
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const assetId = await sha256Hex(bin);
    const rec = { assetId, mime, dataUrl, width, height, sizeBytes };
    await setKey("assets", assetId, rec);
    setAssetsMap((m) => ({ ...m, [assetId]: dataUrl }));
    streamAssetToOverlay(assetId, dataUrl, mime, true);
    return rec;
  }, [streamAssetToOverlay]);

  // ---- Broadcast state to OBS Dock (`selah:state`)
  const broadcastState = useCallback(() => {
    const biblesList = packsRef.current.filter((p) => p.type === "bible").map((b) => ({ id: b.id, code: b.code, name: b.name }));
    const themesList = themesRef.current.map((t) => ({ id: t.id, name: t.name, slot: t.slot }));
    const savedTextsList = savedTextsRef.current
      .filter((t) => !t.deleted)
      .slice(0, 20)
      .map((t) => ({ id: t.id, kind: "text", title: t.title, subtitle: "", body: t.body, templateId: t.templateId || "", favourite: !!t.favourite }));
    emit("selah:state", {
      live: liveRef.current,
      mode: modeRef.current,
      follow: liveFollowRef.current,
      version: activeBibleIdRef.current || biblesList[0]?.id || "",
      themeId: activeThemeIdsRef.current.scripture,
      versions: biblesList,
      themes: themesList,
      recent: recentItems.current,
      savedTexts: savedTextsList,
    });
  }, [emit]);

  // ---- Show / Update / TakeLive / Hide / Clear Controls
  const buildShowPayload = useCallback((item, overrides = {}) => {
    const targetMode = overrides.mode || modeRef.current;
    const kind = item.kind || "scripture";
    const overrideTid = overrides.templateId || item.templateId || (item.songId ? songThemeOverridesRef.current[item.songId] : "");
    const activeTheme = (overrideTid && themesRef.current.find((t) => t.id === overrideTid)) || getThemeForKind(kind);
    const layoutCfg = targetMode === "fullScreen" ? activeTheme.fullScreen : activeTheme.lowerThird;
    return {
      mode: targetMode,
      kind,
      title: item.title || "",
      subtitle: item.subtitle || "",
      body: item.body || "",
      label: item.label || "",
      author: item.author || "",
      templateId: overrideTid || "",
      clearMode: overrides.clearMode || "none",
      animation: overrides.animation || layoutCfg?.entrance || styleRef.current.entrance || "slide-up",
      transition: overrides.transition || layoutCfg?.contentTransition || "fade",
      transitionDuration: layoutCfg?.transitionDuration || (targetMode === "fullScreen" ? 400 : 250),
      transitionEasing: layoutCfg?.transitionEasing || "ease-out",
      theme: activeTheme,
      style: styleRef.current,
    };
  }, [getThemeForKind]);

  const show = useCallback((item, overrides = {}) => {
    if (!item) return;
    const payload = buildShowPayload(item, overrides);
    liveRef.current = payload;
    setLive(payload);
    emit("selah:show", payload);
    if (payload.title || payload.body) {
      recentItems.current = [
        { kind: payload.kind, title: payload.title, subtitle: payload.subtitle, body: payload.body, label: payload.label },
        ...recentItems.current.filter((r) => !(r.title === payload.title && r.body === payload.body)),
      ].slice(0, 8);
    }
    broadcastState();
  }, [buildShowPayload, emit, broadcastState]);

  /**
   * V1.1 BUG 1: Updates the overlay IMMEDIATELY while live with `selah:update` (no hide/show, no entrance replay).
   * Debounced ~75ms so rapid arrow-key presses send only the latest verse cleanly.
   */
  const updateLive = useCallback((item, { force = false, immediate = false, overrides = {} } = {}) => {
    if (!item) return;
    const isCurrentlyLive = !!liveRef.current;
    if (!isCurrentlyLive && !force) return;
    if (isCurrentlyLive && !liveFollowRef.current && !force) return;

    const sendNow = () => {
      const payload = buildShowPayload(item, overrides);
      if (isCurrentlyLive) {
        liveRef.current = payload;
        setLive(payload);
        emit("selah:update", payload);
      } else if (force) {
        liveRef.current = payload;
        setLive(payload);
        emit("selah:show", payload);
      }
      if (payload.title || payload.body) {
        recentItems.current = [
          { kind: payload.kind, title: payload.title, subtitle: payload.subtitle, body: payload.body, label: payload.label },
          ...recentItems.current.filter((r) => !(r.title === payload.title && r.body === payload.body)),
        ].slice(0, 8);
      }
      broadcastState();
    };

    clearTimeout(debounceTimerRef.current);
    if (immediate) sendNow();
    else debounceTimerRef.current = setTimeout(sendNow, 75);
  }, [buildShowPayload, emit, broadcastState]);

  const takeLive = useCallback((item) => {
    if (!item) return;
    updateLive(item, { force: true, immediate: true });
  }, [updateLive]);

  const hide = useCallback(() => {
    clearTimeout(debounceTimerRef.current);
    liveRef.current = null;
    setLive(null);
    emit("selah:hide");
    broadcastState();
  }, [emit, broadcastState]);

  // Clear controls (V1.1 §3.6 Tier 1 #6)
  const clearText = useCallback(() => {
    const base = liveRef.current || { kind: "text", title: "", subtitle: "", body: "" };
    const payload = buildShowPayload({ ...base, title: "", subtitle: "", body: "", label: "" }, { clearMode: "clearText" });
    liveRef.current = payload;
    setLive(payload);
    emit(liveRef.current ? "selah:update" : "selah:show", payload);
    broadcastState();
  }, [buildShowPayload, emit, broadcastState]);

  const blackout = useCallback(() => {
    const payload = buildShowPayload({ kind: "text", title: "", subtitle: "", body: "" }, { mode: "fullScreen", clearMode: "blackout" });
    liveRef.current = payload;
    setLive(payload);
    emit("selah:show", payload);
    broadcastState();
  }, [buildShowPayload, emit, broadcastState]);

  const logoScreen = useCallback(() => {
    const payload = buildShowPayload({ kind: "text", title: "", subtitle: "", body: "" }, { mode: "fullScreen", clearMode: "logoScreen" });
    liveRef.current = payload;
    setLive(payload);
    emit("selah:show", payload);
    broadcastState();
  }, [buildShowPayload, emit, broadcastState]);

  const setMode = useCallback((nextMode) => {
    modeRef.current = nextMode;
    setModeState(nextMode);
    if (liveRef.current && liveFollowRef.current) {
      updateLive(liveRef.current, { force: true, immediate: true, overrides: { mode: nextMode } });
    } else {
      broadcastState();
    }
  }, [updateLive, broadcastState]);

  const setLiveFollow = useCallback((val) => {
    liveFollowRef.current = !!val;
    setLiveFollowState(!!val);
    setKey("settings", "liveFollow", !!val);
    broadcastState();
  }, [broadcastState]);

  const setLyricsLinesPerSlide = useCallback((n) => {
    const clamped = Math.max(1, Math.min(6, Number(n) || 2));
    setLyricsLinesPerSlideState(clamped);
    setKey("settings", "lyricsLinesPerSlide", clamped);
  }, []);

  const setScriptureRangeSplit = useCallback((v) => {
    setScriptureRangeSplitState(!!v);
    setKey("settings", "scriptureRangeSplit", !!v);
  }, []);

  const pushStyle = useCallback((s, activeTheme = null) => {
    emit("selah:style", { style: s, theme: activeTheme || getThemeForKind(liveRef.current?.kind || "scripture") });
  }, [emit, getThemeForKind]);

  const saveStyle = useCallback((patch) => {
    setStyleState((st) => {
      const n = { ...st, ...patch };
      styleRef.current = n;
      setKey("settings", "style", n);
      pushStyle(n);
      if (liveRef.current) updateLive(liveRef.current, { force: true, immediate: true });
      return n;
    });
  }, [pushStyle, updateLive]);

  const previewStyle = useCallback((patch) => setStyleState((st) => ({ ...st, ...patch })), []);

  // ---- Account sync (V1.2 §5.3)
  const syncNow = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncStatus("offline");
      return { status: "offline" };
    }
    setSyncStatus("syncing");
    const res = await runAccountSync({
      style: styleRef.current,
      activeThemeIds: activeThemeIdsRef.current,
      favSongs: favSongsRef.current,
      songStats: songStatsRef.current,
      songThemeOverrides: songThemeOverridesRef.current,
      customSongs: customSongsRef.current,
      recent: recentRef.current,
      pinned: pinnedRef.current,
      savedTexts: savedTextsRef.current,
      customThemes: themesRef.current.filter((t) => !t.builtIn),
      updatedAt: localUpdatedAtRef.current,
    });
    setSyncStatus(res.status || "local");
    if (res.syncedAt) setLastSyncedAt(res.syncedAt);
    if (res.merged) {
      if (res.merged.style) {
        setStyleState(res.merged.style);
        styleRef.current = res.merged.style;
        setKey("settings", "style", res.merged.style);
      }
      if (res.merged.activeThemeIds) {
        setActiveThemeIds(res.merged.activeThemeIds);
        setKey("settings", "activeThemeIds", res.merged.activeThemeIds);
      }
      if (res.merged.favSongs) {
        setFavSongs(res.merged.favSongs);
        setKey("lists", "favSongs", res.merged.favSongs);
      }
      if (res.merged.songStats) {
        setSongStats(res.merged.songStats);
        setKey("lists", "songStats", res.merged.songStats);
      }
      if (res.merged.songThemeOverrides) {
        setSongThemeOverrides(res.merged.songThemeOverrides);
        setKey("lists", "songThemeOverrides", res.merged.songThemeOverrides);
      }
      if (res.merged.customSongs) {
        setCustomSongs(res.merged.customSongs);
        setKey("lists", "customSongs", res.merged.customSongs);
      }
      if (res.merged.recent) {
        setRecent(res.merged.recent);
        setKey("lists", "recent", res.merged.recent);
      }
      if (res.merged.pinned) {
        setPinned(res.merged.pinned);
        setKey("lists", "pinned", res.merged.pinned);
      }
      if (res.merged.savedTexts) {
        setSavedTexts(res.merged.savedTexts);
      }
      if (res.merged.customThemes) {
        const activeCustom = res.merged.customThemes.filter((t) => !t.deleted);
        const nextThemes = [...DEFAULT_THEMES, ...activeCustom];
        setThemes(nextThemes);
        themesRef.current = nextThemes;
      }
      if (res.merged.downloadedAssets) {
        setAssetsMap((m) => ({ ...m, ...res.merged.downloadedAssets }));
      }
      if (res.remoteChanged) {
        setSyncNotice("Updated from another device.");
        setTimeout(() => setSyncNotice(""), 6000);
      }
    }
    return res;
  }, []);

  const markDirtyForSync = useCallback(() => {
    const now = new Date().toISOString();
    localUpdatedAtRef.current = now;
    setKey("settings", "localUpdatedAt", now);
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (typeof navigator !== "undefined" && navigator.onLine) syncNow();
    }, 3500);
  }, [syncNow]);

  // Run initial sync on boot & when connection returns
  useEffect(() => {
    if (!ready) return;
    if (online) syncNow();
    else setSyncStatus("offline");
  }, [ready, online, syncNow]);

  // ---- Theme CRUD (V1.2 §5.2 — built-ins read-only, unique names enforced)
  const saveTheme = useCallback(async (rawTheme) => {
    const builtInIds = new Set(DEFAULT_THEMES.map((t) => t.id));
    if (rawTheme?.builtIn || builtInIds.has(rawTheme?.id)) {
      throw new Error("Built-in templates cannot be overwritten. Save as a new template with a unique name.");
    }
    const trimmedName = String(rawTheme?.name || "").trim();
    if (!trimmedName || trimmedName.length > 60) {
      throw new Error("Template name must be 1–60 characters.");
    }
    if (isTemplateNameTaken(trimmedName, themesRef.current, rawTheme?.id)) {
      throw new Error("That name already exists. Choose a different name.");
    }
    const valid = sanitizeTheme({
      ...rawTheme,
      name: trimmedName,
      builtIn: false,
      deleted: false,
      updatedAt: new Date().toISOString(),
    });
    await setKey("themes", valid.id, valid);
    setThemes((list) => {
      const idx = list.findIndex((t) => t.id === valid.id);
      const next = idx >= 0 ? list.map((t, i) => (i === idx ? valid : t)) : [...list, valid];
      themesRef.current = next;
      return next;
    });
    pushStyle(styleRef.current, valid);
    if (liveRef.current) updateLive(liveRef.current, { force: true, immediate: true });
    broadcastState();
    markDirtyForSync();
    return valid;
  }, [pushStyle, updateLive, broadcastState, markDirtyForSync]);

  const deleteTheme = useCallback(async (id) => {
    const target = themesRef.current.find((t) => t.id === id);
    if (!target || target.builtIn || DEFAULT_THEMES.some((d) => d.id === id)) return false;
    // Soft-delete tombstone for cross-device sync
    await setKey("themes", id, { ...target, deleted: true, updatedAt: new Date().toISOString() });
    setThemes((list) => {
      const next = list.filter((t) => t.id !== id);
      themesRef.current = next;
      return next;
    });
    broadcastState();
    markDirtyForSync();
    return true;
  }, [broadcastState, markDirtyForSync]);

  const bumpThemeUse = useCallback((themeId) => {
    setThemes((list) => {
      const next = list.map((t) => (t.id === themeId ? { ...t, useCount: (t.useCount || 0) + 1 } : t));
      themesRef.current = next;
      const updated = next.find((t) => t.id === themeId);
      if (updated && !updated.builtIn) setKey("themes", updated.id, updated);
      return next;
    });
  }, []);

  const selectThemeForSlot = useCallback((slot, themeId) => {
    bumpThemeUse(themeId);
    setActiveThemeIds((prev) => {
      const next = { ...prev, [slot]: themeId };
      activeThemeIdsRef.current = next;
      setKey("settings", "activeThemeIds", next);
      const th = themesRef.current.find((t) => t.id === themeId);
      if (th) pushStyle(styleRef.current, th);
      if (liveRef.current) updateLive(liveRef.current, { force: true, immediate: true });
      broadcastState();
      markDirtyForSync();
      return next;
    });
  }, [bumpThemeUse, pushStyle, updateLive, broadcastState, markDirtyForSync]);

  // ---- Saved Texts CRUD (V1.2 §5.1 — offline-first, max 300, title <= 100, body <= 10000)
  const saveTextItem = useCallback(async (input) => {
    const title = String(input?.title || "").trim().slice(0, 100);
    const body = String(input?.body || "").slice(0, 10000);
    if (!title) throw new Error("Title is required (1–100 characters).");
    const activeCount = savedTextsRef.current.filter((t) => !t.deleted).length;
    const isNew = !input.id || !savedTextsRef.current.some((t) => t.id === input.id);
    if (isNew && activeCount >= 300) throw new Error("Maximum 300 saved texts per account reached.");
    const now = new Date().toISOString();
    const existing = savedTextsRef.current.find((t) => t.id === input.id);
    const rec = {
      id: input.id || `txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      body,
      tags: Array.isArray(input.tags) ? input.tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : (existing?.tags || []),
      favourite: input.favourite !== undefined ? !!input.favourite : (existing?.favourite || false),
      templateId: input.templateId !== undefined ? String(input.templateId || "") : (existing?.templateId || ""),
      useCount: existing?.useCount || 0,
      lastUsedAt: existing?.lastUsedAt || "",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deleted: false,
    };
    await setKey("savedTexts", rec.id, rec);
    setSavedTexts((list) => {
      const idx = list.findIndex((x) => x.id === rec.id);
      const next = idx >= 0 ? list.map((x, i) => (i === idx ? rec : x)) : [rec, ...list];
      savedTextsRef.current = next;
      return next;
    });
    markDirtyForSync();
    return rec;
  }, [markDirtyForSync]);

  const deleteTextItem = useCallback(async (id) => {
    const existing = savedTextsRef.current.find((t) => t.id === id);
    if (!existing) return;
    const tomb = { ...existing, deleted: true, updatedAt: new Date().toISOString() };
    await setKey("savedTexts", id, tomb);
    setSavedTexts((list) => {
      const next = list.map((x) => (x.id === id ? tomb : x));
      savedTextsRef.current = next;
      return next;
    });
    markDirtyForSync();
  }, [markDirtyForSync]);

  const toggleFavText = useCallback(async (id) => {
    const existing = savedTextsRef.current.find((t) => t.id === id);
    if (!existing) return;
    const updated = { ...existing, favourite: !existing.favourite, updatedAt: new Date().toISOString() };
    await setKey("savedTexts", id, updated);
    setSavedTexts((list) => {
      const next = list.map((x) => (x.id === id ? updated : x));
      savedTextsRef.current = next;
      return next;
    });
    markDirtyForSync();
  }, [markDirtyForSync]);

  const bumpTextUse = useCallback(async (id) => {
    const existing = savedTextsRef.current.find((t) => t.id === id);
    if (!existing) return;
    const now = new Date().toISOString();
    const updated = { ...existing, useCount: (existing.useCount || 0) + 1, lastUsedAt: now, updatedAt: now };
    await setKey("savedTexts", id, updated);
    setSavedTexts((list) => {
      const next = list.map((x) => (x.id === id ? updated : x));
      savedTextsRef.current = next;
      return next;
    });
    markDirtyForSync();
  }, [markDirtyForSync]);

  // ---- Song stats & per-song template override (V1.2 §3.3 & §6)
  const bumpSongUse = useCallback((songId) => {
    if (!songId) return;
    setSongStats((prev) => {
      const cur = prev[songId] || { useCount: 0, lastUsedAt: "" };
      const next = { ...prev, [songId]: { useCount: (cur.useCount || 0) + 1, lastUsedAt: new Date().toISOString() } };
      songStatsRef.current = next;
      setKey("lists", "songStats", next);
      return next;
    });
    markDirtyForSync();
  }, [markDirtyForSync]);

  const setSongThemeOverride = useCallback((songId, themeId) => {
    if (!songId) return;
    setSongThemeOverrides((prev) => {
      const next = { ...prev };
      if (!themeId) delete next[songId];
      else next[songId] = themeId;
      songThemeOverridesRef.current = next;
      setKey("lists", "songThemeOverrides", next);
      return next;
    });
    markDirtyForSync();
  }, [markDirtyForSync]);

  const stepLive = useCallback((dir) => {
    window.dispatchEvent(new CustomEvent("selah-dock-step", { detail: dir }));
  }, []);

  // ---- OBS connection & protocol event listener
  const saveObsConf = useCallback((patch) => setObsConf((c) => { const n = { ...c, ...patch }; setKey("settings", "obs", n); return n; }), []);

  const connectObs = useCallback(async (conf) => {
    const c = conf || obsConfRef.current;
    setObsStatus("connecting"); setObsError("");
    try {
      await obs.current.connect(c);
      setObsStatus("connected");
      setTimeout(() => {
        pushStyle(styleRef.current);
        syncAllAssetsToOverlay(false);
        broadcastState();
      }, 300);
      return true;
    } catch (e) {
      setObsStatus("error"); setObsError(e.message || "notRunning");
      return false;
    }
  }, [pushStyle, syncAllAssetsToOverlay, broadcastState]);

  // Handle incoming OBS CustomEvents AND BroadcastChannel messages (dock & overlay)
  useEffect(() => {
    const handleIncoming = (d) => {
      const pairId = obsConfRef.current.pairId;
      if (!isSelah(d, pairId)) return;

      if (d.type === "selah:ping") {
        emit("selah:pong", { appVersion: APP_VERSION, live: !!liveRef.current, recent: recentItems.current });
        broadcastState();
      } else if (d.type === "selah:overlay-hello") {
        emit("selah:overlay-ok");
        pushStyle(styleRef.current);
        syncAllAssetsToOverlay(true);
        if (liveRef.current) emit("selah:show", liveRef.current);
        window.dispatchEvent(new CustomEvent("selah-overlay-ok"));
      } else if (d.type === "selah:asset-ack" && d.assetId) {
        ackedAssetsRef.current.add(d.assetId);
      } else if (d.type === "selah:search") {
        // Dock remote search through app's IndexedDB packs + saved texts (V1.1 §4.3 + V1.2.1)
        const biblesList = packsRef.current.filter((p) => p.type === "bible");
        const songsList = packsRef.current.filter((p) => p.type === "songpack");
        const allTexts = [
          ...savedTextsRef.current.filter((t) => !t.deleted).map((t) => ({ id: t.id, title: t.title, body: t.body, templateId: t.templateId || "" })),
          ...recentTextsRef.current,
        ];
        const res = unifiedSearch({
          packs: biblesList,
          selectedPackId: d.version || activeBibleIdRef.current || biblesList[0]?.id,
          songPacks: songsList,
          customSongs: customSongsRef.current,
          recentTexts: allTexts,
          query: d.query || "",
          scope: d.scope || "all",
          limit: Math.min(20, Number(d.limit) || 20),
        });
        emit("selah:results", {
          reqId: d.reqId,
          results: res.results.map((r) => ({
            id: r.id,
            kind: r.kind,
            title: r.title,
            subtitle: r.subtitle || "",
            body: (r.body || "").slice(0, 600),
            label: r.label || "",
            book: r.book,
            chapter: r.chapter,
            verse: r.verse,
            code: r.code,
            songId: r.songId,
            slideIndex: r.slideIndex,
          })),
          parsed: res.parsed,
          scopeUsed: res.scopeUsed,
        });
      } else if (d.type === "selah:command") {
        const cmd = d.cmd;
        if (cmd === "show" && d.item) show(d.item);
        else if (cmd === "takeLive" && d.item) takeLive(d.item);
        else if (cmd === "select" && d.item) {
          if (liveRef.current && liveFollowRef.current) updateLive(d.item, { immediate: true });
          window.dispatchEvent(new CustomEvent("selah-dock-select", { detail: d.item }));
        } else if (cmd === "hide") hide();
        else if (cmd === "next") window.dispatchEvent(new CustomEvent("selah-dock-step", { detail: 1 }));
        else if (cmd === "prev") window.dispatchEvent(new CustomEvent("selah-dock-step", { detail: -1 }));
        else if (cmd === "setMode" && (d.mode === "lowerThird" || d.mode === "fullScreen")) setMode(d.mode);
        else if (cmd === "setFollow") setLiveFollow(!!d.follow);
        else if (cmd === "setVersion" && d.version) {
          setActiveBibleId(d.version);
          window.dispatchEvent(new CustomEvent("selah-dock-version", { detail: d.version }));
        } else if (cmd === "setTheme" && d.themeId) {
          const th = themesRef.current.find((t) => t.id === d.themeId);
          if (th) selectThemeForSlot(th.slot, th.id);
        } else if (cmd === "clearText") clearText();
        else if (cmd === "blackout") blackout();
        else if (cmd === "logoScreen") logoScreen();
        else if (cmd === "saveText" && d.body) {
          const autoTitle = String(d.title || "").trim() || String(d.body || "").trim().split("\n")[0].slice(0, 60) || "Saved Text";
          saveTextItem({
            title: autoTitle,
            body: String(d.body || "").trim(),
            tags: ["Saved"],
            favourite: !!d.favourite,
          }).then((saved) => {
            broadcastState();
            if (d.pushLive && saved) {
              takeLive({ kind: "text", title: saved.title, subtitle: "", body: saved.body, templateId: saved.templateId || "" });
            }
          }).catch(() => {});
        }
      } else if (d.type === "selah:dock-show" && d.item) {
        show(d.item);
      } else if (d.type === "selah:dock-hide") {
        hide();
      } else if (d.type === "selah:dock-step") {
        window.dispatchEvent(new CustomEvent("selah-dock-step", { detail: d.dir }));
      } else if (d.type === "selah:suggest-action") {
        // Explicit operator click inside OBS Dock suggestion strip (SG-8, PRD §7)
        window.dispatchEvent(
          new CustomEvent("selah-dock-suggest-action", {
            detail: {
              action: d.action,
              suggestionId: d.suggestionId,
              item: d.item || null,
            },
          })
        );
        if (d.action === "show" && d.item) {
          if (liveRef.current) takeLive(d.item);
          else show(d.item);
        } else if (d.action === "preview" && d.item) {
          window.dispatchEvent(new CustomEvent("selah-dock-select", { detail: d.item }));
        }
      }
    };

    const unsubObs = obs.current ? obs.current.on((ev) => {
      if (ev.type === "closed") { setObsStatus("disconnected"); return; }
      if (ev.type === "event" && ev.name === "CustomEvent") handleIncoming(ev.data);
    }) : () => { };

    if (bc.current) bc.current.onmessage = (e) => handleIncoming(e.data);
    return () => { unsubObs(); };
  }, [emit, broadcastState, pushStyle, syncAllAssetsToOverlay, show, takeLive, updateLive, hide, setMode, setLiveFollow, selectThemeForSlot, clearText, blackout, logoScreen]);

  // ---- lists
  const addRecent = useCallback((label) => setRecent((r) => { const n = [label, ...r.filter((x) => x !== label)].slice(0, 8); setKey("lists", "recent", n); return n; }), []);
  const togglePin = useCallback((label) => setPinned((p) => { const n = p.includes(label) ? p.filter((x) => x !== label) : [label, ...p].slice(0, 10); setKey("lists", "pinned", n); return n; }), []);
  const toggleFavSong = useCallback((id) => setFavSongs((f) => { const n = f.includes(id) ? f.filter((x) => x !== id) : [...f, id]; setKey("lists", "favSongs", n); return n; }), []);
  const addCustomSong = useCallback((song) => setCustomSongs((s) => { const n = [{ ...song, id: "c" + Date.now(), custom: true }, ...s]; setKey("lists", "customSongs", n); return n; }), []);
  const addRecentText = useCallback((t) => setRecentTexts((r) => { const n = [t, ...r.filter((x) => x.body !== t.body)].slice(0, 6); setKey("lists", "recentTexts", n); return n; }), []);
  const finishSetup = useCallback(() => { setSetupDone(true); setKey("settings", "setupDone", true); }, []);
  const changeTheme = useCallback((t) => { setTheme(t); setKey("settings", "theme", t); }, []);

  // ---- manifest + packs
  const refreshManifest = useCallback(async () => {
    try {
      const r = await fetch("/api/manifest", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const m = await r.json(); setManifest(m); return m;
    } catch { return null; }
  }, []);
  useEffect(() => { if (!ready) return; refreshManifest(); const t = setInterval(() => navigator.onLine && refreshManifest(), 30 * 60 * 1000); return () => clearInterval(t); }, [ready, refreshManifest]);

  const installPack = useCallback(async (entry) => {
    setDownloads((d) => ({ ...d, [entry.id]: 0.02 }));
    try {
      const res = await fetch(entry.url);
      if (!res.ok) throw new Error("download");
      const total = +res.headers.get("content-length") || entry.sizeBytes || 1;
      const reader = res.body.getReader(); const chunks = []; let got = 0;
      for (; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        setDownloads((d) => ({ ...d, [entry.id]: Math.min(0.95, got / total) }));
      }
      const rawBytes = new Uint8Array(got);
      let o = 0;
      chunks.forEach((c) => { rawBytes.set(c, o); o += c.length; });

      let bytes = rawBytes;
      const isGzipMagic = rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b;
      if (isGzipMagic) {
        bytes = gunzipSync(rawBytes);
      } else if (entry.url.endsWith(".zip")) {
        const z = unzipSync(rawBytes);
        const firstJson = Object.entries(z).find(([name]) => name.endsWith(".json"));
        if (!firstJson) throw new Error("zip_empty");
        bytes = firstJson[1];
      }

      if (entry.sha256) {
        const [hexDecompressed, hexRaw] = await Promise.all([sha256Hex(bytes), sha256Hex(rawBytes)]);
        if (hexDecompressed !== entry.sha256 && hexRaw !== entry.sha256) throw new Error("checksum");
      }

      const data = JSON.parse(new TextDecoder().decode(bytes));
      const storeKey = `${entry.type}:${entry.id}`;
      const existing = await getKey("packs", storeKey, null);
      const previousPack = existing && existing.version !== entry.version ? { ...existing, previousPack: null } : existing?.previousPack || null;

      await setKey("packs", storeKey, {
        ...data,
        id: entry.id,
        type: entry.type,
        name: entry.name,
        version: entry.version,
        previousPack,
      });
      const updatedPacks = await allPacks();
      setPacks(updatedPacks);
      if (entry.type === "bible" && !activeBibleIdRef.current) setActiveBibleId(entry.id);
      setDownloads((d) => { const n = { ...d }; delete n[entry.id]; return n; });

      fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "download", packId: entry.id }),
      }).catch(() => { });

      return true;
    } catch {
      setDownloads((d) => { const n = { ...d }; delete n[entry.id]; return n; });
      return false;
    }
  }, []);

  const rollbackPack = useCallback(async (p) => {
    if (!p?.previousPack) return false;
    await setKey("packs", p.key, { ...p.previousPack, previousPack: null });
    setPacks(await allPacks());
    return true;
  }, []);

  const removePack = useCallback(async (p) => { await (await db()).delete("packs", p.key); setPacks(await allPacks()); }, []);

  const updates = useMemo(() => {
    if (!manifest) return [];
    return (manifest.packs || []).filter((m) => {
      const have = packs.find((p) => p.id === m.id && p.type === m.type);
      return !have || have.version !== m.version;
    });
  }, [manifest, packs]);

  useEffect(() => {
    setNotices(
      updates
        .filter((u) => u.notify !== false)
        .map((u) => ({
          id: u.id + u.version,
          entry: u,
          title: packs.find((p) => p.id === u.id) ? `Update: ${u.name}` : `New ${u.type === "bible" ? "Bible version" : "song pack"}: ${u.name}`,
          text: u.notes || "Ready to download.",
          time: "Today",
          unread: true,
        }))
    );
  }, [updates, packs]);

  const value = {
    ready, obs: obs.current, obsConf, saveObsConf, obsStatus, obsError, connectObs, online,
    style, saveStyle, previewStyle,
    themes, activeThemeIds, getThemeForKind, saveTheme, deleteTheme, selectThemeForSlot, bumpThemeUse,
    assetsMap, saveAsset, streamAssetToOverlay,
    mode, setMode, live, liveFollow, setLiveFollow,
    show, updateLive, takeLive, hide, clearText, blackout, logoScreen, emit, stepLive,
    activeBibleId, setActiveBibleId,
    lyricsLinesPerSlide, setLyricsLinesPerSlide,
    scriptureRangeSplit, setScriptureRangeSplit,
    packs, bibles: packs.filter((p) => p.type === "bible"), songPacks: packs.filter((p) => p.type === "songpack"),
    manifest, updates, notices, installPack, rollbackPack, removePack, downloads, refreshManifest,
    recent, addRecent, pinned, togglePin, favSongs, toggleFavSong, songStats, bumpSongUse, songThemeOverrides, setSongThemeOverride,
    customSongs, addCustomSong, recentTexts, addRecentText,
    savedTexts: savedTexts.filter((t) => !t.deleted), saveTextItem, deleteTextItem, toggleFavText, bumpTextUse,
    syncStatus, lastSyncedAt, syncNotice, syncNow,
    setupDone, finishSetup, theme, changeTheme,
  };
  return (
    <Ctx.Provider value={value}>
      <VoiceProvider
        bibles={value.bibles}
        activeBibleId={activeBibleId}
        songPacks={value.songPacks}
        customSongs={customSongs}
        savedTexts={value.savedTexts}
        lyricsLinesPerSlide={lyricsLinesPerSlide}
        emit={emit}
      >
        {children}
      </VoiceProvider>
    </Ctx.Provider>
  );
}
