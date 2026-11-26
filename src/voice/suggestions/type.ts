import type { SongForVoiceMatch } from '../detectors/type';
import type {
  BiblePack,
  ConfidenceBand,
  Reason,
  SavedTextItem,
  SensitivityLevel,
  Suggestion,
  SuggestionKind,
  SuggestionPayload,
} from '../type';

export interface OperatorGestureEvent {
  isTrusted?: boolean | undefined;
  type: 'click' | 'keydown';
  key?: string | undefined;
  altKey?: boolean | undefined;
  shiftKey?: boolean | undefined;
}

export interface OperatorActionCallbacks {
  onShow?: ((suggestion: Suggestion) => void) | undefined;
  onPreview?: ((suggestion: Suggestion) => void) | undefined;
  onDismiss?: ((suggestionId: string) => void) | undefined;
}

export interface CandidateSuggestionInput {
  kind: SuggestionKind;
  reason: Reason;
  confidence: number;
  band?: ConfidenceBand | undefined;
  heard: string;
  payload: SuggestionPayload;
}

export interface IngestOptions {
  sensitivity?: SensitivityLevel | undefined;
  now?: number | undefined;
  bypassRateLimit?: boolean | undefined;
}

export interface IngestResult {
  changed: boolean;
  createdNew: boolean;
  suggestions: Suggestion[];
}

export interface ResolvedSuggestionView {
  kind: SuggestionKind;
  title: string;
  subtitle: string;
  body: string;
  label?: string | undefined;
  ref?: string | undefined;
  book?: number | undefined;
  chapter?: number | undefined;
  verse?: number | undefined;
  songId?: string | undefined;
  slideIndex?: number | undefined;
  savedTextId?: string | undefined;
  templateId?: string | undefined;
}

export interface ResolveSuggestionOptions {
  bibles?: BiblePack[] | undefined;
  activeBibleId?: string | undefined;
  defaultVersionId?: string | undefined;
  songs?: SongForVoiceMatch[] | undefined;
  savedTexts?: SavedTextItem[] | undefined;
}
