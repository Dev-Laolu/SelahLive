/**
 * Selah Live v2 — Browser SpeechRecognition Backup & First-Run Bridge (ST-2, ST-8)
 *
 * Rules:
 * - Used ONLY as a backup or first-run bridge when Whisper is not downloaded yet
 *   or when the user selects Browser (backup).
 * - Checks for on-device recognition (`processLocally: true`) where supported by Chrome/Edge.
 * - If on-device recognition is not supported by the browser, it ONLY runs if the user has
 *   explicitly opted in to `allowCloudBrowserEngine: true` in Settings -> Voice (ST-2, PRD §8).
 */

import type { TranscriptSegment, VoiceSettings } from '../types';
import type { AsrEngine, AsrEngineCallbacks } from './engineInterface';
import { sanitizeTranscriptText } from '../suggestions/safety';

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Checks if Chrome's experimental/modern on-device SpeechRecognition (`processLocally`) is available.
 */
export function supportsProcessLocally(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: { prototype?: { processLocally?: unknown } };
    webkitSpeechRecognition?: { prototype?: { processLocally?: unknown } };
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return false;
  try {
    const inst = new (Ctor as unknown as new () => SpeechRecognitionInstance)();
    return 'processLocally' in inst;
  } catch {
    return false;
  }
}

export class BrowserSpeechEngine implements AsrEngine {
  readonly id = 'browser' as const;
  private recognition: SpeechRecognitionInstance | null = null;
  private callbacks: AsrEngineCallbacks | null = null;
  private shouldKeepRunning = false;
  private isPaused = false;
  private segCounter = 0;

  async init(settings: VoiceSettings, callbacks: AsrEngineCallbacks): Promise<void> {
    await this.destroy();
    this.callbacks = callbacks;

    if (!isBrowserSpeechRecognitionSupported()) {
      callbacks.onStatusChange('error', 'Browser SpeechRecognition is not available in this browser.');
      return;
    }

    const canRunLocally = supportsProcessLocally();
    if (!canRunLocally && !settings.allowCloudBrowserEngine) {
      callbacks.onStatusChange(
        'error',
        'Download an offline Whisper model in Library → Voice models, or opt in to Cloud Browser Recognition in Settings → Voice.'
      );
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    if (canRunLocally && !settings.allowCloudBrowserEngine) {
      try {
        rec.processLocally = true;
      } catch {}
    }

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      if (this.isPaused || !this.callbacks) return;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const alt = res?.[0];
        if (!alt) continue;
        const clean = sanitizeTranscriptText(alt.transcript, 360);
        if (!clean) continue;
        const now = Date.now();
        const seg: TranscriptSegment = {
          id: res.isFinal ? `br-fin-${++this.segCounter}` : `br-int-${this.segCounter + 1}`,
          text: clean,
          isFinal: !!res.isFinal,
          startMs: now - 1200,
          endMs: now,
          confidence: typeof alt.confidence === 'number' && alt.confidence > 0 ? alt.confidence : 0.85,
        };
        this.callbacks.onSegment(seg);
      }
    };

    rec.onerror = (ev) => {
      const code = ev?.error || '';
      if (code === 'no-speech' || code === 'aborted') return;
      this.callbacks?.onError(`Browser speech engine error: ${code || 'unknown'}`);
    };

    rec.onend = () => {
      if (this.shouldKeepRunning && !this.isPaused) {
        try {
          rec.start();
        } catch {}
      }
    };

    this.recognition = rec;
    this.shouldKeepRunning = true;
    this.isPaused = false;

    try {
      rec.start();
      callbacks.onStatusChange('listening', canRunLocally ? 'Browser (on-device)' : 'Browser (cloud opt-in)');
    } catch (err) {
      callbacks.onError((err as { message?: string })?.message || 'Could not start browser speech recognition.');
    }
  }

  pause(): void {
    this.isPaused = true;
    this.shouldKeepRunning = false;
    try {
      this.recognition?.stop();
    } catch {}
    this.callbacks?.onStatusChange('paused');
  }

  resume(): void {
    if (!this.recognition) return;
    this.isPaused = false;
    this.shouldKeepRunning = true;
    try {
      this.recognition.start();
      this.callbacks?.onStatusChange('listening');
    } catch {}
  }

  async destroy(): Promise<void> {
    this.shouldKeepRunning = false;
    this.isPaused = true;
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
  }
}
