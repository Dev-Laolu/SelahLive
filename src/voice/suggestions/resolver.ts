import { BOOK_NAMES, getVerse } from '@/lib/bible';
import type {
  ScripturePayload,
  SongPayload,
  Suggestion,
  SuggestionKind,
  TextPayload,
} from '../types';

export interface ResolvedSuggestionView {
  kind: SuggestionKind;
  title: string;
  subtitle: string;
  body: string;
  label?: string;
  ref?: string;
  book?: number;
  chapter?: number;
  verse?: number;
  songId?: string;
  slideIndex?: number;
  savedTextId?: string;
  templateId?: string;
}

/**
 * Resolves any Suggestion (`scripture` | `song` | `text`) against the user's installed IndexedDB libraries.
 * Kept in a pure module with zero React/Context imports to avoid circular dependencies.
 */
export function resolveSuggestionView(
  suggestion: Suggestion,
  options: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bibles?: any[];
    activeBibleId?: string;
    defaultVersionId?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    songs?: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    savedTexts?: any[];
  } = {}
): ResolvedSuggestionView {
  const {
    bibles = [],
    activeBibleId,
    defaultVersionId,
    songs = [],
    savedTexts = [],
  } = options;

  if (suggestion.kind === 'song') {
    const p = suggestion.payload as SongPayload;
    const foundSong = songs.find((s) => s.id === p.songId);
    const slideIdx = p.slideIndex ?? 0;
    const sec = foundSong?.sections?.[slideIdx] || foundSong?.sections?.[0];
    return {
      kind: 'song',
      title: foundSong?.title || 'Song Suggestion',
      subtitle: foundSong?.author || foundSong?.pack || 'Song',
      body: sec?.text || p.matchedLine || '',
      label: sec?.label || '',
      songId: p.songId,
      slideIndex: slideIdx,
    };
  }

  if (suggestion.kind === 'text') {
    const p = suggestion.payload as TextPayload;
    const foundText = savedTexts.find((t) => t.id === p.savedTextId);
    return {
      kind: 'text',
      title: foundText?.title || 'Saved Text',
      subtitle: 'Saved Text',
      body: foundText?.body || '',
      savedTextId: p.savedTextId,
      templateId: foundText?.templateId || '',
    };
  }

  // Scripture
  const p = suggestion.payload as ScripturePayload;
  const pack =
    bibles.find((b) => b.id === (p.versionId || defaultVersionId || activeBibleId)) ||
    bibles.find((b) => b.id === activeBibleId) ||
    bibles[0];

  const bookName = BOOK_NAMES[(p.book || 1) - 1] || 'Scripture';
  const vStart = p.verseStart || 1;
  const vEnd = p.verseEnd && p.verseEnd > vStart ? p.verseEnd : undefined;
  const refTitle = vEnd
    ? `${bookName} ${p.chapter}:${vStart}-${vEnd}`
    : `${bookName} ${p.chapter}:${vStart}`;

  if (!pack) {
    return {
      kind: 'scripture',
      title: refTitle,
      subtitle: '',
      body: 'Download a Bible version in Library to load verse text.',
      ref: refTitle,
      book: p.book,
      chapter: p.chapter,
      verse: vStart,
    };
  }

  if (vEnd) {
    const parts: string[] = [];
    for (let v = vStart; v <= vEnd; v++) {
      const gv = getVerse(pack, p.book, p.chapter, v);
      if (gv?.text) {
        parts.push(`${v} ${gv.text}`);
      }
    }
    return {
      kind: 'scripture',
      title: refTitle,
      subtitle: pack.code || pack.name || '',
      body: parts.join(' ') || `Open ${refTitle}`,
      ref: refTitle,
      book: p.book,
      chapter: p.chapter,
      verse: vStart,
    };
  }

  const gv = getVerse(pack, p.book, p.chapter, vStart);
  return {
    kind: 'scripture',
    title: refTitle,
    subtitle: pack.code || pack.name || '',
    body: gv?.text || `Open ${refTitle}`,
    ref: refTitle,
    book: p.book,
    chapter: p.chapter,
    verse: vStart,
  };
}

export function resolveScriptureSuggestion(
  suggestion: Suggestion,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bibles: any[],
  activeBibleId?: string,
  defaultVersionId?: string
): ResolvedSuggestionView {
  return resolveSuggestionView(suggestion, {
    bibles,
    activeBibleId,
    defaultVersionId,
  });
}
