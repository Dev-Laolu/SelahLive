import type { LevelReading, MicTestReport } from '../types';
import { resolveNoiseSuppression } from './deviceManager';

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 512;

export interface CaptureConfig {
  deviceId?: string;
  deviceLabel?: string;
  channel?: 'mix' | 1 | 2;
  noiseSuppression?: 'auto' | 'on' | 'off';
  onLevel?: (reading: LevelReading) => void;
  onPcmFrame?: (samples16k: Float32Array) => void;
  onStreamEnded?: () => void;
}

/**
 * Pure deterministic linear-interpolation resampler from any input sampleRate to 16000 Hz mono.
 * Used both as a fallback when AudioWorklet isn't available and for unit testing.
 */
export function resampleTo16kMono(
  channels: Float32Array[],
  inputSampleRate: number,
  channelMode: 'mix' | 1 | 2 = 'mix'
): Float32Array {
  if (!channels || channels.length === 0 || !channels[0] || channels[0].length === 0) {
    return new Float32Array(0);
  }
  const inLen = channels[0].length;
  const numCh = channels.length;
  const mono = new Float32Array(inLen);

  for (let i = 0; i < inLen; i++) {
    if (channelMode === 1 || numCh === 1) {
      mono[i] = channels[0][i] || 0;
    } else if (channelMode === 2) {
      const ch = numCh > 1 ? channels[1] : channels[0];
      mono[i] = ch[i] || 0;
    } else {
      const count = Math.min(2, numCh);
      let s = 0;
      for (let c = 0; c < count; c++) s += channels[c][i] || 0;
      mono[i] = s / count;
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
    const s0 = mono[idx] || 0;
    const s1 = idx + 1 < inLen ? mono[idx + 1] : s0;
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
      summary: 'No audio signal received. Check that your microphone or USB interface channel is unmuted.',
    };
  }

  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < sampleCount; i++) {
    const s = samples16k[i];
    const abs = s < 0 ? -s : s;
    sumSq += s * s;
    if (abs > peak) peak = abs;
  }
  const avgRms = Math.sqrt(sumSq / sampleCount);
  const clipping = peak >= 0.96;

  let status: MicTestReport['status'] = 'good';
  let summary = '';

  if (peak < 0.01 || avgRms < 0.002) {
    status = 'silent';
    summary =
      'Signal is silent. Verify the correct input device and channel (Channel 1 vs Channel 2) and check your mixer gain.';
  } else if (clipping) {
    status = 'clipping';
    summary =
      'Signal is clipping (too hot). Lower the channel gain on your USB interface or sound desk slightly.';
  } else if (avgRms < 0.012) {
    status = 'low';
    summary =
      'Audio detected, but the level is quiet. Speak closer to the mic or raise the preamp gain slightly.';
  } else {
    status = 'good';
    summary =
      'Clean 16 kHz audio signal captured. Level is in a healthy range for speech recognition.';
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
      'Audio pipeline verified (16 kHz mono PCM ready). Speech transcription activates in Phase 1 when a voice engine is loaded.',
  };
}

/**
 * Manages the active MediaStream, AudioContext, and AudioWorkletNode.
 * Calling `stop()` ALWAYS stops all MediaStreamTracks and closes the AudioContext
 * so the browser's hardware microphone indicator turns off immediately.
 */
export class AudioCaptureSession {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sinkGain: GainNode | null = null;
  private config: CaptureConfig;
  private active = false;

  constructor(config: CaptureConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    await this.stop();

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is not supported in this browser.');
    }

    const ns = resolveNoiseSuppression(
      this.config.noiseSuppression,
      this.config.deviceLabel || ''
    );

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: { ideal: false },
      autoGainControl: { ideal: false },
      noiseSuppression: { ideal: ns },
      channelCount: { ideal: 2 },
    };

    if (this.config.deviceId && this.config.deviceId !== 'default') {
      audioConstraints.deviceId = { exact: this.config.deviceId };
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    } catch (err) {
      // If exact deviceId failed because browser rotated deviceIds, retry with default constraint if fallback allowed
      const name = (err as { name?: string })?.name;
      if (
        (name === 'OverconstrainedError' || name === 'NotFoundError') &&
        audioConstraints.deviceId
      ) {
        delete audioConstraints.deviceId;
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      } else {
        throw err;
      }
    }

    this.stream = stream;
    this.active = true;

    // Watch track end (e.g. USB interface unplugged or OS revoked mic)
    const tracks = stream.getAudioTracks();
    tracks.forEach((track) => {
      track.onended = () => {
        if (this.active && this.config.onStreamEnded) {
          this.config.onStreamEnded();
        }
      };
    });

    // Do NOT force AudioContext({ sampleRate: 16000 }) — browsers differ; resample in our worklet
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.audioCtx = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const source = ctx.createMediaStreamSource(stream);
    this.sourceNode = source;

    // Zero-gain sink so the audio graph runs without playing mic audio out of the laptop speakers
    const silentSink = ctx.createGain();
    silentSink.gain.value = 0;
    silentSink.connect(ctx.destination);
    this.sinkGain = silentSink;

    if (ctx.audioWorklet) {
      await ctx.audioWorklet.addModule('/worklets/voice-capture-processor.js');
      const node = new AudioWorkletNode(ctx, 'voice-capture-processor', {
        processorOptions: {
          channel: this.config.channel || 'mix',
        },
      });

      node.port.onmessage = (ev) => {
        if (!this.active) return;
        const d = ev.data || {};
        if (d.type === 'level' && this.config.onLevel) {
          this.config.onLevel({
            rms: d.rms || 0,
            peak: d.peak || 0,
            db: rmsToDb(d.rms || 0),
            clipping: !!d.clipping,
          });
        } else if (d.type === 'pcm16k' && d.samples && this.config.onPcmFrame) {
          this.config.onPcmFrame(d.samples as Float32Array);
        }
      };

      source.connect(node);
      node.connect(silentSink);
      this.workletNode = node;
    }
  }

  setChannel(channel: 'mix' | 1 | 2): void {
    this.config.channel = channel;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'set-channel', channel });
    }
  }

  isActive(): boolean {
    return (
      this.active &&
      !!this.stream &&
      this.stream.getAudioTracks().some((t) => t.readyState === 'live')
    );
  }

  /**
   * Stops all MediaStream tracks immediately so the browser tab/OS mic indicator turns off,
   * disconnects nodes, and closes the AudioContext.
   */
  async stop(): Promise<void> {
    this.active = false;

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.sinkGain) {
      try {
        this.sinkGain.disconnect();
      } catch {}
      this.sinkGain = null;
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      } catch {}
      this.stream = null;
    }

    if (this.audioCtx) {
      const ctx = this.audioCtx;
      this.audioCtx = null;
      try {
        if (ctx.state !== 'closed') {
          await ctx.close();
        }
      } catch {}
    }

    if (this.config.onLevel) {
      this.config.onLevel({ rms: 0, peak: 0, db: -60, clipping: false });
    }
  }
}
