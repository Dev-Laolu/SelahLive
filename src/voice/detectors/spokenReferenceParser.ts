/**
 * Selah Live v2 — Spoken Scripture Reference Parser (MD-1, MD-2, MD-3)
 *
 * Supports:
 * - "Psalm 32", "Psalms thirty-two", "Twenty-third Psalm", "119th Psalm"
 * - "John chapter three verse sixteen"
 * - "First John four eight", "Second Corinthians five seventeen"
 * - "Romans eight twenty-eight to thirty"
 * - "Genesis one one through five", "Luke 15 verses 1 to 7"
 * - "turn to...", "open your Bibles to..."
 * - ASR misspellings and phonetic variants (Philippians, Ecclesiastes, Habakkuk, Thessalonians, Deuteronomy, etc.)
 * - Confidence bands (MD-3):
 *   - book + chapter + verse = High (confidence >= 0.88)
 *   - book + chapter = Medium (confidence ~ 0.75, verseStart defaults to 1 with chapterOnly: true)
 *   - book only = no suggestion
 */

import { BOOK_NAMES, BOOK_ALIASES } from '@/lib/bible';
import { normaliseSpokenText } from '../normalise';

export interface ParsedSpokenReference {
  book: number;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  chapterOnly: boolean;
  confidence: number;
  band: 'high' | 'medium';
  matchedExcerpt: string;
  canonicalRef: string;
}

// Maximum number of chapters per Bible book (1..66) to reject impossible chapter numbers
// (e.g. "John 316" -> split as John 3:16; "Genesis 99" -> rejected)
export const MAX_CHAPTERS_BY_BOOK: Record<number, number> = {
  1: 50,  2: 40,  3: 27,  4: 36,  5: 34,  6: 24,  7: 21,  8: 4,   9: 31,  10: 24,
  11: 22, 12: 25, 13: 29, 14: 36, 15: 10, 16: 13, 17: 10, 18: 42, 19: 150, 20: 31,
  21: 12, 22: 8,  23: 66, 24: 52, 25: 5,  26: 48, 27: 12, 28: 14, 29: 3,   30: 9,
  31: 1,  32: 4,  33: 7,  34: 3,  35: 3,  36: 3,  37: 2,  38: 14, 39: 4,   40: 28,
  41: 16, 42: 24, 43: 21, 44: 28, 45: 16, 46: 16, 47: 13, 48: 6,  49: 6,   50: 4,
  51: 4,  52: 5,  53: 3,  54: 6,  55: 4,  56: 3,  57: 1,  58: 13, 59: 5,   60: 5,
  61: 3,  62: 5,  63: 1,  64: 1,  65: 1,  66: 22,
};

// Books that take a 1 / 2 / 3 prefix
const NUMBERED_BASE_BOOKS: Record<string, Record<number, number>> = {
  samuel: { 1: 9, 2: 10 },
  sam: { 1: 9, 2: 10 },
  kings: { 1: 11, 2: 12 },
  king: { 1: 11, 2: 12 },
  chronicles: { 1: 13, 2: 14 },
  chronicle: { 1: 13, 2: 14 },
  chron: { 1: 13, 2: 14 },
  corinthians: { 1: 46, 2: 47 },
  corinthian: { 1: 46, 2: 47 },
  cor: { 1: 46, 2: 47 },
  thessalonians: { 1: 52, 2: 53 },
  thessalonian: { 1: 52, 2: 53 },
  thess: { 1: 52, 2: 53 },
  timothy: { 1: 54, 2: 55 },
  tim: { 1: 54, 2: 55 },
  peter: { 1: 60, 2: 61 },
  pet: { 1: 60, 2: 61 },
  john: { 1: 62, 2: 63, 3: 64 },
};

