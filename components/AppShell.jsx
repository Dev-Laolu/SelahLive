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
import { ListeningIndicator } from "@/src/voice/ui/ListeningIndicator";

const NAV = [
  { href: "/app/overview", label: "Overview", icon: "home" },
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
  const activeItem = live && liveFollow ? live : item;
  const previewTheme =
    (activeItem.templateId && themes.find((t) => t.id === activeItem.templateId)) ||
    activeItem.theme ||
    getThemeForKind(activeItem.kind || "scripture");
  const slot = activeItem.kind === "song" ? "songs" : activeItem.kind === "text" ? "text" : "scripture";
  const canShow = !!pending;
  const isDifferentFromLive = live && pending && (live.title !== pending.title || live.body !== pending.body || live.mode !== mode);

  return (
    <aside className="preview-pane" aria-label="Live broadcast preview">
      <div className="row between">
        <div className="row" style={{ gap: 6 }}>
          <span className={`dot ${live ? "bad pulse" : "gold"}`} />
          <h3 style={{ fontSize: 15, margin: 0 }}>Live Broadcast Preview</h3>
        </div>
        {live ? <span className="chip live"><span className="dot bad pulse" />On screen</span> : <span className="chip">PGM Ready</span>}
      </div>

      <PreviewFrame
        item={activeItem}
        style={style}
        theme={previewTheme}
        assetsMap={assetsMap}
        performanceMode={!!style.performanceMode}
        reduceMotion={!!style.reduceMotion}
      />

      <div className="col" style={{ gap: 6 }}>
        <span className="label">Display mode</span>
        <div className="seg" role="group" aria-label="Display mode">
          <button aria-pressed={mode === "lowerThird"} onClick={() => setMode("lowerThird")}>Lower third</button>
          <button aria-pressed={mode === "fullScreen"} onClick={() => setMode("fullScreen")}>Full screen</button>
        </div>
      </div>

      <div className="row between" style={{ padding: "6px 0" }}>
        <div className="col" style={{ gap: 2 }}>
          <span id="live-follow-lbl" style={{ fontSize: 13, fontWeight: 600 }}>Live follow</span>
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

function ObsHelpModal({ onClose, user, churchName, currentPath }) {
  const [tab, setTab] = useState("guide"); // guide | ticket
  const [category, setCategory] = useState("OBS Connection");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState("");
  const [err, setErr] = useState("");

  const submitTicket = async (e) => {
    e.preventDefault();
    if (message.trim().length < 5) {
      setErr("Please describe your issue (at least 5 characters).");
      return;
    }
    setSending(true);
    setErr("");
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uid: user?.uid || "",
          name: user?.name || "",
          email: user?.email || "",
          churchName: churchName || "",
          category,
          subject: subject.trim(),
          message: message.trim(),
          page: currentPath || "",
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not send message.");
      setSentId(data.id || "sent");
      setSubject("");
      setMessage("");
    } catch (er) {
      setErr(er.message || "Could not send message. Check your internet connection.");
    }
    setSending(false);
  };

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Help & Support" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal col" style={{ gap: 14, maxWidth: 580 }}>
        <div className="row between">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="help" size={20} className="gold" />
            <h3 style={{ margin: 0 }}>Help &amp; Support</h3>
          </div>
          <button className="iconbtn" aria-label="Close help" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="seg" role="tablist">
          <button role="tab" aria-pressed={tab === "guide"} onClick={() => setTab("guide")}>OBS Connection Guide</button>
          <button role="tab" aria-pressed={tab === "voice"} onClick={() => setTab("voice")}>Voice Suggestions Guide</button>
          <button role="tab" aria-pressed={tab === "ticket"} onClick={() => setTab("ticket")}>Send Help Desk Message</button>
        </div>

        {tab === "guide" ? (
          <>
            <ol className="col" style={{ gap: 10, margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.5 }}>
              <li>Open <b>OBS Studio</b> (version 28 or newer).</li>
              <li>In OBS, click <b>Tools → WebSocket Server Settings</b>.</li>
              <li>Check <b>Enable WebSocket server</b> (keep Server Port <code className="mono">4455</code>), click <b>Show Connect Info</b>, and copy the <b>Server Password</b>.</li>
              <li>In Selah Live, open <b>Settings</b>, paste the password under <b>OBS WebSocket password</b>, and click <b>Connect</b>.</li>
              <li>Selah Live automatically creates the <b>Selah Live Overlay</b> Browser Source (1920×1080) in your active OBS scene.</li>
              <li><b>Optional OBS Dock:</b> Copy your <b>Dock link</b> in Settings, then in OBS go to <b>Docks → Custom Browser Docks…</b>, name it <b>Selah Live</b>, paste the link, and click <b>Apply</b>.</li>
            </ol>

            <div className="banner ok" style={{ fontSize: 13 }}>
              <Icon name="bolt" size={16} />
              <span><b>Tip:</b> Keep Selah Live open (minimized is fine) during your service so the overlay and OBS dock stay connected.</span>
            </div>

            <div className="row wrap between" style={{ gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTab("ticket")}>Still need help? Message Support →</button>
              <div className="row wrap" style={{ gap: 8 }}>
                <Link href="/setup" className="btn btn-secondary btn-sm" onClick={onClose}>Re-run Setup Wizard</Link>
                <Link href="/app/settings" className="btn btn-primary btn-sm" onClick={onClose}>Open OBS Settings</Link>
              </div>
            </div>
          </>
        ) : tab === "voice" ? (
          <div className="col" style={{ gap: 10, fontSize: 13, lineHeight: 1.5 }}>
            <div className="card raised col" style={{ gap: 6, padding: 12 }}>
              <b className="gold">How Voice Suggestions Work (100% On-Device &amp; Manual Control)</b>
              <span className="muted">
                Selah Live listens to the pastor&apos;s microphone, transcribes speech locally on your computer, and suggests Bible verses, songs, and service slides in the <b>Suggested from voice</b> tray. <b>Nothing is ever displayed automatically</b>—you always decide with one click or shortcut.
              </span>
            </div>
            <ol className="col" style={{ gap: 8, margin: 0, paddingLeft: 20 }}>
              <li><b>Download an offline Whisper model:</b> Open <b>Library → Voice models</b> and download <b>Whisper Base (`base.en`)</b> (or <b>Whisper Tiny (`tiny.en`)</b> on 4 GB laptops).</li>
              <li><b>Choose your audio source:</b> In <b>Settings → Voice</b>, pick your microphone or USB audio interface. For best accuracy and to avoid conflicting with OBS, feed a dedicated aux/monitor line from your sound mixer into Channel 1 or 2.</li>
              <li><b>Test &amp; start listening:</b> Click <b>Test mic (3 s)</b> to check signal health, then toggle Voice Suggestions <b>On</b>.</li>
              <li><b>Use one-click or keyboard shortcuts:</b>
                <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                  <span><span className="kbd">Alt+1…5</span> Show card 1–5</span>
                  <span><span className="kbd">Shift+Alt+1…5</span> Preview card 1–5</span>
                  <span><span className="kbd">Alt+D</span> Dismiss top card</span>
                  <span><span className="kbd">Alt+L</span> Pause/resume listening</span>
                </div>
              </li>
            </ol>
            <div className="row wrap between" style={{ gap: 8, marginTop: 4 }}>
              <Link href="/app/library?tab=voice" className="btn btn-secondary btn-sm" onClick={onClose}>Open Voice Models</Link>
              <Link href="/app/settings#voice-settings" className="btn btn-primary btn-sm" onClick={onClose}>Open Voice Settings</Link>
            </div>
          </div>
        ) : sentId ? (
          <div className="col" style={{ gap: 12, padding: "12px 0" }}>
            <div className="banner ok">
              <Icon name="checkc" size={18} />
              <span><b>Message sent to the Selah Live Help Desk!</b> Our admin team can now see your message and resolve it.</span>
            </div>
            <div className="muted mono" style={{ fontSize: 12 }}>Reference ID: {sentId}</div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSentId("")}>Send another</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form className="col" style={{ gap: 10 }} onSubmit={submitTicket}>
            <div className="muted" style={{ fontSize: 12 }}>
              Sending as <b>{user?.name || "Volunteer"}</b> ({user?.email || "no email"}){churchName ? ` · ${churchName}` : ""}
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="help-topic">Topic</label>
                <Select
                  id="help-topic"
                  ariaLabel="Help topic"
                  value={category}
                  onChange={setCategory}
                  options={["OBS Connection", "Bible / Songs", "Display / Overlay", "Account / Sync", "Other"]}
                />
              </div>
              <div className="field">
                <label htmlFor="help-subj">Subject (optional)</label>
                <input id="help-subj" name="subject" className="input" maxLength={120} placeholder="Short summary" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="help-msg">How can we help?</label>
              <textarea
                id="help-msg"
                name="message"
                className="textarea"
                style={{ minHeight: 110 }}
                maxLength={2000}
                placeholder="Describe what happened or what you need help with…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>
            {err && <div className="banner bad"><Icon name="alertc" size={16} /><span>{err}</span></div>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={sending || message.trim().length < 5}>
                <Icon name="send" size={15} />{sending ? "Sending…" : "Send to Help Desk"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AppShell({ children, pending, preview = true }) {
  const path = usePathname(); const router = useRouter();
  const { ready, obsStatus, live, online, updates, setupDone, hide, notices, manifest, style } = useApp();
  const { user, logOut } = useAuth();
  const [bell, setBell] = useState(false); const [menu, setMenu] = useState(false); const [help, setHelp] = useState(false);

  useEffect(() => { if (user === null) router.replace("/login"); }, [user, router]);
  useEffect(() => { if (ready && user && !setupDone && path !== "/app/settings") router.replace("/setup"); }, [ready, user, setupDone, path, router]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape" && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { hide(); setBell(false); setHelp(false); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [hide]);

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
          <ListeningIndicator />
          {obsChip}
          {live && <span className="chip live"><span className="dot bad pulse" />Live: {live.clearMode === "blackout" ? "Blackout" : live.clearMode === "logoScreen" ? "Logo" : live.title || "On screen"}</span>}
          <button className="btn btn-ghost btn-sm" aria-label="OBS Connection Help" title="How to connect to OBS" onClick={() => setHelp(true)} style={{ gap: 5 }}>
            <Icon name="help" size={17} /><span>Help</span>
          </button>
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
      {help && <ObsHelpModal onClose={() => setHelp(false)} user={user} churchName={style?.churchName} currentPath={path} />}
    </div>
  );
}
