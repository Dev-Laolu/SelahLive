import type { AudioInputDevice, NoiseSuppressionOption } from '../type';
import type { PermissionErrorMapping } from './type';

const INTERFACE_PATTERNS: readonly RegExp[] = [
  /\busb\b/i,
  /\bscarlett\b/i,
  /\bfocusrite\b/i,
  /\bbehringer\b/i,
  /\bx32\b|\bm32\b|\bxr18\b|\bumc\d+/i,
  /\byamaha\b|\bmg\d+\b|\btf\d+\b/i,
  /\ballen\s*&?\s*heath\b|\bqu-\d+|\bsq-\d+|\bzeds?\b/i,
  /\bmackie\b|\bpresonus\b|\bsteinberg\b|\bmotu\b|\baudient\b|\btascam\b|\bzoom\b|\brode\b|\bshure\b/i,
  /\bmixer\b|\binterface\b|\bline\s*in\b|\bdante\b|\bloopback\b|\bvirtual\s*cable\b|\bcapture\b/i,
  /\bcodec\b|\bexternal\b/i,
];

const BUILTIN_PATTERNS: readonly RegExp[] = [
  /\binternal\b/i,
  /\bbuilt[-\s]?in\b/i,
  /\barray\b/i,
  /\brealtek\b/i,
  /\bmacbook\b/i,
  /\blaptop\b/i,
  /\bintegrated\b/i,
];

export function isLikelyAudioInterface(label: string): boolean {
  const clean = label.trim();
  if (!clean) return false;
  if (INTERFACE_PATTERNS.some((rx) => rx.test(clean))) return true;
  if (BUILTIN_PATTERNS.some((rx) => rx.test(clean))) return false;
  return false;
}

export function resolveNoiseSuppression(
  setting: NoiseSuppressionOption | undefined,
  deviceLabel: string
): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return !isLikelyAudioInterface(deviceLabel);
}

export function resolvePreferredDevice(
  devices: AudioInputDevice[],
  savedDeviceId?: string,
  savedDeviceLabel?: string
): AudioInputDevice | null {
  if (devices.length === 0) return null;

  if (savedDeviceId) {
    const byId = devices.find((d) => d.deviceId === savedDeviceId);
    if (byId) return byId;
  }

  const trimmedLabel = savedDeviceLabel?.trim().toLowerCase();
  if (trimmedLabel) {
    const byExact = devices.find((d) => d.label.trim().toLowerCase() === trimmedLabel);
    if (byExact) return byExact;

    const byPartial = devices.find((d) => {
      const candidate = d.label.toLowerCase();
      return candidate.includes(trimmedLabel) || trimmedLabel.includes(candidate);
    });
    if (byPartial) return byPartial;
  }

  return devices.find((d) => d.deviceId === 'default') ?? devices[0] ?? null;
}

export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === 'audioinput')
      .map((d, idx) => {
        const label = d.label || `Microphone ${idx + 1}`;
        return {
          deviceId: d.deviceId || `input-${idx}`,
          label,
          groupId: d.groupId || '',
          isLikelyInterface: isLikelyAudioInterface(label),
        };
      });
  } catch {
    return [];
  }
}

export function mapMediaErrorToPermissionState(err: unknown): PermissionErrorMapping {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return {
      state: 'denied',
      message:
        'Microphone access was blocked. Click the site lock/tune icon in your browser address bar, allow Microphone, and try again.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      state: 'no-device',
      message:
        'No microphone or USB audio interface was found. Plug in your audio device and check that Windows/macOS detects it.',
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      state: 'in-use',
      message:
        'This audio device is busy or locked by another application (such as OBS in exclusive mode). Disable exclusive mode or use a shared feed.',
    };
  }
  return {
    state: 'error',
    message:
      (err as { message?: string })?.message ||
      'Could not open the selected audio device. Check your microphone connection and try again.',
  };
}
