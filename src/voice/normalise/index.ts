/**
 * Selah Live v2 — Text Normaliser for Spoken Scripture References (MD-1, MD-2)
 *
 * Converts spoken English number words, ordinals, compound numbers ("thirty-two",
 * "one hundred and nineteen"), and common ASR homophones ("first", "1st", "chapter",
 * "verse", "to", "through") into a canonical token stream ready for the Spoken Reference Parser.
 */

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  won: 1,
  two: 2,
  to: 2,   // Only treated as 2 when inside a compound number context, handled contextually below
  too: 2,
  three: 3,
  four: 4,
  for: 4,  // Contextual
  fore: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ate: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const STRICT_ONES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  fifth: 5,
  '5th': 5,
  sixth: 6,
  '6th': 6,
  seventh: 7,
  '7th': 7,
  eighth: 8,
  '8th': 8,
  ninth: 9,
  '9th': 9,
  tenth: 10,
  '10th': 10,
  eleventh: 11,
  '11th': 11,
  twelfth: 12,
  '12th': 12,
  thirteenth: 13,
  '13th': 13,
  fourteenth: 14,
  '14th': 14,
  fifteenth: 15,
  '15th': 15,
  sixteenth: 16,
  '16th': 16,
  seventeenth: 17,
  '17th': 17,
  eighteenth: 18,
  '18th': 18,
  nineteenth: 19,
  '19th': 19,
  twentieth: 20,
  '20th': 20,
  thirtieth: 30,
  '30th': 30,
  fortieth: 40,
  '40th': 40,
  fiftieth: 50,
  '50th': 50,
  sixtieth: 60,
  '60th': 60,
  seventieth: 70,
  '70th': 70,
  eightieth: 80,
  '80th': 80,
  ninetieth: 90,
  '90th': 90,
  hundredth: 100,
  '100th': 100,
};

const TENS_ORDINAL_PREFIX: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/**
 * Checks if a single word token is a strict cardinal number word (1..90 or "hundred")
 * or ordinal word (4th..150th). Note: "first", "second", "third" at the start of a book name
 * (e.g. "First John", "Second Kings") are handled specially so book prefixes remain intact.
 */
export function parseSingleNumberToken(token: string): number | null {
  const clean = token.toLowerCase().trim();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  const ordMatch = clean.match(/^(\d+)(?:st|nd|rd|th)$/);
  if (ordMatch) return parseInt(ordMatch[1], 10);
  if (STRICT_ONES[clean] !== undefined) return STRICT_ONES[clean];
  if (TENS[clean] !== undefined) return TENS[clean];
  if (ORDINAL_WORDS[clean] !== undefined) return ORDINAL_WORDS[clean];
  return null;
}

/**
 * Collapses spoken number word sequences in a token array into digit strings.
 *
 * Examples:
 * - ["thirty", "two"] -> ["32"]
 * - ["one", "hundred", "and", "nineteen"] -> ["119"]
 * - ["a", "hundred", "and", "fifty"] -> ["150"]
 * - ["one", "nineteen"] (spoken shorthand for 119 when followed by "verse") -> handled in parser or normaliser
 * - ["eight", "twenty", "eight"] -> ["8", "28"] (chapter 8 verse 28!)
 *
 * IMPORTANT: In spoken Bible references, people often say:
 *   "Romans eight twenty-eight" -> Chapter 8, Verse 28 (two separate numbers: 8 and 28)
 *   "Genesis one one" -> Chapter 1, Verse 1 (two separate numbers: 1 and 1)
 *   "Psalm thirty two verse one" -> Chapter 32, Verse 1 (one compound number 32, then 1)
 *   "Psalm one hundred and nineteen verse one oh five" -> Chapter 119, Verse 105
 *
 * Therefore:
 * - TENS (20..90) + ONES (1..9) combine into a single 2-digit number (e.g. "twenty" + "eight" = 28).
 * - ONES (1) + "hundred" + [optional "and"] + (TENS + ONES | ONES | TENS) combine into 100..199.
 * - ONES (1) + "oh" + ONES (1..9) combine into 101..109 (e.g. "one oh five" = 105, "one zero five" = 105).
 * - Two separate ONES (e.g. "one" "one" or "four" "eight") stay as TWO separate number tokens ("1", "1" and "4", "8")
 *   so "First John four eight" becomes ["1", "john", "4", "8"]!
 */