// Extensive ASR misspelling & phonetic alias table for Bible books (MD-2)
const ASR_BOOK_ALIASES: Record<string, number> = {
  ...(BOOK_ALIASES as Record<string, number>),
  genisis: 1, genesys: 1, jenesis: 1, genesi: 1, jenesi: 1,
  exodos: 2, exedus: 2, esodus: 2, exodous: 2,
  levitacus: 3, levitcus: 3, lebiticus: 3, levitic: 3,
  number: 4,
  deuteronamy: 5, duteronomy: 5, deuteronomi: 5, deteronomy: 5, deutronomy: 5,
  joshwa: 6, josua: 6, josha: 6, yoshua: 6,
  judge: 7,
  ruthe: 8,
  samual: 9,
  "1samual": 9, "2samual": 10,
  "1king": 11, "2king": 12,
  cronicles: 13, "1cronicles": 13, "2cronicles": 14, "1chronicle": 13, "2chronicle": 14,
  nehemia: 16, nehamiah: 16, nehmiah: 16,
  ester: 17, esthr: 17,
  salm: 19, salms: 19, samps: 19, psal: 19, pslam: 19, pslams: 19, palm: 19, palms: 19, sams: 19,
  proverb: 20, probabs: 20, proverbz: 20,
  eclesiastes: 21, ecclesiastis: 21, ecclesiastics: 21, eclesiastics: 21, eklesiastes: 21,
  songofsoloman: 22, solomon: 22,
  isiah: 23, isaia: 23, izayah: 23, isaya: 23, izaya: 23, asaya: 23,
  jerimiah: 24, jeramia: 24, jeramiah: 24, jeremaya: 24, jeremia: 24,
  lamentation: 25,
  ezekial: 26, ezequiel: 26, ezekel: 26, esekiel: 26,
  danyel: 27,
  hozea: 28, hoseah: 28,
  obadia: 31, obediah: 31,
  jona: 32,
  mica: 33, mikah: 33,
  nahem: 34, nayhum: 34,
  habakuk: 35, habbakuk: 35, habakkuk: 35, habakuck: 35, abakkuk: 35,
  zefaniah: 36, zepheniah: 36, zephania: 36,
  hagai: 37, haggai: 37, haggi: 37,
  zecariah: 38, zachariah: 38, zecharia: 38, zacharia: 38,
  malachi: 39, malachy: 39, malakai: 39,
  mathew: 40, mathiew: 40, matthews: 40, matyu: 40, mateo: 40, mathiu: 40,
  marc: 41,
  luc: 42, luk: 42,
  jhon: 43, jonh: 43, jon: 43,
  ax: 44, act: 44,
  roman: 45, romens: 45, romanz: 45,
  corinthians: 46, "1corinthian": 46, "2corinthian": 47, "1corintians": 46, "2corintians": 47,
  "1korinthians": 46, "2korinthians": 47, "1korintians": 46, "2korintians": 47,
  galations: 48, galatians: 48, galatian: 48, galashians: 48, galasians: 48,
  ephesian: 49, efesians: 49, ephesions: 49, efishians: 49,
  philipians: 50, phillipians: 50, phillippians: 50, filippians: 50, philippians: 50, filipians: 50,
  colosians: 51, colossions: 51, collosians: 51, kolossians: 51,
  thesalonians: 52, "1thesalonians": 52, "2thesalonians": 53, "1thessalonian": 52, "2thessalonian": 53,
  "1tesalonians": 52, "2tesalonians": 53,
  "1timoty": 54, "2timoty": 55,
  tites: 56,
  filemon: 57, philimon: 57, phileman: 57,
  hebrew: 58, hebews: 58, ibrews: 58,
  jams: 59,
  "1peters": 60, "2peters": 61,
  "1jhon": 62, "2jhon": 63, "3jhon": 64,
  revelations: 66, revlation: 66, revalation: 66, reveleshon: 66, revelashon: 66,
};

// Stopwords that must never fuzzy-match to a Bible book name
const NON_BOOK_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was',
  'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
  'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
  'turn', 'open', 'your', 'bible', 'bibles', 'read', 'from', 'look', 'book', 'chapter',
  'chapters', 'verse', 'verses', 'to', 'through', 'thru', 'unto', 'into', 'with', 'that',
  'this', 'have', 'will', 'what', 'when', 'where', 'which', 'their', 'there', 'then', 'than',
  'some', 'time', 'good', 'lord', 'god', 'jesus', 'christ', 'holy', 'spirit', 'amen',
  'going', 'today', 'morning', 'evening', 'church', 'pastor', 'message', 'sermon', 'text',
  'start', 'starting', 'beginning', 'down', 'over', 'about', 'just', 'like', 'know',
]);

/**
 * Simple phonetic skeleton (Double-Metaphone-style consonant code) for book name matching.
 */
