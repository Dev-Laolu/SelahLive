"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import Logo from "./Logo";
import Select from "./Select";
import { PreviewFrame } from "./Overlay";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { SAMPLE_VERSE } from "@/lib/defaults";

const NAV = [
  { href: "/app/scripture", label: "Scripture", icon: "book" },
  { href: "/app/songs", label: "Songs", icon: "music" },
  { href: "/app/text", label: "Text", icon: "type" },
  { href: "/app/library", label: "Library", icon: "library", badge: true },
  { href: "/app/display", label: "Display", icon: "monitor" },
  { href: "/app/settings", label: "Settings", icon: "sliders" },
];

export function PreviewPane({ pending }) {
  const {
    style, themes, activeThemeIds, getThemeForKind, selectThemeForSlot, assetsMap,
    mode, setMode, live, liveFollow, setLiveFollow,
    show, takeLive, hide, clearText, blackout, logoScreen,
  } = useApp();

  const item = pending ? { ...pending, mode } : live || { ...SAMPLE_VERSE, mode };
  const previewTheme = getThemeForKind(item.kind || "scripture");
  const slot = item.kind === "song" ? "songs" : item.kind === "text" ? "text" : "scripture";
  const canShow = !!pending;
  const isDifferentFromLive = live && pending && (live.title !== pending.title || live.body !== pending.body || live.mode !== mode);

  return (
    <aside className="preview-pane" aria-label="Live preview">
      <div className="row between">
        <h3 style={{ fontSize: 16 }}>Live preview</h3>
        {live ? <span className="chip live"><span className="dot bad pulse" />On screen</span> : <span className="chip">Ready</span>}
      </div>

      <PreviewFrame item={live && liveFollow ? live : item} style={style} theme={previewTheme} assetsMap={assetsMap} />

      <div className="col" style={{ gap: 6 }}>
        <span className="label">Display mode</span>
        <div className="seg" role="group" aria-label="Display mode">
          <button aria-pressed={mode === "lowerThird"} onClick={() => setMode("lowerThird")}>Lower third</button>
          <button aria-pressed={mode === "fullScreen"} onClick={() => setMode("fullScreen")}>Full screen</button>
        </div>
      </div>

      <div className="row between" style={{ padding: "6px 0" }}>
        <div className="col" style={{ gap: 2 }}>
          <label id="live-follow-lbl" style={{ fontSize: 13, fontWeight: 600 }}>Live follow</label>
          <span className="muted" style={{ fontSize: 11 }}>{liveFollow ? "Changes update live immediately" : "Preview first — press Take Live"}</span>
        </div>
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={liveFollow}
          aria-labelledby="live-follow-lbl"
          onClick={() => setLiveFollow(!liveFollow)}
        />
      </div>

      <div className="col" style={{ gap: 6 }}>
        <span className="label">Theme ({slot})</span>
        <Select
          ariaLabel="Overlay theme"
          value={activeThemeIds[slot] || previewTheme.id}
          onChange={(tid) => selectThemeForSlot(slot, tid)}
          options={themes.map((t) => ({ value: t.id, label: t.name, sub: t.slot }))}
        />
      </div>

      <div style={{ flex: 1 }} />

      {live ? (
        <div className="col" style={{ gap: 8 }}>
          {!liveFollow && isDifferentFromLive && (
            <button className="btn btn-primary btn-lg show-btn" onClick={() => takeLive(pending)}>
              <Icon name="play" size={22} />TAKE LIVE
            </button>
          )}
          <button className="btn btn-lg show-btn live" onClick={hide}>
            <Icon name="eyeoff" size={24} />HIDE
          </button>
        </div>
      ) : (
        <button className="btn btn-primary btn-lg show-btn" disabled={!canShow} onClick={() => pending && show(pending)}>
          <Icon name="play" size={24} />SHOW
        </button>
      )}

      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-secondary btn-sm grow" title="Clear text only (keep background & logo)" onClick={clearText}>Clear text</button>
        <button className="btn btn-secondary btn-sm grow" title="Blackout full screen" onClick={blackout}>Blackout</button>
        <button className="btn btn-secondary btn-sm grow" title="Show church logo screen" onClick={logoScreen}>Logo</button>
      </div>

      <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        <span className="kbd">Enter</span> {live && !liveFollow ? "take live" : "show"} · <span className="kbd">Esc</span> hide · <span className="kbd">←</span> <span className="kbd">→</span> step
      </div>
    </aside>
  );
}

