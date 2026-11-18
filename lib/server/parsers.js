// SERVER ONLY. Modular upload parsers. Supports .js, .json, Zefania .xml, and OSIS .xml.
import { BOOK_NAMES, parseReference } from "@/lib/bible";

const OSIS_BOOKS = {
  gen: 1, exod: 2, lev: 3, num: 4, deut: 5, josh: 6, judg: 7, ruth: 8, "1sam": 9, "2sam": 10,
  "1kgs": 11, "2kgs": 12, "1chr": 13, "2chr": 14, ezra: 15, neh: 16, esth: 17, job: 18, ps: 19, prov: 20,
  eccl: 21, song: 22, isa: 23, jer: 24, lam: 25, ezek: 26, dan: 27, hos: 28, joel: 29, amos: 30,
  obad: 31, jonah: 32, mic: 33, nah: 34, hab: 35, zeph: 36, hag: 37, zech: 38, mal: 39,
  matt: 40, mark: 41, luke: 42, john: 43, acts: 44, rom: 45, "1cor": 46, "2cor": 47, gal: 48, eph: 49,
  phil: 50, col: 51, "1thess": 52, "2thess": 53, "1tim": 54, "2tim": 55, titus: 56, phlm: 57, heb: 58,
  jas: 59, "1pet": 60, "2pet": 61, "1john": 62, "2john": 63, "3john": 64, jude: 65, rev: 66,
};

function extractJsonPayload(raw) {
  let s = raw.trim();
  // Strip BOM if present
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1).trim();
  // Strip JS variable/export wrapper such as `var bible_data = [...]` or `export default [...]`
  s = s.replace(/^(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*/, "");
  s = s.replace(/^(?:(?:var|let|const)\s+[a-zA-Z0-9_$]+\s*=\s*|export\s+default\s+|module\.exports\s*=\s*|window\.[a-zA-Z0-9_$]+\s*=\s*)/, "");
  s = s.replace(/;\s*$/, "").trim();
  return JSON.parse(s);
}

// Normalised shape: { books: [{ n, name, abbr, chapters: [[text,...],...] }], duplicateRefs: [] }
const jsOrJsonParser = {
  name: "js/json",
  accepts: (f) => f.endsWith(".json") || f.endsWith(".js"),
  parse(text) {
    let j;
    try {
      j = extractJsonPayload(text);
    } catch (e) {
      throw new Error(`Invalid JSON/JS syntax: ${e.message}`);
    }

    const duplicateRefs = [];
    const seen = new Set();

    // Case 1: Flat array of verse entries (e.g. `var bible_data = [{ ari: "0:1:1", name: "Genesis 1:1", verse: "..." }, ...]`)
    const flatArr = Array.isArray(j) ? j : Array.isArray(j?.verses) ? j.verses : Array.isArray(j?.bible_data) ? j.bible_data : null;
    if (flatArr && flatArr.length > 0 && (flatArr[0].ari !== undefined || flatArr[0].verse !== undefined || (flatArr[0].chapter !== undefined && flatArr[0].text !== undefined))) {
      // Determine whether `ari` book index is 0-based (0..65) or 1-based (1..66)
      let zeroBased = false;
      for (let i = 0; i < Math.min(flatArr.length, 50); i++) {
        if (typeof flatArr[i].ari === "string" && flatArr[i].ari.startsWith("0:")) {
          zeroBased = true;
          break;
        }
      }
      const byBook = new Map();
      for (const item of flatArr) {
        let bookNum, chapterNum, verseNum;
        if (typeof item.ari === "string") {
          const p = item.ari.split(":").map(Number);
          bookNum = p[0] + (zeroBased ? 1 : 0);
          chapterNum = p[1];
          verseNum = p[2];
        } else {
          bookNum = Number(item.book_number || item.book) || (item.name ? parseReference(item.name)?.book : null);
          chapterNum = Number(item.chapter);
          verseNum = Number(item.verse_number || item.verseNum || (typeof item.verse === "number" ? item.verse : 0)) || (item.name ? parseReference(item.name)?.verse : null);
        }
        if (!bookNum || !chapterNum || !verseNum) continue;
        const name = BOOK_NAMES[bookNum - 1] || (item.name ? item.name.replace(/\s+\d+:\d+.*$/, "") : `Book ${bookNum}`);
        const refKey = `${bookNum}:${chapterNum}:${verseNum}`;
        if (seen.has(refKey)) duplicateRefs.push(`${name} ${chapterNum}:${verseNum}`);
        seen.add(refKey);
        if (!byBook.has(bookNum)) {
          byBook.set(bookNum, { n: bookNum, name, abbr: name.slice(0, 3), chapters: [] });
        }
        const b = byBook.get(bookNum);
        if (!b.chapters[chapterNum - 1]) b.chapters[chapterNum - 1] = [];
        const vText = typeof item.verse === "string" ? item.verse : item.text || "";
        b.chapters[chapterNum - 1][verseNum - 1] = vText.trim();
      }
      const books = [...byBook.values()]
        .sort((a, b) => a.n - b.n)
        .map((b) => ({
          ...b,
          chapters: Array.from(b.chapters, (c) => (c ? Array.from(c, (v) => v || "") : [])),
        }));
      return { books, duplicateRefs };
    }

    // Case 2: Nested books array `[{ name, chapters: [[...]] }]` or `{ books: [...] }`
    const arr = Array.isArray(j) ? j : j?.books;
    if (!Array.isArray(arr)) {
      throw new Error("Expected a JS/JSON array of verse objects ({ ari, name, verse }) or books (books → chapters → verses).");
    }
    const books = arr.map((b, i) => {
      const n = b.number || b.n || i + 1;
      const name = b.name || BOOK_NAMES[n - 1] || `Book ${n}`;
      const abbr = b.abbr || b.abbreviation || name.slice(0, 3);
      const chapters = (b.chapters || []).map((c, ci) => {
        if (!c) return [];
        const vs = Array.isArray(c) ? c : c.verses || [];
        return vs.map((v, vi) => {
          const refKey = `${n}:${ci + 1}:${vi + 1}`;
          if (seen.has(refKey)) duplicateRefs.push(`${name} ${ci + 1}:${vi + 1}`);
          seen.add(refKey);
          return typeof v === "string" ? v : v?.text || v?.verse || "";
        });
      });
      return { n, name, abbr, chapters };
    });
    return { books, duplicateRefs };
  },
};

