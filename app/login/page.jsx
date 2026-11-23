"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import Icon from "@/components/Icon";
import { useAuth, friendly } from "@/lib/auth";

export default function Login() {
  const { logIn, reset, demo } = useAuth(); const router = useRouter();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [show, setShow] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const submit = async (e) => { e.preventDefault(); setErr(""); setBusy(true); try { await logIn({ email, password: pw }); router.replace("/app/scripture"); } catch (x) { setErr(friendly(x.code)); } setBusy(false); };
  return (
    <div className="auth-bg"><form className="auth-card" onSubmit={submit} noValidate>
      <div style={{ display: "grid", placeItems: "center" }}><Logo size={44} stacked /></div>
      <h1 style={{ fontSize: 26, textAlign: "center" }}>Welcome back</h1>
      {demo && <div className="banner warn" style={{ fontSize: 12 }}><Icon name="alert" size={16} />Demo mode: Firebase isn't configured, so sign-in is stored on this device only.</div>}
      {err && <div className="err"><Icon name="alertc" size={16} />{err}</div>}{note && <div className="banner ok">{note}</div>}
      <div className="field"><label htmlFor="e">Email</label><input id="e" name="email" className={`input ${err ? "error" : ""}`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label htmlFor="p">Password</label><div className="pw"><input id="p" name="password" className={`input ${err ? "error" : ""}`} type={show ? "text" : "password"} autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /><button type="button" className="iconbtn" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}><Icon name={show ? "eyeoff" : "eye"} size={18} /></button></div></div>
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={async () => { if (!email) return setErr("Enter your email above first."); try { await reset(email); setNote("If that email has an account, a reset link is on its way."); } catch (x) { setErr(friendly(x.code)); } }}>Forgot password?</button>
      <button className="btn btn-primary btn-block" disabled={busy || !email || !pw}>{busy ? "Logging in…" : "Log in"}</button>
      <div className="muted" style={{ textAlign: "center" }}>New here? <Link className="gold" href="/signup">Create an account</Link></div>
    </form></div>
  );
}
