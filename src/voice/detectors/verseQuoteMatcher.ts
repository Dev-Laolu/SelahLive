import {
  buildPackQuoteIndex,
  extractContentTokens,
  MIN_MATCHING_CONTENT_WORDS,
} from './quoteIndex';
import type { BiblePackForQuotes, IndexedVerse, QuoteMatchResult } from './type';

export { extractContentTokens, MIN_MATCHING_CONTENT_WORDS };

type RankedQuoteCandidate = QuoteMatchResult & { rawScore: number; isDefault: boolean };

function scoreIndexedVerse(
  verse: IndexedVerse,
  matchedWords: number,
  bm25Weight: number,
  qTokens: string[],
  uniqueQCount: number,
  qBigrams: Set<string>,
  isDefault: boolean
): { confidence: number; rawScore: number } | null {
  let bigramHits = 0;
  for (const bg of qBigrams) {
    if (verse.bigrams.has(bg)) bigramHits++;
  }

  let lastPos = -1;
  let orderedMatches = 0;
  for (const qt of qTokens) {
    if (!verse.tokenSet.has(qt)) continue;
    const pos = verse.tokens.indexOf(qt, lastPos + 1);
    if (pos > lastPos) {
      orderedMatches++;
      lastPos = pos;
    }
  }

  if (bigramHits < 2 && orderedMatches < 5) return null;

  const verseCoverage = matchedWords / Math.max(6, Math.min(14, verse.tokenSet.size));
  const queryCoverage = matchedWords / Math.max(6, uniqueQCount);
  const bigramRatio =
    qBigrams.size > 0 ? bigramHits / Math.min(qBigrams.size, verse.bigrams.size || 1) : 0;
  const orderRatio = orderedMatches / matchedWords;

  const rawScore =
    bm25Weight * 0.4 +
    matchedWords * 1.5 +
    bigramHits * 2.2 +
    orderedMatches * 0.9 +
    (isDefault ? 1.25 : 0);

  const rawConfidence = Math.min(
    0.96,
    0.58 +
      Math.min(0.18, (matchedWords - 5) * 0.035) +
      Math.min(0.12, bigramRatio * 0.16) +
      Math.min(0.08, ((verseCoverage + queryCoverage) / 2) * 0.1) * orderRatio +
      (isDefault ? 0.02 : 0)
  );
  const confidence = Number(rawConfidence.toFixed(2));
  if (confidence < 0.72) return null;

  return { confidence, rawScore };
}

export function matchSpokenVerseQuotes(
  rawTranscript: string,
  packs: BiblePackForQuotes[],
  defaultVersionId?: string
): QuoteMatchResult[] {
  if (!rawTranscript || packs.length === 0) return [];

  const rawWords = String(rawTranscript)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-22);
  if (rawWords.length < 7) return [];

  const qTokens = extractContentTokens(rawWords.join(' '));
  const uniqueQTokens = Array.from(new Set(qTokens));
  if (uniqueQTokens.length < MIN_MATCHING_CONTENT_WORDS) return [];

  const qBigrams = new Set<string>();
  for (let i = 0; i < qTokens.length - 1; i++) {
    const w1 = qTokens[i];
    const w2 = qTokens[i + 1];
    if (w1 && w2) qBigrams.add(`${w1} ${w2}`);
  }

  const orderedPacks = [...packs].sort((a, b) => {
    if (a.id === defaultVersionId) return -1;
    if (b.id === defaultVersionId) return 1;
    return 0;
  });

  const firstPackId = orderedPacks[0]?.id;
  const bestByRef = new Map<string, RankedQuoteCandidate>();

  for (const pack of orderedPacks) {
    const idx = buildPackQuoteIndex(pack);
    if (idx.verses.length === 0) continue;
    const isDefault = pack.id === defaultVersionId || pack.id === firstPackId;

    const hitCounts = new Map<number, number>();
    const bm25Scores = new Map<number, number>();

    for (const word of uniqueQTokens) {
      const posting = idx.inverted.get(word);
      if (!posting) continue;
      const weight = idx.idf.get(word) ?? 1;
      for (const vIdx of posting) {
        hitCounts.set(vIdx, (hitCounts.get(vIdx) ?? 0) + 1);
        bm25Scores.set(vIdx, (bm25Scores.get(vIdx) ?? 0) + weight);
      }
    }

    for (const [vIdx, matchedWords] of hitCounts.entries()) {
      if (matchedWords < MIN_MATCHING_CONTENT_WORDS) continue;
      const verse = idx.verses[vIdx];
      if (!verse) continue;

      const scored = scoreIndexedVerse(
        verse,
        matchedWords,
        bm25Scores.get(vIdx) ?? 0,
        qTokens,
        uniqueQTokens.length,
        qBigrams,
        isDefault
      );
      if (!scored) continue;

      const canonicalRef = `${verse.bookName} ${verse.chapter}:${verse.verse}`;
      const existing = bestByRef.get(canonicalRef);
      const shouldReplace =
        !existing ||
        (isDefault && !existing.isDefault && scored.rawScore >= existing.rawScore * 0.9) ||
        scored.rawScore > existing.rawScore;

      if (shouldReplace) {
        bestByRef.set(canonicalRef, {
          book: verse.book,
          bookName: verse.bookName,
          chapter: verse.chapter,
          verseStart: verse.verse,
          versionId: pack.id,
          confidence: scored.confidence,
          band: scored.confidence >= 0.85 ? 'high' : 'medium',
          matchedContentWords: matchedWords,
          heardExcerpt: rawWords.slice(-12).join(' '),
          canonicalRef,
          rawScore: scored.rawScore,
          isDefault,
        });
      }
    }
  }

  return Array.from(bestByRef.values())
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault && Math.abs(a.rawScore - b.rawScore) < 2.0) {
        return a.isDefault ? -1 : 1;
      }
      return b.rawScore - a.rawScore;
    })
    .slice(0, 2)
    .map(({ rawScore: _rawScore, isDefault: _isDefault, ...clean }) => clean);
}
