"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ObsClient, isSelah } from "@/lib/obs";
import { getKey, setKey, allPacks, db } from "@/lib/db";
import { DEFAULT_STYLE } from "@/lib/defaults";
import { gunzipSync, unzipSync } from "fflate";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);
const APP_VERSION = "0.1.0";
const rid = () => Math.random().toString(36).slice(2, 8).toUpperCase();

async function sha256Hex(bytes) {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function AppProvider({ children }) {
  const obs = useRef(null);
  if (!obs.current && typeof window !== "undefined") obs.current = new ObsClient();
  const bc = useRef(null);

  const [ready, setReady] = useState(false);
  const [style, setStyleState] = useState(DEFAULT_STYLE);
  const [obsConf, setObsConf] = useState({ host: "localhost", port: 4455, password: "", pairId: "", scene: "" });
  const [obsStatus, setObsStatus] = useState("disconnected"); // disconnected | connecting | connected | error
  const [obsError, setObsError] = useState("");
  const [online, setOnline] = useState(true);
  const [packs, setPacks] = useState([]);              // installed
  const [manifest, setManifest] = useState(null);
  const [live, setLive] = useState(null);              // currently on screen
  const [mode, setMode] = useState("lowerThird");
  const [recent, setRecent] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [favSongs, setFavSongs] = useState([]);
  const [customSongs, setCustomSongs] = useState([]);
  const [recentTexts, setRecentTexts] = useState([]);
  const [notices, setNotices] = useState([]);
  const [setupDone, setSetupDone] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [downloads, setDownloads] = useState({});       // id -> progress 0..1

  // ---- boot: load everything from IndexedDB
  useEffect(() => {
    (async () => {
      const [st, oc, rc, pn, fv, cs, rt, sd, th, sess] = await Promise.all([
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
      ]);
      const mergedStyle = { ...DEFAULT_STYLE, ...st };
      setStyleState(mergedStyle);
      setMode(mergedStyle.layout || "lowerThird");
      setObsConf(oc || { host: "localhost", port: 4455, password: "", pairId: rid() + rid(), scene: "" });
      if (!oc) setKey("settings", "obs", { host: "localhost", port: 4455, password: "", pairId: "", scene: "" });
      setRecent(rc); setPinned(pn); setFavSongs(fv); setCustomSongs(cs); setRecentTexts(rt); setSetupDone(sd); setTheme(th);
      setPacks(await allPacks());
      setOnline(navigator.onLine);
      setReady(true);

      // Anonymous app_open analytics ping (never records verses or songs)
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

  // make sure a pair id exists once settings load
  useEffect(() => {
    if (ready && !obsConf.pairId) { const c = { ...obsConf, pairId: rid() + rid() }; setObsConf(c); setKey("settings", "obs", c); }
  }, [ready, obsConf]);

  useEffect(() => { if (typeof document !== "undefined") document.documentElement.dataset.theme = theme; }, [theme]);

  // ---- OBS
  const saveObsConf = useCallback((patch) => setObsConf((c) => { const n = { ...c, ...patch }; setKey("settings", "obs", n); return n; }), []);

  const connectObs = useCallback(async (conf) => {
    const c = conf || obsConf;
    setObsStatus("connecting"); setObsError("");
    try {
      await obs.current.connect(c);
      setObsStatus("connected");
      return true;
    } catch (e) {
      setObsStatus("error"); setObsError(e.message || "notRunning");
      return false;
    }
  }, [obsConf]);

  // listen for dock pings & overlay hello
  useEffect(() => {
    if (!obs.current) return;
    return obs.current.on((ev) => {
      if (ev.type === "closed") { setObsStatus("disconnected"); return; }
      if (ev.type === "event" && ev.name === "CustomEvent" && isSelah(ev.data, obsConf.pairId)) {
        if (ev.data.type === "selah:ping") obs.current.send("selah:pong", obsConf.pairId, { appVersion: APP_VERSION, live: !!liveRef.current, recent: recentItems.current }).catch(() => { });
        if (ev.data.type === "selah:overlay-hello") { obs.current.send("selah:overlay-ok", obsConf.pairId).catch(() => { }); window.dispatchEvent(new CustomEvent("selah-overlay-ok")); }
        if (ev.data.type === "selah:dock-show" && ev.data.item) window.dispatchEvent(new CustomEvent("selah-dock-show", { detail: ev.data.item }));
        if (ev.data.type === "selah:dock-hide") window.dispatchEvent(new CustomEvent("selah-dock-hide"));
        if (ev.data.type === "selah:dock-step") window.dispatchEvent(new CustomEvent("selah-dock-step", { detail: ev.data.dir }));
      }
    });
  }, [obsConf.pairId]);

  // ---- sending to overlay (OBS custom event + BroadcastChannel for same-browser preview)
  const liveRef = useRef(null);
  const recentItems = useRef([]);
  const emit = useCallback((type, payload = {}) => {
    const msg = { app: "selah-live", v: 1, pairId: obsConf.pairId, type, ...payload };
    try { bc.current && bc.current.postMessage(msg); } catch { }
    if (obs.current && obs.current.connected) obs.current.send(type, obsConf.pairId, payload).catch(() => { });
  }, [obsConf.pairId]);

  const show = useCallback((item) => {
    const payload = { mode, kind: item.kind || "scripture", title: item.title, subtitle: item.subtitle || "", body: item.body, animation: style.entrance, label: item.label || "" };
    liveRef.current = payload; setLive(payload); emit("selah:show", payload);
    recentItems.current = [{ kind: payload.kind, title: payload.title, subtitle: payload.subtitle, body: payload.body, label: payload.label }, ...recentItems.current.filter((r) => !(r.title === payload.title && r.body === payload.body))].slice(0, 8);
  }, [mode, style.entrance, emit]);
  const hide = useCallback(() => { liveRef.current = null; setLive(null); emit("selah:hide"); }, [emit]);

  const pushStyle = useCallback((s) => emit("selah:style", { style: s }), [emit]);
  const saveStyle = useCallback((patch) => setStyleState((st) => { const n = { ...st, ...patch }; setKey("settings", "style", n); pushStyle(n); return n; }), [pushStyle]);
  const previewStyle = useCallback((patch) => setStyleState((st) => ({ ...st, ...patch })), []);

  // dock remote control events
  useEffect(() => {
    const s = (e) => show(e.detail), h = () => hide();
    window.addEventListener("selah-dock-show", s); window.addEventListener("selah-dock-hide", h);
    return () => { window.removeEventListener("selah-dock-show", s); window.removeEventListener("selah-dock-hide", h); };
  }, [show, hide]);

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
      if (entry.url.endsWith(".gz")) {
        bytes = gunzipSync(rawBytes);
      } else if (entry.url.endsWith(".zip")) {
        const z = unzipSync(rawBytes);
        const firstJson = Object.entries(z).find(([name]) => name.endsWith(".json"));
        if (!firstJson) throw new Error("zip_empty");
        bytes = firstJson[1];
      }

      if (entry.sha256) {
        const [hexDecompressed, hexRaw] = await Promise.all([sha256Hex(bytes), sha256Hex(rawBytes)]);
        if (hexDecompressed !== entry.sha256 && hexRaw !== entry.sha256) {
          throw new Error("checksum");
        }
      }

      const data = JSON.parse(new TextDecoder().decode(bytes));
      const storeKey = `${entry.type}:${entry.id}`;
      const existing = await getKey("packs", storeKey, null);
      const previousPack = existing && existing.version !== entry.version ? { ...existing, previousPack: null } : existing?.previousPack || null;

      // Write only after full verification (never overwrite a working pack with a bad one)
      await setKey("packs", storeKey, {
        ...data,
        id: entry.id,
        type: entry.type,
        name: entry.name,
        version: entry.version,
        previousPack,
      });
      setPacks(await allPacks());
      setDownloads((d) => { const n = { ...d }; delete n[entry.id]; return n; });

      // Anonymous download counter ping
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

  useEffect(() => { // turn updates into notifications (respecting notify flag)
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
    style, saveStyle, previewStyle, mode, setMode, live, show, hide, emit,
    packs, bibles: packs.filter((p) => p.type === "bible"), songPacks: packs.filter((p) => p.type === "songpack"),
    manifest, updates, notices, installPack, rollbackPack, removePack, downloads, refreshManifest,
    recent, addRecent, pinned, togglePin, favSongs, toggleFavSong, customSongs, addCustomSong, recentTexts, addRecentText,
    setupDone, finishSetup, theme, changeTheme,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
