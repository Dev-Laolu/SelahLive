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
  const [savedTexts, setSavedTexts] = useState([]);
  const [voiceSuggestions, setVoiceSuggestions] = useState([]);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBody, setQuickBody] = useState("");
  const [showHelp, setShowHelp] = useState(false);

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
        if (Array.isArray(d.savedTexts)) setSavedTexts(d.savedTexts);
      } else if (d.type === "selah:results") {
        if (d.reqId === pendingReqRef.current.id) {
          clearTimeout(pendingReqRef.current.timer);
          setSearchBusy(false);
          setSearchTimeout(false);
          setResults(d.results || []);
          if (d.results?.length) setSelected(d.results[0]);
        }
      } else if (d.type === "selah:suggest") {
        if (Array.isArray(d.suggestions)) {
          setVoiceSuggestions(d.suggestions.slice(0, 3));
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
    <div className="row between" style={{ flexShrink: 0 }}>
      <div className="row" style={{ gap: 6 }}>
        <span className={`dot ${dotCls} ${state === "ok" ? "" : "pulse"}`} />
        <b style={{ fontFamily: "var(--font-head)", fontSize: 13 }}>Selah Live</b>
        {appVersion && <span className="muted mono" style={{ fontSize: 10 }}>v{appVersion}</span>}
      </div>
      <div className="row" style={{ gap: 4 }}>
        <span className="chip" style={{ fontSize: 10, padding: "1px 6px" }}>{state === "noobs" ? "OBS ✕" : "OBS ✓"}</span>
        <button type="button" className="iconbtn" style={{ width: 26, height: 26 }} title="How to connect to OBS" aria-label="OBS Connection Help" onClick={() => setShowHelp(true)}>
          <Icon name="help" size={14} />
        </button>
        <a className="iconbtn" style={{ width: 26, height: 26 }} title="Open full app" href={`${typeof window !== "undefined" ? location.origin : ""}/app/overview`} target="_blank" rel="noreferrer">
          <Icon name="ext" size={14} />
        </a>
      </div>
    </div>
  );

  const HelpOverlay = showHelp && (
    <div className="modal-bg" style={{ padding: 10 }} role="dialog" aria-modal="true" aria-label="OBS Help" onClick={(e) => e.target === e.currentTarget && setShowHelp(false)}>
      <div className="modal col" style={{ gap: 8, padding: 14, maxWidth: 380, fontSize: 12 }}>
        <div className="row between">
          <b style={{ fontSize: 13 }}>How to connect to OBS</b>
          <button type="button" className="iconbtn" style={{ width: 24, height: 24 }} onClick={() => setShowHelp(false)}><Icon name="x" size={14} /></button>
        </div>
        <ol className="muted col" style={{ gap: 5, margin: 0, paddingLeft: 16, lineHeight: 1.45 }}>
          <li>In OBS, open <b>Tools → WebSocket Server Settings</b> and enable WebSocket (port <code className="mono">4455</code>).</li>
          <li>Copy the <b>Server Password</b> and paste it in Selah Live <b>Settings</b>, then click <b>Connect</b>.</li>
          <li>Keep the Selah Live app open (minimized is fine) so this dock stays connected.</li>
        </ol>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowHelp(false)}>Got it</button>
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
        {HelpOverlay}
      </div>
    );
  }
  if (state === "noobs") {
    return (
      <div className="dock">{Head}
        <div className="dock-state">
          <div className="big" style={{ color: "var(--warn)" }}><Icon name="alert" /></div>
          <h2 style={{ fontSize: 18 }}>Can't reach OBS</h2>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Check that WebSocket is enabled in OBS under Tools → WebSocket Server Settings.</p>
          <span className="muted" style={{ fontSize: 11 }}>Retrying automatically…</span>
        </div>
        {HelpOverlay}
      </div>
    );
  }
  if (state === "noapp" || state === "starting") {
    return (
      <div className="dock">{Head}
        <div className="dock-state">
          <div className="big muted"><Icon name={state === "starting" ? "loader" : "pause"} className={state === "starting" ? "spin" : ""} /></div>
          <h2 style={{ fontSize: 18 }}>{state === "starting" ? "Connecting…" : "Selah Live isn't running"}</h2>
          {state === "noapp" && (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>Open the app to continue.</p>
              <a className="btn btn-primary" href={`${location.origin}/app/overview`} target="_blank" rel="noreferrer">Open app</a>
              <span className="muted" style={{ fontSize: 11 }}>Reconnects automatically</span>
            </>
          )}
        </div>
        {HelpOverlay}
      </div>
    );
  }

  const displayList = q.trim() ? results : (scope === "text" ? savedTexts : recent);
  const activeItem = selected || displayList[0] || live;

  const pushQuickText = (e) => {
    e?.preventDefault();
    const body = quickBody.trim();
    if (!body) return;
    const item = {
      kind: "text",
      title: quickTitle.trim(),
      subtitle: "",
      body,
    };
    setSelected(item);
    cmd("takeLive", { item });
  };

  return (
    <div className="dock">
      {/* Fixed Top Navbar: Status + Search + Scope Tabs */}
      <div className="dock-head">
        {Head}
        <div className="row" style={{ gap: 6 }}>
          <div className="search grow">
            <Icon name="search" size={15} style={{ left: 10 }} />
            <input
              id="dock-search"
              name="dockSearch"
              type="search"
              autoComplete="off"
              className="input"
              style={{ height: 32, fontSize: 12, paddingLeft: 32 }}
              maxLength={200}
              placeholder="Search verse (Jn 3:16), song, or text…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search scripture, songs, and text"
            />
          </div>
          <div className="tabs" role="tablist" style={{ gap: 0, borderBottom: 0, flexShrink: 0 }}>
            {[["all", "All"], ["scripture", "Bible"], ["songs", "Songs"], ["text", "Text"]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)} style={{ padding: "4px 7px", fontSize: 11 }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Body: switches to 2-column grid when docked horizontally at the bottom of OBS */}
      <div className="dock-body">
        <div className="dock-scroll">
          {/* SG-8: Compact Voice Suggestion Strip (top 3) inside OBS Dock */}
          {voiceSuggestions.length > 0 && (
            <div className="card raised col" style={{ gap: 5, padding: 7, borderColor: "var(--gold)" }}>
              <div className="row between">
                <span className="row" style={{ gap: 5, fontSize: 11 }}>
                  <Icon name="sparkle" size={13} className="gold" />
                  <b className="gold">Voice Suggestions</b>
                </span>
                <span className="muted" style={{ fontSize: 10 }}>Click Show to display</span>
              </div>
              {voiceSuggestions.map((sug) => (
                <div
                  key={sug.id}
                  className="row between"
                  style={{
                    gap: 6,
                    padding: "4px 6px",
                    borderRadius: 6,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row" style={{ gap: 4 }}>
                      <b style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sug.item?.title || "Suggestion"}
                      </b>
                      <span className={`chip ${sug.band === "high" ? "ok" : "warn"}`} style={{ fontSize: 9, padding: "0 4px" }}>
                        {Math.round((sug.confidence || 0.8) * 100)}%
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sug.item?.body || sug.heard || ""}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ minHeight: 24, padding: "2px 8px", fontSize: 10 }}
                      onClick={() => {
                        if (sug.item) setSelected(sug.item);
                        sendMsg("selah:suggest-action", {
                          action: "show",
                          suggestionId: sug.id,
                          item: sug.item,
                        });
                        setVoiceSuggestions((list) => list.filter((x) => x.id !== sug.id));
                      }}
                    >
                      Show
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      style={{ width: 22, height: 22 }}
                      aria-label="Dismiss suggestion"
                      onClick={() => {
                        sendMsg("selah:suggest-action", {
                          action: "dismiss",
                          suggestionId: sug.id,
                        });
                        setVoiceSuggestions((list) => list.filter((x) => x.id !== sug.id));
                      }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Text Push Live Composer inside OBS Dock (v1.2.1) */}
          {scope === "text" && (
            <form className="card raised col" style={{ gap: 5, padding: 7 }} onSubmit={pushQuickText}>
              <input
                id="dock-quick-title"
                name="quickTitle"
                className="input"
                style={{ height: 28, fontSize: 11 }}
                maxLength={100}
                placeholder="Title (optional, e.g. Welcome / Offering)"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                aria-label="Quick text title"
              />
              <textarea
                id="dock-quick-body"
                name="quickBody"
                className="textarea"
                style={{ minHeight: 46, fontSize: 11, padding: 6 }}
                maxLength={2000}
                placeholder="Type message to push live on display…"
                value={quickBody}
                onChange={(e) => setQuickBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") pushQuickText(e);
                }}
                aria-label="Quick text message"
              />
              <div className="row wrap" style={{ gap: 5 }}>
                <button type="submit" className="btn btn-primary grow" disabled={!quickBody.trim()}>
                  <Icon name="play" size={13} /> Push Live
                </button>
                <button
                  type="button"
                  className="btn btn-secondary grow"
                  disabled={!quickBody.trim()}
                  onClick={() => {
                    const body = quickBody.trim();
                    if (!body) return;
                    const title = quickTitle.trim() || body.split("\n")[0].slice(0, 50) || "Saved Text";
                    cmd("saveText", { title, body, pushLive: false });
                    setQuickTitle("");
                    setQuickBody("");
                  }}
                >
                  <Icon name="plus" size={13} /> Save to App
                </button>
                {(quickTitle || quickBody) && (
                  <button type="button" className="btn btn-ghost" onClick={() => { setQuickTitle(""); setQuickBody(""); }}>
                    Clear
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Results / Recent / Saved Texts List */}
          {searchBusy && <span className="muted" style={{ fontSize: 11 }}>Searching…</span>}
          {searchTimeout && <div className="banner warn" style={{ padding: 6, fontSize: 11 }}><Icon name="alert" size={14} />App didn't answer. Check that Selah Live is open.</div>}
          {!searchBusy && !searchTimeout && displayList.length === 0 && (
            <span className="muted" style={{ fontSize: 11 }}>{q.trim() ? "No matches found." : scope === "text" ? "Type a message above or save texts in the app." : "Type a verse or song above, or show something in the app."}</span>
          )}
          {displayList.map((r, i) => {
            const isSel = selected && selected.title === r.title && selected.body === r.body;
            const isLiveRow = live && live.title === r.title && live.body === r.body;
            return (
              <button
                key={r.id || i}
                className={`verse ${isSel ? "sel" : ""} ${isLiveRow ? "live" : ""}`}
                style={{ padding: "6px 8px" }}
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
                  <span className="ref" style={{ fontSize: 12 }}>{r.title}{r.label ? ` · ${r.label}` : ""}</span>
                  <span className="muted" style={{ fontSize: 10 }}>{r.subtitle}</span>
                </div>
                <p style={{ fontSize: 11, marginTop: 2 }}>{r.body}</p>
              </button>
            );
          })}
        </div>

        {/* Fixed Compact Control Deck */}
        <div className="dock-controls">
          <div className="row between" style={{ gap: 6, padding: "4px 8px", background: "var(--raised)", borderRadius: 8 }}>
            <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 600 }} className="gold">
              {live ? (live.clearMode === "blackout" ? "Blackout" : live.clearMode === "logoScreen" ? "Logo screen" : live.title || "On screen") : "Nothing on screen"}
            </div>
            {live ? <span className="chip live" style={{ padding: "0px 6px", fontSize: 10 }}><span className="dot bad pulse" />Live</span> : <span className="muted" style={{ fontSize: 10 }}>Hidden</span>}
          </div>

          {/* Single-row compact Show / Hide / Prev / Next */}
          <div className="row" style={{ gap: 5 }}>
            {live && !follow && activeItem ? (
              <button className="btn btn-primary grow" onClick={() => cmd("takeLive", { item: activeItem })}>TAKE LIVE</button>
            ) : (
              <button className="btn btn-primary grow" disabled={!activeItem} onClick={() => activeItem && cmd("show", { item: activeItem })}>SHOW</button>
            )}
            <button className={`btn grow ${live ? "btn-danger" : "btn-secondary"}`} onClick={() => cmd("hide")}>HIDE</button>
            <button className="btn btn-secondary" title="Previous" aria-label="Previous" onClick={() => cmd("prev")}><Icon name="left" size={14} /></button>
            <button className="btn btn-secondary" title="Next" aria-label="Next" onClick={() => cmd("next")}><Icon name="right" size={14} /></button>
          </div>

          {/* Compact Mode + Live Follow on one line */}
          <div className="row between" style={{ gap: 6 }}>
            <div className="seg grow" role="group" aria-label="Display mode">
              <button aria-pressed={mode === "lowerThird"} onClick={() => { setMode("lowerThird"); cmd("setMode", { mode: "lowerThird" }); }}>Lower 3rd</button>
              <button aria-pressed={mode === "fullScreen"} onClick={() => { setMode("fullScreen"); cmd("setMode", { mode: "fullScreen" }); }}>Full</button>
            </div>
            <div className="row" style={{ gap: 5, flexShrink: 0 }}>
              <span id="dock-follow" style={{ fontSize: 11 }} className="muted">Follow</span>
              <button type="button" className="toggle" style={{ transform: "scale(0.85)" }} role="switch" aria-checked={follow} aria-labelledby="dock-follow" onClick={() => { const next = !follow; setFollow(next); cmd("setFollow", { follow: next }); }} />
            </div>
          </div>

          {/* Compact Version & Theme Dropdowns */}
          {(versions.length > 0 || themes.length > 0) && (
            <div className="row" style={{ gap: 5 }}>
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
          )}

          {/* Compact Clear Controls */}
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-ghost grow" style={{ fontSize: 11, minHeight: 26 }} onClick={() => cmd("clearText")}>Clear text</button>
            <button className="btn btn-ghost grow" style={{ fontSize: 11, minHeight: 26 }} onClick={() => cmd("blackout")}>Blackout</button>
            <button className="btn btn-ghost grow" style={{ fontSize: 11, minHeight: 26 }} onClick={() => cmd("logoScreen")}>Logo</button>
          </div>
        </div>
      </div>

      {HelpOverlay}
    </div>
  );
}
