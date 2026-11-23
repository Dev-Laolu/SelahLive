export interface WorkerMicTestResult {
  durationMs: number;
  sampleCount: number;
  sampleRate: number;
  avgRms: number;
  peak: number;
  clipping: boolean;
}

export class VoiceWorkerClient {
  private worker: Worker | null = null;
  private ready = false;
  private micTestResolver: ((res: WorkerMicTestResult) => void) | null = null;

  start(): void {
    if (this.worker || typeof window === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./voice.worker.ts', import.meta.url));
      this.worker.onmessage = (ev: MessageEvent) => {
        const d = ev.data || {};
        if (d.type === 'ready') {
          this.ready = true;
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
          });
        }
      };
      this.worker.postMessage({ type: 'init' });
    } catch {
      this.worker = null;
      this.ready = false;
    }
  }

  sendPcmFrame(samples16k: Float32Array): void {
    if (!this.worker) return;
    // Transfer copy buffer to worker so main thread retains zero references
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
  }

  isReady(): boolean {
    return this.ready;
  }
}
