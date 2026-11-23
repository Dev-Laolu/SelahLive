/**
 * Selah Live v2 — AudioWorkletProcessor (`voice-capture-processor`)
 *
 * Responsibilities:
 * 1. Channel extraction: 'mix' (average L+R), 1 (channel 0), or 2 (channel 1 if stereo, fallback to 0).
 * 2. Real-time level metering (RMS & Peak) posted at ~30 Hz.
 * 3. Deterministic resampling from native AudioContext.sampleRate (e.g. 48000 / 44100 Hz)
 *    to 16000 Hz mono Float32 PCM frames (512 samples = 32 ms per frame).
 * 4. All buffers are processed in memory and discarded immediately after posting.
 */

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 512; // 32ms at 16kHz (matches Silero VAD chunk size)

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.channelMode = opts.channel || "mix"; // 'mix' | 1 | 2
    this.inputSampleRate = sampleRate || 48000;
    this.ratio = this.inputSampleRate / TARGET_SAMPLE_RATE;

    // Resampler state
    this.resamplePos = 0;
    this.prevSample = 0;
    this.outBuffer = new Float32Array(FRAME_SAMPLES);
    this.outIndex = 0;

    // Level meter accumulator (~30 Hz updates)
    this.meterSumSq = 0;
    this.meterPeak = 0;
    this.meterCount = 0;
    this.meterIntervalSamples = Math.max(256, Math.floor(this.inputSampleRate / 30));

    this.port.onmessage = (ev) => {
      const d = ev.data || {};
      if (d.type === "set-channel") {
        this.channelMode = d.channel || "mix";
      }
    };
  }

  extractMonoSample(channels, i) {
    const numCh = channels.length;
    if (numCh === 0) return 0;
    if (this.channelMode === 1 || numCh === 1) {
      return channels[0][i] || 0;
    }
    if (this.channelMode === 2) {
      const ch = numCh > 1 ? channels[1] : channels[0];
      return ch[i] || 0;
    }
    // 'mix': average first two channels (or all available up to 2)
    let sum = 0;
    const count = Math.min(2, numCh);
    for (let c = 0; c < count; c++) {
      sum += channels[c][i] || 0;
    }
    return sum / count;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;

    const blockLen = input[0].length;
    // Build mono block at native sampleRate & accumulate meter stats
    const mono = new Float32Array(blockLen);
    for (let i = 0; i < blockLen; i++) {
      const s = this.extractMonoSample(input, i);
      mono[i] = s;
      const abs = s < 0 ? -s : s;
      this.meterSumSq += s * s;
      if (abs > this.meterPeak) this.meterPeak = abs;
      this.meterCount++;
    }

    if (this.meterCount >= this.meterIntervalSamples) {
      const rms = Math.sqrt(this.meterSumSq / this.meterCount);
      const peak = this.meterPeak;
      this.port.postMessage({
        type: "level",
        rms,
        peak,
        clipping: peak >= 0.96,
      });
      this.meterSumSq = 0;
      this.meterPeak = 0;
      this.meterCount = 0;
    }

    // Resample native mono block -> 16000 Hz using linear interpolation
    if (this.inputSampleRate === TARGET_SAMPLE_RATE) {
      for (let i = 0; i < blockLen; i++) {
        this.outBuffer[this.outIndex++] = mono[i];
        if (this.outIndex >= FRAME_SAMPLES) {
          const chunk = this.outBuffer.slice(0);
          this.port.postMessage({ type: "pcm16k", samples: chunk }, [chunk.buffer]);
          this.outIndex = 0;
        }
      }
      return true;
    }

    let pos = this.resamplePos;
    const ratio = this.ratio;
    while (pos < blockLen) {
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = idx === 0 ? this.prevSample : mono[idx - 1];
      const s1 = mono[idx];
      const sample = s0 + frac * (s1 - s0);

      this.outBuffer[this.outIndex++] = sample;
      if (this.outIndex >= FRAME_SAMPLES) {
        const chunk = this.outBuffer.slice(0);
        this.port.postMessage({ type: "pcm16k", samples: chunk }, [chunk.buffer]);
        this.outIndex = 0;
      }
      pos += ratio;
    }

    this.resamplePos = pos - blockLen;
    this.prevSample = mono[blockLen - 1];
    return true;
  }
}

registerProcessor("voice-capture-processor", VoiceCaptureProcessor);
