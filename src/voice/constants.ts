import type {
  LevelReading,
  Reason,
  SuggestionFeedbackCounters,
  VoiceSettings,
} from './type';

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  deviceId: 'default',
  deviceLabel: '',
  channel: 'mix',
  noiseSuppression: 'auto',
  engine: 'auto',
  whisperModel: 'base.en',
  sensitivity: 'balanced',
  defaultVersionId: '',
  showTranscript: true,
  chime: false,
  performanceMode: false,
  allowCloudBrowserEngine: false,
  customVocabulary: [],
};

export const ZERO_LEVEL: LevelReading = {
  rms: 0,
  peak: 0,
  db: -60,
  clipping: false,
};

export const ZERO_FEEDBACK_COUNTERS: SuggestionFeedbackCounters = {
  shownCount: 0,
  previewedCount: 0,
  dismissedCount: 0,
};

export const TRANSCRIPT_RETENTION_MS = 5 * 60 * 1000;
export const ROLLING_WINDOW_MS = 7_500;
export const MAX_TRANSCRIPT_SEGMENTS = 80;

export const REASON_LABELS: Readonly<Record<Reason, string>> = {
  'spoken-reference': 'Spoken Ref',
  'quote-match': 'Verse Quote',
  'title-mention': 'Song Title',
  'lyric-match': 'Song Lyric',
  'intent-trigger': 'Service Cue',
  'service-context': 'Service Context',
};
