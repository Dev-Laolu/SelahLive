"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { ObsClient, isSelah } from "@/lib/obs";

// OBS custom browser dock. A thin remote: pings the app every 3s, expects a pong within 2s (LOCKED fail-safe).
export default function Dock() {
  const [state, setState] = useState("starting"); // starting | ok | noapp | noobs | nopair
  const [recent, setRecent] = useState([]); const [live, setLive] = useState(false); const [q, setQ] = useState("");
  const obsRef = useRef(null); const pairRef = useRef(""); const pongAt = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    const pair = new URLSearchParams(location.search).get("pair") || ""; pairRef.current = pair;
    if (!pair) { setState("nopair"); return; }
    const pw = new URLSearchParams(location.hash.slice(1)).get("pw") || "";
    const obs = new ObsClient(); obsRef.current = obs; let dead = false, timer, connecting = false;
    obs.on((ev) => {
      if (ev.type === "closed") { setState("noobs"); return; }
      if (ev.type === "event" && ev.name === "CustomEvent" && isSelah(ev.data, pair) && ev.data.type === "selah:pong") { pongAt.current = Date.now(); setRecent(ev.data.recent || []); setLive(!!ev.data.live); setState("ok"); }
    });
    const connect = async () => { if (connecting || dead) return; connecting = true; try { await obs.connect({ password: pw }); } catch { setState("noobs"); } connecting = false; };
    const tick = async () => {
      if (dead) return;
      if (!obs.connected) { await connect(); if (!obs.connected) return; }
      const sent = Date.now();
      obs.send("selah:ping", pair).catch(() => {});
      setTimeout(() => { if (!dead && obs.connected && pongAt.current < sent) setState("noapp"); }, 2000);
    };
    connect().then(tick); timer = setInterval(tick, 3000);
    return () => { dead = true; clearInterval(timer); obs.close(); };
  }, []);

  const send = (type, extra) => obsRef.current?.send(type, pairRef.current, extra).catch(() => {});
  const dotCls = state === "ok" ? "ok" : state === "noapp" || state === "starting" ? "warn" : "bad";
  const list = recent.filter((r) => !q || (r.title + r.body).toLowerCase().includes(q.toLowerCase()));

  const Head = <div className="row between"><div className="row" style={{ gap: 8 }}><span className={`dot ${dotCls} ${state === "ok" ? "" : "pulse"}`} /><b style={{ fontFamily: "var(--font-head)" }}>Selah Live</b></div><span className="chip" style={{ fontSize: 11 }}>{state === "noobs" ? "OBS ✕" : "OBS ✓"}</span></div>;

  if (state === "nopair") return <div className="dock">{Head}<div className="dock-state"><div className="big gold"><Icon name="link" /></div><h2 style={{ fontSize: 20 }}>Pairing needed</h2><ol className="muted" style={{ textAlign: "left", paddingLeft: 18, margin: 0 }}><li>Open Selah Live.</li><li>Go to Settings.</li><li>Press “Copy dock link”.</li><li>Paste it as this dock's URL in OBS.</li></ol></div></div>;
  if (state === "noobs") return <div className="dock">{Head}<div className="dock-state"><div className="big" style={{ color: "var(--warn)" }}><Icon name="alert" /></div><h2 style={{ fontSize: 20 }}>Can't reach OBS</h2><p className="muted" style={{ margin: 0 }}>Check that WebSocket is enabled in OBS under Tools → WebSocket Server Settings.</p><span className="muted" style={{ fontSize: 12 }}>Retrying automatically…</span></div></div>;
  if (state === "noapp" || state === "starting") return <div className="dock">{Head}<div className="dock-state"><div className="big muted"><Icon name={state === "starting" ? "loader" : "pause"} className={state === "starting" ? "spin" : ""} /></div><h2 style={{ fontSize: 20 }}>{state === "starting" ? "Connecting…" : "Selah Live isn't running"}</h2>{state === "noapp" && <><p className="muted" style={{ margin: 0 }}>Open the app to continue.</p><a className="btn btn-primary" href={`${location.origin}/app/scripture`} target="_blank" rel="noreferrer">Open app</a><span className="muted" style={{ fontSize: 12 }}>Reconnects automatically</span></>}</div></div>;

  return (
    <div className="dock">{Head}
      <div className="search"><Icon name="search" /><input className="input" style={{ height: 44, fontSize: 14 }} placeholder="Search recent verses or songs" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="col" style={{ gap: 8, flex: 1, overflow: "auto" }}>
        {list.length === 0 && <span className="muted">Show something in the app and it appears here.</span>}
        {list.map((r, i) => <button key={i} className="verse" style={{ padding: "10px 12px" }} onClick={() => send("selah:dock-show", { item: r })}><span className="ref" style={{ fontSize: 15 }}>{r.title}{r.label ? ` · ${r.label}` : ""}</span><p style={{ fontSize: 12 }}>{r.body}</p></button>)}
      </div>
      <div className="row"><button className="btn btn-primary grow btn-lg" disabled={!list[0]} onClick={() => list[0] && send("selah:dock-show", { item: list[0] })}>SHOW</button><button className={`btn grow btn-lg ${live ? "btn-danger" : "btn-secondary"}`} onClick={() => send("selah:dock-hide")}>HIDE</button></div>
      <div className="row between"><button className="btn btn-ghost btn-sm" onClick={() => send("selah:dock-step", { dir: -1 })}><Icon name="left" size={16} />Prev</button><button className="btn btn-ghost btn-sm" onClick={() => send("selah:dock-step", { dir: 1 })}>Next<Icon name="right" size={16} /></button></div>
    </div>
  );
}
