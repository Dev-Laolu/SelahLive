/**
 * Selah Live v2 — Verse Quote Matcher (MD-4 & PRD §6)
 *
 * When the pastor reads a Bible verse aloud without naming the reference,
 * matches the last ~8–20 spoken words against the installed Bible verse index
 * using an inverted BM25-style rare-word candidate retrieve + word n-gram (shingle)
 * & order-aware overlap score.
 *
 * Rules (MD-4):
 * - Require at least 6 matching content words (`MIN_MATCHING_CONTENT_WORDS = 6`) before suggesting.
 * - Search all installed Bible versions, ranking the default version first.
 * - Pre-indexes each pack once by `(id, version)` in memory so matching takes < 10 ms.
 */

export interface BibleBookEntry {
  n: number;
  name: string;
  chapters: string[][];
}

export interface BiblePackForQuotes {
  id: string;
  code?: string;
  name?: string;
  version?: string | number;
  books?: BibleBookEntry[];
}

export interface QuoteMatchResult {
  book: number;
  bookName: string;
  chapter: number;
  verseStart: number;
  versionId: string;
  confidence: number;
  band: 'high' | 'medium';
  matchedContentWords: number;
  heardExcerpt: string;
  canonicalRef: string;
}

const QUOTE_STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'this', 'have', 'unto', 'shall',
  'will', 'they', 'them', 'their', 'there', 'then', 'than', 'when', 'what',
  'which', 'who', 'whom', 'whose', 'into', 'upon', 'were', 'was', 'are', 'been',
  'being', 'his', 'her', 'him', 'she', 'you', 'your', 'our', 'out', 'not', 'but',
  'all', 'any', 'can', 'had', 'has', 'hath', 'doth', 'did', 'may', 'now', 'one',
  'two', 'said', 'say', 'says', 'saying', 'also', 'even', 'only', 'very', 'just',
  'like', 'about', 'over', 'after', 'before', 'because', 'through', 'therefore',
  'wherefore', 'thee', 'thou', 'thy', 'thine', 'ye',
]);

export const MIN_MATCHING_CONTENT_WORDS = 6;

export function extractContentTokens(text: string): string[] {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !QUOTE_STOPWORDS.has(w));
}

interface IndexedVerse {
  idx: number;
  book: number;
  bookName: string;
  chapter: number;
  verse: number;
  tokens: string[];
  tokenSet: Set<string>;
  bigrams: Set<string>;
}

interface PackQuoteIndex {
  packKey: string;
  packId: string;
  verses: IndexedVerse[];
  inverted: Map<string, number[]>; // content word -> array of verse indices
  idf: Map<string, number>;
}

const indexCache = new Map<string, PackQuoteIndex>();

function buildPackQuoteIndex(pack: BiblePackForQuotes): PackQuoteIndex {
  const packKey = `${pack.id}:${pack.version || '1'}`;
  const cached = indexCache.get(packKey);
  if (cached) return cached;

  const verses: IndexedVerse[] = [];
  const inverted = new Map<string, number[]>();

  for (const book of pack.books || []) {
    const chapters = book.chapters || [];
    for (let ci = 0; ci < chapters.length; ci++) {
      const chVerses = chapters[ci];
      if (!Array.isArray(chVerses)) continue;
      for (let vi = 0; vi < chVerses.length; vi++) {
        const rawText = chVerses[vi];
        if (!rawText) continue;
        const tokens = extractContentTokens(rawText);
        if (tokens.length < 4) continue;

        const idx = verses.length;
        const tokenSet = new Set(tokens);
        const bigrams = new Set<string>();
        for (let k = 0; k < tokens.length - 1; k++) {
          bigrams.add(`${tokens[k]} ${tokens[k + 1]}`);
        }

        verses.push({
          idx,
          book: book.n,
          bookName: book.name,
          chapter: ci + 1,
          verse: vi + 1,
          tokens,
          tokenSet,
          bigrams,
        });

        for (const w of tokenSet) {
          let list = inverted.get(w);
          if (!list) {
            list = [];
            inverted.set(w, list);
          }
          list.push(idx);
        }
      }
    }
  }

  const totalVerses = Math.max(1, verses.length);
  const idf = new Map<string, number>();
  for (const [w, posting] of inverted.entries()) {
    const df = posting.length;
    idf.set(w, Math.log(1 + (totalVerses - df + 0.5) / (df + 0.5)));
  }

  const built: PackQuoteIndex = {
    packKey,
    packId: pack.id,
    verses,
    inverted,
    idf,
  };
  indexCache.set(packKey, built);
  return built;
}

/**
 * Matches the last ~8–20 spoken words against installed Bible packs (MD-4).
 * Searches all installed versions and ranks the default version first.
 */
