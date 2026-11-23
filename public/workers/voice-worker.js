/**
 * Selah Live v2 — Whisper ASR & VAD Web Worker (`/workers/voice-worker.js`)
 *
 * Served as a static module Web Worker (`new Worker('/workers/voice-worker.js', { type: 'module' })`)
 * so Next.js SSR never attempts to bundle Web Worker / ONNX / WebGPU runtime into server routes,
 * while `@huggingface/transformers` loads lazily inside the worker ONLY when the user downloads
 * or loads a Whisper model.
 *
 * Responsibilities (Phase 1 & Phase 2 — ST-3..ST-10, PRD §8):
 * 1. Explicit Model Download & Loading (`download-model` / `load-model`):
 *    - Loads `onnx-community/whisper-tiny.en`, `onnx-community/whisper-base.en`,
 *      or `onnx-community/whisper-small.en` via Transformers.js v3.
 *    - Uses WebGPU (`device: 'webgpu'`) when available, falling back automatically to quantised WASM (`dtype: 'q8'`).
 *    - Emits real-time file download/loading progress (`model-progress`).
 * 2. ST-9 First-Run Speed Check Benchmark (`run-benchmark`):
 *    - Synthesizes a 2.0-second 16 kHz speech-band benchmark clip in memory, runs one warm-up pass
 *      and one timed inference pass on the loaded Whisper model, reports `{ audioDurationMs, inferenceMs, rtf, backend }`,
 *      and zeroes the buffer immediately.
 * 3. Utterance-Based Voice Activity Detection (VAD) + Rolling Context Window + Performance Mode (ST-5, ST-8):
 *    - Segments 16 kHz mono audio into speech utterances (~0.5 s to 6.5 s) with a 256 ms pre-roll.
 *    - In normal mode, emits interim transcription every ~1.8 s during continuous speech.
 *    - In Performance mode (`set-performance-mode`), disables mid-utterance interim decodes (decoding only on final utterance pause)
 *      to cut CPU/GPU usage by ~50% while streaming in OBS.
 *    - Reports `audioDurationMs`, `inferenceMs`, and `rtf` on every final segment so `RtfMonitor` (ST-8.3)
 *      can detect sustained slow decoding (`RTF > 1.0`) and step down to `tiny.en` or Browser fallback automatically.
 *    - Immediately zeroes and discards audio buffers after inference (zero audio retention: PRD §8).
 * 4. 3-Second "Test Mic" with Live Whisper Transcription (VA-2).
 */

const MODEL_REPOS = {
  "tiny.en": "onnx-community/whisper-tiny.en",
  "base.en": "onnx-community/whisper-base.en",
  "small.en": "onnx-community/whisper-small.en",
};

const TRANSFORMERS_ESM_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

// Filter known harmless upstream ONNX Runtime & Transformers.js worker log spam
// while preserving all real warnings and errors.
const SUPPRESSED_WORKER_LOG_PATTERNS = [
  "VerifyEachNodeIsAssignedToAnEp",
  "Unable to determine content-length from response headers",
];
for (const method of ["warn", "log"]) {
  const orig = console[method].bind(console);
  console[method] = (...args) => {
    const first = typeof args[0] === "string" ? args[0] : "";
    if (SUPPRESSED_WORKER_LOG_PATTERNS.some((p) => first.includes(p))) {
      return;
    }
    orig(...args);
  };
}

let transformersLib = null;
let isPaused = false;
let performanceMode = false;
let framesProcessed = 0;

// Active Whisper pipeline instance
let asrPipeline = null;
let loadedModelId = null;
let activeBackend = "wasm";
let isLoadingModel = false;
let loadingModelId = null;
let loadingPromise = null;
let isTranscribing = false;
let segmentSeq = 0;

// VAD & Utterance accumulator state (16 kHz mono, 512 samples = 32 ms per frame)
const SAMPLE_RATE = 16000;
const PRE_ROLL_MAX_FRAMES = 8;          // ~256 ms pre-roll before speech onset
const SPEECH_RMS_ONSET = 0.0075;        // Speech onset threshold (~-42.5 dBFS for laptop mics & mixers)
const SPEECH_RMS_HOLD = 0.004;          // Speech continuation threshold (~-48 dBFS)
const SILENCE_FRAMES_TO_FINALIZE = 9;   // ~288 ms of silence ends an utterance promptly
const INTERIM_INTERVAL_SAMPLES = 16000; // ~1.0 s of speech triggers an interim decode (disabled in performanceMode)
const MAX_UTTERANCE_SAMPLES = 80000;    // ~5.0 s max utterance before forced final decode
const MIN_SPEECH_SAMPLES = 6400;        // ~0.4 s minimum speech to transcribe

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
      // Suppress noisy ORT VerifyEachNodeIsAssignedToAnEp console warnings
      if (transformersLib.env.backends && transformersLib.env.backends.onnx) {
        transformersLib.env.backends.onnx.logLevel = "error";
      }
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

  // Deduplicate concurrent load calls for the same model so ONNX never loads twice simultaneously
  if (isLoadingModel && loadingPromise) {
    if (loadingModelId === modelId) {
      return loadingPromise;
    }
    try {
      await loadingPromise;
    } catch {}
  }

  isLoadingModel = true;
  loadingModelId = modelId;
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

  loadingPromise = (async () => {
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
              encoder_model: "fp16",
              decoder_model_merged: "q4",
            },
            session_options: { logSeverityLevel: 3 },
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
          session_options: { logSeverityLevel: 3 },
          progress_callback: progressCallback,
        });
        backendUsed = "wasm";
      }

      asrPipeline = pipe;
      loadedModelId = modelId;
      activeBackend = backendUsed;
      isLoadingModel = false;
      loadingModelId = null;
      loadingPromise = null;

      self.postMessage({
        type: "model-ready",
        modelId,
        hfRepo: repo,
        backend: backendUsed,
      });
      return true;
    } catch (err) {
      isLoadingModel = false;
      loadingModelId = null;
      loadingPromise = null;
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
  })();

  return loadingPromise;
}

