// Phase 1 scaffold — Unified ASR Engine interface (Whisper primary, Browser SpeechRecognition backup)
import type { TranscriptSegment, VoiceSettings } from '../types';

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