function Notifications({ onClose }) {
  const { notices, installPack, downloads } = useApp();
  return (
    <div className="drawer" role="dialog" aria-label="Notifications">
      <div className="row between" style={{ padding: 16, borderBottom: "1px solid var(--border)" }}><h3>Notifications</h3><button className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="x" size={20} /></button></div>
      <div className="col" style={{ padding: 16, overflow: "auto" }}>
        {notices.length === 0 && <div className="empty"><Icon name="bell" /><b>You're all caught up</b><span>New Bible versions and song packs show up here.</span></div>}
        {notices.map((n) => (
          <div className="card raised" key={n.id}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <span className="dot gold" style={{ marginTop: 7 }} />
              <div className="grow"><b>{n.title}</b><div className="muted" style={{ fontSize: 13 }}>{n.text}</div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{n.time}</div></div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} disabled={downloads[n.entry.id] != null} onClick={() => installPack(n.entry)}>
              <Icon name="download" size={16} />{downloads[n.entry.id] != null ? "Downloading…" : "Download"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AppShell({ children, pending, preview = true }) {
  const path = usePathname(); const router = useRouter();
  const { ready, obsStatus, live, online, updates, setupDone, hide, notices, manifest } = useApp();
  const { user, logOut } = useAuth();
  const [bell, setBell] = useState(false); const [menu, setMenu] = useState(false);

  useEffect(() => { if (user === null) router.replace("/login"); }, [user, router]);
  useEffect(() => { if (ready && user && !setupDone && path !== "/app/settings") router.replace("/setup"); }, [ready, user, setupDone, path, router]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape" && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { hide(); setBell(false); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [hide]);

  if (!ready || user === undefined) return <div className="auth-bg"><Logo size={48} stacked /></div>;
  const obsChip = obsStatus === "connected" ? <span className="chip ok"><Icon name="checkc" size={14} />OBS connected</span>
    : obsStatus === "connecting" ? <span className="chip warn"><Icon name="loader" size={14} className="spin" />Connecting…</span>
    : <span className="chip bad"><Icon name="alertc" size={14} />OBS not connected</span>;

  return (
    <div className={`shell ${preview ? "" : "no-preview"}`}>
      <header className="topbar">
        <Link href="/app/scripture"><Logo /></Link>
        <div className="row" style={{ gap: 10 }}>
          {!online && <span className="chip warn"><Icon name="wifioff" size={14} />Offline</span>}
          {obsChip}
          {live && <span className="chip live"><span className="dot bad pulse" />Live: {live.clearMode === "blackout" ? "Blackout" : live.clearMode === "logoScreen" ? "Logo" : live.title || "On screen"}</span>}
          <button className="iconbtn" aria-label="Notifications" onClick={() => setBell((b) => !b)}><Icon name="bell" size={20} />{notices.length > 0 && <span className="dot gold" style={{ position: "absolute", top: 10, right: 10 }} />}</button>
          <div style={{ position: "relative" }}>
            <button className="iconbtn" aria-label="Account menu" onClick={() => setMenu((m) => !m)} style={{ background: "var(--gold)", color: "var(--on-gold)", borderRadius: "50%", width: 36, height: 36 }}><Icon name="user" size={18} /></button>
            {menu && <div className="card raised" style={{ position: "absolute", right: 0, top: 46, width: 220, zIndex: 130, padding: 12 }}>
              <div style={{ padding: "4px 8px 10px" }}><b>{user?.name || "Account"}</b><div className="muted" style={{ fontSize: 12 }}>{user?.email}</div></div>
              <Link className="btn btn-ghost btn-sm btn-block" href="/app/settings" onClick={() => setMenu(false)}>Settings</Link>
              <button className="btn btn-ghost btn-sm btn-block" onClick={() => { logOut(); router.replace("/login"); }}><Icon name="logout" size={16} />Log out</button>
            </div>}
          </div>
        </div>
      </header>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
            <Icon name={n.icon} size={20} /><span className="lbl">{n.label}</span>{n.badge && updates.length > 0 && <span className="dot gold" aria-label="Updates available" />}
          </Link>
        ))}
      </nav>
      <main className="main" id="main">
        {manifest?.announcement && (
          <div className="banner ok"><Icon name="bell" size={18} /><span className="grow">{manifest.announcement}</span></div>
        )}
        {obsStatus !== "connected" && (
          <div className="banner warn">
            <Icon name="alert" size={20} />
            <span className="grow">Not connected to OBS. You can still prepare verses, but nothing will show on stream.</span>
            <Link className="btn btn-secondary btn-sm" href="/app/settings">Connect</Link>
          </div>
        )}
        {children}
      </main>
      {preview && <PreviewPane pending={pending} />}
      {bell && <Notifications onClose={() => setBell(false)} />}
    </div>
  );
}
