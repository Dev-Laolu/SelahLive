"use client";
import { useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { useApp } from "@/lib/store";

export default function TextPage() {
  const { show, recentTexts, addRecentText } = useApp();
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const file = useRef(null);
  const item = body.trim() ? { kind: "text", title, subtitle: "", body: body.trim() } : null;
  const upload = async (e) => { const f = e.target.files?.[0]; if (f) setBody(await f.text()); e.target.value = ""; };
  return (
    <AppShell pending={item}>
      <h1 className="page-title">Text</h1>
      <div className="field"><label htmlFor="t">Title (optional)</label><input id="t" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement, Welcome…" /></div>
      <div className="field">
        <div className="row between"><label htmlFor="b">Text</label>
          <button className="btn btn-ghost btn-sm" onClick={() => file.current.click()}><Icon name="upload" size={16} />Upload .txt</button><input ref={file} type="file" accept=".txt" hidden onChange={upload} /></div>
        <textarea id="b" className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type or paste what you want to show…" />
        <span className="muted mono" style={{ fontSize: 12, textAlign: "right" }}>{body.length} characters</span>
      </div>
      <div className="row"><button className="btn btn-primary" disabled={!item} onClick={() => { show(item); addRecentText({ title, body: body.trim() }); }}><Icon name="play" size={16} />Show now</button></div>
      <div className="col" style={{ gap: 8 }}>
        <span className="label">Recent texts</span>
        {recentTexts.length === 0 ? <span className="muted">Texts you show appear here for quick reuse.</span> :
          <div className="row wrap" style={{ gap: 8 }}>{recentTexts.map((t, i) => <button key={i} className="chip clickable" onClick={() => { setTitle(t.title || ""); setBody(t.body); }}>{(t.title || t.body).slice(0, 36)}{(t.title || t.body).length > 36 ? "…" : ""}</button>)}</div>}
      </div>
    </AppShell>
  );
}
