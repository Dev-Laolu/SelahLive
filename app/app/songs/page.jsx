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
import { SuggestionTray } from "@/src/voice/ui/SuggestionTray";
import { TranscriptPanel } from "@/src/voice/ui/TranscriptPanel";
import { useVoice } from "@/src/voice/VoiceContext";

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
            <label htmlFor="song-upload-txt" className="drop">
              <div><Icon name="upload" size={28} /><div>Choose a .txt file</div></div>
              <input id="song-upload-txt" name="songFile" type="file" accept=".txt" hidden onChange={upload} />
            </label>
          ) : (
            <textarea
              id="song-paste-lyrics"
              name="songLyrics"
              aria-label="Paste song lyrics"
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
    songStats, bumpSongUse, themes, songThemeOverrides, setSongThemeOverride,
    lyricsLinesPerSlide, setLyricsLinesPerSlide,
    show, updateLive, takeLive, live,
  } = useApp();
  const { settings: voiceSettings } = useVoice();
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

  const songThemes = useMemo(() => themes.filter((t) => t.slot === "songs"), [themes]);

  // Split favourites (pinned at top, sorted by most used first, then title) vs normal songs (V1.2 §6)
  const { favList, otherList } = useMemo(() => {
    const favs = list
      .filter((s) => favSongs.includes(s.id))
      .sort((a, b) => {
        const ua = songStats[a.id]?.useCount || 0;
        const ub = songStats[b.id]?.useCount || 0;
        if (ub !== ua) return ub - ua;
        return (a.title || "").localeCompare(b.title || "");
      });
    const others = list.filter((s) => !favSongs.includes(s.id));
    return { favList: favs, otherList: others };
  }, [list, favSongs, songStats]);

  // Recently used songs row (V1.2 §6)
  const recentlyUsed = useMemo(() => {
    return songs
      .filter((s) => songStats[s.id]?.lastUsedAt)
      .sort((a, b) => (songStats[b.id]?.lastUsedAt || "").localeCompare(songStats[a.id]?.lastUsedAt || ""))
      .slice(0, 5);
  }, [songs, songStats]);

  const song = songs.find((s) => s.id === songId) || favList[0] || otherList[0];
  const sec = song?.sections[slide] || song?.sections[0];
  const songTplId = song ? (songThemeOverrides[song.id] || "") : "";
  const item = song && sec
    ? { kind: "song", songId: song.id, title: song.title, subtitle: song.author || "", author: song.author || "", body: sec.text, label: sec.label, templateId: songTplId }
    : null;

  const selectSlide = (idx, targetSong = song) => {
    if (!targetSong) return;
    const clamped = Math.max(0, Math.min(targetSong.sections.length - 1, idx));
    setSlide(clamped);
    const s = targetSong.sections[clamped];
    if (s) {
      updateLive({
        kind: "song",
        songId: targetSong.id,
        title: targetSong.title,
        subtitle: targetSong.author || "",
        author: targetSong.author || "",
        body: s.text,
        label: s.label,
        templateId: songThemeOverrides[targetSong.id] || "",
      });
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

      {/* SG-8: Voice suggestions for songs (title mentions & consecutive lyric matches) */}
      <SuggestionTray
        filterKind="song"
        songs={songs}
        onOperatorShow={(sugItem) => {
          if (sugItem.songId) {
            setSongId(sugItem.songId);
            setSlide(sugItem.slideIndex ?? 0);
            bumpSongUse(sugItem.songId);
          }
          const payload = {
            ...sugItem,
            templateId: (sugItem.songId && songThemeOverrides[sugItem.songId]) || "",
          };
          if (live) takeLive(payload);
          else show(payload);
        }}
        onOperatorPreview={(sugItem) => {
          if (sugItem.songId) {
            const target = songs.find((s) => s.id === sugItem.songId);
            setSongId(sugItem.songId);
            selectSlide(sugItem.slideIndex ?? 0, target);
          }
        }}
      />
      {voiceSettings.showTranscript !== false && <TranscriptPanel defaultOpen={false} />}

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
              <input id="songs-search" name="songsSearch" type="search" autoComplete="off" className="input" style={{ height: 44, fontSize: 14 }} placeholder="Search title, author, or lyrics…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search songs" />
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
            {recentlyUsed.length > 0 && (
              <div className="col" style={{ gap: 6 }}>
                <span className="label" style={{ fontSize: 11 }}>Recently used</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {recentlyUsed.map((rs) => (
                    <button
                      key={rs.id}
                      className="chip clickable"
                      onClick={() => {
                        setSongId(rs.id);
                        bumpSongUse(rs.id);
                        selectSlide(0, rs);
                      }}
                    >
                      {rs.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {favList.length > 0 && (
              <div className="col" style={{ gap: 6 }}>
                <span className="label" style={{ fontSize: 11 }}>Favourites (most used first)</span>
                {favList.map((s) => (
                  <button
                    key={s.id}
                    className={`verse ${song?.id === s.id ? "sel" : ""}`}
                    onClick={() => {
                      setSongId(s.id);
                      bumpSongUse(s.id);
                      const startSlide = s.matchedSlide >= 0 ? s.matchedSlide : 0;
                      selectSlide(startSlide, s);
                    }}
                    style={{ padding: "12px 14px" }}
                  >
                    <div className="row between">
                      <b>{s.title}</b>
                      <div className="row" style={{ gap: 6 }}>
                        {(songStats[s.id]?.useCount || 0) > 0 && <span className="muted mono" style={{ fontSize: 11 }}>{songStats[s.id].useCount}×</span>}
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Unfavourite"
                          onClick={(e) => { e.stopPropagation(); toggleFavSong(s.id); }}
                          style={{ color: "var(--gold)" }}
                        >
                          <Icon name="star" size={16} />
                        </span>
                      </div>
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
            )}

            {otherList.length > 0 && (
              <div className="col" style={{ gap: 6 }}>
                {favList.length > 0 && <span className="label" style={{ fontSize: 11 }}>All songs</span>}
                {otherList.map((s) => (
                  <button
                    key={s.id}
                    className={`verse ${song?.id === s.id ? "sel" : ""}`}
                    onClick={() => {
                      setSongId(s.id);
                      bumpSongUse(s.id);
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
                        style={{ color: "var(--text-2)" }}
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
            )}
          </div>
          <div className="col" style={{ gap: 10 }}>
            {song && (
              <div className="row between wrap" style={{ gap: 8 }}>
                <div><h2 style={{ fontSize: 22 }}>{song.title}</h2><span className="muted">{song.author}</span></div>
                <div className="row" style={{ gap: 8 }}>
                  <Select
                    ariaLabel="Per-song template override"
                    style={{ width: 190 }}
                    value={songTplId}
                    onChange={(tid) => setSongThemeOverride(song.id, tid)}
                    options={[{ value: "", label: "Default song template" }, ...songThemes.map((t) => ({ value: t.id, label: t.name }))]}
                  />
                  <span className="muted mono" style={{ fontSize: 12 }}>{slide + 1} / {song.sections.length}</span>
                </div>
              </div>
            )}
            {song?.sections.map((s, i) => (
              <button
                key={i}
                className={`slide ${i === slide ? "sel" : ""} ${live && live.title === song.title && live.body === s.text ? "live" : ""}`}
                onClick={() => { bumpSongUse(song.id); selectSlide(i); }}
                onDoubleClick={() => { bumpSongUse(song.id); takeLive({ kind: "song", songId: song.id, title: song.title, subtitle: song.author || "", author: song.author || "", body: s.text, label: s.label, templateId: songTplId }); }}
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
