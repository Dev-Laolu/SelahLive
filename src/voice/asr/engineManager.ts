import {
  CONSECUTIVE_SLOW_UTTERANCES_LIMIT,
  RTF_SLOW_THRESHOLD,
  RtfMonitor,
} from './rtfMonitor';
import type {
  EngineSelectionDecision,
  EngineSelectionInput,
  HardwareProfile,
  ModelRecommendation,
  WhisperModelId,
} from './type';

export { CONSECUTIVE_SLOW_UTTERANCES_LIMIT, RTF_SLOW_THRESHOLD, RtfMonitor };

export function recommendWhisperModel(
  hw: HardwareProfile,
  benchmarkRtf?: number,
  testedModel: WhisperModelId = 'base.en'
): ModelRecommendation {
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

function buildWhisperCandidateOrder(input: EngineSelectionInput): WhisperModelId[] {
  const candidates: WhisperModelId[] = [];
  if (input.performanceMode && input.installedModels.includes('tiny.en')) {
    candidates.push('tiny.en');
  }
  if (!candidates.includes(input.preferredWhisperModel)) {
    candidates.push(input.preferredWhisperModel);
  }
  const fallbacks: readonly WhisperModelId[] = ['base.en', 'tiny.en', 'small.en'];
  for (const fallback of fallbacks) {
    if (!candidates.includes(fallback)) {
      candidates.push(fallback);
    }
  }
  return candidates;
}

export function selectActiveAsrEngine(
  input: EngineSelectionInput
): EngineSelectionDecision {
  const canUseBrowser =
    input.browserSupported && (input.browserProcessLocally || input.allowCloudBrowserEngine);

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

  const failedOrSlow = new Set<WhisperModelId>([
    ...input.whisperFailedModels,
    ...input.whisperSlowModels,
  ]);
  const healthyModel = buildWhisperCandidateOrder(input).find(
    (m) => input.installedModels.includes(m) && !failedOrSlow.has(m)
  );

  if (healthyModel) {
    const steppedDown =
      healthyModel !== input.preferredWhisperModel &&
      failedOrSlow.has(input.preferredWhisperModel);
    return {
      targetEngine: 'whisper',
      targetWhisperModel: healthyModel,
      mode: 'whisper',
      notice: steppedDown
        ? `Switched to lighter Whisper model (${healthyModel}) to keep real-time speed smooth.`
        : input.performanceMode && healthyModel === 'tiny.en'
          ? 'Whisper tiny.en (Performance mode)'
          : `Whisper ${healthyModel} (offline)`,
      showRetryWhisper: steppedDown,
    };
  }

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

  if (failedOrSlow.size > 0) {
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
