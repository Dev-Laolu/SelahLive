import type { WhisperBackend, WhisperModelId } from '../asr/type';
import type { TranscriptSegment } from '../type';
import type {
  WorkerBenchmarkResult,
  WorkerClientCallbacks,
  WorkerMicTestResult,
} from './type';

export class VoiceWorkerClient {
  private worker: Worker | null = null;
  private ready = false;
  private callbacks: WorkerClientCallbacks = {};
  private micTestResolver: ((res: WorkerMicTestResult) => void) | null = null;
  private benchmarkResolver: {
    resolve: (res: WorkerBenchmarkResult) => void;
    reject: (err: Error) => void;
  } | null = null;
  private modelLoadResolvers = new Map<
    WhisperModelId,
    { resolve: (info: { backend: WhisperBackend }) => void; reject: (err: Error) => void }
  >();

  setCallbacks(cb: WorkerClientCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cb };
  }

  start(): void {
    if (this.worker || typeof window === 'undefined') return;
    try {
      this.worker = new Worker('/workers/voice-worker.js', { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent) => this.handleMessage(ev.data ?? {});
      this.worker.postMessage({ type: 'init' });
    } catch {
      this.worker = null;
      this.ready = false;
    }
  }

  private handleMessage(data: Record<string, unknown>): void {
    const type = data.type as string | undefined;
    switch (type) {
      case 'ready':
        this.ready = true;
        return;

      case 'transcript-segment':
        if (data.segment) {
          this.callbacks.onTranscriptSegment?.(data.segment as TranscriptSegment);
        }
        return;

      case 'rtf-metric':
        this.callbacks.onRtfMetric?.({
          modelId: data.modelId as WhisperModelId,
          backend: (data.backend as WhisperBackend) || 'wasm',
          audioDurationMs: Number(data.audioDurationMs) || 1000,
          inferenceMs: Number(data.inferenceMs) || 0,
          rtf: Number(data.rtf) || 0,
        });
        return;

      case 'benchmark-complete':
        if (this.benchmarkResolver) {
          const { resolve } = this.benchmarkResolver;
          this.benchmarkResolver = null;
          resolve({
            modelId: data.modelId as WhisperModelId,
            backend: (data.backend as WhisperBackend) || 'wasm',
            audioDurationMs: Number(data.audioDurationMs) || 2000,
            inferenceMs: Number(data.inferenceMs) || 0,
            rtf: Number(data.rtf) || 0,
          });
        }
        return;

      case 'benchmark-error':
        if (this.benchmarkResolver) {
          const { reject } = this.benchmarkResolver;
          this.benchmarkResolver = null;
          reject(new Error(String(data.error || 'Benchmark failed')));
        }
        return;

      case 'model-progress':
        this.callbacks.onModelProgress?.({
          modelId: data.modelId as WhisperModelId,
          progress: Number(data.progress) || 0,
          loadedBytes: data.loadedBytes as number | undefined,
          totalBytes: data.totalBytes as number | undefined,
          file: data.file as string | undefined,
        });
        return;

      case 'model-ready': {
        const modelId = data.modelId as WhisperModelId;
        const backend = (data.backend as WhisperBackend) || 'wasm';
        const pending = this.modelLoadResolvers.get(modelId);
        if (pending) {
          this.modelLoadResolvers.delete(modelId);
          pending.resolve({ backend });
        }
        this.callbacks.onModelReady?.({
          modelId,
          hfRepo: String(data.hfRepo || ''),
          backend,
        });
        return;
      }

      case 'model-error': {
        const modelId = data.modelId as WhisperModelId;
        const errorMsg = String(data.error || 'Model failed to load');
        const pending = this.modelLoadResolvers.get(modelId);
        if (pending) {
          this.modelLoadResolvers.delete(modelId);
          pending.reject(new Error(errorMsg));
        }
        this.callbacks.onModelError?.({ modelId, error: errorMsg });
        return;
      }

      case 'decode-error':
        this.callbacks.onDecodeError?.({
          modelId: (data.modelId as WhisperModelId | null) ?? null,
          error: String(data.error || 'Whisper transcription error'),
        });
        return;

      case 'mic-test-complete':
        if (this.micTestResolver) {
          const resolve = this.micTestResolver;
          this.micTestResolver = null;
          resolve({
            durationMs: Number(data.durationMs) || 3000,
            sampleCount: Number(data.sampleCount) || 0,
            sampleRate: Number(data.sampleRate) || 16_000,
            avgRms: Number(data.avgRms) || 0,
            peak: Number(data.peak) || 0,
            clipping: Boolean(data.clipping),
            transcriptPreview: String(data.transcriptPreview || ''),
            modelLoaded: (data.modelLoaded as WhisperModelId | null) ?? null,
          });
        }
        return;

      default:
        return;
    }
  }

  setPerformanceMode(enabled: boolean): void {
    this.worker?.postMessage({ type: 'set-performance-mode', enabled });
  }

  runSpeedBenchmark(modelId?: WhisperModelId): Promise<WorkerBenchmarkResult> {
    if (!this.worker) this.start();
    return new Promise((resolve, reject) => {
      this.benchmarkResolver = { resolve, reject };
      this.worker?.postMessage({ type: 'run-benchmark', modelId });
    });
  }

  downloadOrLoadModel(
    modelId: WhisperModelId,
    hfRepo?: string
  ): Promise<{ backend: WhisperBackend }> {
    if (!this.worker) this.start();
    return new Promise((resolve, reject) => {
      this.modelLoadResolvers.set(modelId, { resolve, reject });
      this.worker?.postMessage({ type: 'download-model', modelId, hfRepo });
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
    this.benchmarkResolver = null;
    this.modelLoadResolvers.clear();
  }

  isReady(): boolean {
    return this.ready;
  }
}
