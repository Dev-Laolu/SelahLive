import type {
  BiblePack,
  ConfidenceBand,
  SavedTextItem,
  SongSectionSlide,
} from '../type';

export type BiblePackForQuotes = BiblePack;
export type SavedTextForTrigger = SavedTextItem;

export interface SongForVoiceMatch {
  id: string;
  title: string;
  author?: string | undefined;
  pack?: string | undefined;
  sections?: SongSectionSlide[] | undefined;
}

export interface BookMatch {
  book: number;
  fuzzy: boolean;
}

export interface CanonicalBookRecord {
  book: number;
  name: string;
  clean: string;
  phonetic: string;
}

export interface ParsedSpokenReference {
  book: number;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number | undefined;
  chapterOnly: boolean;
  confidence: number;
  band: ConfidenceBand;
  matchedExcerpt: string;
  canonicalRef: string;
}

export interface IndexedVerse {
  idx: number;
  book: number;
  bookName: string;
  chapter: number;
  verse: number;
  tokens: string[];
  tokenSet: Set<string>;
  bigrams: Set<string>;
}

export interface PackQuoteIndex {
  packKey: string;
  packId: string;
  verses: IndexedVerse[];
  inverted: Map<string, number[]>;
  idf: Map<string, number>;
}

export interface QuoteMatchResult {
  book: number;
  bookName: string;
  chapter: number;
  verseStart: number;
  versionId: string;
  confidence: number;
  band: ConfidenceBand;
  matchedContentWords: number;
  heardExcerpt: string;
  canonicalRef: string;
}

export interface SongMatchResult {
  songId: string;
  title: string;
  slideIndex: number;
  matchedLine: string;
  reason: 'title-mention' | 'lyric-match';
  confidence: number;
  band: ConfidenceBand;
  heardExcerpt: string;
}

export interface BuiltInIntentCategory {
  id: string;
  label: string;
  matchKeywords: string[];
  phrases: string[];
}

export interface IntentTriggerMatchResult {
  savedTextId: string;
  title: string;
  triggerId: string;
  matchedPhrase: string;
  confidence: number;
  band: ConfidenceBand;
  heardExcerpt: string;
}

export interface ServiceContextBoostResult {
  confidence: number;
  boosted: boolean;
}