const xmlParser = {
  // Supports both Zefania XML (<BIBLEBOOK><CHAPTER><VERS>) and OSIS XML (<div type="book"><chapter><verse osisID="Gen.1.1">)
  name: "xml",
  accepts: (f) => f.endsWith(".xml"),
  parse(text) {
    if (/<!(?:DOCTYPE|ENTITY)\b/i.test(text)) {
      throw new Error("XML DTD and entity declarations are disallowed for security.");
    }
    const duplicateRefs = [];
    const seen = new Set();

    // 1. Try Zefania-style: <BIBLEBOOK bnumber><CHAPTER cnumber><VERS vnumber>text
    const zBooks = [];
    for (const bm of text.matchAll(/<BIBLEBOOK[^>]*?bnumber="(\d+)"[^>]*?(?:bname="([^"]*)")?[^>]*>([\s\S]*?)<\/BIBLEBOOK>/gi)) {
      const n = +bm[1];
      const name = bm[2] || BOOK_NAMES[n - 1] || `Book ${n}`;
      const chapters = [];
      for (const cm of bm[3].matchAll(/<CHAPTER[^>]*?cnumber="(\d+)"[^>]*>([\s\S]*?)<\/CHAPTER>/gi)) {
        const cn = +cm[1];
        const verses = [];
        for (const vm of cm[2].matchAll(/<VERS[^>]*?vnumber="(\d+)"[^>]*>([\s\S]*?)<\/VERS>/gi)) {
          const vn = +vm[1];
          const refKey = `${n}:${cn}:${vn}`;
          if (seen.has(refKey)) duplicateRefs.push(`${name} ${cn}:${vn}`);
          seen.add(refKey);
          verses[vn - 1] = vm[2].replace(/<[^>]+>/g, "").trim();
        }
        chapters[cn - 1] = Array.from(verses, (v) => v || "");
      }
      zBooks.push({ n, name, abbr: name.slice(0, 3), chapters: Array.from(chapters, (c) => c || []) });
    }
    if (zBooks.length) return { books: zBooks, duplicateRefs };

    // 2. Try OSIS-style: <verse osisID="Gen.1.1">text</verse> or milestone <verse osisID="Gen.1.1" sID="..."/>text<verse eID="..."/>
    const byBook = new Map();
    const addOsisVerse = (osisId, rawText) => {
      const parts = osisId.split(".");
      if (parts.length < 3) return;
      const bKey = parts[0].toLowerCase();
      const n = OSIS_BOOKS[bKey] || parseReference(parts[0])?.book;
      if (!n) return;
      const cn = +parts[1];
      const vn = +parts[2];
      if (!cn || !vn) return;
      const name = BOOK_NAMES[n - 1] || parts[0];
      const refKey = `${n}:${cn}:${vn}`;
      if (seen.has(refKey)) duplicateRefs.push(`${name} ${cn}:${vn}`);
      seen.add(refKey);
      if (!byBook.has(n)) byBook.set(n, { n, name, abbr: name.slice(0, 3), chapters: [] });
      const b = byBook.get(n);
      if (!b.chapters[cn - 1]) b.chapters[cn - 1] = [];
      b.chapters[cn - 1][vn - 1] = rawText.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    };

    for (const vm of text.matchAll(/<verse[^>]*?\bosisID="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/gi)) {
      addOsisVerse(vm[1], vm[2]);
    }
    if (!byBook.size) {
      for (const vm of text.matchAll(/<verse[^>]*?\bosisID="([^"]+)"[^>]*?\bsID="([^"]+)"[^>]*\/>([\s\S]*?)<verse[^>]*?\beID="\2"[^>]*\/>/gi)) {
        addOsisVerse(vm[1], vm[3]);
      }
    }
    if (byBook.size) {
      const books = [...byBook.values()]
        .sort((a, b) => a.n - b.n)
        .map((b) => ({
          ...b,
          chapters: Array.from(b.chapters, (c) => (c ? Array.from(c, (v) => v || "") : [])),
        }));
      return { books, duplicateRefs };
    }

    throw new Error("Unrecognised XML structure. Expected Zefania (<BIBLEBOOK>) or OSIS (<verse osisID=\"...\">) XML.");
  },
};

export const BIBLE_PARSERS = [jsOrJsonParser, xmlParser];

export function parseBibleFile(filename, text) {
  const parser = BIBLE_PARSERS.find((p) => p.accepts(filename.toLowerCase()));
  if (!parser) throw new Error("Upload a .js, .json, or .xml file.");
  return { parser: parser.name, ...parser.parse(text) };
}

export function validateBible(filename, text, includeData = false) {
  let parsed;
  try {
    parsed = parseBibleFile(filename, text);
  } catch (e) {
    return { ok: false, errors: [e.message] };
  }
  const { books, duplicateRefs = [], parser } = parsed;
  const errors = [], warnings = [];
  let verses = 0, chapters = 0;
  const flat = [];
  for (const b of books) {
    chapters += (b.chapters || []).filter((c) => Array.isArray(c) && c.length > 0).length;
    (b.chapters || []).forEach((c, ci) => {
      if (!Array.isArray(c)) return;
      c.forEach((t, vi) => {
        if (!t || !t.trim()) {
          warnings.push(`Empty verse: ${b.name} ${ci + 1}:${vi + 1}`);
        } else {
          verses++;
          flat.push({ ref: `${b.name} ${ci + 1}:${vi + 1}`, book: b.n, chapter: ci + 1, verse: vi + 1, text: t });
        }
      });
    });
  }
  if (!verses) errors.push("No verses were found in this file.");
  if (books.length < 66) warnings.push(`Only ${books.length} books found (a full Bible has 66).`);
  for (const d of duplicateRefs) warnings.push(`Duplicate reference: ${d}`);
  if (/\uFFFD/.test(text)) warnings.push("Encoding problem: replacement characters found. Save the file as UTF-8.");
  const sample = [];
  if (flat.length > 0) {
    const step = Math.max(1, Math.floor(flat.length / 5));
    for (let i = 0; i < Math.min(5, flat.length); i++) {
      sample.push(flat[Math.min(flat.length - 1, i * step)]);
    }
  }
  const res = {
    ok: errors.length === 0,
    errors,
    warnings: warnings.slice(0, 50),
    format: parser,
    counts: { books: books.length, chapters, verses },
    first: flat[0] || null,
    last: flat[flat.length - 1] || null,
    sample,
  };
  if (includeData) res.books = books;
  return res;
}

export { splitSongs, validateSongs } from "@/lib/songs";

