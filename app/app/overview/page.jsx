"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useApp } from "@/lib/store";
import { highlightSegments, unifiedSearch } from "@/lib/search";
import { songSlides } from "@/lib/songs";
import { search as searchBible } from "@/lib/bible";
import { SuggestionTray } from "@/src/voice/ui/SuggestionTray";
import { TranscriptPanel } from "@/src/voice/ui/TranscriptPanel";
import { useVoice } from "@/src/voice/VoiceContext";

function HighlightedText({ text, query }) {
  const segs = useMemo(() => highlightSegments(text, query), [text, query]);
  return (
    <>
      {segs.map((s, i) => (s.match ? <span key={i} className="hl">{s.text}</span> : <span key={i}>{s.text}</span>))}
    </>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const toast = useToast();
  const {
    bibles, songPacks, customSongs, recentTexts, savedTexts, saveTextItem,
    favSongs, songStats, recent, pinned, updates, obsStatus, online,
    activeBibleId, live, show, updateLive, takeLive, hide, stepLive,
    lyricsLinesPerSlide, bumpSongUse, bumpTextUse, syncNotice, addRecent,
  } = useApp();
  const { settings: voiceSettings, serviceContext, addServiceContextItem, removeServiceContextItem, clearServiceContext } = useVoice();
  const [svcInput, setSvcInput] = useState("");

  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all"); // all | scripture | songs | text
  const [pending, setPending] = useState(null);
  const [newTextModal, setNewTextModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newFav, setNewFav] = useState(true);
  const inputRef = useRef(null);

  const handleCreateNewText = async ({ alsoShow = false } = {}) => {
    if (!newTitle.trim() && !newBody.trim()) return;
    const autoTitle = newTitle.trim() || newBody.trim().split("\n")[0].slice(0, 60) || "Announcement";
    try {
      const saved = await saveTextItem({
        title: autoTitle,
        body: newBody.trim(),
        tags: ["Service"],
        favourite: newFav,
      });
      const item = { kind: "text", title: saved.title, subtitle: "", body: saved.body, templateId: saved.templateId || "" };
      setPending(item);
      toast(`Saved "${saved.title}" to your app texts.`);
      if (alsoShow) {
        if (live) takeLive(item);
        else show(item);
        bumpTextUse(saved.id);
      } else {
        updateLive(item);
      }
      setNewTitle("");
      setNewBody("");
      setNewTextModal(false);
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  const pack = bibles.find((b) => b.id === activeBibleId) || bibles[0];

  const allSongs = useMemo(() => {
    const out = [...customSongs];
    songPacks.forEach((p) => (p.songs || []).forEach((s) => out.push({ ...s, packName: p.name })));
    return out;
  }, [customSongs, songPacks]);

  // Combine savedTexts + recentTexts for unified text search
  const searchableTexts = useMemo(() => {
    const mapped = savedTexts.map((t) => ({ id: t.id, title: t.title, body: t.body, templateId: t.templateId }));
    return [...mapped, ...recentTexts];
  }, [savedTexts, recentTexts]);

  const searchOut = useMemo(() => {
    if (!q.trim()) return { results: [] };
    return unifiedSearch({
      packs: bibles,
      selectedPackId: pack?.id,
      songPacks,
      customSongs,
      recentTexts: searchableTexts,
      query: q,
      scope,
      limit: 30,
    });
  }, [bibles, pack?.id, songPacks, customSongs, searchableTexts, q, scope]);

  const results = searchOut.results;

  // Favourites (songs sorted by most used first, then title; saved texts sorted by most used first, then title)
  const favouriteSongsList = useMemo(() => {
    return allSongs
      .filter((s) => favSongs.includes(s.id))
      .sort((a, b) => {
        const ua = songStats[a.id]?.useCount || 0;
        const ub = songStats[b.id]?.useCount || 0;
        if (ub !== ua) return ub - ua;
        return (a.title || "").localeCompare(b.title || "");
      })
      .slice(0, 6);
  }, [allSongs, favSongs, songStats]);

  const favouriteTextsList = useMemo(() => {
    return savedTexts
      .filter((t) => t.favourite)
      .sort((a, b) => {
        const ua = a.useCount || 0;
        const ub = b.useCount || 0;
        if (ub !== ua) return ub - ua;
        return (a.title || "").localeCompare(b.title || "");
      })
      .slice(0, 6);
  }, [savedTexts]);

  const selectResult = (r) => {
    const item = {
      kind: r.kind || "scripture",
      title: r.title || r.ref || "",
      subtitle: r.subtitle || (r.kind === "scripture" ? pack?.code || "" : ""),
      body: r.body || r.text || "",
      label: r.label || "",
      songId: r.songId || "",
      templateId: r.templateId || "",
      ref: r.ref || r.title || "",
    };
    setPending(item);
    updateLive(item);
  };

  const selectSong = (s) => {
    const slides = songSlides(s, lyricsLinesPerSlide);
    const first = slides[0] || { label: "", text: "" };
    const item = {
      kind: "song",
      songId: s.id,
      title: s.title,
      subtitle: s.author || s.packName || "",
      author: s.author || "",
      label: first.label,
      body: first.text,
    };
    setPending(item);
    bumpSongUse(s.id);
    updateLive(item);
  };

  const selectSavedText = (t) => {
    const item = {
      kind: "text",
      title: t.title,
      subtitle: "",
      body: t.body,
      templateId: t.templateId || "",
    };
    setPending(item);
    bumpTextUse(t.id);
    updateLive(item);
  };

  const selectRecentVerse = (refLabel) => {
    if (!pack) return;
    const hit = searchBible(pack, refLabel, 1)?.[0];
    if (!hit) return;
    const item = {
      kind: "scripture",
      title: hit.ref,
      subtitle: pack.code,
      body: hit.text,
      ref: hit.ref,
    };
    setPending(item);
    updateLive(item);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }
      if (e.key === "Escape") { hide(); return; }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "Enter" && pending) {
        e.preventDefault();
        if (live) takeLive(pending);
        else show(pending);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, live, show, takeLive, hide]);

  return (
    <AppShell pending={pending}>
      <div className="col" style={{ gap: 18 }}>
        {/* Header & Quick actions */}
        <div className="row between wrap" style={{ gap: 12 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>Overview</h1>
            <div className="muted" style={{ fontSize: 13 }}>Search across Scripture, Songs, and Saved Texts — or jump straight into your service.</div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewTextModal(true)}><Icon name="plus" size={16} />New text</button>
            <Link href="/app/songs" className="btn btn-secondary btn-sm"><Icon name="music" size={16} />Add song</Link>
            <Link href="/app/display" className="btn btn-primary btn-sm"><Icon name="monitor" size={16} />Open Display</Link>
          </div>
        </div>

        {/* Status & Updates strip */}
        <div className="row wrap" style={{ gap: 10 }}>
          <span className={`chip ${obsStatus === "connected" ? "ok" : ""}`}>
            <span className={`dot ${obsStatus === "connected" ? "ok" : "warn"}`} />
            OBS {obsStatus === "connected" ? "connected" : "not connected"}
          </span>
          <span className={`chip ${online ? "ok" : "warn"}`}>
            <span className={`dot ${online ? "ok" : "warn"}`} />
            {online ? "Online" : "Offline ready"}
          </span>
          {updates.length > 0 && (
            <Link href="/app/library" className="chip warn" style={{ textDecoration: "none" }}>
              <Icon name="download" size={14} /> {updates.length} library update{updates.length > 1 ? "s" : ""} available
            </Link>
          )}
          {syncNotice && <span className="chip ok">{syncNotice}</span>}
        </div>

        {/* SG-8: Voice Assistant Panel on Overview (all suggestion kinds + optional live transcript) */}
        <SuggestionTray
          bibles={bibles}
          activeBibleId={pack?.id}
          songs={allSongs}
          savedTexts={savedTexts}
          onOperatorShow={(sugItem) => {
            setPending(sugItem);
            if (live) takeLive(sugItem);
            else show(sugItem);
            if (sugItem.ref) addRecent(sugItem.ref);
            if (sugItem.songId) bumpSongUse(sugItem.songId);
            if (sugItem.savedTextId) bumpTextUse(sugItem.savedTextId);
          }}
          onOperatorPreview={(sugItem) => {
            setPending(sugItem);
          }}
        />
        {voiceSettings.showTranscript !== false && <TranscriptPanel defaultOpen={true} />}

        {/* MD-7: Service Context (optional preload list for today's expected verses, songs & texts) */}
        {voiceSettings.enabled && (
          <div className="card col" style={{ gap: 8, padding: 12 }}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <Icon name="pin" size={15} className="gold" />
                <b style={{ fontSize: 13 }}>Today&apos;s Service Context (Voice Confidence Boost)</b>
                <span className="muted" style={{ fontSize: 12 }}>
                  Preload expected verses, songs, or slides so they rank first when spoken.
                </span>
              </div>
              {serviceContext.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 26, padding: "2px 8px", fontSize: 11 }} onClick={() => clearServiceContext()}>
                  Clear list
                </button>
              )}
            </div>
            <form
              className="row wrap"
              style={{ gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!svcInput.trim()) return;
                addServiceContextItem(svcInput.trim());
                setSvcInput("");
              }}
            >
              <input
                className="input grow"
                style={{ height: 34, fontSize: 13 }}
                maxLength={80}
                value={svcInput}
                onChange={(e) => setSvcInput(e.target.value)}
                placeholder='Add expected verse, song, or slide (e.g. "Romans 8:28", "Amazing Grace", "Offering today")…'
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={!svcInput.trim()}>
                <Icon name="plus" size={14} /> Add to Service Context
              </button>
            </form>
            {serviceContext.length > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>
                {serviceContext.map((itemLabel) => (
                  <span key={itemLabel} className="chip gold" style={{ fontSize: 12 }}>
                    {itemLabel}
                    <button
                      type="button"
                      aria-label={`Remove ${itemLabel} from service context`}
                      onClick={() => removeServiceContextItem(itemLabel)}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Live now card (V1.2 §1) */}
        <div className="card raised col" style={{ gap: 10 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className={`dot ${live ? "bad pulse" : ""}`} />
              <b>{live ? "Live now" : "Nothing on screen"}</b>
              {live && <span className="chip">{live.kind}</span>}
            </div>
            {live ? (
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => stepLive(-1)}><Icon name="left" size={15} />Prev</button>
                <button className="btn btn-secondary btn-sm" onClick={() => stepLive(1)}>Next<Icon name="right" size={15} /></button>
                <button className="btn btn-danger btn-sm" onClick={hide}><Icon name="eyeoff" size={15} />Hide</button>
              </div>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>Select any item below and press SHOW</span>
            )}
          </div>
          {live && (
            <div style={{ fontSize: 15, lineHeight: 1.4 }}>
              <b className="gold">{live.title}{live.subtitle ? ` · ${live.subtitle}` : ""}</b>
              <div className="muted" style={{ marginTop: 4, whiteSpace: "pre-line" }}>{live.body}</div>
            </div>
          )}
        </div>

        {/* Unified Search Box (V1.2 §1 — moved here from Scripture) */}
        <div className="card col" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="seg" role="tablist" aria-label="Search scope">
              {[
                ["all", "All"],
                ["scripture", "Scripture"],
                ["songs", "Songs"],
                ["text", "Text"],
              ].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={scope === id} aria-pressed={scope === id} onClick={() => setScope(id)}>
                  {label}
                </button>
              ))}
            </div>
            {pending?.kind === "scripture" && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => router.push(`/app/scripture?q=${encodeURIComponent(pending.title || "")}`)}
              >
                Open in Scripture <Icon name="right" size={14} />
              </button>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <Icon name="search" size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input
              ref={inputRef}
              className="input"
              style={{ paddingLeft: 42, fontSize: 16 }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='Search everything… e.g. "John 3:16", "Amazing Grace", "Offering" (Ctrl+K)'
            />
          </div>

          {q.trim() && (
            <div className="col" style={{ gap: 6, maxHeight: 300, overflowY: "auto" }}>
              {results.length === 0 ? (
                <div className="muted" style={{ padding: 12, fontSize: 13 }}>No matches found for &ldquo;{q}&rdquo;.</div>
              ) : (
                results.map((r) => {
                  const active = pending && pending.title === (r.title || r.ref) && pending.body === (r.body || r.text);
                  return (
                    <div
                      key={r.id}
                      className={`list-item ${active ? "active" : ""}`}
                      tabIndex={0}
                      onClick={() => selectResult(r)}
                      onDoubleClick={() => { selectResult(r); show({ kind: r.kind || "scripture", title: r.title || r.ref, subtitle: r.subtitle || "", body: r.body || r.text || "", label: r.label || "" }); }}
                      onKeyDown={(e) => e.key === "Enter" && selectResult(r)}
                    >
                      <div className="row between" style={{ marginBottom: 3 }}>
                        <b><HighlightedText text={r.title || r.ref} query={q} /></b>
                        <span className="chip">{r.kind === "song" ? "Song" : r.kind === "text" ? "Text" : r.subtitle || "Scripture"}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <HighlightedText text={r.body || r.text || ""} query={q} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Grouped Favourites & Recent */}
        <div className="grid2">
          <div className="card col" style={{ gap: 10 }}>
            <div className="row between">
              <h3 style={{ fontSize: 15 }}><Icon name="star" size={16} className="gold" style={{ marginRight: 6 }} />Favourites &amp; Saved Texts</h3>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewTextModal(true)}><Icon name="plus" size={13} />Add text</button>
                <Link href="/app/text" className="muted" style={{ fontSize: 12 }}>All texts</Link>
              </div>
            </div>
            {favouriteSongsList.length === 0 && savedTexts.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>Star your favourite songs or click Add text to create a saved text.</div>
            ) : (
              <div className="col" style={{ gap: 6 }}>
                {favouriteSongsList.map((s) => (
                  <button key={s.id} className="list-item" style={{ textAlign: "left" }} onClick={() => selectSong(s)}>
                    <div className="row between">
                      <b>{s.title}</b>
                      <span className="chip">Song</span>
                    </div>
                    {s.author && <div className="muted" style={{ fontSize: 12 }}>{s.author}</div>}
                  </button>
                ))}
                {savedTexts.slice(0, 8).map((t) => (
                  <button key={t.id} className="list-item" style={{ textAlign: "left" }} onClick={() => selectSavedText(t)}>
                    <div className="row between">
                      <b>{t.title}</b>
                      <span className="chip">Text</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.body}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card col" style={{ gap: 10 }}>
            <div className="row between">
              <h3 style={{ fontSize: 15 }}><Icon name="clock" size={16} className="gold" style={{ marginRight: 6 }} />Recent &amp; Pinned</h3>
              <Link href="/app/scripture" className="muted" style={{ fontSize: 12 }}>Scripture</Link>
            </div>
            {recent.length === 0 && pinned.length === 0 && recentTexts.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>Verses and texts you display will appear here for quick recall.</div>
            ) : (
              <div className="col" style={{ gap: 8 }}>
                {(pinned.length > 0 || recent.length > 0) && (
                  <div className="row wrap" style={{ gap: 6 }}>
                    {[...new Set([...pinned, ...recent])].slice(0, 10).map((r) => (
                      <button key={r} className="btn btn-secondary btn-sm" onClick={() => selectRecentVerse(r)}>
                        {pinned.includes(r) && <Icon name="pin" size={13} className="gold" />}
                        {r}
                      </button>
                    ))}
                  </div>
                )}
                {recentTexts.slice(0, 3).map((t, i) => (
                  <button
                    key={i}
                    className="list-item"
                    style={{ textAlign: "left" }}
                    onClick={() => {
                      const item = { kind: "text", title: t.title || "", subtitle: "", body: t.body || "" };
                      setPending(item);
                      updateLive(item);
                    }}
                  >
                    <b>{t.title || "Quick text"}</b>
                    <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.body}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {newTextModal && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Create new text" onClick={(e) => e.target === e.currentTarget && setNewTextModal(false)}>
          <div className="modal col" style={{ gap: 12, maxWidth: 520 }}>
            <div className="row between">
              <h3 style={{ margin: 0 }}>Create &amp; Save New Text</h3>
              <button type="button" className="iconbtn" onClick={() => setNewTextModal(false)}><Icon name="x" size={18} /></button>
            </div>
            <div className="field">
              <label htmlFor="ov-new-title">Title (optional — auto-filled from text if blank)</label>
              <input id="ov-new-title" className="input" maxLength={100} autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Sermon Point 1, Offering, Welcome…" />
            </div>
            <div className="field">
              <label htmlFor="ov-new-body">Text to display</label>
              <textarea id="ov-new-body" className="textarea" style={{ minHeight: 130 }} maxLength={10000} value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Type your announcement, note, or custom text here…" />
            </div>
            <label className="check">
              <input type="checkbox" checked={newFav} onChange={(e) => setNewFav(e.target.checked)} />
              <span>Pin to Favourites on Overview &amp; Text list</span>
            </label>
            <div className="row wrap" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setNewTextModal(false)}>Cancel</button>
              <button type="button" className="btn btn-secondary" disabled={!newTitle.trim() && !newBody.trim()} onClick={() => handleCreateNewText({ alsoShow: false })}>
                <Icon name="plus" size={15} /> Save &amp; Add to App
              </button>
              <button type="button" className="btn btn-primary" disabled={!newBody.trim()} onClick={() => handleCreateNewText({ alsoShow: true })}>
                <Icon name="play" size={15} /> Save &amp; Show Live
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
