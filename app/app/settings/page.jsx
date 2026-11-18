"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { useApp } from "@/lib/store";
import { useAuth, friendly } from "@/lib/auth";
import { OBS_ERRORS } from "@/lib/obs";
import { useToast } from "@/components/Toast";

export default function SettingsPage() {
  const { obs, obsStatus, obsError, obsConf, saveObsConf, connectObs, theme, changeTheme } = useApp();
  const { user, logOut, changePassword } = useAuth();
  const router = useRouter(); const toast = useToast();
  const [pw, setPw] = useState(obsConf.password || ""); const [show, setShow] = useState(false);
  const [scenes, setScenes] = useState([]); const [scene, setScene] = useState(obsConf.scene || "");
  const [newAcctPw, setNewAcctPw] = useState(""); const [pwChanging, setPwChanging] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = process.env.NEXT_PUBLIC_APP_URL || origin;
  const dock = `${base}/dock?pair=${obsConf.pairId}#pw=${encodeURIComponent(obsConf.password || "")}`;
  const overlayUrl = `${base}/overlay?pair=${obsConf.pairId}#pw=${encodeURIComponent(obsConf.password || "")}`;

  useEffect(() => {
    if (obsStatus === "connected" && obs) {
      obs.getScenes().then((r) => {
        setScenes(r.scenes || []);
        setScene((cur) => cur || r.current || "");
      }).catch(() => {});
    }
  }, [obsStatus, obs]);

  const addOverlayToScene = async () => {
    if (!obs || !scene) return;
    try {
      await obs.addOverlay({ url: overlayUrl, sceneName: scene });
      saveObsConf({ scene });
      toast(`Added Selah Live Overlay to "${scene}".`);
    } catch {
      toast("Couldn't add overlay to that scene. Check that OBS is still open.");
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newAcctPw) return;
    setPwChanging(true);
    try {
      await changePassword(newAcctPw);
      setNewAcctPw("");
      toast("Account password updated.");
    } catch (er) {
      toast(friendly(er.code));
    }
    setPwChanging(false);
  };

  return (
    <AppShell preview={false}>
      <h1 className="page-title">Settings</h1>
      <div className="card col">
        <div className="row between"><h3>OBS connection</h3>
          {obsStatus === "connected" ? <span className="chip ok"><Icon name="checkc" size={14} />Connected</span> : <span className="chip bad"><Icon name="alertc" size={14} />Not connected</span>}</div>
        {obsStatus === "error" && <div className="banner bad"><Icon name="alertc" size={18} />{OBS_ERRORS[obsError] || OBS_ERRORS.notRunning}</div>}
        <div className="field"><label htmlFor="pw">OBS WebSocket password</label>
          <div className="pw"><input id="pw" className="input" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} /><button className="iconbtn" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}><Icon name={show ? "eyeoff" : "eye"} size={18} /></button></div>
          <span className="muted" style={{ fontSize: 12 }}>Saved only on this computer.</span></div>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={async () => { saveObsConf({ password: pw }); const ok = await connectObs({ ...obsConf, password: pw }); toast(ok ? "Connected to OBS." : "Couldn't connect."); }}>{obsStatus === "connecting" ? "Connecting…" : obsStatus === "connected" ? "Reconnect" : "Connect"}</button>
          <Link className="btn btn-secondary" href="/setup">Re-run setup</Link>
        </div>
        {obsStatus === "connected" && scenes.length > 0 && (
          <div className="field" style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <label htmlFor="scene-pick">Add overlay to a different scene</label>
            <div className="row wrap">
              <select id="scene-pick" className="select grow" value={scene} onChange={(e) => setScene(e.target.value)}>
                {scenes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-secondary" onClick={addOverlayToScene}>Add overlay to scene</button>
            </div>
          </div>
        )}
      </div>
      <div className="card col"><h3>OBS dock</h3>
        <p className="muted" style={{ margin: 0 }}>Add this as a custom browser dock in OBS (View → Docks → Custom Browser Docks) to control Selah Live from inside OBS.</p>
        <div className="row"><input className="input mono" readOnly value={dock} aria-label="Dock link" /><button className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(dock); toast("Dock link copied."); }}><Icon name="copy" size={16} />Copy dock link</button></div>
        <span className="muted" style={{ fontSize: 12 }}>Pairing code: <b className="mono gold">{obsConf.pairId}</b></span></div>
      <div className="card col"><h3>Startup help</h3>
        <p style={{ margin: 0 }}>Selah Live must be running (minimized is fine) for verses to show. It can't run after it's closed.</p>
        <ul className="muted" style={{ margin: 0, paddingLeft: 20 }}><li><b>Chrome:</b> open chrome://apps, right-click Selah Live, choose “Start app when you sign in”.</li><li><b>Edge:</b> open edge://apps, choose “Start app on device login”. Turn off “sleeping tabs” for this app.</li></ul></div>
      <div className="card col"><h3>Account</h3><div><b>{user?.name}</b><div className="muted">{user?.email}</div></div>
        <form className="row wrap" onSubmit={handleChangePassword}>
          <input className="input" style={{ maxWidth: 280 }} type="password" autoComplete="new-password" placeholder="New password (min 8 chars)" value={newAcctPw} onChange={(e) => setNewAcctPw(e.target.value)} aria-label="New account password" />
          <button className="btn btn-secondary" type="submit" disabled={!newAcctPw || pwChanging}>{pwChanging ? "Updating…" : "Change password"}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { logOut(); router.replace("/login"); }}><Icon name="logout" size={16} />Log out</button>
        </form>
      </div>
      <div className="card row between"><div><h3>Theme</h3><span className="muted">Dark is easier in a dim room.</span></div>
        <div className="seg" style={{ width: 220 }}><button aria-pressed={theme === "dark"} onClick={() => changeTheme("dark")}><Icon name="moon" size={14} /> Dark</button><button aria-pressed={theme === "light"} onClick={() => changeTheme("light")}><Icon name="sun" size={14} /> Light</button></div></div>
      <div className="card"><h3>About</h3><span className="muted">Selah Live v0.1.0 · Free for churches.</span></div>
    </AppShell>
  );
}
