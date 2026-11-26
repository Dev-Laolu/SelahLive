import type { BiblePack, SavedTextItem } from '../type';

export interface AppStoreContextValue {
  online?: boolean | undefined;
  style?: { reduceMotion?: boolean | undefined } | undefined;
  bibles?: BiblePack[] | undefined;
  savedTexts?: SavedTextItem[] | undefined;
}

export function useApp(): AppStoreContextValue;
