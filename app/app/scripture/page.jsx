"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { useApp } from "@/lib/store";
import { search, neighbour, getAvailableChapters } from "@/lib/bible";

export default function ScripturePage() {
  const { bibles, show, live, recent, addRecent, pinned, togglePin } = useApp();
  const [code, setCode] = useState("");
  const [q, setQ] = useState("John 3:16");
  const [sel, setSel] = useState(null);
  const inputRef = useRef(null);
  const pack = bibles.find((b) => b.id === code) || bibles[0];

  const results = useMemo(() => (pack ? search(pack, q) : []), [pack, q]);
  useEffect(() => {
    if (results.length && (!sel || !results.find((r) => r.ref === sel.ref))) setSel(results[0]);
    if (!results.length) setSel(null);
  }, [results]); // eslint-disable-line

  const item = sel && pack ? { kind: "scripture", title: sel.ref, subtitle: pack.code, body: sel.text } : null;
  const go = (dir) => {
    if (!sel || !pack) return;
    const n = neighbour(pack, sel, dir);
    if (n) { setSel(n); setQ(n.ref); }
  };
  const doShow = () => { if (item) { show(item); addRecent(sel.ref); } };

  useEffect(() => {
    const k = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); inputRef.current?.focus(); return; }
      if (e.key === "Enter" && !(typing && e.target !== inputRef.current)) { e.preventDefault(); doShow(); }
      if (!typing && e.key === "ArrowRight") go(1);
      if (!typing && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  useEffect(() => {
    const h = (e) => {
      if (!sel || !pack) return;
      const n = neighbour(pack, sel, e.detail);
      if (n) {
        setSel(n);
        setQ(n.ref);
        show({ kind: "scripture", title: n.ref, subtitle: pack.code, body: n.text });
      }
    };
    window.addEventListener("selah-dock-step", h);
    return () => window.removeEventListener("selah-dock-step", h);
  });

  const jump = (label) => { setQ(label); };

  const currentBookNum = sel?.book || pack?.books?.[0]?.n || 43;
  const availableChapters = useMemo(() => (pack ? getAvailableChapters(pack, currentBookNum) : []), [pack, currentBookNum]);

  const handleBookJump = (bookNum) => {
    const b = pack?.books?.find((x) => x.n === +bookNum);
    if (!b) return;
    const chs = getAvailableChapters(pack, b.n);
    const firstCh = chs[0] || 1;
    setQ(`${b.name} ${firstCh}`);
  };

  const handleChapterJump = (ch) => {
    const b = pack?.books?.find((x) => x.n === currentBookNum);
    if (!b) return;
    setQ(`${b.name} ${ch}`);
  };

  return (
    <AppShell pending={item}>
      <div className="row">
        <div className="search grow">
          <Icon name="search" />
          <input ref={inputRef} className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Try John 3:16 or "love your neighbor"`} aria-label="Search scripture" />
        </div>
        {bibles.length > 0 && (
          <select className="select" style={{ width: 200, height: 56 }} value={pack?.id} onChange={(e) => setCode(e.target.value)} aria-label="Bible version">
            {bibles.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
        )}
      </div>

      {(pinned.length > 0 || recent.length > 0) && (
        <div className="row wrap" style={{ gap: 8 }}>
          {pinned.map((p) => (
            <span key={"p" + p} className="chip clickable gold" onClick={() => jump(p)}>
              <Icon name="pin" size={13} />{p}
              <button aria-label={`Unpin ${p}`} onClick={(e) => { e.stopPropagation(); togglePin(p); }}><Icon name="x" size={13} /></button>
            </span>
          ))}
          {recent.filter((r) => !pinned.includes(r)).slice(0, 6).map((r) => (
            <span key={"r" + r} className="chip clickable" onClick={() => jump(r)}>{r}</span>
          ))}
        </div>
      )}

      {!pack ? (
        <div className="empty">
          <Icon name="library" />
          <h3 style={{ color: "var(--text)" }}>Download a Bible version to get started</h3>
          <span>You only need to do this once. Then it works offline.</span>
          <Link className="btn btn-primary" href="/app/library">Go to Library</Link>
        </div>
      ) : results.length === 0 ? (
        <div className="empty">
          <Icon name="search" />
          <b style={{ color: "var(--text)" }}>No verses found</b>
          <span>Try a reference like “Ps 23” or a few words from the verse.</span>
        </div>
      ) : (
        <>
          <div className="muted mono" style={{ fontSize: 12 }}>{results.length} {results.length === 1 ? "match" : "matches"}</div>
          <div className="col" style={{ gap: 10 }}>
            {results.map((r) => (
              <button
                key={r.ref}
                className={`verse ${sel?.ref === r.ref ? "sel" : ""} ${live?.title === r.ref ? "live" : ""}`}
                onClick={() => setSel(r)}
                onDoubleClick={() => {
                  setSel(r);
                  show({ kind: "scripture", title: r.ref, subtitle: pack.code, body: r.text });
                  addRecent(r.ref);
                }}
              >
                <div className="row between">
                  <span className="ref">{r.ref}</span>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="hint">Preview</span>
                    <span className="chip">{pack.code}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={pinned.includes(r.ref) ? "Unpin" : "Pin"}
                      onClick={(e) => { e.stopPropagation(); togglePin(r.ref); }}
                      style={{ color: pinned.includes(r.ref) ? "var(--gold)" : "var(--text-2)" }}
                    >
                      <Icon name="star" size={18} />
                    </span>
                  </span>
                </div>
                <p>{r.text}</p>
              </button>
            ))}
          </div>
          {sel && (
            <div className="row between wrap card" style={{ padding: 12 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => go(-1)}><Icon name="left" size={16} />Previous</button>
              <div className="row wrap" style={{ gap: 8 }}>
                <b className="gold" style={{ fontFamily: "var(--font-head)" }}>{sel.ref}</b>
                <select
                  className="select"
                  style={{ width: 140, minHeight: 36, padding: "4px 10px", fontSize: 13 }}
                  value={currentBookNum}
                  onChange={(e) => handleBookJump(e.target.value)}
                  aria-label="Jump to book"
                >
                  {(pack.books || []).map((b) => <option key={b.n} value={b.n}>{b.name}</option>)}
                </select>
                {availableChapters.length > 0 && (
                  <select
                    className="select"
                    style={{ width: 100, minHeight: 36, padding: "4px 10px", fontSize: 13 }}
                    value={sel.chapter}
                    onChange={(e) => handleChapterJump(e.target.value)}
                    aria-label="Jump to chapter"
                  >
                    {availableChapters.map((ch) => <option key={ch} value={ch}>Ch. {ch}</option>)}
                  </select>
                )}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => go(1)}>Next<Icon name="right" size={16} /></button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
