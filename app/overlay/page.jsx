"use client";
import { useEffect, useRef, useState } from "react";
import { OverlayStage } from "@/components/Overlay";
import { ObsClient, isSelah } from "@/lib/obs";
import { DEFAULT_STYLE } from "@/lib/defaults";

// Browser Source page (1920x1080, transparent). A dumb renderer: it holds no library data.
// URL: /overlay?pair=CODE#pw=OBS_PASSWORD   (the hash never leaves the machine)
export default function Overlay() {
  const [item, setItem] = useState(null); const [out, setOut] = useState(false);
  const [style, setStyle] = useState(DEFAULT_STYLE); const [key, setKey] = useState(0);
  const pairRef = useRef("");

  useEffect(() => {
    document.documentElement.style.background = "transparent"; document.body.style.background = "transparent";
    const pair = new URLSearchParams(location.search).get("pair") || ""; pairRef.current = pair;
    const pw = new URLSearchParams(location.hash.slice(1)).get("pw") || "";
    const handle = (d) => {
      if (!isSelah(d, pair)) return;
      if (d.type === "selah:show") { setOut(false); setItem(d); setStyle((s) => s); setKey((k) => k + 1); }
      else if (d.type === "selah:hide") { setOut(true); setTimeout(() => setItem((cur) => (cur ? null : cur)), 320); }
      else if (d.type === "selah:style") setStyle({ ...DEFAULT_STYLE, ...d.style });
    };
    const bc = "BroadcastChannel" in window ? new BroadcastChannel("selah-live") : null;
    if (bc) bc.onmessage = (e) => handle(e.data);
    const obs = new ObsClient(); let stop = false;
    const unsub = obs.on((ev) => { if (ev.type === "event" && ev.name === "CustomEvent") handle(ev.data); if (ev.type === "closed" && !stop) setTimeout(connect, 3000); });
    const connect = () => obs.connect({ password: pw }).then(() => obs.send("selah:overlay-hello", pair)).catch(() => !stop && setTimeout(connect, 3000));
    connect();
    return () => { stop = true; unsub(); obs.close(); bc && bc.close(); };
  }, []);

  if (!item) return <div style={{ width: 1920, height: 1080 }} />;
  return <div style={{ position: "relative", width: 1920, height: 1080, overflow: "hidden" }} className={out ? "ov-out-wrap" : ""}><div className={out ? "ov-out" : ""} style={{ position: "absolute", inset: 0 }}><OverlayStage item={item} style={{ ...style, entrance: item.animation }} animKey={key} /></div></div>;
}
