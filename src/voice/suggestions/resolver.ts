import { BOOK_NAMES, getVerse } from '@/lib/bible';
import type {
  BiblePack,
  ScripturePayload,
  SongPayload,
  SongSectionSlide,
  Suggestion,
  TextPayload,
} from '../type';
import type { ResolvedSuggestionView, ResolveSuggestionOptions } from './type';

export type { ResolvedSuggestionView, ResolveSuggestionOptions } from './type';

export function rechunkSongSections(
  sections: SongSectionSlide[] = [],
  maxLines = 2
): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  for (const sec of sections) {
    const lines = String(sec?.text ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length; i += maxLines) {
      out.push({
        label: sec?.label ?? '',
        text: lines.slice(i, i + maxLines).join('\n'),
      });
    }
  }
  return out;
}

export function resolveSuggestionView(
  suggestion: Suggestion,
  options: ResolveSuggestionOptions = {}
): ResolvedSuggestionView {
  const {
    bibles = [],
    activeBibleId,
    defaultVersionId,
    songs = [],
    savedTexts = [],
  } = options;

  if (suggestion.kind === 'song') {
    const payload = suggestion.payload as SongPayload;
    const foundSong = songs.find((s) => s.id === payload.songId);
    const slideIdx = payload.slideIndex ?? 0;
    const slide = foundSong?.sections?.[slideIdx] ?? foundSong?.sections?.[0];
    return {
      kind: 'song',
      title: foundSong?.title ?? 'Song Suggestion',
      subtitle: foundSong?.author || foundSong?.pack || 'Song',
      body: slide?.text || payload.matchedLine || '',
      label: slide?.label ?? '',
      songId: payload.songId,
      slideIndex: slideIdx,
    };
  }

  if (suggestion.kind === 'text') {
    const payload = suggestion.payload as TextPayload;
    const foundText = savedTexts.find((t) => t.id === payload.savedTextId);
    return {
      kind: 'text',
      title: foundText?.title ?? 'Saved Text',
      subtitle: 'Saved Text',
      body: foundText?.body ?? '',
      savedTextId: payload.savedTextId,
      templateId: foundText?.templateId ?? '',
    };
  }

  const payload = suggestion.payload as ScripturePayload;
  const preferredId = payload.versionId || defaultVersionId || activeBibleId;
  const pack =
    bibles.find((b) => b.id === preferredId) ??
    bibles.find((b) => b.id === activeBibleId) ??
    bibles[0];

  const bookName = BOOK_NAMES[(payload.book || 1) - 1] ?? 'Scripture';
  const vStart = payload.verseStart ?? 1;
  const vEnd = payload.verseEnd && payload.verseEnd > vStart ? payload.verseEnd : undefined;
  const refTitle = vEnd
    ? `${bookName} ${payload.chapter}:${vStart}-${vEnd}`
    : `${bookName} ${payload.chapter}:${vStart}`;

  if (!pack) {
    return {
      kind: 'scripture',
      title: refTitle,
      subtitle: '',
      body: 'Download a Bible version in Library to load verse text.',
      ref: refTitle,
      book: payload.book,
      chapter: payload.chapter,
      verse: vStart,
    };
  }

  if (vEnd) {
    const parts: string[] = [];
    for (let v = vStart; v <= vEnd; v++) {
      const gv = getVerse(pack, payload.book, payload.chapter, v);
      if (gv?.text) parts.push(`${v} ${gv.text}`);
    }
    return {
      kind: 'scripture',
      title: refTitle,
      subtitle: pack.code || pack.name || '',
      body: parts.join(' ') || `Open ${refTitle}`,
      ref: refTitle,
      book: payload.book,
      chapter: payload.chapter,
      verse: vStart,
    };
  }

  const gv = getVerse(pack, payload.book, payload.chapter, vStart);
  return {
    kind: 'scripture',
    title: refTitle,
    subtitle: pack.code || pack.name || '',
    body: gv?.text || `Open ${refTitle}`,
    ref: refTitle,
    book: payload.book,
    chapter: payload.chapter,
    verse: vStart,
  };
}

export function resolveScriptureSuggestion(
  suggestion: Suggestion,
  bibles: BiblePack[],
  activeBibleId?: string,
  defaultVersionId?: string
): ResolvedSuggestionView {
  return resolveSuggestionView(suggestion, { bibles, activeBibleId, defaultVersionId });
}
