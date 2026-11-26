import type { WhisperBackend, WhisperModelId } from '../asr/type';
import type { TranscriptSegment } from '../type';

export type WorkerRequestType =
  | 'init'
  | 'download-model'
  | 'load-model'
  | 'unload-model'
  | 'pcm16k'
  | 'pause'
  | 'resume'
  | 'start-mic-test'
  | 'run-benchmark'
  | 'set-performance-mode'
  | 'stop'
  | 'ping';

export interface WorkerInMessage {
  type: WorkerRequestType;
  modelId?: WhisperModelId | undefined;
  hfRepo?: string | undefined;
  samples?: Float32Array | undefined;
  durationMs?: number | undefined;
  enabled?: boolean | undefined;
}

export interface WorkerMicTestResult {
  durationMs: number;
  sampleCount: number;
  sampleRate: number;
  avgRms: number;
  peak: number;
  clipping: boolean;
  transcriptPreview?: string | undefined;
  modelLoaded?: WhisperModelId | null | undefined;
}

export interface WorkerBenchmarkResult {
  modelId: WhisperModelId;
  backend: WhisperBackend;
  audioDurationMs: number;
  inferenceMs: number;
  rtf: number;
}

export interface WorkerRtfMetric {
  modelId: WhisperModelId;
  backend: WhisperBackend;
  audioDurationMs: number;
  inferenceMs: number;
  rtf: number;
}

export interface ModelProgressEvent {
  modelId: WhisperModelId;
  progress: number;
  loadedBytes?: number | undefined;
  totalBytes?: number | undefined;
  file?: string | undefined;
}

export interface WorkerModelReadyInfo {
  modelId: WhisperModelId;
  hfRepo: string;
  backend: WhisperBackend;
}

export interface WorkerModelErrorInfo {
  modelId: WhisperModelId;
  error: string;
}

export interface WorkerDecodeErrorInfo {
  modelId: WhisperModelId | null;
  error: string;
}

export interface WorkerClientCallbacks {
  onTranscriptSegment?: ((segment: TranscriptSegment) => void) | undefined;
  onModelProgress?: ((ev: ModelProgressEvent) => void) | undefined;
  onModelReady?: ((info: WorkerModelReadyInfo) => void) | undefined;
  onModelError?: ((info: WorkerModelErrorInfo) => void) | undefined;
  onDecodeError?: ((info: WorkerDecodeErrorInfo) => void) | undefined;
  onRtfMetric?: ((metric: WorkerRtfMetric) => void) | undefined;
}
