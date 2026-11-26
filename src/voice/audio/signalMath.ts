import type { AudioChannelOption, MicTestReport, MicTestStatus } from '../type';

export const TARGET_SAMPLE_RATE = 16_000;

export function resampleTo16kMono(
  channels: Float32Array[],
  inputSampleRate: number,
  channelMode: AudioChannelOption = 'mix'
): Float32Array {
  const firstChannel = channels[0];
  if (!firstChannel || firstChannel.length === 0) {
    return new Float32Array(0);
  }

  const inLen = firstChannel.length;
  const numCh = channels.length;
  const mono = new Float32Array(inLen);

  for (let i = 0; i < inLen; i++) {
    if (channelMode === 1 || numCh === 1) {
      mono[i] = firstChannel[i] ?? 0;
    } else if (channelMode === 2) {
      const secondChannel = channels[1] ?? firstChannel;
      mono[i] = secondChannel[i] ?? 0;
    } else {
      const count = Math.min(2, numCh);
      let sum = 0;
      for (let c = 0; c < count; c++) {
        sum += channels[c]?.[i] ?? 0;
      }
      mono[i] = sum / count;
    }
  }

  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    return mono;
  }

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outLen = Math.max(0, Math.floor(inLen / ratio));
  const out = new Float32Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = mono[idx] ?? 0;
    const s1 = idx + 1 < inLen ? (mono[idx + 1] ?? s0) : s0;
    out[i] = s0 + frac * (s1 - s0);
  }

  return out;
}

export function rmsToDb(rms: number): number {
  if (!rms || rms <= 0.00001) return -60;
  const db = 20 * Math.log10(rms);
  return Math.max(-60, Math.min(0, db));
}

export function evaluateMicTestSamples(
  samples16k: Float32Array,
  durationMs: number,
  workerNote?: string
): MicTestReport {
  const sampleCount = samples16k.length;
  if (sampleCount === 0) {
    return {
      durationMs,
      sampleCount: 0,
      sampleRate: TARGET_SAMPLE_RATE,
      avgRms: 0,
      peak: 0,
      clipping: false,
      status: 'silent',
      summary:
        'No audio signal received. Check that your microphone or USB interface channel is unmuted.',
    };
  }

  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = samples16k[i] ?? 0;
    const abs = Math.abs(sample);
    sumSq += sample * sample;
    if (abs > peak) peak = abs;
  }

  const avgRms = Math.sqrt(sumSq / sampleCount);
  const clipping = peak >= 0.96;

  let status: MicTestStatus = 'good';
  let summary = 'Clean 16 kHz audio signal captured. Level is healthy for speech recognition.';

  if (peak < 0.01 || avgRms < 0.002) {
    status = 'silent';
    summary =
      'Signal is silent. Verify the input device, channel (Channel 1 vs Channel 2), and mixer gain.';
  } else if (clipping) {
    status = 'clipping';
    summary =
      'Signal is clipping (too hot). Lower the channel gain on your USB interface or sound desk slightly.';
  } else if (avgRms < 0.012) {
    status = 'low';
    summary =
      'Audio detected, but the level is quiet. Speak closer to the mic or raise preamp gain slightly.';
  }

  return {
    durationMs,
    sampleCount,
    sampleRate: TARGET_SAMPLE_RATE,
    avgRms,
    peak,
    clipping,
    status,
    summary,
    transcriptPreview:
      workerNote ||
      'Audio pipeline verified (16 kHz mono PCM ready). Speech transcription activates when a voice engine is loaded.',
  };
}
