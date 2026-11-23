/**
 * Selah Live v2 — Phase 2 Engine Management (ST-8, ST-9, ST-10)
 *
 * Implements:
 * 1. ST-9 First-Run Speed Check & Model Recommendation:
 *    - Combines hardware capabilities (`deviceMemory`, `hardwareConcurrency`, WebGPU availability)
 *      with an on-device Whisper inference benchmark (2-second synthetic 16 kHz speech-band clip)
 *      to measure Real-Time Factor (`RTF = inferenceMs / audioDurationMs`).
 *    - Recommends:
 *      - `small.en` on strong GPUs (WebGPU + 16 GB+ RAM and RTF <= 0.35)
 *      - `base.en` by default (RTF <= 0.85)
 *      - `tiny.en` on weak laptops (4 GB RAM or RTF > 0.85)
 * 2. ST-8 Auto Engine Selection State Machine (Whisper First):
 *    - Rule 1: If a Whisper model is installed and passes the speed check (sustained RTF <= 1.0), use Whisper.
 *    - Rule 2: If no Whisper model is installed yet (first run), use Browser SpeechRecognition as a temporary bridge
 *      ONLY if on-device (`processLocally`) or `allowCloudBrowserEngine` is opted in. Show:
 *      "Using a temporary voice engine while the offline model downloads."
 *      As soon as a Whisper model finishes downloading, switch to Whisper automatically between utterances.
 *    - Rule 3: If Whisper fails to start or is too slow (sustained RTF > 1.0 over 3 consecutive utterances):
 *      - First step down to `tiny.en` if currently on `base.en` or `small.en` (and `tiny.en` is installed or can be loaded).
 *      - Otherwise fall back to Browser SpeechRecognition under the same privacy rules (on-device or cloud opt-in),
 *        with a visible fallback notice and a "Retry Whisper" button.
 *    - Rule 4: If no engine is available, disable voice suggestions cleanly with a clear explanation while leaving
 *      the rest of Selah Live unaffected.
 * 3. ST-10 Seamless Engine Switching & Performance Mode:
 *    - Switching engines or models never interrupts live OBS output, never clears current suggestions,
 *      and keeps the in-memory transcript continuous.
 *    - Performance mode forces `tiny.en` (when available) and widens interim decoding intervals inside the worker
 *      to minimize CPU/GPU usage while streaming.
 */

import type { WhisperModelId } from './voiceModels';

export interface HardwareProfile {
  deviceMemoryGb: number;
  hardwareConcurrency: number;
  hasWebGpu: boolean;
}

export interface SpeedCheckResult {
  testedModelId: WhisperModelId;
  backend: 'webgpu' | 'wasm';
  audioDurationMs: number;
  inferenceMs: number;
  rtf: number; // inferenceMs / audioDurationMs (< 1.0 means faster than real-time)
  recommendedModel: WhisperModelId;
  summary: string;
  timestamp: string;
}

