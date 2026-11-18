"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { parseSong } from "@/lib/songs";
import { useToast } from "@/components/Toast";

function AddSongModal({ open, onClose, onSave }) {
  const dlgRef = useRef(null);
  const [tab, setTab] = useState("paste");
  const [raw, setRaw] = useState("");
  const song = useMemo(() => parseSong(raw), [raw]);
  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (f) { setRaw(await f.text()); setTab("paste"); }
  };

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    const handleClose = () => {
      dlg.returnValue = "";
      onClose?.();
    };
    dlg.addEventListener("close", handleClose);
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const handleClick = (event) => {
        if (event.target !== dlg) return;
        const rect = dlg.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) dlg.close();
      };
      dlg.addEventListener("click", handleClick);
      return () => {
        dlg.removeEventListener("close", handleClose);
        dlg.removeEventListener("click", handleClick);
      };
    }
    return () => dlg.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog ref={dlgRef} className="native-dialog modal-lg" closedby="any" aria-labelledby="add-song-title">
      <div className="row between">
        <h2 id="add-song-title" style={{ fontSize: 22 }}>Add a song</h2>
        <button type="button" className="iconbtn" aria-label="Close" onClick={() => dlgRef.current?.close()}>
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="tabs" role="tablist" style={{ margin: "12px 0" }}>
        <button role="tab" aria-selected={tab === "paste"} onClick={() => setTab("paste")}>Paste</button>
        <button role="tab" aria-selected={tab === "upload"} onClick={() => setTab("upload")}>Upload .txt</button>
      </div>
      <div className="two" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="col">
          {tab === "upload" ? (
            <label className="drop">
              <div><Icon name="upload" size={28} /><div>Choose a .txt file</div></div>
              <input type="file" accept=".txt" hidden onChange={upload} />
            </label>
          ) : (
            <textarea
              className="textarea"
              style={{ minHeight: 320 }}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"Title: Amazing Grace\nAuthor: John Newton\n\n[Verse 1]\nAmazing grace how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\n…"}
            />
          )}
          <span className="muted" style={{ fontSize: 12 }}>Lyrics are automatically split into 2 lines per slide. [Section] labels are optional.</span>
        </div>
        <div className="col">
          <span className="label">Slides preview{song.title ? ` — ${song.title}` : ""}</span>
          {song.sections.length === 0 ? (
            <div className="muted">Your slides will appear here.</div>
          ) : (
            song.sections.map((s, i) => (
              <div key={i} className="slide" style={{ cursor: "default" }}>
                {s.label && <span className="pill">{s.label}</span>}
                <div>{s.text}</div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={() => dlgRef.current?.close()}>Cancel</button>
        <button
          className="btn btn-primary"
          disabled={!song.title || !song.sections.length}
          onClick={() => { onSave(song); setRaw(""); dlgRef.current?.close(); }}
        >
          Save song
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Custom songs are saved only on this computer.</div>
    </dialog>
  );
}

export default function SongsPage() {
  const { songPacks, customSongs, addCustomSong, favSongs, toggleFavSong, show, live } = useApp();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [packFilter, setPackFilter] = useState("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const [songId, setSongId] = useState(null);
  const [slide, setSlide] = useState(0);
  const [adding, setAdding] = useState(false);

  const songs = useMemo(
    () => [
      ...customSongs.map((s) => ({ ...s, pack: "My songs", language: s.language || "English" })),
      ...songPacks.flatMap((p) => (p.songs || []).map((s) => ({ ...s, id: `${p.id}:${s.id || s.title}`, pack: p.name, language: s.language || p.language || "English" }))),
    ],
    [songPacks, customSongs]
  );

  const packOptions = useMemo(() => [...new Set(songs.map((s) => s.pack))], [songs]);

  const list = songs.filter(
    (s) =>
      (!q || s.title.toLowerCase().includes(q.toLowerCase()) || (s.author || "").toLowerCase().includes(q.toLowerCase())) &&
      (packFilter === "all" || s.pack === packFilter) &&
      (!onlyFav || favSongs.includes(s.id))
  );

  const song = songs.find((s) => s.id === songId) || list[0];
  useEffect(() => { setSlide(0); }, [songId]);
  const sec = song?.sections[slide];
  const item = song && sec ? { kind: "song", title: song.title, subtitle: song.author || "", body: sec.text, label: sec.label } : null;
  const step = (d) => song && setSlide((s) => Math.max(0, Math.min(song.sections.length - 1, s + d)));

  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") step(1);
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") step(-1);
      if (e.key === "Enter" && item) show(item);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  useEffect(() => {
    const h = (e) => {
      if (!song) return;
      const nextIdx = Math.max(0, Math.min(song.sections.length - 1, slide + e.detail));
      setSlide(nextIdx);
      const nextSec = song.sections[nextIdx];
      if (nextSec) {
        show({ kind: "song", title: song.title, subtitle: song.author || "", body: nextSec.text, label: nextSec.label });
      }
    };
    window.addEventListener("selah-dock-step", h);
    return () => window.removeEventListener("selah-dock-step", h);
  });

  return (
    <AppShell pending={item}>
      <div className="row between">
        <h1 className="page-title">Songs</h1>
        <button className="btn btn-secondary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />Add song
        </button>
      </div>
      {songs.length === 0 ? (
        <div className="empty">
          <Icon name="music" />
          <h3 style={{ color: "var(--text)" }}>No songs yet</h3>
          <span>Download a song pack, or add your own song.</span>
          <div className="row">
            <Link className="btn btn-primary" href="/app/library">Go to Library</Link>
            <button className="btn btn-secondary" onClick={() => setAdding(true)}>Add song</button>
          </div>
        </div>
      ) : (
        <div className="songs">
          <div className="col" style={{ gap: 10 }}>
            <div className="search">
              <Icon name="search" />
              <input className="input" style={{ height: 44, fontSize: 14 }} placeholder="Search songs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search songs" />
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <select
                className="select grow"
                style={{ minHeight: 36, padding: "4px 10px", fontSize: 13 }}
                value={packFilter}
                onChange={(e) => setPackFilter(e.target.value)}
                aria-label="Filter by song pack"
              >
                <option value="all">All packs ({songs.length})</option>
                {packOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className="chip clickable" aria-pressed={onlyFav} onClick={() => setOnlyFav((f) => !f)} style={onlyFav ? { color: "var(--gold)" } : null}>
                <Icon name="star" size={13} />Favourites
              </button>
            </div>
            {list.map((s) => (
              <button key={s.id} className={`verse ${song?.id === s.id ? "sel" : ""}`} onClick={() => setSongId(s.id)} style={{ padding: "12px 14px" }}>
                <div className="row between">
                  <b>{s.title}</b>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Favourite"
                    onClick={(e) => { e.stopPropagation(); toggleFavSong(s.id); }}
                    style={{ color: favSongs.includes(s.id) ? "var(--gold)" : "var(--text-2)" }}
                  >
                    <Icon name="star" size={16} />
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{s.author || "Unknown"} · {s.pack}</div>
              </button>
            ))}
          </div>
          <div className="col" style={{ gap: 10 }}>
            {song && (
              <div className="row between">
                <div><h2 style={{ fontSize: 22 }}>{song.title}</h2><span className="muted">{song.author}</span></div>
                <span className="muted mono" style={{ fontSize: 12 }}>{slide + 1} / {song.sections.length}</span>
              </div>
            )}
            {song?.sections.map((s, i) => (
              <button
                key={i}
                className={`slide ${i === slide ? "sel" : ""} ${live && live.title === song.title && live.body === s.text ? "live" : ""}`}
                onClick={() => setSlide(i)}
                onDoubleClick={() => show({ kind: "song", title: song.title, subtitle: song.author || "", body: s.text, label: s.label })}
              >
                {s.label && <span className="pill">{s.label}</span>}
                <div>{s.text}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <AddSongModal open={adding} onClose={() => setAdding(false)} onSave={(s) => { addCustomSong(s); toast("Song saved on this computer."); }} />
    </AppShell>
  );
}
