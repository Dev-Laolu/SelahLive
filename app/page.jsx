"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Logo from "@/components/Logo";
import { PreviewFrame } from "@/components/Overlay";
import { DEFAULT_STYLE, SAMPLE_VERSE } from "@/lib/defaults";

const FAQ = [
  ["Is Selah Live completely free to use?", "Yes. It's free for churches, with no subscription."],
  ["Do I need technical experience or internet?", "No. Setup takes about two minutes. After you download a Bible version once, everything works offline."],
  ["Which versions of OBS are supported?", "OBS Studio 28 or newer, which has the connection we need built in."],
  ["Can we add our own songs?", "Yes. Paste lyrics or upload a .txt file. Custom songs stay on your computer."],
];

export default function Landing() {
  const [prompt, setPrompt] = useState(null); const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "visit" }) }).catch(() => {});
    const h = (e) => { e.preventDefault(); setPrompt(e); };
    const inst = () => fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "install" }) }).catch(() => {});
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", inst);
    return () => {
      window.removeEventListener("beforeinstallprompt", h);
      window.removeEventListener("appinstalled", inst);
    };
  }, []);
  const install = async () => {
    if (prompt) { prompt.prompt(); await prompt.userChoice; setPrompt(null); }
    else if (!/Chrome|Edg/.test(navigator.userAgent)) setMsg("Open this page in Chrome or Edge to install Selah Live.");
    else setMsg("Selah Live is already installed, or your browser has it ready. Look for the install icon in the address bar.");
  };
  const lt = { ...SAMPLE_VERSE, mode: "lowerThird" }, fs = { ...SAMPLE_VERSE, mode: "fullScreen", body: "For God so loved the world, that he gave his only begotten Son." };
  return (
    <div className="site">
      <header className="site-nav"><Logo />
        <nav aria-label="Site"><a href="#how">How it works</a><a href="#features">Features</a><a href="#faq">FAQ</a></nav>
        <div className="row"><Link className="btn btn-ghost" href="/login">Log in</Link><button className="btn btn-primary btn-sm" onClick={install}><Icon name="download" size={16} />Install app</button></div></header>
      <section className="section hero">
        <div className="col" style={{ gap: 20 }}>
          <span className="chip"><span className="dot gold" />Free for churches · Works with OBS Studio</span>
          <h1>Show scripture and songs in OBS <em>in seconds.</em></h1>
          <p className="muted" style={{ fontSize: 18, margin: 0, maxWidth: 480 }}>Free, works offline, updates itself. A calm, reliable tool for church media volunteers working in a dim control booth.</p>
          <div className="row wrap"><button className="btn btn-primary btn-lg" onClick={install}><Icon name="download" size={20} />Install Selah Live</button><a className="btn btn-secondary btn-lg" href="#how">See how it works</a></div>
          {msg && <div className="banner warn"><Icon name="alert" size={18} />{msg}</div>}
          <div className="row wrap muted" style={{ fontSize: 13 }}><span>Works offline</span><span>·</span><span>Windows and macOS</span><span>·</span><span>Chrome or Edge</span></div>
        </div>
        <PreviewFrame item={lt} style={DEFAULT_STYLE} />
      </section>
      <section className="section" id="how"><h2 style={{ fontSize: 34, textAlign: "center", marginBottom: 32 }}>From download to live in three steps</h2>
        <div className="grid3">{[["download", "Install", "Add Selah Live to your computer straight from the browser."], ["bolt", "Connect OBS", "Turn on OBS WebSocket, enter your password, and we add the overlay for you."], ["play", "Show", "Search a verse or song, press Show, and it animates onto your stream."]].map(([i, t, d], n) => <div className="card" key={t}><div className="row"><span className="num">{n + 1}</span><Icon name={i} size={22} className="gold" /></div><h3 style={{ margin: "14px 0 6px" }}>{t}</h3><p className="muted" style={{ margin: 0 }}>{d}</p></div>)}</div></section>
      <section className="section" id="features"><h2 style={{ fontSize: 34, marginBottom: 28 }}>Built for quiet confidence in the control booth</h2>
        <div className="grid2">{[["wifioff", "Works offline", "If the sanctuary internet drops mid-service, your downloaded Bibles and songs keep working."], ["refresh", "Auto-updating libraries", "New Bible versions and song packs appear as a notification. One click to install."], ["lower", "Lower third and full screen", "Switch between a sermon lower third and full-screen worship lyrics."], ["monitor", "Your church branding", "Add your name, logo, watermark and background colour."]].map(([i, t, d]) => <div className="card row" key={t} style={{ alignItems: "flex-start", gap: 16 }}><span className="brand-mark"><Icon name={i} size={18} /></span><div><h3 style={{ fontSize: 17 }}>{t}</h3><p className="muted" style={{ margin: "4px 0 0" }}>{d}</p></div></div>)}</div></section>
      <section className="section"><h2 style={{ fontSize: 34, marginBottom: 24 }}>Two overlay styles, one click apart</h2>
        <div className="grid2"><div className="col"><span className="label">Lower third</span><PreviewFrame item={lt} style={DEFAULT_STYLE} /></div><div className="col"><span className="label">Full screen</span><PreviewFrame item={fs} style={DEFAULT_STYLE} /></div></div></section>
      <section className="section faq" id="faq" style={{ maxWidth: 800 }}><h2 style={{ fontSize: 34, textAlign: "center", marginBottom: 24 }}>Questions we hear often</h2>{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>
      <section className="section"><div className="cta"><div><h2 style={{ fontSize: 30 }}>Ready for a calmer Sunday?</h2><p className="muted" style={{ margin: "6px 0 0" }}>Set up in about two minutes.</p></div><button className="btn btn-primary btn-lg" onClick={install}><Icon name="download" size={20} />Install Selah Live</button></div></section>
      <footer className="section row between muted" style={{ paddingTop: 24, paddingBottom: 40, borderTop: "1px solid var(--border)" }}><Logo size={26} /><span>© {new Date().getFullYear()} Selah Live</span></footer>
    </div>
  );
}
