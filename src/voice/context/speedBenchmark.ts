import { recommendWhisperModel } from '../asr/engineManager';
import type { HardwareProfile, SpeedCheckResult, WhisperModelId } from '../asr/type';
import type { VoiceWorkerClient } from '../workers/workerClient';

export async function runWorkerSpeedBenchmark(
  client: VoiceWorkerClient,
  targetModel: WhisperModelId,
  hw: HardwareProfile
): Promise<SpeedCheckResult> {
  const bench = await client.runSpeedBenchmark(targetModel);
  const rec = recommendWhisperModel(hw, bench.rtf, bench.modelId);
  return {
    testedModelId: bench.modelId,
    backend: bench.backend,
    audioDurationMs: bench.audioDurationMs,
    inferenceMs: bench.inferenceMs,
    rtf: bench.rtf,
    recommendedModel: rec.recommendedModel,
    summary: rec.reason,
    timestamp: new Date().toISOString(),
  };
}
