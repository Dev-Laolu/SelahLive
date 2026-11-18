"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Select from "@/components/Select";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { parseSong } from "@/lib/songs";
import { highlightSegments } from "@/lib/search";
import { useToast } from "@/components/Toast";

function rechunkSections(sections = [], maxLines = 2) {
  const out = [];
  for (const sec of sections) {
    const lines = (sec.text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += maxLines) {
      out.push({ label: sec.label || "", text: lines.slice(i, i + maxLines).join("\n") });
    }
  }
  return out;
}

function AddSongModal({ open, onClose, onSave, maxLines = 2 }) {
  const dlgRef = useRef(null);
  const [tab, setTab] = useState("paste");
  const [raw, setRaw] = useState("");
  const song = useMemo(() => parseSong(raw, maxLines), [raw, maxLines]);
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
    const handleClose = () => { dlg.returnValue = ""; onClose?.(); };
    dlg.addEventListener("close", handleClose);
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const handleClick = (event) => {
        if (event.target !== dlg) return;
        const rect = dlg.getBoundingClientRect();
        const inside = rect.top <= event.clientY && event.clientY <= rect.top + rect.height && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
        if (!inside) dlg.close();
      };
      dlg.addEventListener("click", handleClick);
      return () => { dlg.removeEventListener("close", handleClose); dlg.removeEventListener("click", handleClick); };
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
          <span className="muted" style={{ fontSize: 12 }}>Lyrics are automatically split into {maxLines} lines per slide. [Section] labels are optional.</span>
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
        <button className="btn btn-primary" disabled={!song.title || !song.sections.length} onClick={() => { onSave(song); setRaw(""); dlgRef.current?.close(); }}>
          Save song
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Custom songs are saved only on this computer.</div>
    </dialog>
  );
}