export function phoneticKey(word: string): string {
  const s = word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/ch/g, 'k')
    .replace(/sh/g, 's')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kw')
    .replace(/x/g, 'ks')
    .replace(/z/g, 's')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k');
  if (!s) return '';
  const first = s[0];
  const rest = s.slice(1).replace(/[aeiouyhw]/g, '');
  // Collapse consecutive duplicate consonants
  return (first + rest).replace(/(.)\1+/g, '$1');
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const dp = Array.from({ length: al + 1 }, () => new Uint16Array(bl + 1));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
    }
  }
  return dp[al][bl];
}

const CANONICAL_BOOK_RECORDS = BOOK_NAMES.map((name, idx) => {
  const clean = name.toLowerCase().replace(/\s+/g, '');
  return {
    book: idx + 1,
    name,
    clean,
    phonetic: phoneticKey(clean),
  };
});

/**
 * Matches a candidate book key (e.g. "philipians", "1john", "habakuk") to a book number 1..66.
 */
export function matchSpokenBookToken(candidate: string): { book: number; fuzzy: boolean } | null {
  const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key || key.length < 2) return null;
  if (NON_BOOK_WORDS.has(key)) return null;

  if (ASR_BOOK_ALIASES[key]) {
    return { book: ASR_BOOK_ALIASES[key], fuzzy: false };
  }

  // Fuzzy & phonetic match for tokens >= 4 characters
  if (key.length < 4) return null;

  const keyPhonetic = phoneticKey(key);
  let bestBook: number | null = null;
  let bestDist = 99;
  const maxAllowed = key.length >= 8 ? 3 : key.length >= 6 ? 2 : 1;

  for (const rec of CANONICAL_BOOK_RECORDS) {
    // Prefix digit must match if either has a prefix digit (1/2/3)
    const keyLead = /^[123]/.test(key) ? key[0] : '';
    const recLead = /^[123]/.test(rec.clean) ? rec.clean[0] : '';
    if (keyLead !== recLead) continue;

    const d = editDistance(key, rec.clean);
    if (d <= maxAllowed && d < bestDist) {
      bestDist = d;
      bestBook = rec.book;
    } else if (
      key.length >= 5 &&
      keyPhonetic.length >= 3 &&
      keyPhonetic === rec.phonetic &&
      d <= maxAllowed + 1 &&
      d < bestDist
    ) {
      bestDist = d;
      bestBook = rec.book;
    }
  }

  return bestBook ? { book: bestBook, fuzzy: true } : null;
}

/**
 * Resolves single-chapter books (Obadiah=31, Philemon=57, 2 John=63, 3 John=64, Jude=65)
 * when someone says "Jude verse 3" or "Philemon 6" -> Chapter 1, Verse 3/6.
 */
const SINGLE_CHAPTER_BOOKS = new Set([31, 57, 63, 64, 65]);

export function formatCanonicalRef(
  book: number,
  chapter: number,
  verseStart?: number,
  verseEnd?: number,
  chapterOnly?: boolean
): string {
  const name = BOOK_NAMES[book - 1] || 'Unknown';
  if (chapterOnly || !verseStart) {
    return `${name} ${chapter}`;
  }
  if (verseEnd && verseEnd > verseStart) {
    return `${name} ${chapter}:${verseStart}-${verseEnd}`;
  }
  return `${name} ${chapter}:${verseStart}`;
}

/**
 * Extracts all spoken Scripture references from a transcript string.
 * Returns them ordered by appearance, deduplicated by canonical reference.
 */
