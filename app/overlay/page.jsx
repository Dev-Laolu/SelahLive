"use client";
import { useEffect, useRef, useState } from "react";
import { openDB } from "idb";
import { OverlayStage } from "@/components/Overlay";
import { ObsClient, isSelah } from "@/lib/obs";
import { DEFAULT_STYLE } from "@/lib/defaults";

const MAX_ASSET_BYTES = 1024 * 1024; // 1 MB hard limit on overlay side too (V1.1 §3.5)

async function openOverlayAssetDb() {
  return openDB("selah-overlay-assets", 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("assets")) d.createObjectStore("assets");
    },
  });
}

async function sha256Hex(bytes) {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Browser Source page (1920x1080, transparent). Dumb renderer: holds no library data, caches assets by sha256.
// URL: /overlay?pair=CODE#pw=OBS_PASSWORD   (the hash never leaves the machine)
export default function Overlay() {
  const [item, setItem] = useState(null);
  const [visible, setVisible] = useState(false);
  const [out, setOut] = useState(false);
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [theme, setTheme] = useState(null);
  const [assetsMap, setAssetsMap] = useState({});
  const [enterKey, setEnterKey] = useState(0);
  const [contentKey, setContentKey] = useState(0);

  const pairRef = useRef("");
  const lastSeqRef = useRef(0);
  const visibleRef = useRef(false);
  const hideTimerRef = useRef(null);
  const chunkBuffersRef = useRef(new Map()); // assetId -> { total, mime, parts: [] }

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const pair = new URLSearchParams(location.search).get("pair") || "";
    pairRef.current = pair;
    const pw = new URLSearchParams(location.hash.slice(1)).get("pw") || "";

    // Load cached assets from overlay's IndexedDB on boot
    let assetDbPromise = null;
    (async () => {
      try {
        assetDbPromise = openOverlayAssetDb();
        const db = await assetDbPromise;
        const keys = await db.getAllKeys("assets");
        const loaded = {};
        for (const k of keys) {
          const rec = await db.get("assets", k);
          if (rec?.dataUrl) loaded[k] = rec.dataUrl;
        }
        setAssetsMap(loaded);
      } catch {}
    })();

    const bc = "BroadcastChannel" in window ? new BroadcastChannel("selah-live") : null;
    const obs = new ObsClient();

    const reply = (type, payload = {}) => {
      const msg = { app: "selah-live", v: 1, pairId: pair, type, ...payload };
      try { bc && bc.postMessage(msg); } catch {}
      if (obs.connected) obs.send(type, pair, payload).catch(() => {});
    };

    const handleAssetChunk = async (d) => {
      const { assetId, index, total, mime, data } = d;
      if (!assetId || typeof data !== "string" || !total || total > 12) return;
      if (!chunkBuffersRef.current.has(assetId)) {
        chunkBuffersRef.current.set(assetId, { total, mime: mime || "image/png", parts: new Array(total) });
      }
      const buf = chunkBuffersRef.current.get(assetId);
      buf.parts[index] = data;
      if (buf.parts.filter((p) => typeof p === "string").length === buf.total) {
        chunkBuffersRef.current.delete(assetId);
        try {
          const fullB64 = buf.parts.join("");
          const bin = Uint8Array.from(atob(fullB64), (c) => c.charCodeAt(0));
          if (bin.byteLength > MAX_ASSET_BYTES) return; // Enforce 1 MB limit on overlay side
          const hash = await sha256Hex(bin);
          if (hash !== assetId) return; // Integrity check failed
          const dataUrl = `data:${buf.mime};base64,${fullB64}`;
          setAssetsMap((m) => ({ ...m, [assetId]: dataUrl }));
          if (assetDbPromise) {
            const db = await assetDbPromise;
            await db.put("assets", { assetId, dataUrl, mime: buf.mime }, assetId);
          }
          reply("selah:asset-ack", { assetId });
        } catch {}
      }
    };

    const handle = (d) => {
      if (!isSelah(d, pair)) return;

      if (d.type === "selah:asset") {
        handleAssetChunk(d);
        return;
      }

      // Enforce monotonic `seq` ordering on content events (V1.1 §1.3)
      if (typeof d.seq === "number" && ["selah:show", "selah:update", "selah:hide"].includes(d.type)) {
        if (d.seq <= lastSeqRef.current) return;
        lastSeqRef.current = d.seq;
      }

      if (d.type === "selah:show") {
        clearTimeout(hideTimerRef.current);
        setOut(false);
        if (d.style) setStyle({ ...DEFAULT_STYLE, ...d.style });
        if (d.theme) setTheme(d.theme);
        setItem(d);
        const wasVisible = visibleRef.current;
        visibleRef.current = true;
        setVisible(true);
        if (!wasVisible) setEnterKey((k) => k + 1);
        setContentKey((k) => k + 1);
      } else if (d.type === "selah:update") {
        // V1.1 §1.3: if hidden, store silently without displaying; if visible, update content smoothly without replaying entrance!
        if (d.style) setStyle({ ...DEFAULT_STYLE, ...d.style });
        if (d.theme) setTheme(d.theme);
        setItem(d);
        if (visibleRef.current) {
          clearTimeout(hideTimerRef.current);
          setOut(false);
          setContentKey((k) => k + 1);
        }
      } else if (d.type === "selah:hide") {
        visibleRef.current = false;
        setOut(true);
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          if (!visibleRef.current) {
            setVisible(false);
            setItem(null);
          }
        }, 320);
      } else if (d.type === "selah:style") {
        if (d.style) setStyle({ ...DEFAULT_STYLE, ...d.style });
        if (d.theme) setTheme(d.theme);
      }
    };

    if (bc) bc.onmessage = (e) => handle(e.data);
    let stop = false;
    const unsub = obs.on((ev) => {
      if (ev.type === "event" && ev.name === "CustomEvent") handle(ev.data);
      if (ev.type === "closed" && !stop) setTimeout(connect, 3000);
    });
    const connect = () =>
      obs
        .connect({ password: pw })
        .then(() => reply("selah:overlay-hello"))
        .catch(() => !stop && setTimeout(connect, 3000));
    connect();
    // Also greet over BroadcastChannel for same-browser testing
    reply("selah:overlay-hello");

    return () => {
      stop = true;
      clearTimeout(hideTimerRef.current);
      unsub();
      obs.close();
      bc && bc.close();
    };
  }, []);

  if (!visible || !item) return <div style={{ width: 1920, height: 1080 }} />;
  return (
    <div style={{ position: "relative", width: 1920, height: 1080, overflow: "hidden" }} className={out ? "ov-out-wrap" : ""}>
      <div className={out ? "ov-out" : ""} style={{ position: "absolute", inset: 0 }}>
        <OverlayStage
          item={item}
          style={style}
          theme={theme}
          assetsMap={assetsMap}
          enterKey={enterKey}
          contentKey={contentKey}
        />
      </div>
    </div>
  );
}
