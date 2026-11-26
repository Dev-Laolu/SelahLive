import type { SongForVoiceMatch } from '../detectors/type';
import type { OperatorGestureEvent, ResolvedSuggestionView } from '../suggestions/type';
import type {
  BiblePack,
  LevelReading,
  SavedTextItem,
  Suggestion,
  SuggestionActionType,
  SuggestionKind,
} from '../type';

export interface LevelMeterProps {
  level: LevelReading;
  active: boolean;
}

export interface TranscriptPanelProps {
  defaultOpen?: boolean | undefined;
}

export interface LiveHearingStripProps {
  label?: string | undefined;
  showDbReadout?: boolean | undefined;
}

export interface SuggestionTrayProps {
  filterKind?: SuggestionKind | undefined;
  bibles?: BiblePack[] | undefined;
  activeBibleId?: string | undefined;
  songs?: SongForVoiceMatch[] | undefined;
  savedTexts?: SavedTextItem[] | undefined;
  onOperatorShow: (item: ResolvedSuggestionView) => void;
  onOperatorPreview: (item: ResolvedSuggestionView) => void;
}

export interface SuggestionCardProps {
  suggestion: Suggestion;
  resolved: ResolvedSuggestionView;
  shortcutNumber: number;
  onAction: (
    action: SuggestionActionType,
    suggestion: Suggestion,
    gesture: OperatorGestureEvent
  ) => void;
  onTogglePin: (id: string) => void;
}

export interface VoiceHeaderSectionProps {
  showPermissionIntro: boolean;
  onToggleEnabled: () => void;
  onConfirmPermission: () => void;
  onCancelPermission: () => void;
}

export interface VoiceAudioInputSectionProps {
  onRequestMicTest: () => void;
}
