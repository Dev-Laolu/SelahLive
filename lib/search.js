// Unified Smart Search engine for App & OBS Dock (V1.1 Section 5).
// Supports: fuzzy Bible references, book suggestion chips, guided hints, quoted exact phrase search,
// multi-version search, song lyrics search with slide matching, and safe text highlight segments.
import { BOOK_NAMES, parseReference, getVerse, getAvailableChapters, getAvailableVerses, normalizeBookInput } from "./bible.js";

const MAX_QUERY_LEN = 200;

/**
 * Returns book suggestion chips when the user types a partial book name like "Jo" -> John, Job, Joel, Jonah, Joshua, 1 John, 2 John, 3 John.
 */
export function getBookSuggestions(query, pack) {
  const q = normalizeBookInput(query).trim();
  if (!q || q.length > 24 || /\d+[:\s]\d+/.test(q)) return [];
  // Only suggest if user is still typing a book name (no chapter number yet)
  if (/^[a-z1-3\s]+\s+\d+$/i.test(q) && !/^[1-3]\s*[a-z]*$/i.test(q)) return [];
  const clean = q.replace(/\s+/g, "");
  const availableNums = pack ? new Set((pack.books || []).map((b) => b.n)) : null;

  const matches = [];
  BOOK_NAMES.forEach((name, idx) => {
    const n = idx + 1;
    if (availableNums && !availableNums.has(n)) return;
    const low = name.toLowerCase();
    const compact = low.replace(/\s+/g, "");
    const withoutNum = low.replace(/^[1-3]\s+/, "");
    let score = 0;
    if (low === q || compact === clean) score = 100;
    else if (low.startsWith(q) || compact.startsWith(clean)) score = 80;
    else if (withoutNum.startsWith(q)) score = 60;
    if (score > 0) matches.push({ n, name, score });
  });

  return matches
    .sort((a, b) => b.score - a.score || a.n - b.n)
    .slice(0, 8);
}

/**
 * Returns a guided hint or out-of-range hint for the typed reference.
 */
export function getReferenceGuidance(query, pack) {
  const trimmed = String(query || "").trim().slice(0, MAX_QUERY_LEN);
  if (!trimmed || !pack) return null;
  const ref = parseReference(trimmed);
  if (!ref) return null;

  const b = pack.books?.find((x) => x.n === ref.book);
  if (!b) return { type: "warn", text: `${ref.bookName} is not in ${pack.code}.` };

  const chapters = getAvailableChapters(pack, ref.book);
  const maxCh = chapters.length ? chapters[chapters.length - 1] : (b.chapters?.length || 0);

  if (!ref.chapter) {
    return {
      type: "guide",
      ref,
      canonical: ref.bookName,
      text: `Chapter (1–${maxCh})`,
    };
  }

  if (ref.chapter < 1 || ref.chapter > maxCh || !chapters.includes(ref.chapter)) {
    return {
      type: "warn",
      ref,
      text: `${ref.bookName} has ${maxCh} ${maxCh === 1 ? "chapter" : "chapters"}.`,
    };
  }

  const verses = getAvailableVerses(pack, ref.book, ref.chapter);
  const maxV = verses.length ? verses[verses.length - 1] : 0;

  if (!ref.verse) {
    return {
      type: "guide",
      ref,
      canonical: `${ref.bookName} ${ref.chapter}`,
      text: `Verse (1–${maxV}), or range 1-${Math.min(3, maxV)}`,
    };
  }

  if (ref.verse < 1 || ref.verse > maxV) {
    return {
      type: "warn",
      ref,
      text: `${ref.bookName} ${ref.chapter} has ${maxV} verses.`,
    };
  }

  const endV = ref.end || ref.verse;
  const canonical =
    ref.endChapter && ref.endChapter > ref.chapter
      ? `${ref.bookName} ${ref.chapter}:${ref.verse}-${ref.endChapter}:${endV}`
      : endV > ref.verse
      ? `${ref.bookName} ${ref.chapter}:${ref.verse}-${endV}`
      : `${ref.bookName} ${ref.chapter}:${ref.verse}`;

  return {
    type: "ready",
    ref,
    canonical,
    text: endV > ref.verse ? `Showing ${canonical} · Press Enter to show` : `Press Enter to show, or add -${Math.min(maxV, ref.verse + 2)} for a range`,
  };
}

/**
 * Splits a text string into safe highlight segments: [{ text, match: boolean }] (no HTML injection).
 */
