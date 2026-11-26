import type { SongForVoiceMatch, SongMatchResult } from './type';

const SONG_CUE_PATTERNS: readonly RegExp[] = [
  /\b(?:let\s+us|let's|lets|we\s+will|we're\s+going\s+to|we\s+are\s+going\s+to|join\s+us\s+in|stand\s+and|together)\s+(?:sing|worship\s+with|lift\s+up)\s+([a-z0-9'\s]{3,60})/i,
  /\bsing(?:ing)?\s+(?:the\s+song|the\s+hymn|hymn)?\s*([a-z0-9'\s]{4,60})/i,
  /\bhymn\s+(?:called|titled|named)?\s*([a-z0-9'\s]{4,60})/i,
];

const LYRIC_STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'this', 'have', 'you', 'your',
  'our', 'are', 'was', 'were', 'his', 'her', 'him', 'all', 'not', 'but', 'will',
  'shall', 'unto', 'into', 'upon', 'oh', 'o', 'ah', 'hallelujah', 'amen',
]);

function normalizeLine(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentTokens(s: string): string[] {
  return normalizeLine(s)
    .split(' ')
    .filter((w) => w.length >= 3 && !LYRIC_STOPWORDS.has(w));
}

function tokenOverlapRatio(
  lineTokens: string[],
  transcriptSet: Set<string>
): { matched: number; ratio: number } {
  if (lineTokens.length === 0) return { matched: 0, ratio: 0 };
  let matched = 0;
  for (const tok of lineTokens) {
    if (transcriptSet.has(tok)) matched++;
  }
  return { matched, ratio: matched / lineTokens.length };
}

function matchSongTitleCues(
  rawTranscript: string,
  normTranscript: string,
  songs: SongForVoiceMatch[]
): SongMatchResult[] {
  const hasCue =
    /\b(sing|singing|hymn|song|worship|chorus)\b/i.test(normTranscript) ||
    SONG_CUE_PATTERNS.some((rx) => rx.test(rawTranscript));
  if (!hasCue) return [];

  const matches: SongMatchResult[] = [];
  for (const song of songs) {
    const cleanTitle = normalizeLine(song.title);
    if (cleanTitle.length < 4 || !normTranscript.includes(cleanTitle)) continue;

    const multiWord = cleanTitle.split(' ').filter(Boolean).length >= 2;
    const firstSlideText = song.sections?.[0]?.text ?? song.title;
    matches.push({
      songId: song.id,
      title: song.title,
      slideIndex: 0,
      matchedLine: firstSlideText.split('\n')[0] || song.title,
      reason: 'title-mention',
      confidence: multiWord ? 0.92 : 0.84,
      band: multiWord ? 'high' : 'medium',
      heardExcerpt: rawTranscript.trim().slice(-80),
    });
  }
  return matches;
}

function matchSongLyrics(
  rawTranscript: string,
  normTranscript: string,
  song: SongForVoiceMatch,
  transcriptTokenSet: Set<string>
): SongMatchResult | null {
  const sections = song.sections ?? [];
  let bestSlideIdx = -1;
  let bestConfidence = 0;
  let bestMatchedLine = '';

  for (let si = 0; si < sections.length; si++) {
    const rawSlide = sections[si]?.text ?? '';
    const lines = rawSlide.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const lineStats = lines.map((rawLine) => {
      const normL = normalizeLine(rawLine);
      const toks = contentTokens(normL);
      const { matched, ratio } = tokenOverlapRatio(toks, transcriptTokenSet);
      const exactSubstring = normL.length >= 12 && normTranscript.includes(normL);
      const isLineMatch =
        exactSubstring ||
        (toks.length >= 2 && matched >= 2 && ratio >= 0.75) ||
        (toks.length >= 4 && matched >= 3 && ratio >= 0.65);
      return { rawLine, tokCount: toks.length, exactSubstring, isLineMatch };
    });

    let consecutiveMatched = false;
    let matchedExcerptLine = lineStats[0]?.rawLine ?? '';

    for (let li = 0; li < lineStats.length - 1; li++) {
      const cur = lineStats[li];
      const nxt = lineStats[li + 1];
      if (cur?.isLineMatch && nxt?.isLineMatch) {
        consecutiveMatched = true;
        matchedExcerptLine = `${cur.rawLine} / ${nxt.rawLine}`;
        break;
      }
    }

    const lastLineStat = lineStats[lineStats.length - 1];
    if (!consecutiveMatched && si + 1 < sections.length && lastLineStat?.isLineMatch) {
      const nextFirstLine = (sections[si + 1]?.text ?? '').split('\n')[0]?.trim() ?? '';
      if (nextFirstLine) {
        const nextNorm = normalizeLine(nextFirstLine);
        const nextToks = contentTokens(nextNorm);
        const nextStat = tokenOverlapRatio(nextToks, transcriptTokenSet);
        const nextMatches =
          (nextToks.length >= 2 && nextStat.matched >= 2 && nextStat.ratio >= 0.75) ||
          (nextNorm.length >= 12 && normTranscript.includes(nextNorm));
        if (nextMatches) {
          consecutiveMatched = true;
          matchedExcerptLine = `${lastLineStat.rawLine} / ${nextFirstLine}`;
        }
      }
    }

    const totalSlideToks = contentTokens(rawSlide);
    const slideOverlap = tokenOverlapRatio(totalSlideToks, transcriptTokenSet);
    const veryStrongSingle =
      lineStats.some((ls) => ls.exactSubstring && ls.tokCount >= 3) ||
      (totalSlideToks.length >= 5 && slideOverlap.matched >= 5 && slideOverlap.ratio >= 0.8);

    if (consecutiveMatched || veryStrongSingle) {
      const conf = consecutiveMatched ? 0.91 : 0.86;
      if (conf > bestConfidence) {
        bestConfidence = conf;
        bestSlideIdx = si;
        bestMatchedLine = matchedExcerptLine;
      }
    }
  }

  if (bestSlideIdx < 0) return null;
  return {
    songId: song.id,
    title: song.title,
    slideIndex: bestSlideIdx,
    matchedLine: bestMatchedLine,
    reason: 'lyric-match',
    confidence: bestConfidence,
    band: bestConfidence >= 0.85 ? 'high' : 'medium',
    heardExcerpt: rawTranscript.trim().slice(-80),
  };
}

export function matchSpokenSongs(
  rawTranscript: string,
  songs: SongForVoiceMatch[]
): SongMatchResult[] {
  if (!rawTranscript || songs.length === 0) return [];
  const normTranscript = normalizeLine(rawTranscript);
  if (normTranscript.length < 6) return [];

  const results = matchSongTitleCues(rawTranscript, normTranscript, songs);
  const transcriptTokens = contentTokens(normTranscript);

  if (transcriptTokens.length >= 4) {
    const transcriptTokenSet = new Set(transcriptTokens);
    for (const song of songs) {
      if (results.some((r) => r.songId === song.id)) continue;
      const lyricMatch = matchSongLyrics(rawTranscript, normTranscript, song, transcriptTokenSet);
      if (lyricMatch) results.push(lyricMatch);
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 2);
}
