import type { BiblePack } from '../type';

export const BOOK_NAMES: readonly string[];
export const BOOK_ALIASES: Readonly<Record<string, number>>;

export interface VerseLookupResult {
  ref: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
  code?: string | undefined;
  bookName: string;
}

export function getVerse(
  pack: BiblePack,
  book: number,
  chapter: number,
  verse: number
): VerseLookupResult | null;
