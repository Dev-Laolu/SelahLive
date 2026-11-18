// Reference parsing + search over a pack: { id, code, name, books:[{n,name,abbr,chapters:[[verse text,...],...]}] }
export const BOOK_NAMES = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalm", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
  "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy",
  "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation"
];

const ALIASES = {
  gen: 1, genesis: 1, ge: 1, gn: 1,
  exo: 2, ex: 2, exodus: 2, exod: 2,
  lev: 3, le: 3, lv: 3, leviticus: 3,
  num: 4, nu: 4, nm: 4, numbers: 4,
  deu: 5, dt: 5, deut: 5, deuteronomy: 5,
  jos: 6, josh: 6, joshua: 6,
  jdg: 7, judg: 7, judges: 7, jg: 7,
  rut: 8, ruth: 8, ru: 8,
  "1sa": 9, "1sam": 9, "1samuel": 9,
  "2sa": 10, "2sam": 10, "2samuel": 10,
  "1ki": 11, "1kgs": 11, "1kings": 11,
  "2ki": 12, "2kgs": 12, "2kings": 12,
  "1ch": 13, "1chr": 13, "1chron": 13, "1chronicles": 13,
  "2ch": 14, "2chr": 14, "2chron": 14, "2chronicles": 14,
  ezr: 15, ezra: 15,
  neh: 16, ne: 16, nehemiah: 16,
  est: 17, esth: 17, esther: 17,
  job: 18, jb: 18,
  psa: 19, ps: 19, psalm: 19, psalms: 19, psm: 19,
  pro: 20, prov: 20, pr: 20, prv: 20, proverbs: 20,
  ecc: 21, eccl: 21, ec: 21, ecclesiastes: 21,
  sng: 22, sos: 22, song: 22, songofsolomon: 22, songofsongs: 22, canticles: 22,
  isa: 23, is: 23, isaiah: 23,
  jer: 24, je: 24, jr: 24, jeremiah: 24,
  lam: 25, la: 25, lamentations: 25,
  eze: 26, ezek: 26, ez: 26, ezekiel: 26,
  dan: 27, da: 27, dn: 27, daniel: 27,
  hos: 28, ho: 28, hosea: 28,
  jol: 29, joe: 29, joel: 29,
  amo: 30, am: 30, amos: 30,
  oba: 31, ob: 31, obad: 31, obadiah: 31,
  jon: 32, jnh: 32, jonah: 32,
  mic: 33, mi: 33, micah: 33,
  nah: 34, na: 34, nahum: 34,
  hab: 35, hb: 35, habakkuk: 35,
  zep: 36, zeph: 36, zp: 36, zephaniah: 36,
  hag: 37, hg: 37, haggai: 37,
  zec: 38, zech: 38, zc: 38, zechariah: 38,
  mal: 39, ml: 39, malachi: 39,
  mat: 40, matt: 40, matthew: 40, mt: 40,
  mar: 41, mark: 41, mrk: 41, mk: 41,
  luk: 42, luke: 42, lk: 42,
  joh: 43, jn: 43, jhn: 43, john: 43,
  act: 44, ac: 44, acts: 44,
  rom: 45, romans: 45, ro: 45, rm: 45,
  "1co": 46, "1cor": 46, "1corinthians": 46,
  "2co": 47, "2cor": 47, "2corinthians": 47,
  gal: 48, ga: 48, galatians: 48,
  eph: 49, ephesians: 49,
  phi: 50, phil: 50, php: 50, philippians: 50,
  col: 51, colossians: 51,
  "1th": 52, "1thess": 52, "1thessalonians": 52,
  "2th": 53, "2thess": 53, "2thessalonians": 53,
  "1ti": 54, "1tim": 54, "1timothy": 54,
  "2ti": 55, "2tim": 55, "2timothy": 55,
  tit: 56, titus: 56, ti: 56,
  phm: 57, phlm: 57, philemon: 57,
  heb: 58, hebrews: 58,
  jam: 59, jas: 59, jm: 59, james: 59,
  "1pe": 60, "1pet": 60, "1pt": 60, "1peter": 60,
  "2pe": 61, "2pet": 61, "2pt": 61, "2peter": 61,
  "1jo": 62, "1jn": 62, "1jhn": 62, "1john": 62,
  "2jo": 63, "2jn": 63, "2jhn": 63, "2john": 63,
  "3jo": 64, "3jn": 64, "3jhn": 64, "3john": 64,
  jud: 65, jude: 65, jd: 65,
  rev: 66, re: 66, rv: 66, revelation: 66, revelations: 66,
};