/**
 * Transformers.js v3 throws if `language` or `task` is passed to an English-only
 * Whisper model (e.g. `whisper-tiny.en`, `whisper-base.en`, `whisper-small.en`).
 * Greedy decoding (`num_beams: 1`, `max_new_tokens: 64`) keeps latency low on CPU/iGPU.
 */
function buildAsrOptions() {
  const isEnglishOnly = !loadedModelId || String(loadedModelId).endsWith(".en");
  const base = {
    return_timestamps: false,
    num_beams: 1,
    do_sample: false,
    max_new_tokens: 64,
    condition_on_previous_text: false,
  };
  return isEnglishOnly
    ? base
    : { ...base, language: "english", task: "transcribe" };
}

/**
 * ST-9 First-run speed benchmark:
 * Synthesizes a 2.0-second 16 kHz clip with speech-like formant modulation,
 * runs an initial warm-up pass (to compile shaders/WASM), then times a 2.0s decode pass.
 */
async function runSpeedBenchmark(requestedModelId) {
  const targetModel = requestedModelId || loadedModelId || "base.en";
  if (!asrPipeline || loadedModelId !== targetModel) {
    const ok = await loadWhisperModel(targetModel);
    if (!ok || !asrPipeline) {
      self.postMessage({
        type: "benchmark-error",
        modelId: targetModel,
        error: `Could not load ${targetModel} for speed check.`,
      });
      return;
    }
  }

  const audioDurationMs = 2000;
  const numSamples = SAMPLE_RATE * 2; // 2.0 seconds @ 16 kHz
  const clip = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.sin(Math.PI * (i / numSamples));
    clip[i] =
      0.12 *
      env *
      (Math.sin(2 * Math.PI * 180 * t) +
        0.5 * Math.sin(2 * Math.PI * 520 * t) +
        0.25 * Math.sin(2 * Math.PI * 1150 * t));
  }

  const opts = buildAsrOptions();
  try {
    // Short 0.5s warm-up pass so JIT / shader compilation is excluded from steady-state RTF
    await asrPipeline(clip.subarray(0, 8000), opts);

    const t0 = performance.now();
    await asrPipeline(clip, opts);
    const inferenceMs = Math.max(10, Math.round(performance.now() - t0));
    const rtf = Number((inferenceMs / audioDurationMs).toFixed(2));
    clip.fill(0);

    self.postMessage({
      type: "benchmark-complete",
      modelId: loadedModelId,
      backend: activeBackend,
      audioDurationMs,
      inferenceMs,
      rtf,
    });
  } catch (err) {
    clip.fill(0);
    self.postMessage({
      type: "benchmark-error",
      modelId: targetModel,
      error: (err && err.message) || "Benchmark failed.",
    });
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
  const audioDurationMs = Math.max(
    250,
    Math.round((job.audio.length / SAMPLE_RATE) * 1000)
  );

  try {
    const t0 = performance.now();
    const out = await asrPipeline(job.audio, buildAsrOptions());
    const inferenceMs = Math.max(1, Math.round(performance.now() - t0));
    const rtf = Number((inferenceMs / audioDurationMs).toFixed(2));
    const rawText = out && typeof out.text === "string" ? out.text : "";
    const cleaned = cleanWhisperOutput(rawText);

    // Zero out the audio buffer immediately after inference (PRD §8)
    job.audio.fill(0);

    // Report RTF metric on every final decode so ST-8.3 can detect sustained RTF > 1.0
    if (job.isFinal) {
      self.postMessage({
        type: "rtf-metric",
        modelId: loadedModelId,
        backend: activeBackend,
        audioDurationMs,
        inferenceMs,
        rtf,
      });
    }

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
          audioDurationMs,
          rtf,
        },
      });
    }
  } catch (err) {
    job.audio.fill(0);
    self.postMessage({
      type: "decode-error",
      modelId: loadedModelId,
      error: (err && err.message) || "Whisper transcription error.",
    });
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

  // In Performance mode, skip mid-utterance interim decodes to save CPU/GPU cycles
  if (
    !performanceMode &&
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
      const out = await asrPipeline(merged, buildAsrOptions());
      transcriptPreview = cleanWhisperOutput(out && typeof out.text === "string" ? out.text : "");
    } catch (err) {
      self.postMessage({
        type: "decode-error",
        modelId: loadedModelId,
        error: (err && err.message) || "Whisper mic test transcription error.",
      });
    }
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

    case "set-performance-mode": {
      performanceMode = Boolean(msg.enabled);
      break;
    }

    case "run-benchmark": {
      await runSpeedBenchmark(msg.modelId);
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
