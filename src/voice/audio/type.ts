import type {
  AudioChannelOption,
  LevelReading,
  MicPermissionState,
  NoiseSuppressionOption,
} from '../type';

export interface CaptureConfig {
  deviceId?: string | undefined;
  deviceLabel?: string | undefined;
  channel?: AudioChannelOption | undefined;
  noiseSuppression?: NoiseSuppressionOption | undefined;
  onLevel?: ((reading: LevelReading) => void) | undefined;
  onPcmFrame?: ((samples16k: Float32Array) => void) | undefined;
  onStreamEnded?: (() => void) | undefined;
}

export interface PermissionErrorMapping {
  state: MicPermissionState;
  message: string;
}

export interface AudioWorkletMessage {
  type?: 'level' | 'pcm16k' | undefined;
  rms?: number | undefined;
  peak?: number | undefined;
  clipping?: boolean | undefined;
  samples?: Float32Array | undefined;
}
