import type { PreferredEngineOption, TranscriptSegment, VoiceSettings } from '../type';

export type WhisperModelId = 'tiny.en' | 'base.en' | 'small.en';
export type WhisperBackend = 'webgpu' | 'wasm';
export type AsrEngineId = 'whisper' | 'browser';

export type AsrEngineStatus =
  | 'idle'
  | 'loading-model'
  | 'ready'
  | 'listening'
  | 'paused'
  | 'error';

export interface AsrEngineCallbacks {
  onSegment: (segment: TranscriptSegment) => void;
  onStatusChange: (status: AsrEngineStatus, detail?: string) => void;
  onError: (message: string) => void;
}

export interface AsrEngine {
  readonly id: AsrEngineId;
  init(settings: VoiceSettings, callbacks: AsrEngineCallbacks): Promise<void>;
  pushAudioFrame?(samples16k: Float32Array): void;
  pause(): void;
  resume(): void;
  destroy(): Promise<void>;
}

export interface VoiceModelCatalogEntry {
  id: WhisperModelId;
  hfRepo: string;
  name: string;
  badge: string;
  description: string;
  recommendedRamGb: number;
  fallbackSizeBytes: number;
  quantisedFiles: string[];
}

export interface ModelSizeProbe {
  sizeBytes: number;
  isExact: boolean;
}

export interface InstalledVoiceModelRecord {
  id: WhisperModelId;
  hfRepo: string;
  installedAt: string;
  sizeBytes: number;
  backend: WhisperBackend;
}

export type InstalledModelsMap = Partial<Record<WhisperModelId, InstalledVoiceModelRecord>>;

export interface HardwareProfile {
  deviceMemoryGb: number;
  hardwareConcurrency: number;
  hasWebGpu: boolean;
}

export interface ModelRecommendation {
  recommendedModel: WhisperModelId;
  reason: string;
}

export interface SpeedCheckResult {
  testedModelId: WhisperModelId;
  backend: WhisperBackend;
  audioDurationMs: number;
  inferenceMs: number;
  rtf: number;
  recommendedModel: WhisperModelId;
  summary: string;
  timestamp: string;
}

export interface RtfUtteranceSample {
  rtf: number;
  avgRtf: number;
  isSustainedSlow: boolean;
}

export interface EngineSelectionInput {
  preferredEngine: PreferredEngineOption;
  preferredWhisperModel: WhisperModelId;
  performanceMode: boolean;
  installedModels: WhisperModelId[];
  whisperFailedModels: WhisperModelId[];
  whisperSlowModels: WhisperModelId[];
  browserSupported: boolean;
  browserProcessLocally: boolean;
  allowCloudBrowserEngine: boolean;
  isDownloadingWhisper: boolean;
}

export type EngineSelectionMode =
  | 'whisper'
  | 'browser-bridge'
  | 'browser-fallback'
  | 'browser-manual'
  | 'awaiting-model'
  | 'unavailable';

export interface EngineSelectionDecision {
  targetEngine: 'whisper' | 'browser' | 'none';
  targetWhisperModel?: WhisperModelId | undefined;
  mode: EngineSelectionMode;
  notice: string;
  showRetryWhisper: boolean;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

export interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean | undefined;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