export function parseSpokenReferences(rawTranscript: string): ParsedSpokenReference[] {
  const norm = normaliseSpokenText(rawTranscript);
  if (!norm) return [];

  const tokens = norm.split(' ').filter(Boolean);
  const results: ParsedSpokenReference[] = [];

  // Pre-handle inverted ordinal Psalms: e.g. "23 psalm" / "the 23rd psalm" / "119 psalm"
  for (let i = 0; i < tokens.length - 1; i++) {
    if (/^\d+$/.test(tokens[i]) && /^psalms?$/.test(tokens[i + 1])) {
      const ch = parseInt(tokens[i], 10);
      if (ch >= 1 && ch <= 150) {
        // Check if followed by "verse X [to Y]"
        let vStart: number | undefined;
        let vEnd: number | undefined;
        let consumed = 2;
        if (
          /^(verse|verses|v)$/.test(tokens[i + 2] || '') &&
          /^\d+$/.test(tokens[i + 3] || '')
        ) {
          vStart = parseInt(tokens[i + 3], 10);
          consumed = 4;
          if (
            /^(to|through|thru|-|and)$/.test(tokens[i + 4] || '') &&
            /^\d+$/.test(tokens[i + 5] || '')
          ) {
            vEnd = parseInt(tokens[i + 5], 10);
            consumed = 6;
          }
        }
        const chapterOnly = !vStart;
        const vs = vStart || 1;
        results.push({
          book: 19,
          bookName: 'Psalm',
          chapter: ch,
          verseStart: vs,
          verseEnd: vEnd && vEnd > vs ? vEnd : undefined,
          chapterOnly,
          confidence: chapterOnly ? 0.78 : 0.94,
          band: chapterOnly ? 'medium' : 'high',
          matchedExcerpt: tokens.slice(i, i + consumed).join(' '),
          canonicalRef: formatCanonicalRef(19, ch, vs, vEnd, chapterOnly),
        });
      }
    }
  }

  let i = 0;
  while (i < tokens.length) {
    const t0 = tokens[i];
    const t1 = tokens[i + 1] || '';

    let matchedBook: { book: number; fuzzy: boolean } | null = null;
    let bookTokensConsumed = 0;

    // Case A: Leading "1" / "2" / "3" followed by a numbered book ("1 john", "2 corinthians", "1 kings")
    if ((t0 === '1' || t0 === '2' || t0 === '3') && t1 && !/^\d+$/.test(t1)) {
      const num = parseInt(t0, 10);
      const directBase = NUMBERED_BASE_BOOKS[t1.toLowerCase()];
      if (directBase && directBase[num]) {
        matchedBook = { book: directBase[num], fuzzy: false };
        bookTokensConsumed = 2;
      } else {
        const combined = matchSpokenBookToken(`${t0}${t1}`);
        if (combined) {
          matchedBook = combined;
          bookTokensConsumed = 2;
        }
      }
    }

    // Case B: Single-token book (or already combined like "songofsolomon", "1john")
    if (!matchedBook && !/^\d+$/.test(t0)) {
      const single = matchSpokenBookToken(t0);
      if (single) {
        matchedBook = single;
        bookTokensConsumed = 1;
      }
    }

    if (!matchedBook) {
      i++;
      continue;
    }

    const book = matchedBook.book;
    const bookName = BOOK_NAMES[book - 1];
    const maxCh = MAX_CHAPTERS_BY_BOOK[book] || 150;
    let cursor = i + bookTokensConsumed;

    // Skip optional filler words between book name and chapter ("chapter", "ch", "in", "of")
    let hadExplicitChapterWord = false;
    while (cursor < tokens.length && /^(chapter|chapters|ch|number|no)$/.test(tokens[cursor])) {
      hadExplicitChapterWord = true;
      cursor++;
    }

    // Check if single-chapter book followed directly by "verse X" (e.g. "Jude verse 3", "Philemon verse 6")
    let singleChDirectVerse = false;
    if (
      SINGLE_CHAPTER_BOOKS.has(book) &&
      /^(verse|verses|v)$/.test(tokens[cursor] || '') &&
      /^\d+$/.test(tokens[cursor + 1] || '')
    ) {
      singleChDirectVerse = true;
    }

    if (!singleChDirectVerse && !/^\d+$/.test(tokens[cursor] || '')) {
      // Book only (MD-3: book only = no suggestion)
      i++;
      continue;
    }

    let chapter = 1;
    let verseStart: number | undefined;
    let verseEnd: number | undefined;

    if (singleChDirectVerse) {
      chapter = 1;
      cursor++; // skip "verse"
      verseStart = parseInt(tokens[cursor], 10);
      cursor++;
    } else {
      let rawCh = parseInt(tokens[cursor], 10);
      cursor++;

      // Handle collapsed 3-digit ASR output like "John 316" -> John 3:16 (only when transcript originally had digits, not "hundred")
      const hadHundredWord = /\bhundred\b/i.test(rawTranscript);
      if (!hadHundredWord && rawCh > maxCh && rawCh >= 100 && rawCh <= 9999) {
        const sDigits = String(rawCh);
        const splitCh = parseInt(sDigits[0], 10);
        const splitV = parseInt(sDigits.slice(1), 10);
        if (splitCh >= 1 && splitCh <= maxCh && splitV >= 1 && splitV <= 80) {
          chapter = splitCh;
          verseStart = splitV;
        } else {
          i++;
          continue;
        }
      } else if (SINGLE_CHAPTER_BOOKS.has(book) && rawCh > 1 && rawCh <= 25 && !hadExplicitChapterWord) {
        // e.g. "Jude 24" -> Jude 1:24 (single-chapter books have at most 25 verses)
        chapter = 1;
        verseStart = rawCh;
      } else if (rawCh >= 1 && rawCh <= maxCh) {
        chapter = rawCh;
      } else {
        // Invalid chapter number for this book
        i++;
        continue;
      }
    }

    // Now look for verse number if not already extracted
    if (verseStart === undefined && cursor < tokens.length) {
      // Optional connector before verse: ":", "verse", "verses", "v", "and verse", "starting at verse", "beginning at verse"
      let vCursor = cursor;
      let hadVerseKeyword = false;

      if (tokens[vCursor] === 'and' && /^(verse|verses|v)$/.test(tokens[vCursor + 1] || '')) {
        hadVerseKeyword = true;
        vCursor += 2;
      } else if (
        /^(starting|beginning|down)$/.test(tokens[vCursor] || '') &&
        /^(at|in|from)$/.test(tokens[vCursor + 1] || '') &&
        /^(verse|verses|v)$/.test(tokens[vCursor + 2] || '')
      ) {
        hadVerseKeyword = true;
        vCursor += 3;
      } else if (
        /^(from|at|in)$/.test(tokens[vCursor] || '') &&
        /^(verse|verses|v)$/.test(tokens[vCursor + 1] || '')
      ) {
        hadVerseKeyword = true;
        vCursor += 2;
      } else if (/^(:|verse|verses|v)$/.test(tokens[vCursor] || '')) {
        hadVerseKeyword = true;
        vCursor++;
      }

      if (/^\d+$/.test(tokens[vCursor] || '')) {
        const candidateV = parseInt(tokens[vCursor], 10);
        if (candidateV >= 1 && candidateV <= 176) {
          verseStart = candidateV;
          cursor = vCursor + 1;
        }
      } else if (hadVerseKeyword) {
        // Had "verse" but no valid number yet
      }
    }

    // Check for verse range: "to", "through", "thru", "-", "and", "down to [verse]"
    if (verseStart !== undefined && cursor < tokens.length) {
      let rCursor = cursor;
      let isRangeConnector = false;

      if (
        tokens[rCursor] === 'down' &&
        tokens[rCursor + 1] === 'to'
      ) {
        isRangeConnector = true;
        rCursor += 2;
      } else if (/^(to|through|thru|-|and|unto)$/.test(tokens[rCursor] || '')) {
        isRangeConnector = true;
        rCursor++;
      }

      if (isRangeConnector) {
        if (/^(verse|verses|v)$/.test(tokens[rCursor] || '')) {
          rCursor++;
        }
        if (/^\d+$/.test(tokens[rCursor] || '')) {
          const endV = parseInt(tokens[rCursor], 10);
          // Make sure the token after endV isn't a book name or ":"
          if (endV > verseStart && endV <= 176 && endV - verseStart <= 30) {
            verseEnd = endV;
            cursor = rCursor + 1;
          }
        }
      }
    }

    const chapterOnly = verseStart === undefined;
    const finalVerseStart = verseStart ?? 1;

    // Confidence scoring (MD-3)
    // High: book + chapter + verse (0.90..0.97; slightly lower if book was fuzzy matched)
    // Medium: book + chapter only (0.74..0.80)
    let confidence = chapterOnly ? 0.78 : 0.95;
    if (matchedBook.fuzzy) {
      confidence -= 0.05;
    }
    const band: 'high' | 'medium' = chapterOnly ? 'medium' : 'high';
    const matchedExcerpt = tokens.slice(i, cursor).join(' ');
    const canonicalRef = formatCanonicalRef(
      book,
      chapter,
      finalVerseStart,
      verseEnd,
      chapterOnly
    );

    results.push({
      book,
      bookName,
      chapter,
      verseStart: finalVerseStart,
      verseEnd,
      chapterOnly,
      confidence: Number(confidence.toFixed(2)),
      band,
      matchedExcerpt,
      canonicalRef,
    });

    i = cursor;
  }

  // Deduplicate by canonicalRef (keep highest confidence)
  const byRef = new Map<string, ParsedSpokenReference>();
  for (const r of results) {
    const existing = byRef.get(r.canonicalRef);
    if (!existing || r.confidence > existing.confidence) {
      byRef.set(r.canonicalRef, r);
    }
  }
  return Array.from(byRef.values());
}