export interface EngineSelectionInput {
  preferredEngine: 'auto' | 'whisper' | 'browser';
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

export interface EngineSelectionDecision {
  targetEngine: 'whisper' | 'browser' | 'none';
  targetWhisperModel?: WhisperModelId;
  mode:
    | 'whisper'
    | 'browser-bridge'
    | 'browser-fallback'
    | 'browser-manual'
    | 'awaiting-model'
    | 'unavailable';
  notice: string;
  showRetryWhisper: boolean;
}

export const RTF_SLOW_THRESHOLD = 1.0;
export const CONSECUTIVE_SLOW_UTTERANCES_LIMIT = 3;

/**
 * Recommends a default Whisper model based on hardware profile and optional benchmark RTF (ST-9).
 */
export function recommendWhisperModel(
  hw: HardwareProfile,
  benchmarkRtf?: number,
  testedModel: WhisperModelId = 'base.en'
): { recommendedModel: WhisperModelId; reason: string } {
  if (typeof benchmarkRtf === 'number' && benchmarkRtf > 0) {
    if (testedModel === 'base.en') {
      if (benchmarkRtf > 0.9) {
        return {
          recommendedModel: 'tiny.en',
          reason: `Benchmark ran at ${benchmarkRtf.toFixed(2)}× real-time on base.en. Recommended tiny.en for smooth streaming alongside OBS.`,
        };
      }
      if (hw.hasWebGpu && hw.deviceMemoryGb >= 16 && benchmarkRtf <= 0.3) {
        return {
          recommendedModel: 'base.en',
          reason: `Fast WebGPU speed (${benchmarkRtf.toFixed(2)}× real-time). base.en is recommended (small.en also supported on this machine).`,
        };
      }
      return {
        recommendedModel: 'base.en',
        reason: `Passed real-time speed check (${benchmarkRtf.toFixed(2)}× real-time). base.en is the best balance of speed and accuracy.`,
      };
    }

    if (testedModel === 'tiny.en') {
      if (benchmarkRtf <= 0.45 && (hw.deviceMemoryGb >= 8 || hw.hasWebGpu)) {
        return {
          recommendedModel: 'base.en',
          reason: `Fast speed on tiny.en (${benchmarkRtf.toFixed(2)}× real-time). Your laptop can comfortably run base.en.`,
        };
      }
      return {
        recommendedModel: 'tiny.en',
        reason: `tiny.en ran at ${benchmarkRtf.toFixed(2)}× real-time and is recommended for lowest CPU load on this computer.`,
      };
    }
  }

  // Hardware-only heuristic before a model is downloaded
  if (hw.deviceMemoryGb > 0 && hw.deviceMemoryGb <= 4 && !hw.hasWebGpu) {
    return {
      recommendedModel: 'tiny.en',
      reason: '4 GB RAM without WebGPU detected — tiny.en is recommended for low CPU usage.',
    };
  }
  if (hw.hardwareConcurrency > 0 && hw.hardwareConcurrency <= 4 && !hw.hasWebGpu) {
    return {
      recommendedModel: 'tiny.en',
      reason: '4-thread CPU detected — tiny.en is recommended so OBS streaming stays smooth.',
    };
  }
  return {
    recommendedModel: 'base.en',
    reason: 'base.en is the recommended default for 8 GB+ RAM laptops.',
  };
}

/**
 * Pure deterministic ST-8 Auto Engine Selection state machine.
 */
export function selectActiveAsrEngine(
  input: EngineSelectionInput
): EngineSelectionDecision {
  const canUseBrowser =
    input.browserSupported &&
    (input.browserProcessLocally || input.allowCloudBrowserEngine);

  // 1. User explicitly chose Browser (backup)
  if (input.preferredEngine === 'browser') {
    if (canUseBrowser) {
      return {
        targetEngine: 'browser',
        mode: 'browser-manual',
        notice: input.browserProcessLocally
          ? 'Browser speech engine (on-device)'
          : 'Browser speech engine (cloud opt-in)',
        showRetryWhisper: false,
      };
    }
    return {
      targetEngine: 'none',
      mode: 'unavailable',
      notice:
        'Browser speech recognition requires on-device support or checking "Allow Cloud Browser Speech Recognition" in Settings → Voice.',
      showRetryWhisper: false,
    };
  }

  // Determine candidate Whisper models in priority order
  // In Performance mode, prefer tiny.en first if installed
  const failedOrSlow = new Set<WhisperModelId>([
    ...input.whisperFailedModels,
    ...input.whisperSlowModels,
  ]);

  const orderedCandidates: WhisperModelId[] = [];
  if (input.performanceMode && input.installedModels.includes('tiny.en')) {
    orderedCandidates.push('tiny.en');
  }
  if (!orderedCandidates.includes(input.preferredWhisperModel)) {
    orderedCandidates.push(input.preferredWhisperModel);
  }
  // ST-8.3: If preferred model is too slow or failed, try smaller model (tiny.en) next
  for (const fallback of ['base.en', 'tiny.en', 'small.en'] as WhisperModelId[]) {
    if (!orderedCandidates.includes(fallback)) {
      orderedCandidates.push(fallback);
    }
  }

  const healthyInstalledModel = orderedCandidates.find(
    (m) => input.installedModels.includes(m) && !failedOrSlow.has(m)
  );

  const hadSlowOrFailed =
    input.whisperFailedModels.length > 0 || input.whisperSlowModels.length > 0;

  // ST-8.1 & ST-8.3 (step-down to smaller Whisper model like tiny.en):
  if (healthyInstalledModel) {
    const steppedDown =
      healthyInstalledModel !== input.preferredWhisperModel &&
      failedOrSlow.has(input.preferredWhisperModel);
    return {
      targetEngine: 'whisper',
      targetWhisperModel: healthyInstalledModel,
      mode: 'whisper',
      notice: steppedDown
        ? `Switched to lighter Whisper model (${healthyInstalledModel}) to keep real-time speed smooth.`
        : input.performanceMode && healthyInstalledModel === 'tiny.en'
          ? 'Whisper tiny.en (Performance mode)'
          : `Whisper ${healthyInstalledModel} (offline)`,
      showRetryWhisper: steppedDown,
    };
  }

  // ST-8.2: First run / no Whisper model installed yet -> use Browser as bridge if allowed
  if (input.installedModels.length === 0) {
    if (input.preferredEngine === 'auto' && canUseBrowser) {
      return {
        targetEngine: 'browser',
        mode: 'browser-bridge',
        notice: input.isDownloadingWhisper
          ? 'Using a temporary voice engine while the offline model downloads.'
          : 'Using a temporary voice engine while the offline model downloads. Download Whisper in Library → Voice models for offline use.',
        showRetryWhisper: false,
      };
    }
    return {
      targetEngine: 'none',
      mode: 'awaiting-model',
      notice:
        'Offline Whisper model is not downloaded yet. Open Library → Voice models to download it once (or opt in to Cloud Browser Recognition in Settings → Voice).',
      showRetryWhisper: false,
    };
  }

  // ST-8.3: Whisper was installed, but all installed models failed or exceeded real-time factor > 1.0
  if (hadSlowOrFailed) {
    if (input.preferredEngine === 'auto' && canUseBrowser) {
      return {
        targetEngine: 'browser',
        mode: 'browser-fallback',
        notice:
          'Whisper was too slow or could not start on this device. Fell back to Browser speech recognition.',
        showRetryWhisper: true,
      };
    }
    return {
      targetEngine: 'none',
      mode: 'unavailable',
      notice:
        'Whisper could not run fast enough on this computer, and Browser fallback is not enabled. Try downloading tiny.en in Library → Voice models or click Retry Whisper.',
      showRetryWhisper: true,
    };
  }

  return {
    targetEngine: 'none',
    mode: 'unavailable',
    notice: 'No voice recognition engine is currently available.',
    showRetryWhisper: false,
  };
}

/**
 * Tracks rolling Real-Time Factor (RTF = inferenceMs / audioDurationMs) across utterances (ST-8.3).
 * Flags the current model as too slow only when RTF > 1.0 for 3 consecutive utterances
 * (so a single one-off CPU spike never causes an unnecessary fallback).
 */
export class RtfMonitor {
  private consecutiveSlow = 0;
  private recentRtfs: number[] = [];

  recordUtterance(audioDurationMs: number, inferenceMs: number): {
    rtf: number;
    avgRtf: number;
    isSustainedSlow: boolean;
  } {
    const safeDur = Math.max(250, audioDurationMs);
    const rtf = Number((inferenceMs / safeDur).toFixed(2));
    this.recentRtfs.push(rtf);
    if (this.recentRtfs.length > 6) {
      this.recentRtfs.shift();
    }

    if (rtf > RTF_SLOW_THRESHOLD) {
      this.consecutiveSlow++;
    } else {
      this.consecutiveSlow = 0;
    }

    const avgRtf =
      this.recentRtfs.reduce((a, b) => a + b, 0) / this.recentRtfs.length;

    return {
      rtf,
      avgRtf: Number(avgRtf.toFixed(2)),
      isSustainedSlow: this.consecutiveSlow >= CONSECUTIVE_SLOW_UTTERANCES_LIMIT,
    };
  }

  reset(): void {
    this.consecutiveSlow = 0;
    this.recentRtfs = [];
  }
}
