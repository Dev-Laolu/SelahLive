import type { BiblePackForQuotes, IndexedVerse, PackQuoteIndex } from './type';

export const MIN_MATCHING_CONTENT_WORDS = 6;

const QUOTE_STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'this', 'have', 'unto', 'shall',
  'will', 'they', 'them', 'their', 'there', 'then', 'than', 'when', 'what',
  'which', 'who', 'whom', 'whose', 'into', 'upon', 'were', 'was', 'are', 'been',
  'being', 'his', 'her', 'him', 'she', 'you', 'your', 'our', 'out', 'not', 'but',
  'all', 'any', 'can', 'had', 'has', 'hath', 'doth', 'did', 'may', 'now', 'one',
  'two', 'said', 'say', 'says', 'saying', 'also', 'even', 'only', 'very', 'just',
  'like', 'about', 'over', 'after', 'before', 'because', 'through', 'therefore',
  'wherefore', 'thee', 'thou', 'thy', 'thine', 'ye',
]);

const indexCache = new Map<string, PackQuoteIndex>();

export function extractContentTokens(text: string): string[] {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !QUOTE_STOPWORDS.has(w));
}

export function buildPackQuoteIndex(pack: BiblePackForQuotes): PackQuoteIndex {
  const packKey = `${pack.id}:${pack.version ?? '1'}`;
  const cached = indexCache.get(packKey);
  if (cached) return cached;

  const verses: IndexedVerse[] = [];
  const inverted = new Map<string, number[]>();

  for (const book of pack.books ?? []) {
    const chapters = book.chapters ?? [];
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
          const w1 = tokens[k];
          const w2 = tokens[k + 1];
          if (w1 && w2) bigrams.add(`${w1} ${w2}`);
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

        for (const word of tokenSet) {
          let posting = inverted.get(word);
          if (!posting) {
            posting = [];
            inverted.set(word, posting);
          }
          posting.push(idx);
        }
      }
    }
  }

  const totalVerses = Math.max(1, verses.length);
  const idf = new Map<string, number>();
  for (const [word, posting] of inverted.entries()) {
    const df = posting.length;
    idf.set(word, Math.log(1 + (totalVerses - df + 0.5) / (df + 0.5)));
  }

  const built: PackQuoteIndex = { packKey, packId: pack.id, verses, inverted, idf };
  indexCache.set(packKey, built);
  return built;
}