export default function SongsPage() {
  const {
    songPacks, customSongs, addCustomSong, favSongs, toggleFavSong,
    lyricsLinesPerSlide, setLyricsLinesPerSlide,
    show, updateLive, takeLive, live,
  } = useApp();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [packFilter, setPackFilter] = useState("all");
  const [langFilter, setLangFilter] = useState("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const [songId, setSongId] = useState(null);
  const [slide, setSlide] = useState(0);
  const [adding, setAdding] = useState(false);

  const songs = useMemo(
    () => [
      ...customSongs.map((s) => ({ ...s, pack: "My songs", language: s.language || "English", sections: rechunkSections(s.sections, lyricsLinesPerSlide) })),
      ...songPacks.flatMap((p) =>
        (p.songs || []).map((s) => ({
          ...s,
          id: `${p.id}:${s.id || s.title}`,
          pack: p.name,
          language: s.language || p.language || "English",
          sections: rechunkSections(s.sections, lyricsLinesPerSlide),
        }))
      ),
    ],
    [songPacks, customSongs, lyricsLinesPerSlide]
  );

  const packOptions = useMemo(() => [...new Set(songs.map((s) => s.pack))], [songs]);
  const langOptions = useMemo(() => [...new Set(songs.map((s) => s.language))], [songs]);

  const list = useMemo(() => {
    const low = q.trim().toLowerCase();
    return songs
      .map((s) => {
        let matchedSlide = -1;
        let matchedLine = "";
        if (low) {
          s.sections.forEach((sec, idx) => {
            if (matchedSlide < 0 && (sec.text || "").toLowerCase().includes(low)) {
              matchedSlide = idx;
              matchedLine = sec.text;
            }
          });
        }
        const ok =
          (!low || s.title.toLowerCase().includes(low) || (s.author || "").toLowerCase().includes(low) || matchedSlide >= 0) &&
          (packFilter === "all" || s.pack === packFilter) &&
          (langFilter === "all" || s.language === langFilter) &&
          (!onlyFav || favSongs.includes(s.id));
        return ok ? { ...s, matchedSlide, matchedLine } : null;
      })
      .filter(Boolean);
  }, [songs, q, packFilter, langFilter, onlyFav, favSongs]);

  const song = songs.find((s) => s.id === songId) || list[0];
  const sec = song?.sections[slide] || song?.sections[0];
  const item = song && sec ? { kind: "song", title: song.title, subtitle: song.author || "", body: sec.text, label: sec.label } : null;

  const selectSlide = (idx, targetSong = song) => {
    if (!targetSong) return;
    const clamped = Math.max(0, Math.min(targetSong.sections.length - 1, idx));
    setSlide(clamped);
    const s = targetSong.sections[clamped];
    if (s) {
      updateLive({ kind: "song", title: targetSong.title, subtitle: targetSong.author || "", body: s.text, label: s.label });
    }
  };

  const step = (d) => selectSlide(slide + d);

  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); step(1); }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      if (e.key === "Enter" && item) { e.preventDefault(); live ? takeLive(item) : show(item); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  useEffect(() => {
    const h = (e) => step(e.detail);
    window.addEventListener("selah-dock-step", h);
    return () => window.removeEventListener("selah-dock-step", h);
  });

  return (
    <AppShell pending={item}>
      <div className="row between wrap">
        <h1 className="page-title">Songs</h1>
        <div className="row wrap">
          <Select
            ariaLabel="Lines per slide"
            style={{ width: 155 }}
            value={lyricsLinesPerSlide}
            onChange={(v) => setLyricsLinesPerSlide(+v)}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n} ${n === 1 ? "line" : "lines"} / slide` }))}
          />
          <button className="btn btn-secondary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} />Add song
          </button>
        </div>
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
              <input className="input" style={{ height: 44, fontSize: 14 }} placeholder="Search title, author, or lyrics…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search songs" />
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Select
                ariaLabel="Filter by song pack"
                className="grow"
                value={packFilter}
                onChange={setPackFilter}
                options={[{ value: "all", label: `All packs (${songs.length})` }, ...packOptions.map((p) => ({ value: p, label: p }))]}
              />
              {langOptions.length > 1 && (
                <Select
                  ariaLabel="Filter by language"
                  style={{ width: 120 }}
                  value={langFilter}
                  onChange={setLangFilter}
                  options={[{ value: "all", label: "All langs" }, ...langOptions.map((l) => ({ value: l, label: l }))]}
                />
              )}
              <button className="chip clickable" aria-pressed={onlyFav} onClick={() => setOnlyFav((f) => !f)} style={onlyFav ? { color: "var(--gold)" } : null}>
                <Icon name="star" size={13} />Favourites
              </button>
            </div>
            {list.map((s) => (
              <button
                key={s.id}
                className={`verse ${song?.id === s.id ? "sel" : ""}`}
                onClick={() => {
                  setSongId(s.id);
                  const startSlide = s.matchedSlide >= 0 ? s.matchedSlide : 0;
                  selectSlide(startSlide, s);
                }}
                style={{ padding: "12px 14px" }}
              >
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
                {s.matchedLine && (
                  <div style={{ fontSize: 12, marginTop: 4 }} className="muted">
                    {highlightSegments(s.matchedLine.replace(/\n/g, " / "), q).map((seg, idx) =>
                      seg.match ? <span key={idx} className="hl">{seg.text}</span> : <span key={idx}>{seg.text}</span>
                    )}
                  </div>
                )}
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
                onClick={() => selectSlide(i)}
                onDoubleClick={() => takeLive({ kind: "song", title: song.title, subtitle: song.author || "", body: s.text, label: s.label })}
              >
                {s.label && <span className="pill">{s.label}</span>}
                <div>{s.text}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <AddSongModal open={adding} maxLines={lyricsLinesPerSlide} onClose={() => setAdding(false)} onSave={(s) => { addCustomSong(s); toast("Song saved on this computer."); }} />
    </AppShell>
  );
}
