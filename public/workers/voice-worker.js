/**
 * Selah Live v2 — Whisper ASR & VAD Web Worker (`/workers/voice-worker.js`)
 *
 * Served as a static module Web Worker (`new Worker('/workers/voice-worker.js', { type: 'module' })`)
 * so Next.js SSR never attempts to bundle Web Worker / ONNX / WebGPU runtime into server routes,
 * while `@huggingface/transformers` loads lazily inside the worker ONLY when the user downloads
 * or loads a Whisper model.
 *
 * Responsibilities (Phase 1 — ST-3, ST-4, ST-5, ST-6, PRD §8):
 * 1. Explicit Model Download & Loading (`download-model` / `load-model`):
 *    - Loads `onnx-community/whisper-tiny.en`, `onnx-community/whisper-base.en`,
 *      or `onnx-community/whisper-small.en` via Transformers.js v3.
 *    - Uses WebGPU (`device: 'webgpu'`) when available, falling back automatically to quantised WASM (`dtype: 'q8'`).
 *    - Emits real-time file download/loading progress (`model-progress`).
 * 2. Utterance-Based Voice Activity Detection (VAD) + Rolling Context Window (ST-5):
 *    - Segments 16 kHz mono audio into speech utterances (~0.5 s to 6.5 s) with a 256 ms pre-roll,
 *      interim transcription during continuous speech (~1.8 s), and final transcription on pause (~416 ms silence).
 *    - Immediately zeroes and discards audio buffers after inference (zero audio retention: PRD §8).
 * 3. 3-Second "Test Mic" with Live Whisper Transcription (VA-2):
 *    - Evaluates signal health AND runs Whisper on the 3-second test buffer if a model is loaded,
 *      returning the transcript preview to Settings -> Voice, then immediately zeroes & discards the buffer.
 */

const MODEL_REPOS = {
  "tiny.en": "onnx-community/whisper-tiny.en",
  "base.en": "onnx-community/whisper-base.en",
  "small.en": "onnx-community/whisper-small.en",
};

const TRANSFORMERS_ESM_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

let transformersLib = null;
let isPaused = false;
let framesProcessed = 0;

// Active Whisper pipeline instance
let asrPipeline = null;
let loadedModelId = null;
let activeBackend = "wasm";
let isLoadingModel = false;
let isTranscribing = false;
let segmentSeq = 0;

// VAD & Utterance accumulator state (16 kHz mono, 512 samples = 32 ms per frame)
const SAMPLE_RATE = 16000;
const PRE_ROLL_MAX_FRAMES = 8;          // ~256 ms pre-roll before speech onset
const SPEECH_RMS_ONSET = 0.013;         // Speech onset threshold
const SPEECH_RMS_HOLD = 0.008;          // Speech continuation threshold
const SILENCE_FRAMES_TO_FINALIZE = 13;  // ~416 ms of silence ends an utterance
const INTERIM_INTERVAL_SAMPLES = 28800; // ~1.8 s of speech triggers an interim decode
const MAX_UTTERANCE_SAMPLES = 104000;   // ~6.5 s max utterance before forced final decode
const MIN_SPEECH_SAMPLES = 8000;        // ~0.5 s minimum speech to transcribe

let preRollFrames = [];
let utteranceChunks = [];
let utteranceSampleCount = 0;
let silenceFrames = 0;
let inSpeech = false;
let speechStartedAtMs = 0;
let lastInterimSampleCount = 0;
let currentUtteranceId = "";
let pendingDecode = null;

// Temporary 3-second mic test state (discarded immediately when test completes)
let micTestActive = false;
let micTestTargetSamples = SAMPLE_RATE * 3;
let micTestChunks = [];
let micTestCollected = 0;
let micTestStartedAt = 0;

function resetVadState() {
  preRollFrames = [];
  utteranceChunks = [];
  utteranceSampleCount = 0;
  silenceFrames = 0;
  inSpeech = false;
  lastInterimSampleCount = 0;
  pendingDecode = null;
}

function resetMicTest() {
  micTestActive = false;
  micTestChunks = [];
  micTestCollected = 0;
  micTestStartedAt = 0;
}

