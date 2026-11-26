import type { RtfUtteranceSample } from './type';

export const RTF_SLOW_THRESHOLD = 1.0;
export const CONSECUTIVE_SLOW_UTTERANCES_LIMIT = 3;

export class RtfMonitor {
  private consecutiveSlow = 0;
  private recentRtfs: number[] = [];

  recordUtterance(audioDurationMs: number, inferenceMs: number): RtfUtteranceSample {
    const safeDuration = Math.max(250, audioDurationMs);
    const rtf = Number((inferenceMs / safeDuration).toFixed(2));

    this.recentRtfs.push(rtf);
    if (this.recentRtfs.length > 6) {
      this.recentRtfs.shift();
    }

    if (rtf > RTF_SLOW_THRESHOLD) {
      this.consecutiveSlow++;
    } else {
      this.consecutiveSlow = 0;
    }

    const avgRtf =
      this.recentRtfs.reduce((sum, val) => sum + val, 0) / this.recentRtfs.length;

    return {
      rtf,
      avgRtf: Number(avgRtf.toFixed(2)),
      isSustainedSlow: this.consecutiveSlow >= CONSECUTIVE_SLOW_UTTERANCES_LIMIT,
    };
  }

  reset(): void {
    this.consecutiveSlow = 0;
    this.recentRtfs = [];
  }
}
