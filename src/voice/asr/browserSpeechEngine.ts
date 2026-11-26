import { sanitizeTranscriptText } from '../suggestions/safety';
import type { TranscriptSegment, VoiceSettings } from '../type';
import type {
  AsrEngine,
  AsrEngineCallbacks,
  SpeechRecognitionEvent,
  SpeechRecognitionInstance,
} from './type';

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionConstructor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionConstructor());
}

export function supportsProcessLocally(): boolean {
  const Ctor = getSpeechRecognitionConstructor();
  if (!Ctor) return false;
  try {
    const instance = new Ctor();
    return 'processLocally' in instance;
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

    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
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

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    if (canRunLocally && !settings.allowCloudBrowserEngine) {
      try {
        rec.processLocally = true;
      } catch {}
    }

    rec.onresult = (ev: SpeechRecognitionEvent) => this.handleResult(ev);
    rec.onerror = (ev) => {
      const code = ev?.error ?? '';
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
      callbacks.onStatusChange(
        'listening',
        canRunLocally ? 'Browser (on-device)' : 'Browser (cloud opt-in)'
      );
    } catch (err) {
      callbacks.onError(
        (err as { message?: string })?.message || 'Could not start browser speech recognition.'
      );
    }
  }

  private handleResult(ev: SpeechRecognitionEvent): void {
    if (this.isPaused || !this.callbacks) return;
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      const alt = res?.[0];
      if (!res || !alt) continue;

      const clean = sanitizeTranscriptText(alt.transcript, 360);
      if (!clean) continue;

      const now = Date.now();
      const seg: TranscriptSegment = {
        id: res.isFinal ? `br-fin-${++this.segCounter}` : `br-int-${this.segCounter + 1}`,
        text: clean,
        isFinal: Boolean(res.isFinal),
        startMs: now - 1200,
        endMs: now,
        confidence: alt.confidence > 0 ? alt.confidence : 0.85,
      };
      this.callbacks.onSegment(seg);
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
    if (!this.recognition) return;

    try {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.abort();
    } catch {}
    this.recognition = null;
  }
}