export function convertNumberWordsInTokens(rawTokens: string[]): string[] {
  // Expand hyphenated words first (e.g. "thirty-two" -> "thirty", "two"; "twenty-third" -> "twenty", "third")
  const tokens: string[] = [];
  for (const t of rawTokens) {
    if (t.includes('-') && t !== '-' && !/^\d+-\d+$/.test(t)) {
      const parts = t.split('-').filter(Boolean);
      tokens.push(...parts);
    } else {
      tokens.push(t);
    }
  }

  const out: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const w = tokens[i].toLowerCase();

    // Keep book-leading "first", "second", "third" as "1", "2", "3" if followed by a non-number word,
    // or if preceded by "chapter"/"verse", convert to digit.
    if (w === 'first' || w === 'second' || w === 'third' || w === '1st' || w === '2nd' || w === '3rd') {
      const val = ORDINAL_WORDS[w];
      out.push(String(val));
      i++;
      continue;
    }

    // Check "one/a hundred [and] ..." (for Psalms 100..150)
    if ((w === 'one' || w === 'a' || w === '1') && tokens[i + 1]?.toLowerCase() === 'hundred') {
      let total = 100;
      let step = 2;
      if (tokens[i + step]?.toLowerCase() === 'and') {
        step++;
      }
      const nextW = tokens[i + step]?.toLowerCase() || '';
      const nextW2 = tokens[i + step + 1]?.toLowerCase() || '';

      if (TENS[nextW] !== undefined) {
        total += TENS[nextW];
        step++;
        if (STRICT_ONES[nextW2] !== undefined && STRICT_ONES[nextW2] < 10) {
          total += STRICT_ONES[nextW2];
          step++;
        } else if (ORDINAL_WORDS[nextW2] !== undefined && ORDINAL_WORDS[nextW2] < 10) {
          total += ORDINAL_WORDS[nextW2];
          step++;
        }
      } else if (STRICT_ONES[nextW] !== undefined) {
        total += STRICT_ONES[nextW];
        step++;
      } else if (ORDINAL_WORDS[nextW] !== undefined && ORDINAL_WORDS[nextW] < 20) {
        total += ORDINAL_WORDS[nextW];
        step++;
      }

      out.push(String(total));
      i += step;
      continue;
    }

    // Check "hundred [and] ..." without leading "one"
    if (w === 'hundred' || w === 'hundredth') {
      let total = 100;
      let step = 1;
      if (tokens[i + step]?.toLowerCase() === 'and') step++;
      const nextW = tokens[i + step]?.toLowerCase() || '';
      const nextW2 = tokens[i + step + 1]?.toLowerCase() || '';
      if (TENS[nextW] !== undefined) {
        total += TENS[nextW];
        step++;
        if (STRICT_ONES[nextW2] !== undefined && STRICT_ONES[nextW2] < 10) {
          total += STRICT_ONES[nextW2];
          step++;
        }
      } else if (STRICT_ONES[nextW] !== undefined) {
        total += STRICT_ONES[nextW];
        step++;
      }
      out.push(String(total));
      i += step;
      continue;
    }

    // Check "one oh five" / "one zero five" -> 105
    if (
      (w === 'one' || w === '1') &&
      (tokens[i + 1]?.toLowerCase() === 'oh' || tokens[i + 1]?.toLowerCase() === 'zero') &&
      STRICT_ONES[tokens[i + 2]?.toLowerCase() || ''] !== undefined &&
      STRICT_ONES[tokens[i + 2].toLowerCase()] < 10
    ) {
      const val = 100 + STRICT_ONES[tokens[i + 2].toLowerCase()];
      out.push(String(val));
      i += 3;
      continue;
    }

    // Check "one" + teen/tens for Psalms > 100 (e.g. "Psalm one nineteen" -> 119, "Psalm one thirty nine" -> 139, "Psalm one twenty one" -> 121)
    if (w === 'one' || w === '1') {
      const nextW = tokens[i + 1]?.toLowerCase() || '';
      const nextW2 = tokens[i + 2]?.toLowerCase() || '';
      const prevW = out[out.length - 1]?.toLowerCase() || '';
      const isAfterPsalmOrChapterOrVerse =
        /^(psalm|psalms|chapter|verse|verses|ps)$/.test(prevW);

      // "one" + teen (11..19) is ALWAYS 111..119 (since chapter 1 verse 19 is almost always "chapter 1 verse 19" or in Psalm 119)
      if (STRICT_ONES[nextW] !== undefined && STRICT_ONES[nextW] >= 10 && STRICT_ONES[nextW] <= 19) {
        // Wait: could "Genesis one eleven" mean Genesis 1:11?
        // In Genesis (50 chapters), chapter 111 doesn't exist! In Psalms, 111..119 DO exist.
        // So if preceded by psalm/psalms or verse, or if we check context, let's check if it's after psalm/verse:
        if (isAfterPsalmOrChapterOrVerse || prevW === 'to' || prevW === 'through') {
          out.push(String(100 + STRICT_ONES[nextW]));
          i += 2;
          continue;
        }
      }

      // "one" + TENS (e.g. "Psalm one twenty one", "Psalm one thirty nine", "verse one oh five")
      if (isAfterPsalmOrChapterOrVerse && TENS[nextW] !== undefined) {
        let total = 100 + TENS[nextW];
        let step = 2;
        if (STRICT_ONES[nextW2] !== undefined && STRICT_ONES[nextW2] < 10) {
          total += STRICT_ONES[nextW2];
          step++;
        }
        out.push(String(total));
        i += step;
        continue;
      }
    }

    // Check TENS (20..90) optionally followed by ONES (1..9) or ordinal (1st..9th)
    if (TENS[w] !== undefined || TENS_ORDINAL_PREFIX[w] !== undefined) {
      let total = TENS[w];
      let step = 1;
      const nextW = tokens[i + 1]?.toLowerCase() || '';
      if (STRICT_ONES[nextW] !== undefined && STRICT_ONES[nextW] < 10) {
        total += STRICT_ONES[nextW];
        step++;
      } else if (ORDINAL_WORDS[nextW] !== undefined && ORDINAL_WORDS[nextW] < 10) {
        total += ORDINAL_WORDS[nextW];
        step++;
      }
      out.push(String(total));
      i += step;
      continue;
    }

    // Check standalone STRICT_ONES (1..19) or ORDINAL_WORDS (4th..100th)
    if (STRICT_ONES[w] !== undefined) {
      out.push(String(STRICT_ONES[w]));
      i++;
      continue;
    }

    if (ORDINAL_WORDS[w] !== undefined) {
      out.push(String(ORDINAL_WORDS[w]));
      i++;
      continue;
    }

    // Contextual ASR homophones ("won" / "too" / "ate" / "for" when directly after "chapter" or "verse")
    const prevOut = out[out.length - 1]?.toLowerCase() || '';
    if (
      /^(chapter|ch|verse|verses|v)$/.test(prevOut) &&
      ONES[w] !== undefined
    ) {
      out.push(String(ONES[w]));
      i++;
      continue;
    }

    // Strip ordinal suffixes on digits like "23rd" -> "23", "1st" -> "1"
    const digitOrd = w.match(/^(\d+)(?:st|nd|rd|th)$/);
    if (digitOrd) {
      out.push(digitOrd[1]);
      i++;
      continue;
    }

    out.push(tokens[i]);
    i++;
  }

  return out;
}

