import type { ReactNode } from 'react';
import type {
  HardwareProfile,
  InstalledVoiceModelRecord,
  ModelSizeProbe,
  SpeedCheckResult,
  VoiceModelCatalogEntry,
  WhisperModelId,
} from './asr/type';

export type SuggestionKind = 'scripture' | 'song' | 'text';

export type ConfidenceBand = 'high' | 'medium';

export type Reason =
  | 'spoken-reference'
  | 'quote-match'
  | 'lyric-match'
  | 'title-mention'
  | 'intent-trigger'
  | 'service-context';

export type AudioChannelOption = 'mix' | 1 | 2;
export type NoiseSuppressionOption = 'auto' | 'on' | 'off';
export type PreferredEngineOption = 'auto' | 'whisper' | 'browser';
export type SensitivityLevel = 'careful' | 'balanced' | 'eager';
export type SuggestionActionType = 'show' | 'preview' | 'dismiss';

export interface ScripturePayload {
  book: number;
  chapter: number;
  verseStart?: number | undefined;
  verseEnd?: number | undefined;
  versionId: string;
}

export interface SongPayload {
  songId: string;
  slideIndex?: number | undefined;
  matchedLine?: string | undefined;
}

export interface TextPayload {
  savedTextId: string;
  triggerId: string;
}

export type SuggestionPayload = ScripturePayload | SongPayload | TextPayload;

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  reason: Reason;
  confidence: number;
  band: ConfidenceBand;
  heard: string;
  createdAt: number;
  expiresAt: number;
  pinned: boolean;
  payload: SuggestionPayload;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  isFinal: boolean;
  startMs: number;
  endMs: number;
  confidence?: number | undefined;
}

export interface VoiceSettings {
  enabled: boolean;
  deviceId?: string | undefined;
  deviceLabel?: string | undefined;
  channel?: AudioChannelOption | undefined;
  noiseSuppression?: NoiseSuppressionOption | undefined;
  engine: PreferredEngineOption;
  whisperModel: WhisperModelId;
  sensitivity: SensitivityLevel;
  defaultVersionId: string;
  showTranscript: boolean;
  chime: boolean;
  performanceMode: boolean;
  allowCloudBrowserEngine: boolean;
  customVocabulary: string[];
}

export interface TriggerRule {
  id: string;
  savedTextId: string;
  phrases: string[];
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
  rms: number;
  peak: number;
  db: number;
  clipping: boolean;
}

export type MicTestStatus = 'silent' | 'low' | 'good' | 'clipping';

export interface MicTestReport {
  durationMs: number;
  sampleCount: number;
  sampleRate: number;
  avgRms: number;
  peak: number;
  clipping: boolean;
  status: MicTestStatus;
  summary: string;
  transcriptPreview?: string | undefined;
}

export interface BibleBookEntry {
  n: number;
  name: string;
  chapters: string[][];
}

export interface BiblePack {
  id: string;
  code?: string | undefined;
  name: string;
  version?: string | number | undefined;
  books?: BibleBookEntry[] | undefined;
}

export interface SongSectionSlide {
  label?: string | undefined;
  text: string;
}

export interface SongItem {
  id?: string | undefined;
  title: string;
  author?: string | undefined;
  pack?: string | undefined;
  sections?: SongSectionSlide[] | undefined;
}

export interface SongPack {
  id: string;
  name?: string | undefined;
  songs?: SongItem[] | undefined;
}

export interface SavedTextItem {
  id: string;
  title: string;
  body: string;
  tags?: string[] | undefined;
  templateId?: string | undefined;
}

export type ObsEmitFn = (type: string, payload?: Record<string, unknown>) => void;

export type ActiveAsrMode =
  | 'idle'
  | 'loading-whisper'
  | 'whisper'
  | 'browser-bridge'
  | 'browser-fallback'
  | 'browser-backup'
  | 'awaiting-model'
  | 'unavailable';

export interface SuggestionFeedbackCounters {
  shownCount: number;
  previewedCount: number;
  dismissedCount: number;
}

export type TriggerRuleInput = Omit<TriggerRule, 'id'> & { id?: string | undefined };

export interface VoiceProviderProps {
  children: ReactNode;
  bibles?: BiblePack[] | undefined;
  activeBibleId?: string | undefined;
  songPacks?: SongPack[] | undefined;
  customSongs?: SongItem[] | undefined;
  savedTexts?: SavedTextItem[] | undefined;
  lyricsLinesPerSlide?: number | undefined;
  emit?: ObsEmitFn | undefined;
}

export interface VoiceContextValue {
  settings: VoiceSettings;
  updateVoiceSettings: (patch: Partial<VoiceSettings>) => Promise<void>;
  devices: AudioInputDevice[];
  refreshDevices: () => Promise<AudioInputDevice[]>;
  activeDevice: AudioInputDevice | null;
  effectiveNoiseSuppression: boolean;
  permissionState: MicPermissionState;
  permissionError: string;
  isListening: boolean;
  isPaused: boolean;
  level: LevelReading;
  isTestingMic: boolean;
  micTestCountdown: number;
  micTestReport: MicTestReport | null;
  clearMicTestReport: () => void;
  enableAndStartListening: () => Promise<boolean>;
  disableVoice: () => Promise<void>;
  pauseListening: () => Promise<void>;
  resumeListening: () => Promise<boolean>;
  togglePauseListening: () => Promise<void>;
  runMicTest: () => Promise<MicTestReport | null>;
  activeAsrMode: ActiveAsrMode;
  activeEngineDetail: string;
  engineNotice: string;
  showRetryWhisper: boolean;
  retryWhisperEngine: () => Promise<void>;
  hardwareProfile: HardwareProfile;
  recommendedModel: WhisperModelId;
  recommendationReason: string;
  speedCheckResult: SpeedCheckResult | null;
  isRunningSpeedCheck: boolean;
  runFirstRunSpeedCheck: (modelId?: WhisperModelId) => Promise<SpeedCheckResult | null>;
  lastRtf: number | null;
  modelCatalog: VoiceModelCatalogEntry[];
  installedModels: Partial<Record<WhisperModelId, InstalledVoiceModelRecord>>;
  probedModelSizes: Record<WhisperModelId, ModelSizeProbe>;
  modelDownloadProgress: Partial<Record<WhisperModelId, number>>;
  modelError: string;
  downloadVoiceModel: (modelId: WhisperModelId) => Promise<boolean>;
  removeVoiceModel: (modelId: WhisperModelId) => Promise<void>;
  transcript: TranscriptSegment[];
  clearTranscript: () => void;
  suggestions: Suggestion[];
  markSuggestionActed: (id: string, actionType?: SuggestionActionType) => void;
  togglePinSuggestion: (id: string) => void;
  ingestTranscriptText: (text: string, isFinal?: boolean) => void;
  feedbackCounters: SuggestionFeedbackCounters;
  resetFeedbackCounters: () => Promise<void>;
  triggerRules: TriggerRule[];
  saveTriggerRule: (rule: TriggerRuleInput) => Promise<TriggerRule>;
  deleteTriggerRule: (id: string) => Promise<void>;
  serviceContext: string[];
  addServiceContextItem: (label: string) => Promise<void>;
  removeServiceContextItem: (label: string) => Promise<void>;
  clearServiceContext: () => Promise<void>;
}

export * from './asr/type';
export * from './audio/type';
export * from './detectors/type';
export * from './suggestions/type';
export * from './workers/type';
export * from './ui/type';
