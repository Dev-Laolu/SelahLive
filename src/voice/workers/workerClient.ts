import type { TranscriptSegment } from '../types';
import type { WhisperModelId } from '../asr/voiceModels';

export interface WorkerMicTestResult {
  durationMs: number;
  sampleCount: number;
  sampleRate: number;
  avgRms: number;
  peak: number;
  clipping: boolean;
  transcriptPreview?: string;
  modelLoaded?: WhisperModelId | null;
}

export interface ModelProgressEvent {
  modelId: WhisperModelId;
  progress: number; // 0..1
  loadedBytes?: number;
  totalBytes?: number;
  file?: string;
}

export interface WorkerClientCallbacks {
  onTranscriptSegment?: (segment: TranscriptSegment) => void;
  onModelProgress?: (ev: ModelProgressEvent) => void;
  onModelReady?: (info: { modelId: WhisperModelId; hfRepo: string; backend: 'webgpu' | 'wasm' }) => void;
  onModelError?: (info: { modelId: WhisperModelId; error: string }) => void;
}

export class VoiceWorkerClient {
  private worker: Worker | null = null;
  private ready = false;
  private callbacks: WorkerClientCallbacks = {};
  private micTestResolver: ((res: WorkerMicTestResult) => void) | null = null;
  private modelLoadResolvers = new Map<
    WhisperModelId,
    { resolve: (info: { backend: 'webgpu' | 'wasm' }) => void; reject: (err: Error) => void }
  >();

  setCallbacks(cb: WorkerClientCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cb };
  }

  start(): void {
    if (this.worker || typeof window === 'undefined') return;
    try {
      this.worker = new Worker('/workers/voice-worker.js', { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent) => {
        const d = ev.data || {};
        if (d.type === 'ready') {
          this.ready = true;
        } else if (d.type === 'transcript-segment' && d.segment) {
          this.callbacks.onTranscriptSegment?.(d.segment as TranscriptSegment);
        } else if (d.type === 'model-progress') {
          this.callbacks.onModelProgress?.({
            modelId: d.modelId,
            progress: d.progress || 0,
            loadedBytes: d.loadedBytes,
            totalBytes: d.totalBytes,
            file: d.file,
          });
        } else if (d.type === 'model-ready') {
          const pending = this.modelLoadResolvers.get(d.modelId);
          if (pending) {
            this.modelLoadResolvers.delete(d.modelId);
            pending.resolve({ backend: d.backend || 'wasm' });
          }
          this.callbacks.onModelReady?.({
            modelId: d.modelId,
            hfRepo: d.hfRepo,
            backend: d.backend || 'wasm',
          });
        } else if (d.type === 'model-error') {
          const pending = this.modelLoadResolvers.get(d.modelId);
          if (pending) {
            this.modelLoadResolvers.delete(d.modelId);
            pending.reject(new Error(d.error || 'Model failed to load'));
          }
          this.callbacks.onModelError?.({
            modelId: d.modelId,
            error: d.error || 'Model failed to load',
          });
        } else if (d.type === 'mic-test-complete' && this.micTestResolver) {
          const resolve = this.micTestResolver;
          this.micTestResolver = null;
          resolve({
            durationMs: d.durationMs || 3000,
            sampleCount: d.sampleCount || 0,
            sampleRate: d.sampleRate || 16000,
            avgRms: d.avgRms || 0,
            peak: d.peak || 0,
            clipping: !!d.clipping,
            transcriptPreview: d.transcriptPreview || '',
            modelLoaded: d.modelLoaded || null,
          });
        }
      };
      this.worker.postMessage({ type: 'init' });
    } catch {
      this.worker = null;
      this.ready = false;
    }
  }

  downloadOrLoadModel(modelId: WhisperModelId, hfRepo?: string): Promise<{ backend: 'webgpu' | 'wasm' }> {
    if (!this.worker) this.start();
    return new Promise((resolve, reject) => {
      this.modelLoadResolvers.set(modelId, { resolve, reject });
      this.worker?.postMessage({
        type: 'download-model',
        modelId,
        hfRepo,
      });
    });
  }

  unloadModel(modelId?: WhisperModelId): void {
    this.worker?.postMessage({ type: 'unload-model', modelId });
  }

  sendPcmFrame(samples16k: Float32Array): void {
    if (!this.worker) return;
    const copy = samples16k.slice(0);
    this.worker.postMessage({ type: 'pcm16k', samples: copy }, [copy.buffer]);
  }

  runMicTest(durationMs = 3000): Promise<WorkerMicTestResult> {
    if (!this.worker) this.start();
    return new Promise((resolve) => {
      this.micTestResolver = resolve;
      this.worker?.postMessage({ type: 'start-mic-test', durationMs });
    });
  }

  pause(): void {
    this.worker?.postMessage({ type: 'pause' });
  }

  resume(): void {
    this.worker?.postMessage({ type: 'resume' });
  }

  stop(): void {
    if (!this.worker) return;
    try {
      this.worker.postMessage({ type: 'stop' });
      this.worker.terminate();
    } catch {}
    this.worker = null;
    this.ready = false;
    this.micTestResolver = null;
    this.modelLoadResolvers.clear();
  }

  isReady(): boolean {
    return this.ready;
  }
}