/**
 * Normalises a raw transcript utterance into clean lowercase tokens with number words
 * converted to digits and punctuation standardised.
 */
export function normaliseSpokenText(rawText: string): string {
  if (!rawText) return '';

  let s = String(rawText)
    .toLowerCase()
    // Preserve colon and hyphen between digits, space out other punctuation
    .replace(/(\d)\s*:\s*(\d)/g, '$1 : $2')
    .replace(/(\d)\s*[–—-]\s*(\d)/g, '$1 - $2')
    .replace(/[,.;!?()"“”‘’']/g, ' ')
    // Common multi-word book & cue normalisations
    .replace(/\bsong\s+of\s+songs\b/g, 'songofsolomon')
    .replace(/\bsong\s+of\s+solomon\b/g, 'songofsolomon')
    .replace(/\bcanticles\b/g, 'songofsolomon')
    .replace(/\brevelations\b/g, 'revelation')
    .replace(/\bpsalms\b/g, 'psalm')
    // Accented / colloquial ASR homophones for "chapter" and "verse"
    .replace(/\b(?:shapter|capta|chapt)\b/g, 'chapter')
    .replace(/\b(?:vass|vase|vars)\b/g, 'verse')
    .replace(/\b(\d+)\s+(?:first|fast|bus|pass)\s+(\d+)\b/g, '$1 verse $2')
    .replace(/\b1st\b/g, 'first')
    .replace(/\b2nd\b/g, 'second')
    .replace(/\b3rd\b/g, 'third')
    .replace(/\bbook\s+of\s+/g, '')
    .replace(/\bgospel\s+(?:according\s+to\s+|of\s+)/g, '')
    .replace(/\bepistle\s+(?:of\s+|to\s+(?:the\s+)?)/g, '')
    .replace(/\bletter\s+to\s+(?:the\s+)?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!s) return '';
  const rawTokens = s.split(' ');
  const converted = convertNumberWordsInTokens(rawTokens);
  return converted.join(' ');
}

export function normaliseTranscriptForDetection(text: string): string {
  return normaliseSpokenText(text);
}
