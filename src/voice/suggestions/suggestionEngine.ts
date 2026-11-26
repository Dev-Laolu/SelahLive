import type {
  ConfidenceBand,
  ScripturePayload,
  SensitivityLevel,
  SongPayload,
  Suggestion,
  SuggestionKind,
  SuggestionPayload,
  TextPayload,
} from '../type';
import { sanitizeTranscriptText } from './safety';
import type { CandidateSuggestionInput, IngestOptions, IngestResult } from './type';

export const SENSITIVITY_THRESHOLDS: Readonly<Record<SensitivityLevel, number>> = {
  careful: 0.85,
  balanced: 0.7,
  eager: 0.55,
};

export const SUGGESTION_TTL_MS = 60_000;
export const SUGGESTION_COOLDOWN_MS = 120_000;
export const SUGGESTION_RATE_LIMIT_MS = 1_000;
export const MAX_TRAY_SUGGESTIONS = 5;

export function buildStableSuggestionId(
  kind: SuggestionKind,
  payload: SuggestionPayload
): string {
  if (kind === 'scripture') {
    const p = payload as ScripturePayload;
    const vStart = p.verseStart ?? 1;
    const vEnd = p.verseEnd && p.verseEnd > vStart ? `-${p.verseEnd}` : '';
    return `scripture:${p.book}:${p.chapter}:${vStart}${vEnd}`;
  }
  if (kind === 'song') {
    const p = payload as SongPayload;
    return `song:${p.songId}:${p.slideIndex ?? 0}`;
  }
  const p = payload as TextPayload;
  return `text:${p.savedTextId}`;
}

export class SuggestionEngine {
  private suggestions: Suggestion[] = [];
  private cooldownUntil = new Map<string, number>();
  private lastNewCardAt = 0;

  getThreshold(sensitivity: SensitivityLevel = 'balanced'): number {
    return SENSITIVITY_THRESHOLDS[sensitivity] ?? 0.7;
  }

  ingest(candidate: CandidateSuggestionInput, options: IngestOptions = {}): IngestResult {
    const now = options.now ?? Date.now();
    const threshold = this.getThreshold(options.sensitivity ?? 'balanced');

    this.pruneExpired(now);

    if (candidate.confidence < threshold) {
      return { changed: false, createdNew: false, suggestions: this.getActive(now) };
    }

    const id = buildStableSuggestionId(candidate.kind, candidate.payload);
    const cleanHeard = sanitizeTranscriptText(candidate.heard, 160);
    const band: ConfidenceBand =
      candidate.band ?? (candidate.confidence >= 0.85 ? 'high' : 'medium');

    const existingIdx = this.findMergeIndex(id, candidate, now);
    const existing = existingIdx >= 0 ? this.suggestions[existingIdx] : undefined;

    if (existing && existingIdx >= 0) {
      this.suggestions[existingIdx] = {
        ...existing,
        id,
        reason: candidate.reason,
        confidence: Math.max(existing.confidence, candidate.confidence),
        band: existing.band === 'high' || band === 'high' ? 'high' : 'medium',
        heard: cleanHeard || existing.heard,
        expiresAt: existing.pinned ? existing.expiresAt : now + SUGGESTION_TTL_MS,
        payload: candidate.payload,
      };
      this.sortAndCap();
      return { changed: true, createdNew: false, suggestions: this.getActive(now) };
    }

    const coolUntil = this.cooldownUntil.get(id);
    if (coolUntil && now < coolUntil) {
      return { changed: false, createdNew: false, suggestions: this.getActive(now) };
    }

    if (
      !options.bypassRateLimit &&
      this.lastNewCardAt > 0 &&
      now - this.lastNewCardAt < SUGGESTION_RATE_LIMIT_MS
    ) {
      return { changed: false, createdNew: false, suggestions: this.getActive(now) };
    }

    this.lastNewCardAt = now;
    this.suggestions.unshift({
      id,
      kind: candidate.kind,
      reason: candidate.reason,
      confidence: candidate.confidence,
      band,
      heard: cleanHeard,
      createdAt: now,
      expiresAt: now + SUGGESTION_TTL_MS,
      pinned: false,
      payload: candidate.payload,
    });
    this.sortAndCap();
    return { changed: true, createdNew: true, suggestions: this.getActive(now) };
  }

  private findMergeIndex(
    id: string,
    candidate: CandidateSuggestionInput,
    now: number
  ): number {
    const exactIdx = this.suggestions.findIndex((s) => s.id === id);
    if (exactIdx >= 0 || candidate.kind !== 'scripture') return exactIdx;

    const sp = candidate.payload as ScripturePayload;
    return this.suggestions.findIndex((s) => {
      if (s.kind !== 'scripture') return false;
      const ep = s.payload as ScripturePayload;
      return (
        ep.book === sp.book &&
        ep.chapter === sp.chapter &&
        Math.abs(now - s.createdAt) < 10_000 &&
        (ep.verseStart === 1 || s.band === 'medium')
      );
    });
  }

  markShownOrDismissed(id: string, now = Date.now()): Suggestion[] {
    this.cooldownUntil.set(id, now + SUGGESTION_COOLDOWN_MS);
    this.suggestions = this.suggestions.filter((s) => s.id !== id);
    return this.getActive(now);
  }

  togglePin(id: string, now = Date.now()): Suggestion[] {
    this.suggestions = this.suggestions.map((s) => {
      if (s.id !== id) return s;
      const nextPinned = !s.pinned;
      return {
        ...s,
        pinned: nextPinned,
        expiresAt: nextPinned ? Number.MAX_SAFE_INTEGER : now + SUGGESTION_TTL_MS,
      };
    });
    this.sortAndCap();
    return this.getActive(now);
  }

  pruneExpired(now = Date.now()): boolean {
    const before = this.suggestions.length;
    this.suggestions = this.suggestions.filter((s) => s.pinned || s.expiresAt > now);
    for (const [key, until] of this.cooldownUntil.entries()) {
      if (now >= until) this.cooldownUntil.delete(key);
    }
    return this.suggestions.length !== before;
  }

  getActive(now = Date.now()): Suggestion[] {
    this.pruneExpired(now);
    return [...this.suggestions];
  }

  clearAll(): void {
    this.suggestions = [];
  }

  private sortAndCap(): void {
    this.suggestions.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.band !== b.band) return a.band === 'high' ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
    if (this.suggestions.length > MAX_TRAY_SUGGESTIONS) {
      this.suggestions = this.suggestions.slice(0, MAX_TRAY_SUGGESTIONS);
    }
  }
}
