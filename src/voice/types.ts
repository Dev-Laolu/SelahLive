// PRD §7 — Source-of-truth data structures for Selah Live v2: Voice Suggestions

export type SuggestionKind = 'scripture' | 'song' | 'text';

export type Reason =
  | 'spoken-reference'
  | 'quote-match'
  | 'lyric-match'
  | 'title-mention'
  | 'intent-trigger'
  | 'service-context';

export interface ScripturePayload {
  book: number;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  versionId: string;
}

export interface SongPayload {
  songId: string;
  slideIndex?: number;
  matchedLine?: string;
}

export interface TextPayload {
  savedTextId: string;
  triggerId: string;
}

export interface Suggestion {
  id: string;                 // stable id so interim/final merge into one card
  kind: SuggestionKind;
  reason: Reason;
  confidence: number;         // 0..1
  band: 'high' | 'medium';    // below the sensitivity cutoff is never shown
  heard: string;              // short excerpt that triggered it
  createdAt: number;
  expiresAt: number;          // createdAt + 60_000 unless pinned
  pinned: boolean;
  payload: ScripturePayload | SongPayload | TextPayload;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  isFinal: boolean;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export interface VoiceSettings {
  enabled: boolean;
  deviceId?: string;
  deviceLabel?: string;       // Stored locally alongside deviceId for fallback when browser resets IDs; NEVER synced to Firebase
  channel?: 'mix' | 1 | 2;
  noiseSuppression?: 'auto' | 'on' | 'off';
  engine: 'auto' | 'whisper' | 'browser';   // auto = Whisper primary, browser backup
  whisperModel: 'tiny.en' | 'base.en' | 'small.en';
  sensitivity: 'careful' | 'balanced' | 'eager';
  defaultVersionId: string;
  showTranscript: boolean;
  chime: boolean;
  performanceMode: boolean;
  allowCloudBrowserEngine: boolean;         // default false, explicit opt-in only
  customVocabulary: string[];
}

export interface TriggerRule {
  id: string;
  savedTextId: string;
  phrases: string[];          // e.g. ["offering time", "bring your offering"]
  enabled: boolean;
}

export type MicPermissionState =
  | 'unrequested'
  | 'granted'
  | 'denied'
  | 'no-device'
  | 'in-use'
  | 'error';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  groupId: string;
  isLikelyInterface: boolean;
}

export interface LevelReading {
  rms: number;        // 0..1
  peak: number;       // 0..1
  db: number;         // -60..0
  clipping: boolean;  // peak >= 0.96
}

export interface MicTestReport {
  durationMs: number;
  sampleCount: number;
  sampleRate: number;
  avgRms: number;
  peak: number;
  clipping: boolean;
  status: 'silent' | 'low' | 'good' | 'clipping';
  summary: string;
  transcriptPreview?: string;
}

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
  showTranscript: false,
  chime: false,
  performanceMode: false,
  allowCloudBrowserEngine: false,
  customVocabulary: [],
};