function mergeChunks(chunks, totalLength) {
  const out = new Float32Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function computeFrameRms(samples) {
  if (!samples || samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples.length);
}

async function getTransformers() {
  if (!transformersLib) {
    transformersLib = await import(TRANSFORMERS_ESM_URL);
    if (transformersLib.env) {
      transformersLib.env.allowLocalModels = false;
      transformersLib.env.useBrowserCache = true;
    }
  }
  return transformersLib;
}

async function detectWebGpuAvailable() {
  try {
    if (!self.navigator || !self.navigator.gpu || !self.navigator.gpu.requestAdapter) {
      return false;
    }
    const adapter = await self.navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function loadWhisperModel(modelId, explicitRepo) {
  if (isLoadingModel) return false;
  const repo = explicitRepo || MODEL_REPOS[modelId] || MODEL_REPOS["base.en"];

  if (asrPipeline && loadedModelId === modelId) {
    self.postMessage({
      type: "model-ready",
      modelId,
      hfRepo: repo,
      backend: activeBackend,
    });
    return true;
  }

  isLoadingModel = true;
  self.postMessage({
    type: "model-status",
    status: "loading-model",
    modelId,
    detail: `Preparing ${modelId} voice model…`,
  });

  const fileProgress = new Map();

  const progressCallback = (info) => {
    if (info && info.file && typeof info.loaded === "number" && typeof info.total === "number" && info.total > 0) {
      fileProgress.set(info.file, { loaded: info.loaded, total: info.total });
      let sumLoaded = 0;
      let sumTotal = 0;
      for (const v of fileProgress.values()) {
        sumLoaded += v.loaded;
        sumTotal += v.total;
      }
      const pct = sumTotal > 0 ? Math.min(0.99, sumLoaded / sumTotal) : 0;
      self.postMessage({
        type: "model-progress",
        modelId,
        progress: pct,
        loadedBytes: sumLoaded,
        totalBytes: sumTotal,
        file: info.file,
      });
    } else if (info && typeof info.progress === "number") {
      self.postMessage({
        type: "model-progress",
        modelId,
        progress: Math.min(0.99, info.progress / 100),
        file: info.file || "",
      });
    }
  };

  try {
    const { pipeline } = await getTransformers();
    const hasWebGpu = await detectWebGpuAvailable();
    let pipe = null;
    let backendUsed = "wasm";

    if (hasWebGpu) {
      try {
        pipe = await pipeline("automatic-speech-recognition", repo, {
          device: "webgpu",
          dtype: {
            encoder_model: "fp32",
            decoder_model_merged: "q4",
          },
          progress_callback: progressCallback,
        });
        backendUsed = "webgpu";
      } catch {
        pipe = null;
      }
    }

    if (!pipe) {
      pipe = await pipeline("automatic-speech-recognition", repo, {
        device: "wasm",
        dtype: "q8",
        progress_callback: progressCallback,
      });
      backendUsed = "wasm";
    }

    asrPipeline = pipe;
    loadedModelId = modelId;
    activeBackend = backendUsed;
    isLoadingModel = false;

    self.postMessage({
      type: "model-ready",
      modelId,
      hfRepo: repo,
      backend: backendUsed,
    });
    return true;
  } catch (err) {
    isLoadingModel = false;
    const message =
      (err && err.message) ||
      `Could not load Whisper model (${modelId}). Check your internet connection for first download.`;
    self.postMessage({
      type: "model-error",
      modelId,
      error: message,
    });
    return false;
  }
}

function cleanWhisperOutput(raw) {
  const s = String(raw || "")
    .replace(/\[.*?\]/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  if (/^(you|thank you\.?|thanks for watching\.?|\.|-)$/i.test(s)) return "";
  return s;
}

async function processDecodeQueue() {
  if (isTranscribing || !pendingDecode || !asrPipeline || isPaused) return;
  isTranscribing = true;

  const job = pendingDecode;
  pendingDecode = null;

  try {
    const t0 = performance.now();
    const out = await asrPipeline(job.audio, {
      language: "english",
      task: "transcribe",
      return_timestamps: false,
    });
    const inferenceMs = Math.round(performance.now() - t0);
    const rawText = out && typeof out.text === "string" ? out.text : "";
    const cleaned = cleanWhisperOutput(rawText);

    // Zero out the audio buffer immediately after inference (PRD §8)
    job.audio.fill(0);

    if (cleaned) {
      self.postMessage({
        type: "transcript-segment",
        segment: {
          id: job.utteranceId,
          text: cleaned,
          isFinal: job.isFinal,
          startMs: job.startMs,
          endMs: job.endMs,
          confidence: job.isFinal ? 0.92 : 0.8,
          inferenceMs,
        },
      });
    }
  } catch {
    // Ignore transient single-utterance decode failure
  } finally {
    isTranscribing = false;
    if (pendingDecode && !isPaused) {
      processDecodeQueue();
    }
  }
}

function enqueueUtteranceDecode(isFinal) {
  if (!asrPipeline || utteranceSampleCount < MIN_SPEECH_SAMPLES) return;
  const audioCopy = mergeChunks(utteranceChunks, utteranceSampleCount);
  const now = Date.now();
  pendingDecode = {
    audio: audioCopy,
    isFinal,
    utteranceId: currentUtteranceId || `wh-${++segmentSeq}`,
    startMs: speechStartedAtMs || now - Math.round((utteranceSampleCount / SAMPLE_RATE) * 1000),
    endMs: now,
  };
  processDecodeQueue();
}

function handleVadFrame(samples) {
  if (!asrPipeline) return;
  const rms = computeFrameRms(samples);

  if (!inSpeech) {
    if (rms >= SPEECH_RMS_ONSET) {
      inSpeech = true;
      silenceFrames = 0;
      speechStartedAtMs = Date.now() - preRollFrames.length * 32;
      currentUtteranceId = `wh-${++segmentSeq}`;
      utteranceChunks = [...preRollFrames, new Float32Array(samples)];
      utteranceSampleCount = utteranceChunks.reduce((acc, c) => acc + c.length, 0);
      lastInterimSampleCount = 0;
      preRollFrames = [];
    } else {
      preRollFrames.push(new Float32Array(samples));
      if (preRollFrames.length > PRE_ROLL_MAX_FRAMES) {
        preRollFrames.shift();
      }
    }
    return;
  }

  utteranceChunks.push(new Float32Array(samples));
  utteranceSampleCount += samples.length;

  if (rms < SPEECH_RMS_HOLD) {
    silenceFrames++;
  } else {
    silenceFrames = 0;
  }

  if (silenceFrames >= SILENCE_FRAMES_TO_FINALIZE) {
    enqueueUtteranceDecode(true);
    utteranceChunks = [];
    utteranceSampleCount = 0;
    silenceFrames = 0;
    inSpeech = false;
    lastInterimSampleCount = 0;
    return;
  }

  if (utteranceSampleCount >= MAX_UTTERANCE_SAMPLES) {
    enqueueUtteranceDecode(true);
    const overlapFrames = utteranceChunks.slice(-25);
    utteranceChunks = overlapFrames;
    utteranceSampleCount = overlapFrames.reduce((acc, c) => acc + c.length, 0);
    currentUtteranceId = `wh-${++segmentSeq}`;
    speechStartedAtMs = Date.now() - 800;
    lastInterimSampleCount = 0;
    return;
  }

  if (
    !isTranscribing &&
    utteranceSampleCount - lastInterimSampleCount >= INTERIM_INTERVAL_SAMPLES
  ) {
    lastInterimSampleCount = utteranceSampleCount;
    enqueueUtteranceDecode(false);
  }
}

async function finishMicTest() {
  const total = micTestCollected;
  const merged = mergeChunks(micTestChunks, total);
  const durationMs = Math.max(1, Date.now() - micTestStartedAt);

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

  let transcriptPreview = "";
  if (asrPipeline && avgRms >= 0.003) {
    try {
      const out = await asrPipeline(merged, {
        language: "english",
        task: "transcribe",
        return_timestamps: false,
      });
      transcriptPreview = cleanWhisperOutput(out && typeof out.text === "string" ? out.text : "");
    } catch {}
  }

  merged.fill(0);

  self.postMessage({
    type: "mic-test-complete",
    durationMs,
    sampleCount: total,
    sampleRate: SAMPLE_RATE,
    avgRms,
    peak,
    clipping: peak >= 0.96,
    transcriptPreview,
    modelLoaded: loadedModelId,
  });
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case "init": {
      isPaused = false;
      framesProcessed = 0;
      resetMicTest();
      resetVadState();
      self.postMessage({
        type: "ready",
        engine: loadedModelId ? `whisper-${loadedModelId}` : "harness-ready",
        sampleRate: SAMPLE_RATE,
        loadedModelId,
      });
      break;
    }

    case "download-model":
    case "load-model": {
      const modelId = msg.modelId || "base.en";
      await loadWhisperModel(modelId, msg.hfRepo);
      break;
    }

    case "unload-model": {
      if (!msg.modelId || msg.modelId === loadedModelId) {
        asrPipeline = null;
        loadedModelId = null;
        resetVadState();
      }
      self.postMessage({ type: "model-unloaded", modelId: msg.modelId });
      break;
    }

    case "ping": {
      self.postMessage({
        type: "pong",
        framesProcessed,
        isPaused,
        loadedModelId,
      });
      break;
    }

    case "pause": {
      isPaused = true;
      resetMicTest();
      resetVadState();
      self.postMessage({ type: "status", isPaused: true });
      break;
    }

    case "resume": {
      isPaused = false;
      self.postMessage({ type: "status", isPaused: false });
      break;
    }

    case "start-mic-test": {
      const durSec = Math.max(1, Math.min(5, (msg.durationMs || 3000) / 1000));
      micTestTargetSamples = Math.floor(SAMPLE_RATE * durSec);
      micTestChunks = [];
      micTestCollected = 0;
      micTestStartedAt = Date.now();
      micTestActive = true;
      break;
    }

    case "pcm16k": {
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

      handleVadFrame(msg.samples);
      break;
    }

    case "stop": {
      isPaused = true;
      framesProcessed = 0;
      resetMicTest();
      resetVadState();
      self.postMessage({ type: "stopped" });
      break;
    }
  }
};
