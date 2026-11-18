"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import Logo from "@/components/Logo";
import Select from "@/components/Select";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { OBS_ERRORS } from "@/lib/obs";

const STEPS = ["Welcome", "OBS", "Connect", "Overlay", "Libraries", "Keep running"];

export default function Setup() {
  const router = useRouter(); const { user } = useAuth();
  const app = useApp(); const { obs, obsConf, saveObsConf, obsStatus, obsError, connectObs, manifest, packs, installPack, downloads, finishSetup } = app;
  const [step, setStep] = useState(0);
  const [pw, setPw] = useState(""); const [show, setShow] = useState(false);
  const [scenes, setScenes] = useState([]); const [scene, setScene] = useState("");
  const [added, setAdded] = useState("idle"); const [working, setWorking] = useState("idle"); const [addErr, setAddErr] = useState("");

  useEffect(() => { if (user === null) router.replace("/login"); }, [user, router]);
  useEffect(() => { if (obsConf.password) setPw(obsConf.password); }, [obsConf.password]);
  useEffect(() => { if (step === 3 && obsStatus === "connected") obs.getScenes().then((r) => { setScenes(r.scenes); setScene(r.current); }).catch(() => {}); }, [step, obsStatus, obs]);
  useEffect(() => { const ok = () => setWorking("ok"); window.addEventListener("selah-overlay-ok", ok); return () => window.removeEventListener("selah-overlay-ok", ok); }, []);

  const overlayUrl = () => `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/overlay?pair=${obsConf.pairId}#pw=${encodeURIComponent(obsConf.password || "")}`;
  const addOverlay = async () => {
    setAdded("busy"); setAddErr(""); setWorking("busy");
    try {
      await obs.addOverlay({ url: overlayUrl(), sceneName: scene });
      saveObsConf({ scene }); setAdded("ok");
      setTimeout(() => setWorking((w) => (w === "busy" ? "slow" : w)), 8000);
    } catch (e) { setAdded("err"); setWorking("idle"); setAddErr("We couldn't add the overlay. Make sure OBS is still open, then try again."); }
  };
  const next = () => setStep((s) => Math.min(5, s + 1));
  const canNext = step === 2 ? obsStatus === "connected" : step === 3 ? added === "ok" : true;
  const finish = () => { finishSetup(); router.replace("/app/scripture"); };
  const lib = (manifest?.packs || []);

  return (
    <div className="auth-bg"><div className="wiz">
      <div className="row between" style={{ padding: "20px 28px 0" }}><div><Logo size={40} /><div className="muted" style={{ marginTop: 6 }}>Get connected to OBS in about two minutes.</div></div><span className="chip">Studio setup</span></div>
      <div className="stepper" aria-label="Setup progress">{STEPS.map((s, i) => <div key={s} className={`st ${i < step ? "done" : i === step ? "cur" : ""}`} aria-current={i === step ? "step" : undefined}><span className="n">{i < step ? <Icon name="check" size={16} /> : i + 1}</span>{s}</div>)}</div>
      <div className="wiz-body">
        {step === 0 && <div className="col" style={{ gap: 16 }}><span className="gold label">Step 1 of 6</span><h1 style={{ fontSize: 32 }}>Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p className="muted" style={{ fontSize: 16, maxWidth: 560 }}>We'll turn on a setting in OBS, connect Selah Live to it, add the overlay for you, and download your first Bible. You only do this once.</p>
          <div className="grid3">{[["monitor", "Open OBS"], ["link", "Connect"], ["download", "Download Bible"]].map(([i, t]) => <div className="card raised row" key={t}><Icon name={i} size={20} className="gold" />{t}</div>)}</div></div>}

        {step === 1 && <div className="col"><span className="gold label">Step 2 of 6</span><h1 style={{ fontSize: 30 }}>Turn on OBS WebSocket</h1>
          <p className="muted" style={{ margin: 0 }}>This lets Selah Live talk to OBS. Everything stays on your computer.</p>
          <div className="two" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="col">{[["Open OBS Studio", "Launch OBS on this computer."], ["Open Server Settings", "Go to Tools → WebSocket Server Settings."], ["Enable and set a password", "Tick “Enable WebSocket server”, keep port 4455, set a password and remember it."]].map(([t, d], i) => <div key={t} className="card raised row" style={{ alignItems: "flex-start" }}><span className="num">{i + 1}</span><div><b>{t}</b><div className="muted">{d}</div></div></div>)}</div>
            <div className="obs-dlg" aria-label="Illustration of OBS WebSocket Server Settings"><header>WebSocket Server Settings</header><div className="body">
              <div className="card row" style={{ padding: 12, borderColor: "var(--gold)" }}><span className="check"><input type="checkbox" checked readOnly aria-label="Enable WebSocket server" /></span><div><b className="gold">Enable WebSocket server</b></div></div>
              <div className="row between"><span className="muted">Server Port</span><span className="chip mono">4455</span></div>
              <div className="row between"><span className="muted">Server Password</span><span className="chip mono">••••••••••</span></div></div></div>
          </div></div>}

        {step === 2 && <div className="col" style={{ maxWidth: 520 }}><span className="gold label">Step 3 of 6</span><h1 style={{ fontSize: 30 }}>Connect to OBS</h1>
          <div className="field"><label htmlFor="pw">OBS WebSocket password</label><div className="pw"><input id="pw" className="input" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} /><button className="iconbtn" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}><Icon name={show ? "eyeoff" : "eye"} size={18} /></button></div></div>
          <div className="row"><button className="btn btn-primary" disabled={obsStatus === "connecting"} onClick={() => { saveObsConf({ password: pw }); connectObs({ ...obsConf, password: pw }); }}>Connect</button>
            {obsStatus === "connecting" ? <span className="chip warn"><Icon name="loader" size={14} className="spin" />Connecting…</span> : obsStatus === "connected" ? <span className="chip ok"><Icon name="checkc" size={14} />Connected</span> : <span className="chip">Not connected</span>}</div>
          {obsStatus === "error" && <div className="banner bad" style={{ alignItems: "flex-start" }}><Icon name="alertc" size={18} /><div><b>{obsError === "wrongPassword" ? "Wrong password" : "Can't reach OBS"}</b><div>{OBS_ERRORS[obsError] || OBS_ERRORS.notRunning}</div></div></div>}</div>}

        {step === 3 && <div className="col" style={{ maxWidth: 520 }}><span className="gold label">Step 4 of 6</span><h1 style={{ fontSize: 30 }}>Add the overlay to OBS</h1>
          <div className="field"><label htmlFor="sc">Scene</label><Select id="sc" ariaLabel="OBS Scene" value={scene} onChange={setScene} options={scenes.map((s) => ({ value: s, label: s }))} placeholder="Select a scene…" /></div>
          <div><button className="btn btn-primary" disabled={!scene || added === "busy"} onClick={addOverlay}>{added === "busy" ? "Adding…" : "Add overlay to OBS"}</button></div>
          {addErr && <div className="err"><Icon name="alertc" size={16} />{addErr}</div>}
          <div className="card raised col" style={{ gap: 10 }}>
            <div className="row"><Icon name={obsStatus === "connected" ? "checkc" : "alertc"} className={obsStatus === "connected" ? "" : "gold"} style={{ color: obsStatus === "connected" ? "var(--ok)" : undefined }} />OBS connected</div>
            <div className="row">{working === "ok" ? <Icon name="checkc" style={{ color: "var(--ok)" }} /> : working === "busy" ? <Icon name="loader" className="spin" /> : <Icon name="clock" />}Overlay working{working === "slow" && <span className="muted"> — still waiting. You can continue and check it later.</span>}</div></div></div>}

        {step === 4 && <div className="col"><span className="gold label">Step 5 of 6</span><h1 style={{ fontSize: 30 }}>Download your libraries</h1>
          <p className="muted" style={{ margin: 0 }}>These work offline once downloaded. You can skip and do this later in Library.</p>
          <div className="grid2">{lib.length === 0 && <div className="muted">Couldn't load the list. You can download later from Library.</div>}{lib.map((e) => { const have = packs.find((p) => p.id === e.id && p.type === e.type); const pct = downloads[e.id]; return <div key={e.id} className="card raised col" style={{ gap: 8 }}><span className="chip" style={{ alignSelf: "flex-start" }}>{e.type === "bible" ? "Recommended Bible" : "Starter song pack"}</span><b>{e.name}</b><span className="muted">{e.language}</span>
            {pct != null && <div className="progress"><i style={{ width: pct * 100 + "%" }} /></div>}
            {have ? <span className="chip ok" style={{ alignSelf: "flex-start" }}><Icon name="check" size={14} />Downloaded</span> : <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={pct != null} onClick={() => installPack(e)}><Icon name="download" size={14} />Download</button>}</div>; })}</div></div>}

        {step === 5 && <div className="col"><span className="gold label">Step 6 of 6</span><h1 style={{ fontSize: 30 }}>Keep it running</h1>
          <p className="muted" style={{ margin: 0 }}>Selah Live must be open to send verses to OBS. It can't run in the background once closed.</p>
          <div className="grid3">{[["download", "Minimize, don't close", "Keep the app window open and minimized during the service."], ["play", "Start when I sign in", "In Chrome or Edge, open the apps page and turn on “start when you sign in”."], ["bolt", "Edge never-sleep tip", "In Edge, turn off sleeping tabs for this app so it stays awake."]].map(([i, t, d]) => <div key={t} className="card raised col" style={{ gap: 8 }}><Icon name={i} size={22} className="gold" /><b>{t}</b><span className="muted">{d}</span></div>)}</div></div>}
      </div>
      <div className="wiz-foot">
        <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}><Icon name="left" size={16} />Back</button>
        <div className="row">{step >= 2 && step < 5 && !canNext && <button className="btn btn-ghost" onClick={next}>Skip for now</button>}
          {step < 5 ? <button className="btn btn-primary" disabled={!canNext} onClick={next}>Next<Icon name="right" size={16} /></button> : <button className="btn btn-primary" onClick={finish}>Go to app</button>}</div>
      </div>
    </div></div>
  );
}
