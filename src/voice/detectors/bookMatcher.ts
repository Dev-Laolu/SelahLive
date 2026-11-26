import { BOOK_NAMES } from '@/lib/bible';
import { ASR_BOOK_ALIASES, NON_BOOK_WORDS } from './bookAliases';
import type { BookMatch, CanonicalBookRecord } from './type';

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

  const first = s[0];
  if (!first) return '';
  const rest = s.slice(1).replace(/[aeiouyhw]/g, '');
  return (first + rest).replace(/(.)\1+/g, '$1');
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;

  const cols = bl + 1;
  const dp = new Uint16Array((al + 1) * cols);
  const at = (r: number, c: number): number => dp[r * cols + c] ?? 0;

  for (let i = 0; i <= al; i++) dp[i * cols] = i;
  for (let j = 0; j <= bl; j++) dp[j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, at(i - 2, j - 2) + 1);
      }
      dp[i * cols + j] = val;
    }
  }

  return at(al, bl);
}

const CANONICAL_BOOK_RECORDS: readonly CanonicalBookRecord[] = BOOK_NAMES.map((name, idx) => {
  const clean = name.toLowerCase().replace(/\s+/g, '');
  return { book: idx + 1, name, clean, phonetic: phoneticKey(clean) };
});

export function matchSpokenBookToken(candidate: string): BookMatch | null {
  const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key.length < 2 || NON_BOOK_WORDS.has(key)) return null;

  const exactAlias = ASR_BOOK_ALIASES[key];
  if (exactAlias !== undefined) {
    return { book: exactAlias, fuzzy: false };
  }

  if (key.length < 4) return null;

  const keyPhonetic = phoneticKey(key);
  const maxAllowed = key.length >= 8 ? 3 : key.length >= 6 ? 2 : 1;
  let bestBook: number | null = null;
  let bestDist = 99;

  for (const rec of CANONICAL_BOOK_RECORDS) {
    const keyLead = /^[123]/.test(key) ? key[0] : '';
    const recLead = /^[123]/.test(rec.clean) ? rec.clean[0] : '';
    if (keyLead !== recLead) continue;

    const dist = editDistance(key, rec.clean);
    const isDirectClose = dist <= maxAllowed && dist < bestDist;
    const isPhoneticClose =
      key.length >= 5 &&
      keyPhonetic.length >= 3 &&
      keyPhonetic === rec.phonetic &&
      dist <= maxAllowed + 1 &&
      dist < bestDist;

    if (isDirectClose || isPhoneticClose) {
      bestDist = dist;
      bestBook = rec.book;
    }
  }

  return bestBook ? { book: bestBook, fuzzy: true } : null;
}

export function formatCanonicalRef(
  book: number,
  chapter: number,
  verseStart?: number,
  verseEnd?: number,
  chapterOnly?: boolean
): string {
  const name = BOOK_NAMES[book - 1] ?? 'Unknown';
  if (chapterOnly || !verseStart) {
    return `${name} ${chapter}`;
  }
  if (verseEnd && verseEnd > verseStart) {
    return `${name} ${chapter}:${verseStart}-${verseEnd}`;
  }
  return `${name} ${chapter}:${verseStart}`;
}
