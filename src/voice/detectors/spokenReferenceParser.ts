import { BOOK_NAMES } from '@/lib/bible';
import { normaliseSpokenText } from '../normalise';
import {
  MAX_CHAPTERS_BY_BOOK,
  NUMBERED_BASE_BOOKS,
  SINGLE_CHAPTER_BOOKS,
} from './bookAliases';
import { formatCanonicalRef, matchSpokenBookToken, phoneticKey } from './bookMatcher';
import type { BookMatch, ParsedSpokenReference } from './type';

export { formatCanonicalRef, matchSpokenBookToken, MAX_CHAPTERS_BY_BOOK, phoneticKey };

function extractInvertedPsalmRefs(tokens: string[]): ParsedSpokenReference[] {
  const found: ParsedSpokenReference[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const t0 = tokens[i] ?? '';
    const t1 = tokens[i + 1] ?? '';
    if (!/^\d+$/.test(t0) || !/^psalms?$/.test(t1)) continue;

    const ch = parseInt(t0, 10);
    if (ch < 1 || ch > 150) continue;

    let vStart: number | undefined;
    let vEnd: number | undefined;
    let consumed = 2;

    const t2 = tokens[i + 2] ?? '';
    const t3 = tokens[i + 3] ?? '';
    if (/^(verse|verses|v)$/.test(t2) && /^\d+$/.test(t3)) {
      vStart = parseInt(t3, 10);
      consumed = 4;
      const t4 = tokens[i + 4] ?? '';
      const t5 = tokens[i + 5] ?? '';
      if (/^(to|through|thru|-|and)$/.test(t4) && /^\d+$/.test(t5)) {
        vEnd = parseInt(t5, 10);
        consumed = 6;
      }
    }

    const chapterOnly = !vStart;
    const vs = vStart ?? 1;
    const validEnd = vEnd && vEnd > vs ? vEnd : undefined;

    found.push({
      book: 19,
      bookName: 'Psalm',
      chapter: ch,
      verseStart: vs,
      verseEnd: validEnd,
      chapterOnly,
      confidence: chapterOnly ? 0.78 : 0.94,
      band: chapterOnly ? 'medium' : 'high',
      matchedExcerpt: tokens.slice(i, i + consumed).join(' '),
      canonicalRef: formatCanonicalRef(19, ch, vs, validEnd, chapterOnly),
    });
  }
  return found;
}

function resolveBookAtCursor(
  tokens: string[],
  idx: number
): { match: BookMatch; consumed: number } | null {
  const t0 = tokens[idx] ?? '';
  const t1 = tokens[idx + 1] ?? '';

  if ((t0 === '1' || t0 === '2' || t0 === '3') && t1 && !/^\d+$/.test(t1)) {
    const prefix = parseInt(t0, 10);
    const baseBook = NUMBERED_BASE_BOOKS[t1.toLowerCase()]?.[prefix];
    if (baseBook !== undefined) {
      return { match: { book: baseBook, fuzzy: false }, consumed: 2 };
    }
    const combined = matchSpokenBookToken(`${t0}${t1}`);
    if (combined) return { match: combined, consumed: 2 };
  }

  if (!/^\d+$/.test(t0)) {
    const single = matchSpokenBookToken(t0);
    if (single) return { match: single, consumed: 1 };
  }

  return null;
}

function advancePastVerseConnector(tokens: string[], cursor: number): number {
  const t0 = tokens[cursor] ?? '';
  const t1 = tokens[cursor + 1] ?? '';
  const t2 = tokens[cursor + 2] ?? '';

  if (t0 === 'and' && /^(verse|verses|v)$/.test(t1)) return cursor + 2;
  if (/^(starting|beginning|down)$/.test(t0) && /^(at|in|from)$/.test(t1) && /^(verse|verses|v)$/.test(t2)) {
    return cursor + 3;
  }
  if (/^(from|at|in)$/.test(t0) && /^(verse|verses|v)$/.test(t1)) return cursor + 2;
  if (/^(:|verse|verses|v)$/.test(t0)) return cursor + 1;
  return cursor;
}

function readOptionalVerseRange(
  tokens: string[],
  cursor: number,
  verseStart: number
): { verseEnd?: number | undefined; nextCursor: number } {
  let rCursor = cursor;
  const t0 = tokens[rCursor] ?? '';
  const t1 = tokens[rCursor + 1] ?? '';

  if (t0 === 'down' && t1 === 'to') {
    rCursor += 2;
  } else if (/^(to|through|thru|-|and|unto)$/.test(t0)) {
    rCursor += 1;
  } else {
    return { nextCursor: cursor };
  }

  if (/^(verse|verses|v)$/.test(tokens[rCursor] ?? '')) {
    rCursor++;
  }

  const endToken = tokens[rCursor] ?? '';
  if (/^\d+$/.test(endToken)) {
    const endV = parseInt(endToken, 10);
    if (endV > verseStart && endV <= 176 && endV - verseStart <= 30) {
      return { verseEnd: endV, nextCursor: rCursor + 1 };
    }
  }
  return { nextCursor: cursor };
}

