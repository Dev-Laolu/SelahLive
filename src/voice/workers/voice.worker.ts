/**
 * TypeScript contract for `/public/workers/voice-worker.js`.
 * The actual worker script is served from `/workers/voice-worker.js` so Next.js SSR
 * never bundles Web Worker / WebGPU / ONNX code into server page bundles.
 */

export type WhisperModelId = 'tiny.en' | 'base.en' | 'small.en';

export interface WorkerInMessage {
  type:
    | 'init'
    | 'download-model'
    | 'load-model'
    | 'unload-model'
    | 'pcm16k'
    | 'pause'
    | 'resume'
    | 'start-mic-test'
    | 'stop'
    | 'ping';
  modelId?: WhisperModelId;
  hfRepo?: string;
  samples?: Float32Array;
  durationMs?: number;
}
