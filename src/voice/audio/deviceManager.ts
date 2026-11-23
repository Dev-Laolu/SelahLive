import type { AudioInputDevice, MicPermissionState } from '../types';

/**
 * Heuristic check whether a device label looks like a USB audio interface,
 * mixer feed, capture device, or external line-in rather than a built-in laptop mic.
 *
 * Used only as the default for noiseSuppression ('auto' -> off for interfaces, on for built-in mics).
 * The user can always override noiseSuppression in Settings -> Voice.
 */
const INTERFACE_PATTERNS = [
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

const BUILTIN_PATTERNS = [
  /\binternal\b/i,
  /\bbuilt[-\s]?in\b/i,
  /\barray\b/i,
  /\brealtek\b/i,
  /\bmacbook\b/i,
  /\blaptop\b/i,
  /\bintegrated\b/i,
];

export function isLikelyAudioInterface(label: string): boolean {
  const clean = String(label || '').trim();
  if (!clean) return false;
  if (INTERFACE_PATTERNS.some((rx) => rx.test(clean))) return true;
  if (BUILTIN_PATTERNS.some((rx) => rx.test(clean))) return false;
  return false;
}

export function resolveNoiseSuppression(
  setting: 'auto' | 'on' | 'off' | undefined,
  deviceLabel: string
): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  // 'auto' (default): OFF for USB interfaces/mixers, ON for built-in mics
  return !isLikelyAudioInterface(deviceLabel);
}

/**
 * Match a stored device selection against currently enumerated audio inputs.
 * Since browsers can reset `deviceId` after permissions or USB port changes,
 * falls back to matching by `deviceLabel`, then to default/first available device.
 */
export function resolvePreferredDevice(
  devices: AudioInputDevice[],
  savedDeviceId?: string,
  savedDeviceLabel?: string
): AudioInputDevice | null {
  if (!devices || devices.length === 0) return null;

  if (savedDeviceId) {
    const byId = devices.find((d) => d.deviceId === savedDeviceId);
    if (byId) return byId;
  }

  if (savedDeviceLabel && savedDeviceLabel.trim()) {
    const norm = savedDeviceLabel.trim().toLowerCase();
    const byExactLabel = devices.find((d) => d.label.trim().toLowerCase() === norm);
    if (byExactLabel) return byExactLabel;

    const byPartialLabel = devices.find(
      (d) =>
        d.label.toLowerCase().includes(norm) ||
        norm.includes(d.label.toLowerCase())
    );
    if (byPartialLabel) return byPartialLabel;
  }

  return devices.find((d) => d.deviceId === 'default') || devices[0] || null;
}

export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const raw = await navigator.mediaDevices.enumerateDevices();
    const inputs = raw.filter((d) => d.kind === 'audioinput');
    return inputs.map((d, idx) => {
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

export function mapMediaErrorToPermissionState(err: unknown): {
  state: MicPermissionState;
  message: string;
} {
  const name = (err as { name?: string })?.name || '';
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
        'This audio device is busy or locked by another application (such as OBS in exclusive mode). Disable exclusive mode or use a shared/monitor feed.',
    };
  }
  return {
    state: 'error',
    message:
      (err as { message?: string })?.message ||
      'Could not open the selected audio device. Check your microphone connection and try again.',
  };
}