export function parseSpokenReferences(rawTranscript: string): ParsedSpokenReference[] {
  const norm = normaliseSpokenText(rawTranscript);
  if (!norm) return [];

  const tokens = norm.split(' ').filter(Boolean);
  const results: ParsedSpokenReference[] = extractInvertedPsalmRefs(tokens);
  const hadHundredWord = /\bhundred\b/i.test(rawTranscript);

  let i = 0;
  while (i < tokens.length) {
    const resolvedBook = resolveBookAtCursor(tokens, i);
    if (!resolvedBook) {
      i++;
      continue;
    }

    const { book, fuzzy } = resolvedBook.match;
    const bookName = BOOK_NAMES[book - 1] ?? 'Unknown';
    const maxCh = MAX_CHAPTERS_BY_BOOK[book] ?? 150;
    let cursor = i + resolvedBook.consumed;

    let hadExplicitChapterWord = false;
    while (cursor < tokens.length && /^(chapter|chapters|ch|number|no)$/.test(tokens[cursor] ?? '')) {
      hadExplicitChapterWord = true;
      cursor++;
    }

    const singleChDirectVerse =
      SINGLE_CHAPTER_BOOKS.has(book) &&
      /^(verse|verses|v)$/.test(tokens[cursor] ?? '') &&
      /^\d+$/.test(tokens[cursor + 1] ?? '');

    if (!singleChDirectVerse && !/^\d+$/.test(tokens[cursor] ?? '')) {
      i++;
      continue;
    }

    let chapter = 1;
    let verseStart: number | undefined;

    if (singleChDirectVerse) {
      verseStart = parseInt(tokens[cursor + 1] ?? '1', 10);
      cursor += 2;
    } else {
      const rawCh = parseInt(tokens[cursor] ?? '0', 10);
      cursor++;

      if (!hadHundredWord && rawCh > maxCh && rawCh >= 100 && rawCh <= 9999) {
        const digits = String(rawCh);
        const splitCh = parseInt(digits[0] ?? '0', 10);
        const splitV = parseInt(digits.slice(1), 10);
        if (splitCh >= 1 && splitCh <= maxCh && splitV >= 1 && splitV <= 80) {
          chapter = splitCh;
          verseStart = splitV;
        } else {
          i++;
          continue;
        }
      } else if (SINGLE_CHAPTER_BOOKS.has(book) && rawCh > 1 && rawCh <= 25 && !hadExplicitChapterWord) {
        chapter = 1;
        verseStart = rawCh;
      } else if (rawCh >= 1 && rawCh <= maxCh) {
        chapter = rawCh;
      } else {
        i++;
        continue;
      }
    }

    if (verseStart === undefined && cursor < tokens.length) {
      const vCursor = advancePastVerseConnector(tokens, cursor);
      const vToken = tokens[vCursor] ?? '';
      if (/^\d+$/.test(vToken)) {
        const candidateV = parseInt(vToken, 10);
        if (candidateV >= 1 && candidateV <= 176) {
          verseStart = candidateV;
          cursor = vCursor + 1;
        }
      }
    }

    let verseEnd: number | undefined;
    if (verseStart !== undefined && cursor < tokens.length) {
      const range = readOptionalVerseRange(tokens, cursor, verseStart);
      verseEnd = range.verseEnd;
      cursor = range.nextCursor;
    }

    const chapterOnly = verseStart === undefined;
    const finalVerseStart = verseStart ?? 1;
    const baseConfidence = chapterOnly ? 0.78 : 0.95;
    const confidence = Number((fuzzy ? baseConfidence - 0.05 : baseConfidence).toFixed(2));

    results.push({
      book,
      bookName,
      chapter,
      verseStart: finalVerseStart,
      verseEnd,
      chapterOnly,
      confidence,
      band: chapterOnly ? 'medium' : 'high',
      matchedExcerpt: tokens.slice(i, cursor).join(' '),
      canonicalRef: formatCanonicalRef(book, chapter, finalVerseStart, verseEnd, chapterOnly),
    });

    i = cursor;
  }

  const byRef = new Map<string, ParsedSpokenReference>();
  for (const item of results) {
    const existing = byRef.get(item.canonicalRef);
    if (!existing || item.confidence > existing.confidence) {
      byRef.set(item.canonicalRef, item);
    }
  }
  return Array.from(byRef.values());
}