export function matchSpokenVerseQuotes(
  rawTranscript: string,
  packs: BiblePackForQuotes[],
  defaultVersionId?: string
): QuoteMatchResult[] {
  if (!rawTranscript || !packs || packs.length === 0) return [];

  // Take the last 22 words of the spoken transcript (MD-4: last ~8-20 spoken words)
  const rawWords = String(rawTranscript)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-22);
  if (rawWords.length < 7) return [];

  const queryWindowText = rawWords.join(' ');
  const qTokens = extractContentTokens(queryWindowText);
  const uniqueQTokens = Array.from(new Set(qTokens));

  if (uniqueQTokens.length < MIN_MATCHING_CONTENT_WORDS) {
    return [];
  }

  const qBigrams = new Set<string>();
  for (let i = 0; i < qTokens.length - 1; i++) {
    qBigrams.add(`${qTokens[i]} ${qTokens[i + 1]}`);
  }

  // Order packs so the default version is searched and ranked first (MD-4)
  const orderedPacks = [...packs].sort((a, b) => {
    if (a.id === defaultVersionId) return -1;
    if (b.id === defaultVersionId) return 1;
    return 0;
  });

  const bestByCanonicalRef = new Map<string, QuoteMatchResult & { rawScore: number; isDefault: boolean }>();

  for (const pack of orderedPacks) {
    const idx = buildPackQuoteIndex(pack);
    if (idx.verses.length === 0) continue;
    const isDefault = pack.id === defaultVersionId || pack.id === orderedPacks[0].id;

    // Accumulate candidate verse hit counts and BM25-style IDF weights
    const hitCounts = new Map<number, number>();
    const bm25Scores = new Map<number, number>();

    for (const w of uniqueQTokens) {
      const posting = idx.inverted.get(w);
      if (!posting) continue;
      // Skip ultra-common words appearing in > 2500 verses during initial candidate gather unless needed
      const weight = idx.idf.get(w) || 1;
      for (let i = 0; i < posting.length; i++) {
        const vIdx = posting[i];
        hitCounts.set(vIdx, (hitCounts.get(vIdx) || 0) + 1);
        bm25Scores.set(vIdx, (bm25Scores.get(vIdx) || 0) + weight);
      }
    }

    for (const [vIdx, matchedWords] of hitCounts.entries()) {
      if (matchedWords < MIN_MATCHING_CONTENT_WORDS) continue;

      const v = idx.verses[vIdx];
      // Compute word shingle (bigram) overlap and in-order sequence bonus
      let bigramHits = 0;
      for (const bg of qBigrams) {
        if (v.bigrams.has(bg)) bigramHits++;
      }

      // Check in-order monotonic token match
      let lastPos = -1;
      let orderedMatches = 0;
      for (const qt of qTokens) {
        if (!v.tokenSet.has(qt)) continue;
        const pos = v.tokens.indexOf(qt, lastPos + 1);
        if (pos > lastPos) {
          orderedMatches++;
          lastPos = pos;
        }
      }

      const verseCoverage = matchedWords / Math.max(6, Math.min(14, v.tokenSet.size));
      const queryCoverage = matchedWords / Math.max(6, uniqueQTokens.length);
      const bigramRatio = qBigrams.size > 0 ? bigramHits / Math.min(qBigrams.size, v.bigrams.size || 1) : 0;
      const orderRatio = orderedMatches / matchedWords;

      // Require strong order or bigram overlap so random bags of 6 common words don't misfire
      if (bigramHits < 2 && orderedMatches < 5) continue;

      const rawScore =
        (bm25Scores.get(vIdx) || 0) * 0.4 +
        matchedWords * 1.5 +
        bigramHits * 2.2 +
        orderedMatches * 0.9 +
        (isDefault ? 1.25 : 0);

      let confidence = Math.min(
        0.96,
        0.58 +
          Math.min(0.18, (matchedWords - 5) * 0.035) +
          Math.min(0.12, bigramRatio * 0.16) +
          Math.min(0.08, ((verseCoverage + queryCoverage) / 2) * 0.1) *
            orderRatio +
          (isDefault ? 0.02 : 0)
      );
      confidence = Number(confidence.toFixed(2));
      if (confidence < 0.72) continue;

      const band: 'high' | 'medium' = confidence >= 0.85 ? 'high' : 'medium';
      const canonicalRef = `${v.bookName} ${v.chapter}:${v.verse}`;
      const existing = bestByCanonicalRef.get(canonicalRef);

      if (
        !existing ||
        (isDefault && !existing.isDefault && rawScore >= existing.rawScore * 0.9) ||
        rawScore > existing.rawScore
      ) {
        bestByCanonicalRef.set(canonicalRef, {
          book: v.book,
          bookName: v.bookName,
          chapter: v.chapter,
          verseStart: v.verse,
          versionId: pack.id,
          confidence,
          band,
          matchedContentWords: matchedWords,
          heardExcerpt: rawWords.slice(-12).join(' '),
          canonicalRef,
          rawScore,
          isDefault,
        });
      }
    }
  }

  return Array.from(bestByCanonicalRef.values())
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault && Math.abs(a.rawScore - b.rawScore) < 2.0) {
        return a.isDefault ? -1 : 1;
      }
      return b.rawScore - a.rawScore;
    })
    .slice(0, 2)
    .map(({ rawScore: _r, isDefault: _d, ...clean }) => clean);
}
