import type { HardwareProfile } from '../asr/type';

export function playSoftChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const win = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioCtx = window.AudioContext || win.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);

    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.23);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 300);
  } catch {}
}

export async function detectHardwareProfile(): Promise<HardwareProfile> {
  if (typeof navigator === 'undefined') {
    return { deviceMemoryGb: 8, hardwareConcurrency: 4, hasWebGpu: false };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: { requestAdapter?: () => Promise<unknown> };
  };

  let hasWebGpu = false;
  try {
    if (nav.gpu?.requestAdapter) {
      hasWebGpu = Boolean(await nav.gpu.requestAdapter());
    }
  } catch {}

  return {
    deviceMemoryGb: Number(nav.deviceMemory) || 8,
    hardwareConcurrency: Number(nav.hardwareConcurrency) || 4,
    hasWebGpu,
  };
}
