"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import Select from "@/components/Select";
import { ObsClient, isSelah } from "@/lib/obs";

// Redesigned OBS Custom Browser Dock (320-420px wide, V1.1 §4).
// Thin remote: pings app every 3s (2s pong fail-safe), searches through app via `selah:search` / `selah:results`.
export default function Dock() {
  const [state, setState] = useState("starting"); // starting | ok | noapp | noobs | nopair
  const [appVersion, setAppVersion] = useState("");
  const [live, setLive] = useState(null);
  const [mode, setMode] = useState("lowerThird");
  const [follow, setFollow] = useState(true);
  const [version, setVersion] = useState("");
  const [versions, setVersions] = useState([]);
  const [themeId, setThemeId] = useState("");
  const [themes, setThemes] = useState([]);
  const [recent, setRecent] = useState([]);

  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(false);

  const obsRef = useRef(null);
  const bcRef = useRef(null);
  const pairRef = useRef("");
  const pongAt = useRef(0);
  const pendingReqRef = useRef({ id: "", timer: null });

  const sendMsg = (type, payload = {}) => {
    const pair = pairRef.current;
    const msg = { app: "selah-live", v: 1, pairId: pair, type, ...payload };
    try { bcRef.current && bcRef.current.postMessage(msg); } catch {}
    obsRef.current?.send(type, pair, payload).catch(() => {});
  };

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    const pair = new URLSearchParams(location.search).get("pair") || "";
    pairRef.current = pair;
    if (!pair) { setState("nopair"); return; }
    const pw = new URLSearchParams(location.hash.slice(1)).get("pw") || "";
    const obs = new ObsClient();
    obsRef.current = obs;
    const bc = "BroadcastChannel" in window ? new BroadcastChannel("selah-live") : null;
    bcRef.current = bc;
    let dead = false, timer, connecting = false;

    const handleEvent = (d) => {
      if (!isSelah(d, pair)) return;
      if (d.type === "selah:pong") {
        pongAt.current = Date.now();
        if (d.appVersion) setAppVersion(d.appVersion);
        if (Array.isArray(d.recent)) setRecent(d.recent);
        setState("ok");
      } else if (d.type === "selah:state") {
        pongAt.current = Date.now();
        setState("ok");
        setLive(d.live || null);
        if (d.mode) setMode(d.mode);
        if (typeof d.follow === "boolean") setFollow(d.follow);
        if (d.version) setVersion(d.version);
        if (Array.isArray(d.versions)) setVersions(d.versions);
        if (d.themeId) setThemeId(d.themeId);
        if (Array.isArray(d.themes)) setThemes(d.themes);
        if (Array.isArray(d.recent)) setRecent(d.recent);
      } else if (d.type === "selah:results") {
        if (d.reqId === pendingReqRef.current.id) {
          clearTimeout(pendingReqRef.current.timer);
          setSearchBusy(false);
          setSearchTimeout(false);
          setResults(d.results || []);
          if (d.results?.length) setSelected(d.results[0]);
        }
      }
    };

    if (bc) bc.onmessage = (e) => handleEvent(e.data);
    obs.on((ev) => {
      if (ev.type === "closed") { setState("noobs"); return; }
      if (ev.type === "event" && ev.name === "CustomEvent") handleEvent(ev.data);
    });

    const connect = async () => {
      if (connecting || dead) return;
      connecting = true;
      try { await obs.connect({ password: pw }); } catch { setState("noobs"); }
      connecting = false;
    };

    const tick = async () => {
      if (dead) return;
      if (!obs.connected) { await connect(); if (!obs.connected) return; }
      const sent = Date.now();
      sendMsg("selah:ping");
      setTimeout(() => {
        if (!dead && obs.connected && pongAt.current < sent) setState("noapp");
      }, 2000);
    };

    connect().then(tick);
    timer = setInterval(tick, 3000);
    return () => {
      dead = true;
      clearInterval(timer);
      clearTimeout(pendingReqRef.current.timer);
      obs.close();
      bc && bc.close();
    };
  }, []);

  // Debounced remote search through the app (`selah:search` -> `selah:results`, 150ms debounce, 2s timeout)
  useEffect(() => {
    if (state !== "ok") return;
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setSearchBusy(false);
      setSearchTimeout(false);
      return;
    }
    const t = setTimeout(() => {
      const reqId = "r" + Date.now() + Math.random().toString(36).slice(2, 5);
      clearTimeout(pendingReqRef.current.timer);
      setSearchBusy(true);
      setSearchTimeout(false);
      pendingReqRef.current = {
        id: reqId,
        timer: setTimeout(() => {
          setSearchBusy(false);
          setSearchTimeout(true);
        }, 2000),
      };
      sendMsg("selah:search", { reqId, query: trimmed.slice(0, 200), scope, version, limit: 20 });
    }, 150);
    return () => clearTimeout(t);
  }, [q, scope, version, state]);

  const cmd = (c, extra = {}) => sendMsg("selah:command", { cmd: c, ...extra });

  const dotCls = state === "ok" ? "ok" : state === "noapp" || state === "starting" ? "warn" : "bad";
  const Head = (
    <div className="row between">
      <div className="row" style={{ gap: 8 }}>
        <span className={`dot ${dotCls} ${state === "ok" ? "" : "pulse"}`} />
        <b style={{ fontFamily: "var(--font-head)" }}>Selah Live</b>
        {appVersion && <span className="muted mono" style={{ fontSize: 11 }}>v{appVersion}</span>}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <span className="chip" style={{ fontSize: 11 }}>{state === "noobs" ? "OBS ✕" : "OBS ✓"}</span>
        <a className="iconbtn" style={{ width: 32, height: 32 }} title="Open full app" href={`${typeof window !== "undefined" ? location.origin : ""}/app/scripture`} target="_blank" rel="noreferrer">
          <Icon name="ext" size={15} />
        </a>
      </div>
    </div>
  );

  // Locked fail-safe states (AGENTS.md §4)
  if (state === "nopair") {
    return (
      <div className="dock">{Head}
        <div className="dock-state">
          <div className="big gold"><Icon name="link" /></div>
          <h2 style={{ fontSize: 20 }}>Pairing needed</h2>
          <ol className="muted" style={{ textAlign: "left", paddingLeft: 18, margin: 0 }}>
            <li>Open Selah Live.</li>
            <li>Go to Settings.</li>
            <li>Press “Copy dock link”.</li>
            <li>Paste it as this dock's URL in OBS.</li>
          </ol>
        </div>
      </div>
    );
  }
  if (state === "noobs") {
    return (
      <div className="dock">{Head}
        <div className="dock-state">
          <div className="big" style={{ color: "var(--warn)" }}><Icon name="alert" /></div>
          <h2 style={{ fontSize: 20 }}>Can't reach OBS</h2>
          <p className="muted" style={{ margin: 0 }}>Check that WebSocket is enabled in OBS under Tools → WebSocket Server Settings.</p>
          <span className="muted" style={{ fontSize: 12 }}>Retrying automatically…</span>
        </div>
      </div>
    );
  }
  if (state === "noapp" || state === "starting") {
    return (
      <div className="dock">{Head}
        <div className="dock-state">
          <div className="big muted"><Icon name={state === "starting" ? "loader" : "pause"} className={state === "starting" ? "spin" : ""} /></div>
          <h2 style={{ fontSize: 20 }}>{state === "starting" ? "Connecting…" : "Selah Live isn't running"}</h2>
          {state === "noapp" && (
            <>
              <p className="muted" style={{ margin: 0 }}>Open the app to continue.</p>
              <a className="btn btn-primary" href={`${location.origin}/app/scripture`} target="_blank" rel="noreferrer">Open app</a>
              <span className="muted" style={{ fontSize: 12 }}>Reconnects automatically</span>
            </>
          )}
        </div>
      </div>
    );
  }

  const displayList = q.trim() ? results : recent;
  const activeItem = selected || displayList[0] || live;

  return (
    <div className="dock" style={{ gap: 10 }}>
      {Head}

      {/* Smart Search Bar + Scope */}
      <div className="search">
        <Icon name="search" size={18} />
        <input
          className="input"
          style={{ height: 42, fontSize: 13, paddingLeft: 42 }}
          maxLength={200}
          placeholder="Search verse (Jn 3:16) or song…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search scripture and songs"
        />
      </div>
      <div className="tabs" role="tablist" style={{ gap: 2 }}>
        {[["all", "All"], ["scripture", "Scripture"], ["songs", "Songs"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)} style={{ padding: "4px 10px", fontSize: 12 }}>{l}</button>
        ))}
      </div>

      {/* Results / Recent List */}
      <div className="col" style={{ gap: 6, flex: 1, overflow: "auto", minHeight: 120 }}>
        {searchBusy && <span className="muted" style={{ fontSize: 12 }}>Searching…</span>}
        {searchTimeout && <div className="banner warn" style={{ padding: 8, fontSize: 12 }}><Icon name="alert" size={15} />App didn't answer. Check that Selah Live is open.</div>}
        {!searchBusy && !searchTimeout && displayList.length === 0 && (
          <span className="muted" style={{ fontSize: 12 }}>{q.trim() ? "No matches found." : "Type a verse or song above, or show something in the app."}</span>
        )}
        {displayList.map((r, i) => {
          const isSel = selected && selected.title === r.title && selected.body === r.body;
          const isLiveRow = live && live.title === r.title && live.body === r.body;
          return (
            <button
              key={r.id || i}
              className={`verse ${isSel ? "sel" : ""} ${isLiveRow ? "live" : ""}`}
              style={{ padding: "8px 10px" }}
              onClick={() => {
                setSelected(r);
                cmd("select", { item: r });
              }}
              onDoubleClick={() => {
                setSelected(r);
                cmd("takeLive", { item: r });
              }}
            >
              <div className="row between" style={{ gap: 6 }}>
                <span className="ref" style={{ fontSize: 14 }}>{r.title}{r.label ? ` · ${r.label}` : ""}</span>
                <span className="muted" style={{ fontSize: 11 }}>{r.subtitle}</span>
              </div>
              <p style={{ fontSize: 12, marginTop: 2 }}>{r.body}</p>
            </button>
          );
        })}
      </div>

      {/* Now Live Card */}
      <div className="card raised" style={{ padding: "8px 10px" }}>
        <div className="row between" style={{ marginBottom: 2 }}>
          <span className="label">Now live</span>
          {live ? <span className="chip live" style={{ padding: "1px 8px", fontSize: 11 }}><span className="dot bad pulse" />Live</span> : <span className="muted" style={{ fontSize: 11 }}>Hidden</span>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600 }} className="gold">{live ? (live.clearMode === "blackout" ? "Blackout" : live.clearMode === "logoScreen" ? "Logo screen" : live.title || "On screen") : "Nothing on screen"}</div>
      </div>

      {/* Primary Show / Take Live / Hide + Prev / Next */}
      <div className="row" style={{ gap: 8 }}>
        {live && !follow && activeItem ? (
          <button className="btn btn-primary grow" onClick={() => cmd("takeLive", { item: activeItem })}>TAKE LIVE</button>
        ) : (
          <button className="btn btn-primary grow" disabled={!activeItem} onClick={() => activeItem && cmd("show", { item: activeItem })}>SHOW</button>
        )}
        <button className={`btn grow ${live ? "btn-danger" : "btn-secondary"}`} onClick={() => cmd("hide")}>HIDE</button>
      </div>
      <div className="row between" style={{ gap: 8 }}>
        <button className="btn btn-secondary btn-sm grow" onClick={() => cmd("prev")}><Icon name="left" size={15} />Prev</button>
        <button className="btn btn-secondary btn-sm grow" onClick={() => cmd("next")}>Next<Icon name="right" size={15} /></button>
      </div>

      {/* Mode + Live Follow */}
      <div className="seg" role="group" aria-label="Display mode">
        <button aria-pressed={mode === "lowerThird"} onClick={() => { setMode("lowerThird"); cmd("setMode", { mode: "lowerThird" }); }}>Lower third</button>
        <button aria-pressed={mode === "fullScreen"} onClick={() => { setMode("fullScreen"); cmd("setMode", { mode: "fullScreen" }); }}>Full screen</button>
      </div>
      <div className="row between" style={{ fontSize: 12 }}>
        <label id="dock-follow">Live follow</label>
        <button type="button" className="toggle" role="switch" aria-checked={follow} aria-labelledby="dock-follow" onClick={() => { const next = !follow; setFollow(next); cmd("setFollow", { follow: next }); }} />
      </div>

      {/* Styled Version & Theme Dropdowns */}
      <div className="row" style={{ gap: 6 }}>
        {versions.length > 0 && (
          <Select
            searchable
            ariaLabel="Bible version"
            className="grow"
            value={version}
            onChange={(v) => { setVersion(v); cmd("setVersion", { version: v }); }}
            options={versions.map((v) => ({ value: v.id, label: v.code, sub: v.name }))}
          />
        )}
        {themes.length > 0 && (
          <Select
            ariaLabel="Overlay theme"
            className="grow"
            value={themeId}
            onChange={(tid) => { setThemeId(tid); cmd("setTheme", { themeId: tid }); }}
            options={themes.map((t) => ({ value: t.id, label: t.name }))}
          />
        )}
      </div>

      {/* Clear Controls */}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-ghost btn-sm grow" onClick={() => cmd("clearText")}>Clear text</button>
        <button className="btn btn-ghost btn-sm grow" onClick={() => cmd("blackout")}>Blackout</button>
        <button className="btn btn-ghost btn-sm grow" onClick={() => cmd("logoScreen")}>Logo</button>
      </div>
    </div>
  );
}
