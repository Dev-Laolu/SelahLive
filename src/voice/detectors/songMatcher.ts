/**
 * Selah Live v2 — Song Title & Lyric Matcher (MD-5)
 *
 * Detects:
 * (a) Title mentions: when the pastor or worship leader cues a song by title
 *     (e.g. "let's sing Amazing Grace", "we're going to sing Way Maker", "stand and sing Holy Holy Holy").
 * (b) Lyric lines: matches spoken/led lyric lines against installed song packs and custom songs.
 *     Requires TWO consecutive line matches in a slide/song (or one very strong 6+ content-word match)
 *     before suggesting, and returns the exact matching `slideIndex` and `matchedLine`.
 */

export interface SongSectionSlide {
  label?: string;
  text: string;
}

export interface SongForVoiceMatch {
  id: string;
  title: string;
  author?: string;
  sections?: SongSectionSlide[];
}

export interface SongMatchResult {
  songId: string;
  title: string;
  slideIndex: number;
  matchedLine: string;
  reason: 'title-mention' | 'lyric-match';
  confidence: number;
  band: 'high' | 'medium';
  heardExcerpt: string;
}

const SONG_CUE_PATTERNS = [
  /\b(?:let\s+us|let's|lets|we\s+will|we're\s+going\s+to|we\s+are\s+going\s+to|join\s+us\s+in|stand\s+and|together)\s+(?:sing|worship\s+with|lift\s+up)\s+([a-z0-9'\s]{3,60})/i,
  /\bsing(?:ing)?\s+(?:the\s+song|the\s+hymn|hymn)?\s*([a-z0-9'\s]{4,60})/i,
  /\bhymn\s+(?:called|titled|named)?\s*([a-z0-9'\s]{4,60})/i,
];

const LYRIC_STOPWORDS = new Set([
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

function tokenOverlapRatio(lineTokens: string[], transcriptSet: Set<string>): {
  matched: number;
  ratio: number;
} {
  if (lineTokens.length === 0) return { matched: 0, ratio: 0 };
  let matched = 0;
  for (const t of lineTokens) {
    if (transcriptSet.has(t)) matched++;
  }
  return { matched, ratio: matched / lineTokens.length };
}

/**
 * Matches spoken transcript against song titles (with cue phrases) and song lyric slides (MD-5).
 */
export function matchSpokenSongs(
  rawTranscript: string,
  songs: SongForVoiceMatch[]
): SongMatchResult[] {
  if (!rawTranscript || !songs || songs.length === 0) return [];
  const normTranscript = normalizeLine(rawTranscript);
  if (normTranscript.length < 6) return [];

  const results: SongMatchResult[] = [];

  // (a) Check explicit song title cue mentions ("let's sing Amazing Grace")
  let hasSongCueVerb = /\b(sing|singing|hymn|song|worship|chorus)\b/i.test(normTranscript);
  for (const rx of SONG_CUE_PATTERNS) {
    if (rx.test(rawTranscript)) {
      hasSongCueVerb = true;
      break;
    }
  }

  if (hasSongCueVerb) {
    for (const song of songs) {
      const cleanTitle = normalizeLine(song.title);
      if (!cleanTitle || cleanTitle.length < 4) continue;
      const titleTokens = cleanTitle.split(' ').filter(Boolean);

      if (normTranscript.includes(cleanTitle)) {
        const firstSlideText = song.sections?.[0]?.text || song.title;
        results.push({
          songId: song.id,
          title: song.title,
          slideIndex: 0,
          matchedLine: firstSlideText.split('\n')[0] || song.title,
          reason: 'title-mention',
          confidence: titleTokens.length >= 2 ? 0.92 : 0.84,
          band: titleTokens.length >= 2 ? 'high' : 'medium',
          heardExcerpt: rawTranscript.trim().slice(-80),
        });
      }
    }
  }

  // (b) Check lyric line matches (MD-5: two consecutive line matches, or one very strong match)
  const transcriptTokens = contentTokens(normTranscript);
  const transcriptTokenSet = new Set(transcriptTokens);

  if (transcriptTokens.length >= 4) {
    for (const song of songs) {
      if (results.some((r) => r.songId === song.id)) continue;
      const sections = song.sections || [];

      let bestSlideIdx = -1;
      let bestSlideConfidence = 0;
      let bestMatchedLine = '';

      for (let si = 0; si < sections.length; si++) {
        const rawSlide = sections[si]?.text || '';
        const lines = rawSlide
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) continue;

        const lineStats = lines.map((rawLine) => {
          const normL = normalizeLine(rawLine);
          const toks = contentTokens(normL);
          const { matched, ratio } = tokenOverlapRatio(toks, transcriptTokenSet);
          const exactSubstring = normL.length >= 12 && normTranscript.includes(normL);
          return {
            rawLine,
            normL,
            tokCount: toks.length,
            matched,
            ratio,
            exactSubstring,
            isLineMatch:
              exactSubstring ||
              (toks.length >= 2 && matched >= 2 && ratio >= 0.75) ||
              (toks.length >= 4 && matched >= 3 && ratio >= 0.65),
          };
        });

        // Condition 1: Two consecutive lines in this slide match (or line i and line 0 of next slide)
        let consecutiveMatched = false;
        let matchedExcerptLine = lineStats[0].rawLine;

        for (let li = 0; li < lineStats.length - 1; li++) {
          if (lineStats[li].isLineMatch && lineStats[li + 1].isLineMatch) {
            consecutiveMatched = true;
            matchedExcerptLine = `${lineStats[li].rawLine} / ${lineStats[li + 1].rawLine}`;
            break;
          }
        }

        // Also check across slide boundary: last line of slide si + first line of slide si+1
        if (!consecutiveMatched && si + 1 < sections.length && lineStats[lineStats.length - 1].isLineMatch) {
          const nextFirstLine = (sections[si + 1]?.text || '').split('\n')[0]?.trim() || '';
          if (nextFirstLine) {
            const nextToks = contentTokens(nextFirstLine);
            const nextStat = tokenOverlapRatio(nextToks, transcriptTokenSet);
            if (
              (nextToks.length >= 2 && nextStat.matched >= 2 && nextStat.ratio >= 0.75) ||
              normalizeLine(nextFirstLine).length >= 12 && normTranscript.includes(normalizeLine(nextFirstLine))
            ) {
              consecutiveMatched = true;
              matchedExcerptLine = `${lineStats[lineStats.length - 1].rawLine} / ${nextFirstLine}`;
            }
          }
        }

        // Condition 2: One very strong single-line or full-slide match (>= 5 content words or exact 18+ char line)
        const totalSlideToks = contentTokens(rawSlide);
        const slideOverlap = tokenOverlapRatio(totalSlideToks, transcriptTokenSet);
        const veryStrongSingle =
          lineStats.some((ls) => ls.exactSubstring && ls.tokCount >= 3) ||
          (totalSlideToks.length >= 5 && slideOverlap.matched >= 5 && slideOverlap.ratio >= 0.8);

        if (consecutiveMatched || veryStrongSingle) {
          const conf = consecutiveMatched ? 0.91 : 0.86;
          if (conf > bestSlideConfidence) {
            bestSlideConfidence = conf;
            bestSlideIdx = si;
            bestMatchedLine = matchedExcerptLine;
          }
        }
      }

      if (bestSlideIdx >= 0) {
        results.push({
          songId: song.id,
          title: song.title,
          slideIndex: bestSlideIdx,
          matchedLine: bestMatchedLine,
          reason: 'lyric-match',
          confidence: bestSlideConfidence,
          band: bestSlideConfidence >= 0.85 ? 'high' : 'medium',
          heardExcerpt: rawTranscript.trim().slice(-80),
        });
      }
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 2);
}
