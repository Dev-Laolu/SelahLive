"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import Icon from "@/components/Icon";
import { useAuth, friendly } from "@/lib/auth";

export default function Signup() {
  const { signUp, demo } = useAuth(); const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "" }); const [show, setShow] = useState(false);
  const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); const er = {};
    if (!f.name.trim()) er.name = "Tell us your name."; if (!/^\S+@\S+\.\S+$/.test(f.email)) er.email = "That email address doesn't look right."; if (f.password.length < 8) er.password = "Use at least 8 characters.";
    setErrs(er); if (Object.keys(er).length) return;
    setBusy(true); try { await signUp(f); router.replace("/setup"); } catch (x) { setErrs({ form: friendly(x.code) }); } setBusy(false);
  };
  const E = ({ k }) => errs[k] ? <span className="err"><Icon name="alertc" size={14} />{errs[k]}</span> : null;
  return (
    <div className="auth-bg"><form className="auth-card" onSubmit={submit} noValidate>
      <div style={{ display: "grid", placeItems: "center" }}><Logo size={44} stacked /></div>
      <h1 style={{ fontSize: 26, textAlign: "center" }}>Create your account</h1>
      {demo && <div className="banner warn" style={{ fontSize: 12 }}><Icon name="alert" size={16} />Demo mode: Firebase isn't configured, so your account is stored on this device only.</div>}
      {errs.form && <div className="err"><Icon name="alertc" size={16} />{errs.form}</div>}
      <div className="field"><label htmlFor="n">Name</label><input id="n" className={`input ${errs.name ? "error" : ""}`} autoComplete="name" value={f.name} onChange={set("name")} /><E k="name" /></div>
      <div className="field"><label htmlFor="e">Email</label><input id="e" className={`input ${errs.email ? "error" : ""}`} type="email" autoComplete="email" value={f.email} onChange={set("email")} /><E k="email" /></div>
      <div className="field"><label htmlFor="p">Password</label><div className="pw"><input id="p" className={`input ${errs.password ? "error" : ""}`} type={show ? "text" : "password"} autoComplete="new-password" value={f.password} onChange={set("password")} /><button type="button" className="iconbtn" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}><Icon name={show ? "eyeoff" : "eye"} size={18} /></button></div><E k="password" /></div>
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      <div className="muted" style={{ textAlign: "center" }}>Already have an account? <Link className="gold" href="/login">Log in</Link></div>
      <p className="muted" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>We only record that you opened the app, never which verses or songs you show.</p>
    </form></div>
  );
}