export function highlightSegments(text, query) {
  const str = String(text || "");
  const cleanQ = String(query || "").trim().slice(0, MAX_QUERY_LEN);
  if (!cleanQ) return [{ text: str, match: false }];

  // Extract quoted exact phrases and individual words
  const tokens = [];
  const phraseRe = /"([^"]+)"/g;
  let m;
  let remainder = cleanQ;
  while ((m = phraseRe.exec(cleanQ)) !== null) {
    if (m[1].trim()) tokens.push(m[1].trim());
    remainder = remainder.replace(m[0], " ");
  }
  remainder
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2)
    .forEach((w) => tokens.push(w));

  if (!tokens.length) return [{ text: str, match: false }];
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = str.split(re).filter((p) => p.length > 0);
  const lowerTokens = tokens.map((t) => t.toLowerCase());
  return parts.map((p) => ({
    text: p,
    match: lowerTokens.some((t) => p.toLowerCase() === t),
  }));
}

/**
 * Searches scripture across one or all downloaded Bible packs.
 */
export function searchScripture({ packs, selectedPackId, query, allVersions = false, limit = 50, rangeSplitLines = 0 }) {
  const q = String(query || "").trim().slice(0, MAX_QUERY_LEN);
  if (!q || !packs?.length) return { results: [], parsed: null, isReference: false };

  const activePack = packs.find((p) => p.id === selectedPackId) || packs[0];
  const ref = parseReference(q);

  if (ref && activePack) {
    const b = activePack.books?.find((x) => x.n === ref.book);
    if (b) {
      const verses = [];
      if (ref.extraVerses && ref.chapter) {
        for (const vn of ref.extraVerses) {
          const gv = getVerse(activePack, ref.book, ref.chapter, vn);
          if (gv) verses.push(gv);
        }
      } else if (ref.chapter && ref.endChapter && ref.endChapter > ref.chapter && ref.verse && ref.end) {
        for (let c = ref.chapter; c <= ref.endChapter; c++) {
          const vs = b.chapters?.[c - 1];
          if (!Array.isArray(vs)) continue;
          const startV = c === ref.chapter ? ref.verse : 1;
          const stopV = c === ref.endChapter ? ref.end : vs.length;
          for (let v = startV; v <= stopV && verses.length < limit; v++) {
            const gv = getVerse(activePack, ref.book, c, v);
            if (gv) verses.push(gv);
          }
        }
      } else {
        const chs = ref.chapter ? [ref.chapter] : (b.chapters || []).map((_, i) => i + 1);
        for (const c of chs) {
          const vs = b.chapters?.[c - 1];
          if (!Array.isArray(vs)) continue;
          for (let v = 1; v <= vs.length && verses.length < limit; v++) {
            if (ref.verse && (v < ref.verse || v > (ref.end || ref.verse))) continue;
            const gv = getVerse(activePack, ref.book, c, v);
            if (gv) verses.push(gv);
          }
        }
      }

      // If it's a multi-verse range (e.g. John 3:16-18), also offer a combined range card at the top!
      const results = [];
      if (ref.verse && ((ref.end && ref.end > ref.verse) || (ref.endChapter && ref.endChapter > ref.chapter) || ref.extraVerses)) {
        if (verses.length > 1) {
          const canonical =
            ref.endChapter && ref.endChapter > ref.chapter
              ? `${b.name} ${ref.chapter}:${ref.verse}-${ref.endChapter}:${ref.end}`
              : ref.extraVerses
              ? `${b.name} ${ref.chapter}:${ref.extraVerses.join(",")}`
              : `${b.name} ${ref.chapter}:${ref.verse}-${ref.end}`;
          const combinedText = verses.map((x) => `${x.verse} ${x.text}`).join(" ");
          results.push({
            kind: "scripture",
            id: `${activePack.id}:${canonical}`,
            ref: canonical,
            title: canonical,
            subtitle: activePack.code,
            body: combinedText,
            text: combinedText,
            book: ref.book,
            bookName: b.name,
            chapter: ref.chapter,
            verse: ref.verse,
            code: activePack.code,
            packId: activePack.id,
            isRange: true,
            rangeVerses: verses,
          });
        }
      }

      for (const v of verses) {
        results.push({
          kind: "scripture",
          id: `${activePack.id}:${v.ref}`,
          ref: v.ref,
          title: v.ref,
          subtitle: activePack.code,
          body: v.text,
          text: v.text,
          book: v.book,
          bookName: v.bookName,
          chapter: v.chapter,
          verse: v.verse,
          code: activePack.code,
          packId: activePack.id,
        });
      }

      return { results, parsed: ref, isReference: true };
    }
  }

  // Keyword / exact-phrase full-text search
  const phrases = [];
  let rem = q;
  const phraseRe = /"([^"]+)"/g;
  let m;
  while ((m = phraseRe.exec(q)) !== null) {
    if (m[1].trim()) phrases.push(m[1].trim().toLowerCase());
    rem = rem.replace(m[0], " ");
  }
  const words = rem
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2);

  if (!phrases.length && !words.length) return { results: [], parsed: null, isReference: false };

  const targetPacks = allVersions ? packs : [activePack];
  const scored = [];

  for (const p of targetPacks) {
    for (const b of p.books || []) {
      (b.chapters || []).forEach((vs, ci) => {
        if (!Array.isArray(vs)) return;
        vs.forEach((t, vi) => {
          if (!t) return;
          const lt = t.toLowerCase();
          if (phrases.some((ph) => !lt.includes(ph))) return;
          if (words.some((w) => !lt.includes(w))) return;
          // Relevance score: exact startsWith > exact phrase > shorter/tighter match
          let score = 10;
          if (lt.startsWith(q.toLowerCase())) score += 50;
          if (phrases.length) score += 25;
          if (lt.includes(words.join(" "))) score += 20;
          score -= Math.min(8, Math.floor(t.length / 60));
          scored.push({
            score,
            item: {
              kind: "scripture",
              id: `${p.id}:${b.name} ${ci + 1}:${vi + 1}`,
              ref: `${b.name} ${ci + 1}:${vi + 1}`,
              title: `${b.name} ${ci + 1}:${vi + 1}`,
              subtitle: p.code,
              body: t,
              text: t,
              book: b.n,
              bookName: b.name,
              chapter: ci + 1,
              verse: vi + 1,
              code: p.code,
              packId: p.id,
              startsMatch: lt.startsWith(q.toLowerCase()),
            },
          });
        });
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    results: scored.slice(0, limit).map((x) => x.item),
    parsed: null,
    isReference: false,
  };
}

/**
 * Searches songs across all installed song packs and custom songs (title, author, and lyrics lines).
 */
export function searchSongs({ songPacks = [], customSongs = [], query, limit = 25 }) {
  const q = String(query || "").trim().toLowerCase().slice(0, MAX_QUERY_LEN);
  if (!q) return [];
  const all = [
    ...customSongs.map((s) => ({ ...s, id: s.id, pack: "My songs" })),
    ...songPacks.flatMap((p) => (p.songs || []).map((s) => ({ ...s, id: `${p.id}:${s.id || s.title}`, pack: p.name }))),
  ];

  const out = [];
  for (const s of all) {
    const titleHit = (s.title || "").toLowerCase().includes(q);
    const authorHit = (s.author || "").toLowerCase().includes(q);
    let slideIndex = 0;
    let matchedLine = "";
    let lyricHit = false;
    (s.sections || []).forEach((sec, idx) => {
      if (lyricHit) return;
      if ((sec.text || "").toLowerCase().includes(q)) {
        lyricHit = true;
        slideIndex = idx;
        matchedLine = sec.text;
      }
    });
    if (titleHit || authorHit || lyricHit) {
      const sec = s.sections?.[slideIndex] || s.sections?.[0];
      out.push({
        kind: "song",
        id: `${s.id}#${slideIndex}`,
        songId: s.id,
        slideIndex,
        title: s.title,
        subtitle: s.author || s.pack,
        pack: s.pack,
        label: sec?.label || "",
        body: sec?.text || "",
        matchedLine: matchedLine || sec?.text || "",
        score: titleHit ? 30 : lyricHit ? 20 : 10,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Unified search across Scripture, Songs, and Recent Free Texts.
 */
export function unifiedSearch({ packs, selectedPackId, songPacks, customSongs, recentTexts, query, scope = "all", allVersions = false, limit = 20 }) {
  const q = String(query || "").trim().slice(0, MAX_QUERY_LEN);
  if (!q) return { results: [], parsed: null, scopeUsed: scope };

  const scRes = scope === "all" || scope === "scripture"
    ? searchScripture({ packs, selectedPackId, query: q, allVersions, limit })
    : { results: [], parsed: null, isReference: false };

  // Auto-switch to scripture if a reference was detected in "all" mode
  if (scope === "all" && scRes.isReference && scRes.results.length > 0) {
    return { results: scRes.results.slice(0, limit), parsed: scRes.parsed, scopeUsed: "scripture" };
  }

  const songRes = scope === "all" || scope === "songs"
    ? searchSongs({ songPacks, customSongs, query: q, limit })
    : [];

  const textRes = scope === "all" || scope === "text"
    ? (recentTexts || [])
        .filter((t) => `${t.title || ""} ${t.body || ""}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 6)
        .map((t, i) => ({
          kind: "text",
          id: `text:${i}`,
          title: t.title || "Free text",
          subtitle: "Recent text",
          body: t.body,
        }))
    : [];

  const combined = [...scRes.results, ...songRes, ...textRes].slice(0, limit);
  return { results: combined, parsed: scRes.parsed, scopeUsed: scope };
}
