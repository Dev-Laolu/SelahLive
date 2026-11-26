import type { SongForVoiceMatch } from '../detectors/type';
import { rechunkSongSections } from '../suggestions/resolver';
import type { SongItem, SongPack } from '../type';

export function isEditableElementFocused(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest('[contenteditable="true"]')) {
    return true;
  }
  return false;
}

export function normalizeAllSongs(
  customSongs: SongItem[],
  songPacks: SongPack[],
  lyricsLinesPerSlide: number
): SongForVoiceMatch[] {
  const out: SongForVoiceMatch[] = [];
  for (const song of customSongs) {
    out.push({
      id: song.id || song.title,
      title: song.title,
      author: song.author ?? '',
      sections: rechunkSongSections(song.sections, lyricsLinesPerSlide),
    });
  }
  for (const pack of songPacks) {
    for (const song of pack.songs ?? []) {
      out.push({
        id: `${pack.id}:${song.id || song.title}`,
        title: song.title,
        author: song.author ?? '',
        pack: pack.name,
        sections: rechunkSongSections(song.sections, lyricsLinesPerSlide),
      });
    }
  }
  return out;
}
