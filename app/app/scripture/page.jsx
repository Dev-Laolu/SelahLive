"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Select from "@/components/Select";
import { useToast } from "@/components/Toast";
import { useApp } from "@/lib/store";
import { neighbour, getAvailableChapters, getAvailableVerses, getVerse } from "@/lib/bible";
import { getBookSuggestions, getReferenceGuidance, highlightSegments, unifiedSearch } from "@/lib/search";
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

export default function ScripturePage() {
  const {
    bibles,
    activeBibleId, setActiveBibleId,
    show, updateLive, takeLive, live,
    recent, addRecent, pinned, togglePin,
  } = useApp();
  const { settings: voiceSettings } = useVoice();
  const toast = useToast();

  const [q, setQ] = useState("John 3:16");
  const [allVersions, setAllVersions] = useState(false);
  const [sel, setSel] = useState(null);
  const [selIdx, setSelIdx] = useState(0);
  const inputRef = useRef(null);

  // Pick up ?q=... when arriving from Overview's "Open in Scripture"
  useEffect(() => {
    if (typeof window === "undefined") return;
    const paramQ = new URLSearchParams(window.location.search).get("q");
    if (paramQ && paramQ.trim()) setQ(paramQ.trim());
  }, []);

  const pack = bibles.find((b) => b.id === activeBibleId) || bibles[0];

  const bookSuggestions = useMemo(() => getBookSuggestions(q, pack), [q, pack]);
  const guidance = useMemo(() => getReferenceGuidance(q, pack), [q, pack]);

  const searchOut = useMemo(
    () =>
      unifiedSearch({
        packs: bibles,
        selectedPackId: pack?.id,
        songPacks: [],
        customSongs: [],
        recentTexts: [],
        query: q,
        scope: "scripture",
        allVersions,
        limit: 50,
      }),
    [bibles, pack?.id, q, allVersions]
  );

  const results = searchOut.results;

  // Keep selected item synced with search results
  useEffect(() => {
    if (results.length) {
      const matchIdx = sel ? results.findIndex((r) => r.id === sel.id) : -1;
      if (matchIdx >= 0) {
        setSelIdx(matchIdx);
        setSel(results[matchIdx]);
      } else {
        setSelIdx(0);
        setSel(results[0]);
      }
    } else {
      setSel(null);
      setSelIdx(0);
    }
  }, [results]); // eslint-disable-line

  const item = sel
    ? {
        kind: sel.kind || "scripture",
        title: sel.title || sel.ref,
        subtitle: sel.subtitle || pack?.code || "",
        body: sel.body || sel.text || "",
        label: sel.label || "",
      }
    : null;

  // Select helper: updates preview AND updates live immediately when Live Follow is ON (BUG 1)
  const selectItem = (r, idx = 0, { triggerLive = true } = {}) => {
    setSel(r);
    setSelIdx(idx);
    if (triggerLive && r) {
      updateLive({
        kind: r.kind || "scripture",
        title: r.title || r.ref,
        subtitle: r.subtitle || pack?.code || "",
        body: r.body || r.text || "",
        label: r.label || "",
      });
    }
  };

  // Version switch while live: re-fetch the same verse in the new Bible version and update live immediately!
  const handleVersionChange = (newPackId) => {
    setActiveBibleId(newPackId);
    const nextPack = bibles.find((b) => b.id === newPackId);
    if (nextPack && sel?.book && sel?.chapter && sel?.verse) {
      const updated = getVerse(nextPack, sel.book, sel.chapter, sel.verse);
      if (updated) {
        const nextItem = {
          kind: "scripture",
          id: `${nextPack.id}:${updated.ref}`,
          ref: updated.ref,
          title: updated.ref,
          subtitle: nextPack.code,
          body: updated.text,
          text: updated.text,
          book: updated.book,
          bookName: updated.bookName,
          chapter: updated.chapter,
          verse: updated.verse,
          code: nextPack.code,
          packId: nextPack.id,
        };
        setSel(nextItem);
        updateLive(nextItem, { immediate: true });
      }
    }
  };

  // Next / Previous verse stepping with chapter & book boundary rollover + toast (BUG 1 §1.2)
  const go = (dir) => {
    if (!sel || !pack || (sel.kind && sel.kind !== "scripture")) return;
    const n = neighbour(pack, sel, dir);
    if (!n) return;
    const nextItem = {
      kind: "scripture",
      id: `${pack.id}:${n.ref}`,
      ref: n.ref,
      title: n.ref,
      subtitle: pack.code,
      body: n.text,
      text: n.text,
      book: n.book,
      bookName: n.bookName,
      chapter: n.chapter,
      verse: n.verse,
      code: pack.code,
      packId: pack.id,
    };
    setSel(nextItem);
    setQ(n.ref);
    updateLive(nextItem);
    if (n.boundaryChanged) {
      toast(`${n.bookName} ${n.chapter}`);
    }
  };

  const doTakeLive = () => {
    if (!item) return;
    if (live) takeLive(item);
    else show(item);
    if (sel?.ref) addRecent(sel.ref);
  };

  // Keyboard shortcuts (BUG 1 §1.2 + Smart Search §5.4)
  useEffect(() => {
    const k = (e) => {
      const typing = /INPUT|TEXTAREA/.test(e.target.tagName);
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }
      if (typing && e.target === inputRef.current) {
        if (e.key === "Tab" && bookSuggestions.length > 0 && !guidance?.ref?.chapter) {
          e.preventDefault();
          setQ(`${bookSuggestions[0].name} `);
          return;
        }
        if (e.key === "ArrowDown" && results.length > 0) {
          e.preventDefault();
          const ni = Math.min(results.length - 1, selIdx + 1);
          selectItem(results[ni], ni);
          return;
        }
        if (e.key === "ArrowUp" && results.length > 0) {
          e.preventDefault();
          const ni = Math.max(0, selIdx - 1);
          selectItem(results[ni], ni);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          doTakeLive();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setQ("");
          return;
        }
        return;
      }
      if (!typing) {
        if (e.key === "Enter") { e.preventDefault(); doTakeLive(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        else if (e.key === "ArrowDown" && results.length > 0) {
          e.preventDefault();
          const ni = Math.min(results.length - 1, selIdx + 1);
          selectItem(results[ni], ni);
        } else if (e.key === "ArrowUp" && results.length > 0) {
          e.preventDefault();
          const ni = Math.max(0, selIdx - 1);
          selectItem(results[ni], ni);
        }
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // Listen for OBS Dock commands (step, version, select)
  useEffect(() => {
    const onStep = (e) => go(e.detail);
    const onVer = (e) => handleVersionChange(e.detail);
    const onSelect = (e) => {
      if (e.detail?.title) {
        setSel(e.detail);
        if (e.detail.kind === "scripture") setQ(e.detail.title);
      }
    };
    window.addEventListener("selah-dock-step", onStep);
    window.addEventListener("selah-dock-version", onVer);
    window.addEventListener("selah-dock-select", onSelect);
    return () => {
      window.removeEventListener("selah-dock-step", onStep);
      window.removeEventListener("selah-dock-version", onVer);
      window.removeEventListener("selah-dock-select", onSelect);
    };
  });

  const currentBookNum = sel?.book || pack?.books?.[0]?.n || 43;
  const availableChapters = useMemo(() => (pack ? getAvailableChapters(pack, currentBookNum) : []), [pack, currentBookNum]);
  const currentChapter = sel?.chapter || availableChapters[0] || 1;
  const availableVerses = useMemo(() => (pack ? getAvailableVerses(pack, currentBookNum, currentChapter) : []), [pack, currentBookNum, currentChapter]);

  const jumpToRef = (bookNum, chapter, verse = 1) => {
    if (!pack) return;
    const b = pack.books?.find((x) => x.n === +bookNum);
    if (!b) return;
    const gv = getVerse(pack, b.n, +chapter, +verse);
    if (gv) {
      const nextItem = {
        kind: "scripture",
        id: `${pack.id}:${gv.ref}`,
        ref: gv.ref,
        title: gv.ref,
        subtitle: pack.code,
        body: gv.text,
        text: gv.text,
        book: gv.book,
        bookName: gv.bookName,
        chapter: gv.chapter,
        verse: gv.verse,
        code: pack.code,
        packId: pack.id,
      };
      setQ(gv.ref);
      setSel(nextItem);
      updateLive(nextItem);
    } else {
      setQ(`${b.name} ${chapter}`);
    }
  };

  return (
    <AppShell pending={item}>
      {/* SG-8: "Suggested from voice" strip at the top of Scripture (scripture only) */}
      <SuggestionTray
        filterKind="scripture"
        bibles={bibles}
        activeBibleId={pack?.id}
        onOperatorShow={(sugItem) => {
          setQ(sugItem.ref || sugItem.title);
          setSel({ ...sugItem, id: `${pack?.id}:${sugItem.title}`, text: sugItem.body });
          if (live) takeLive(sugItem);
          else show(sugItem);
          if (sugItem.ref) addRecent(sugItem.ref);
        }}
        onOperatorPreview={(sugItem) => {
          setQ(sugItem.ref || sugItem.title);
          setSel({ ...sugItem, id: `${pack?.id}:${sugItem.title}`, text: sugItem.body });
        }}
      />
      {voiceSettings.showTranscript !== false && <TranscriptPanel defaultOpen={true} />}

      {/* Smart Search Bar + Searchable Bible Version Combobox */}
      <div className="row wrap">
        <div className="search grow">
          <Icon name="search" />
          <input
            ref={inputRef}
            id="scripture-search"
            name="scriptureSearch"
            type="search"
            autoComplete="off"
            className="input"
            maxLength={200}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search Bible reference (John 3:16-18) or keywords ("love your neighbor")…`}
            aria-label="Search scripture references and Bible text"
          />
        </div>
        {bibles.length > 0 && (
          <Select
            searchable
            searchPlaceholder="Filter Bible versions…"
            ariaLabel="Bible version"
            style={{ width: 220 }}
            value={pack?.id || ""}
            onChange={handleVersionChange}
            options={bibles.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}`, sub: b.language }))}
          />
        )}
      </div>

      {/* All Versions Toggle (Scripture-only screen) */}
      {bibles.length > 1 && (
        <div className="row" style={{ gap: 10 }}>
          <label htmlFor="scripture-all-versions" className="check" style={{ fontSize: 12, alignItems: "center" }}>
            <input id="scripture-all-versions" name="allVersions" type="checkbox" checked={allVersions} onChange={(e) => setAllVersions(e.target.checked)} />
            <span className="muted">Search across all downloaded Bible versions</span>
          </label>
        </div>
      )}

      {/* Book Suggestion Chips (e.g. typing "Jo") */}
      {bookSuggestions.length > 0 && !guidance?.ref?.chapter && (
        <div className="row wrap" style={{ gap: 6 }} aria-label="Book suggestions">
          <span className="muted" style={{ fontSize: 12 }}>Books:</span>
          {bookSuggestions.map((b) => (
            <button key={b.n} className="chip clickable" onClick={() => { setQ(`${b.name} `); inputRef.current?.focus(); }}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Guided Hint / Out-of-range Hint */}
      {guidance && (
        <div className={`row ${guidance.type === "warn" ? "banner warn" : ""}`} style={{ padding: guidance.type === "warn" ? "8px 12px" : "0 4px", fontSize: 12 }}>
          <Icon name={guidance.type === "warn" ? "alert" : "book"} size={14} className="gold" />
          {guidance.canonical && <b className="gold">{guidance.canonical}</b>}
          <span className="muted">{guidance.text}</span>
        </div>
      )}

      {/* Pinned & Recent Chips */}
      {(pinned.length > 0 || recent.length > 0) && (
        <div className="row wrap" style={{ gap: 8 }}>
          {pinned.map((p) => (
            <span key={"p" + p} className="chip clickable gold" onClick={() => setQ(p)}>
              <Icon name="pin" size={13} />{p}
              <button aria-label={`Unpin ${p}`} onClick={(e) => { e.stopPropagation(); togglePin(p); }}><Icon name="x" size={13} /></button>
            </span>
          ))}
          {recent.filter((r) => !pinned.includes(r)).slice(0, 6).map((r) => (
            <span key={"r" + r} className="chip clickable" onClick={() => setQ(r)}>{r}</span>
          ))}
        </div>
      )}

      {/* Synced Book / Chapter / Verse Pickers */}
      {pack && (
        <div className="row between wrap card" style={{ padding: 12, gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => go(-1)} disabled={!sel || sel.kind !== "scripture"}>
            <Icon name="left" size={16} />Prev
          </button>
          <div className="row wrap" style={{ gap: 8 }}>
            <Select
              searchable
              searchPlaceholder="Filter books…"
              ariaLabel="Book"
              style={{ width: 170 }}
              value={currentBookNum}
              onChange={(bn) => {
                const chs = getAvailableChapters(pack, +bn);
                jumpToRef(+bn, chs[0] || 1, 1);
              }}
              options={(pack.books || []).map((b) => ({ value: b.n, label: b.name }))}
            />
            {availableChapters.length > 0 && (
              <Select
                ariaLabel="Chapter"
                style={{ width: 112 }}
                value={currentChapter}
                onChange={(ch) => jumpToRef(currentBookNum, +ch, 1)}
                options={availableChapters.map((ch) => ({ value: ch, label: `Ch. ${ch}` }))}
              />
            )}
            {availableVerses.length > 0 && (
              <Select
                ariaLabel="Verse"
                style={{ width: 100 }}
                value={sel?.verse || availableVerses[0]}
                onChange={(v) => jumpToRef(currentBookNum, currentChapter, +v)}
                options={availableVerses.map((v) => ({ value: v, label: `v. ${v}` }))}
              />
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => go(1)} disabled={!sel || sel.kind !== "scripture"}>
            Next<Icon name="right" size={16} />
          </button>
        </div>
      )}

      {/* Results List */}
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
          <b style={{ color: "var(--text)" }}>No matches found</b>
          <span>Try a reference like “John 3:16-18”, “1 Jn 4:8”, or a phrase in quotes.</span>
        </div>
      ) : (
        <>
          <div className="muted mono" style={{ fontSize: 12 }}>
            {results.length} {results.length === 1 ? "match" : "matches"}
          </div>
          <div className="col" style={{ gap: 10 }}>
            {results.map((r, idx) => {
              const isSelected = sel?.id === r.id;
              const isLiveItem = live && live.title === r.title && live.body === r.body;
              return (
                <button
                  key={r.id}
                  className={`verse ${isSelected ? "sel" : ""} ${isLiveItem ? "live" : ""}`}
                  onClick={() => selectItem(r, idx)}
                  onDoubleClick={() => {
                    selectItem(r, idx, { triggerLive: false });
                    takeLive({ kind: r.kind, title: r.title, subtitle: r.subtitle || "", body: r.body, label: r.label || "" });
                    if (r.ref) addRecent(r.ref);
                  }}
                >
                  <div className="row between">
                    <span className="ref">
                      {r.title}
                      {r.label ? <span className="pill" style={{ marginLeft: 8 }}>{r.label}</span> : null}
                    </span>
                    <span className="row" style={{ gap: 8 }}>
                      {r.startsMatch && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="chip clickable ok"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQ(`${r.bookName} ${r.chapter}:${r.verse}-${r.verse + 3}`);
                          }}
                        >
                          Next verses →
                        </span>
                      )}
                      <span className="chip">{r.kind === "song" ? r.pack || "Song" : r.subtitle || pack?.code}</span>
                      {r.ref && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={pinned.includes(r.ref) ? "Unpin" : "Pin"}
                          onClick={(e) => { e.stopPropagation(); togglePin(r.ref); }}
                          style={{ color: pinned.includes(r.ref) ? "var(--gold)" : "var(--text-2)" }}
                        >
                          <Icon name="star" size={18} />
                        </span>
                      )}
                    </span>
                  </div>
                  <p>
                    {searchOut.parsed ? r.body : <HighlightedText text={r.body} query={q} />}
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
