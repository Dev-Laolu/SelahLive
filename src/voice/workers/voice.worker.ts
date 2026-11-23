/**
 * Selah Live v2 — Web Worker Harness (`voice.worker.ts`)
 *
 * Phase 0 responsibilities:
 * - Off-main-thread lifecycle: `init`, `pcm16k`, `pause`, `resume`, `start-mic-test`, `stop`.
 * - Tracks rolling in-memory frame statistics without retaining audio buffers.
 * - Accumulates a temporary 3-second buffer ONLY during an explicit "Test mic" run,
 *   computes signal health diagnostics, and immediately discards the buffer.
 * - Hosts Silero VAD + Whisper ASR in Phase 1.
 */

export interface WorkerInMessage {
  type: 'init' | 'pcm16k' | 'pause' | 'resume' | 'start-mic-test' | 'stop' | 'ping';
  samples?: Float32Array;
  durationMs?: number;
}

let isPaused = false;
let framesProcessed = 0;

// Temporary 3-second mic test state (discarded immediately when test completes)
let micTestActive = false;
let micTestTargetSamples = 16000 * 3;
let micTestChunks: Float32Array[] = [];
let micTestCollected = 0;
let micTestStartedAt = 0;

function resetMicTest(): void {
  micTestActive = false;
  micTestChunks = [];
  micTestCollected = 0;
  micTestStartedAt = 0;
}

function finishMicTest(): void {
  const total = micTestCollected;
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of micTestChunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  const durationMs = Math.max(1, Date.now() - micTestStartedAt);

  // Immediately clear chunks from memory (PRD §8: Audio buffers are processed in memory and discarded)
  resetMicTest();

  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < merged.length; i++) {
    const s = merged[i];
    const abs = s < 0 ? -s : s;
    sumSq += s * s;
    if (abs > peak) peak = abs;
  }
  const avgRms = merged.length > 0 ? Math.sqrt(sumSq / merged.length) : 0;

  self.postMessage({
    type: 'mic-test-complete',
    durationMs,
    sampleCount: merged.length,
    sampleRate: 16000,
    avgRms,
    peak,
    clipping: peak >= 0.96,
  });
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'init': {
      isPaused = false;
      framesProcessed = 0;
      resetMicTest();
      self.postMessage({
        type: 'ready',
        engine: 'harness-phase0',
        sampleRate: 16000,
      });
      break;
    }

    case 'ping': {
      self.postMessage({
        type: 'pong',
        framesProcessed,
        isPaused,
      });
      break;
    }

    case 'pause': {
      isPaused = true;
      resetMicTest();
      self.postMessage({ type: 'status', isPaused: true });
      break;
    }

    case 'resume': {
      isPaused = false;
      self.postMessage({ type: 'status', isPaused: false });
      break;
    }

    case 'start-mic-test': {
      const durSec = Math.max(1, Math.min(5, (msg.durationMs || 3000) / 1000));
      micTestTargetSamples = Math.floor(16000 * durSec);
      micTestChunks = [];
      micTestCollected = 0;
      micTestStartedAt = Date.now();
      micTestActive = true;
      break;
    }

    case 'pcm16k': {
      if (isPaused || !msg.samples) return;
      framesProcessed++;

      if (micTestActive) {
        const copy = new Float32Array(msg.samples);
        micTestChunks.push(copy);
        micTestCollected += copy.length;
        if (micTestCollected >= micTestTargetSamples) {
          finishMicTest();
        }
      }
      // In Phase 0, audio frame is discarded immediately after processing.
      break;
    }

    case 'stop': {
      isPaused = true;
      framesProcessed = 0;
      resetMicTest();
      self.postMessage({ type: 'stopped' });
      break;
    }
  }
};
