import { ONES, ORDINAL_WORDS, STRICT_ONES, TENS } from './numberDictionaries';

interface TokenConsumeStep {
  value: string;
  consumed: number;
}

function expandHyphenatedTokens(rawTokens: string[]): string[] {
  const expanded: string[] = [];
  for (const token of rawTokens) {
    if (token.includes('-') && token !== '-' && !/^\d+-\d+$/.test(token)) {
      expanded.push(...token.split('-').filter(Boolean));
    } else {
      expanded.push(token);
    }
  }
  return expanded;
}

function readSmallUnitValue(word: string): number | undefined {
  const strict = STRICT_ONES[word];
  if (strict !== undefined && strict < 10) return strict;
  const ord = ORDINAL_WORDS[word];
  if (ord !== undefined && ord < 10) return ord;
  return undefined;
}

function consumeHundreds(tokens: string[], startIdx: number): TokenConsumeStep | null {
  const w0 = (tokens[startIdx] ?? '').toLowerCase();
  const w1 = (tokens[startIdx + 1] ?? '').toLowerCase();

  let step = 0;
  if ((w0 === 'one' || w0 === 'a' || w0 === '1') && w1 === 'hundred') {
    step = 2;
  } else if (w0 === 'hundred' || w0 === 'hundredth') {
    step = 1;
  } else {
    return null;
  }

  let total = 100;
  if ((tokens[startIdx + step] ?? '').toLowerCase() === 'and') {
    step++;
  }

  const nextW = (tokens[startIdx + step] ?? '').toLowerCase();
  const nextW2 = (tokens[startIdx + step + 1] ?? '').toLowerCase();
  const tensVal = TENS[nextW];
  const onesVal = STRICT_ONES[nextW];
  const ordVal = ORDINAL_WORDS[nextW];

  if (tensVal !== undefined) {
    total += tensVal;
    step++;
    const unit = readSmallUnitValue(nextW2);
    if (unit !== undefined) {
      total += unit;
      step++;
    }
  } else if (onesVal !== undefined) {
    total += onesVal;
    step++;
  } else if (ordVal !== undefined && ordVal < 20) {
    total += ordVal;
    step++;
  }

  return { value: String(total), consumed: step };
}

function consumeOneShorthandNumber(
  tokens: string[],
  startIdx: number,
  prevOut: string
): TokenConsumeStep | null {
  const w0 = (tokens[startIdx] ?? '').toLowerCase();
  if (w0 !== 'one' && w0 !== '1') return null;

  const w1 = (tokens[startIdx + 1] ?? '').toLowerCase();
  const w2 = (tokens[startIdx + 2] ?? '').toLowerCase();

  const ohUnit = STRICT_ONES[w2];
  if ((w1 === 'oh' || w1 === 'zero') && ohUnit !== undefined && ohUnit < 10) {
    return { value: String(100 + ohUnit), consumed: 3 };
  }

  const isPsalmOrRefContext = /^(psalm|psalms|chapter|verse|verses|ps)$/.test(prevOut);
  const teenVal = STRICT_ONES[w1];
  if (
    teenVal !== undefined &&
    teenVal >= 10 &&
    teenVal <= 19 &&
    (isPsalmOrRefContext || prevOut === 'to' || prevOut === 'through')
  ) {
    return { value: String(100 + teenVal), consumed: 2 };
  }

  const tensVal = TENS[w1];
  if (isPsalmOrRefContext && tensVal !== undefined) {
    let total = 100 + tensVal;
    let step = 2;
    const unit = STRICT_ONES[w2];
    if (unit !== undefined && unit < 10) {
      total += unit;
      step++;
    }
    return { value: String(total), consumed: step };
  }

  return null;
}

export function convertNumberWordsInTokens(rawTokens: string[]): string[] {
  const tokens = expandHyphenatedTokens(rawTokens);
  const out: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const raw = tokens[i] ?? '';
    const word = raw.toLowerCase();
    const prevOut = (out[out.length - 1] ?? '').toLowerCase();

    if (/^(first|second|third|1st|2nd|3rd)$/.test(word)) {
      out.push(String(ORDINAL_WORDS[word] ?? raw));
      i++;
      continue;
    }

    const hundredStep = consumeHundreds(tokens, i);
    if (hundredStep) {
      out.push(hundredStep.value);
      i += hundredStep.consumed;
      continue;
    }

    const shorthandStep = consumeOneShorthandNumber(tokens, i, prevOut);
    if (shorthandStep) {
      out.push(shorthandStep.value);
      i += shorthandStep.consumed;
      continue;
    }

    const tensVal = TENS[word];
    if (tensVal !== undefined) {
      let total = tensVal;
      let step = 1;
      const nextWord = (tokens[i + 1] ?? '').toLowerCase();
      const unit = readSmallUnitValue(nextWord);
      if (unit !== undefined) {
        total += unit;
        step++;
      }
      out.push(String(total));
      i += step;
      continue;
    }

    const strictVal = STRICT_ONES[word] ?? ORDINAL_WORDS[word];
    if (strictVal !== undefined) {
      out.push(String(strictVal));
      i++;
      continue;
    }

    const homophoneVal = ONES[word];
    if (/^(chapter|ch|verse|verses|v)$/.test(prevOut) && homophoneVal !== undefined) {
      out.push(String(homophoneVal));
      i++;
      continue;
    }

    const digitOrdinal = word.match(/^(\d+)(?:st|nd|rd|th)$/);
    if (digitOrdinal?.[1]) {
      out.push(digitOrdinal[1]);
      i++;
      continue;
    }

    out.push(raw);
    i++;
  }

  return out;
}