export function parseReference(input) {
  const m = input.trim().toLowerCase().replace(/\./g, "").match(/^((?:[1-3]\s*)?[a-z]+(?:\s+of\s+[a-z]+)?)\s*(\d+)?(?:\s*[:\s]\s*(\d+))?(?:\s*-\s*(\d+))?$/);
  if (!m) return null;
  const key = m[1].replace(/\s+/g, "");
  const n = ALIASES[key];
  if (!n) return null;
  return { book: n, chapter: m[2] ? +m[2] : null, verse: m[3] ? +m[3] : null, end: m[4] ? +m[4] : null };
}

export function getVerse(pack, book, chapter, verse) {
  const b = pack?.books?.find((x) => x.n === book);
  const t = b?.chapters?.[chapter - 1]?.[verse - 1];
  return t && t.trim() ? { ref: `${b.name} ${chapter}:${verse}`, book, chapter, verse, text: t, code: pack.code, bookName: b.name } : null;
}

export function getAvailableChapters(pack, book) {
  const b = pack?.books?.find((x) => x.n === book);
  if (!b || !Array.isArray(b.chapters)) return [];
  const out = [];
  b.chapters.forEach((vs, ci) => {
    if (Array.isArray(vs) && vs.some((t) => t && t.trim())) out.push(ci + 1);
  });
  return out;
}

export function search(pack, query, limit = 30) {
  if (!pack || !query.trim()) return [];
  const ref = parseReference(query);
  const out = [];
  if (ref) {
    const b = pack.books.find((x) => x.n === ref.book);
    if (b) {
      const chs = ref.chapter ? [ref.chapter] : (b.chapters || []).map((_, i) => i + 1);
      for (const c of chs) {
        const verses = b.chapters?.[c - 1];
        if (!Array.isArray(verses)) continue;
        for (let v = 1; v <= verses.length; v++) {
          if (ref.verse && (v < ref.verse || v > (ref.end || ref.verse))) continue;
          const gv = getVerse(pack, ref.book, c, v);
          if (gv) out.push(gv);
          if (out.length >= limit) return out;
        }
      }
      if (out.length) return out;
    }
  }
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  for (const b of pack.books || []) {
    (b.chapters || []).forEach((vs, ci) => {
      if (!Array.isArray(vs)) return;
      vs.forEach((t, vi) => {
        if (!t) return;
        const lt = t.toLowerCase();
        if (words.every((w) => lt.includes(w)) && out.length < limit) {
          const gv = getVerse(pack, b.n, ci + 1, vi + 1);
          if (gv) out.push(gv);
        }
      });
    });
  }
  return out;
}

export function neighbour(pack, v, dir) {
  if (!pack || !v) return null;
  const b = pack.books?.find((x) => x.n === v.book);
  if (!b || !Array.isArray(b.chapters)) return null;
  const list = [];
  b.chapters.forEach((vs, ci) => {
    if (!Array.isArray(vs)) return;
    vs.forEach((t, vi) => {
      if (t && t.trim()) list.push({ chapter: ci + 1, verse: vi + 1 });
    });
  });
  const idx = list.findIndex((x) => x.chapter === v.chapter && x.verse === v.verse);
  if (idx < 0) return null;
  const target = list[idx + (dir > 0 ? 1 : -1)];
  if (!target) return null;
  return getVerse(pack, v.book, target.chapter, target.verse);
}

