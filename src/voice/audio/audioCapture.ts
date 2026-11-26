import { ZERO_LEVEL } from '../constants';
import type { AudioChannelOption } from '../type';
import { resolveNoiseSuppression } from './deviceManager';
import { rmsToDb } from './signalMath';
import type { AudioWorkletMessage, CaptureConfig } from './type';

export { evaluateMicTestSamples, resampleTo16kMono, rmsToDb } from './signalMath';

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || win.webkitAudioContext;
}

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

    const noiseSuppression = resolveNoiseSuppression(
      this.config.noiseSuppression,
      this.config.deviceLabel ?? ''
    );

    const constraints: MediaTrackConstraints = {
      echoCancellation: { ideal: false },
      autoGainControl: { ideal: false },
      noiseSuppression: { ideal: noiseSuppression },
      channelCount: { ideal: 2 },
    };

    if (this.config.deviceId && this.config.deviceId !== 'default') {
      constraints.deviceId = { exact: this.config.deviceId };
    }

    this.stream = await this.openMediaStream(constraints);
    this.active = true;

    for (const track of this.stream.getAudioTracks()) {
      track.onended = () => {
        if (this.active) this.config.onStreamEnded?.();
      };
    }

    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) {
      throw new Error('Web Audio API is not available in this browser.');
    }

    const ctx = new AudioCtx();
    this.audioCtx = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const source = ctx.createMediaStreamSource(this.stream);
    this.sourceNode = source;

    const silentSink = ctx.createGain();
    silentSink.gain.value = 0;
    silentSink.connect(ctx.destination);
    this.sinkGain = silentSink;

    if (ctx.audioWorklet) {
      await ctx.audioWorklet.addModule('/worklets/voice-capture-processor.js');
      const node = new AudioWorkletNode(ctx, 'voice-capture-processor', {
        processorOptions: { channel: this.config.channel ?? 'mix' },
      });

      node.port.onmessage = (ev: MessageEvent<AudioWorkletMessage>) => {
        if (!this.active) return;
        const data = ev.data ?? {};
        if (data.type === 'level') {
          const rms = data.rms ?? 0;
          this.config.onLevel?.({
            rms,
            peak: data.peak ?? 0,
            db: rmsToDb(rms),
            clipping: Boolean(data.clipping),
          });
        } else if (data.type === 'pcm16k' && data.samples) {
          this.config.onPcmFrame?.(data.samples);
        }
      };

      source.connect(node);
      node.connect(silentSink);
      this.workletNode = node;
    }
  }

  private async openMediaStream(constraints: MediaTrackConstraints): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      const canFallback =
        (name === 'OverconstrainedError' || name === 'NotFoundError') &&
        Boolean(constraints.deviceId);
      if (!canFallback) throw err;

      const relaxed: MediaTrackConstraints = { ...constraints };
      delete relaxed.deviceId;
      return navigator.mediaDevices.getUserMedia({ audio: relaxed, video: false });
    }
  }

  setChannel(channel: AudioChannelOption): void {
    this.config.channel = channel;
    this.workletNode?.port.postMessage({ type: 'set-channel', channel });
  }

  isActive(): boolean {
    return (
      this.active &&
      Boolean(this.stream) &&
      (this.stream?.getAudioTracks().some((t) => t.readyState === 'live') ?? false)
    );
  }

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
        for (const track of this.stream.getTracks()) {
          track.onended = null;
          track.stop();
        }
      } catch {}
      this.stream = null;
    }

    if (this.audioCtx) {
      const ctx = this.audioCtx;
      this.audioCtx = null;
      try {
        if (ctx.state !== 'closed') await ctx.close();
      } catch {}
    }

    this.config.onLevel?.(ZERO_LEVEL);
  }
}
