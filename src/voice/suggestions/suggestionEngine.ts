/**
 * Selah Live v2 — Suggestion Engine (SG-1 through SG-6, PRD §7 & §8)
 *
 * Responsibilities:
 * - Sensitivity thresholds: Careful >= 0.85, Balanced >= 0.70, Eager >= 0.55.
 * - Stable ID generation so interim and final transcripts raising the same reference
 *   merge in place into ONE card without flicker (SG-5).
 * - Cooldown: dismissed or shown items are not re-suggested for 2 minutes (120_000 ms)
 *   unless explicitly forced (SG-4).
 * - Expiry: cards expire after 60 seconds (60_000 ms) unless pinned (SG-4).
 * - Rate-limiting: max 1 new card created per second (1_000 ms) to avoid UI floods (PRD §8).
 * - Maximum 5 cards visible in the tray, ranked by pinned first, then confidence & recency (SG-1).
 */

import type {
  Reason,
  ScripturePayload,
  SongPayload,
  Suggestion,
  SuggestionKind,
  TextPayload,
  VoiceSettings,
} from '../types';
import { sanitizeTranscriptText } from './safety';

export const SENSITIVITY_THRESHOLDS: Record<VoiceSettings['sensitivity'], number> = {
  careful: 0.85,
  balanced: 0.70,
  eager: 0.55,
};

export const SUGGESTION_TTL_MS = 60_000;       // 60 seconds expiry unless pinned (SG-4)
export const SUGGESTION_COOLDOWN_MS = 120_000; // 2 minutes cooldown after show/dismiss (SG-4)
export const SUGGESTION_RATE_LIMIT_MS = 1_000; // Max 1 new card per second (PRD §8)
export const MAX_TRAY_SUGGESTIONS = 5;         // Up to 5 cards in tray (SG-1)

export interface CandidateSuggestionInput {
  kind: SuggestionKind;
  reason: Reason;
  confidence: number;
  band?: 'high' | 'medium';
  heard: string;
  payload: ScripturePayload | SongPayload | TextPayload;
}

/**
 * Generates a deterministic ID for a suggestion so interim and final transcripts
 * for the same verse/song/text merge in place (SG-5).
 * Also normalises chapter-only vs specific-verse upgrades on the same book+chapter
 * when raised within the same utterance window.
 */
export function buildStableSuggestionId(
  kind: SuggestionKind,
  payload: ScripturePayload | SongPayload | TextPayload
): string {
  if (kind === 'scripture') {
    const p = payload as ScripturePayload;
    const vStart = p.verseStart || 1;
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

  getThreshold(sensitivity: VoiceSettings['sensitivity'] = 'balanced'): number {
    return SENSITIVITY_THRESHOLDS[sensitivity] ?? 0.70;
  }

  /**
   * Ingests a candidate suggestion from any detector.
   * Returns `{ changed: boolean, createdNew: boolean, suggestions: Suggestion[] }`.
   */
  ingest(
    candidate: CandidateSuggestionInput,
    options: {
      sensitivity?: VoiceSettings['sensitivity'];
      now?: number;
      bypassRateLimit?: boolean;
    } = {}
  ): { changed: boolean; createdNew: boolean; suggestions: Suggestion[] } {
    const now = options.now ?? Date.now();
    const sensitivity = options.sensitivity ?? 'balanced';
    const threshold = this.getThreshold(sensitivity);

    this.pruneExpired(now);

    if (candidate.confidence < threshold) {
      return { changed: false, createdNew: false, suggestions: this.getActive(now) };
    }

    const id = buildStableSuggestionId(candidate.kind, candidate.payload);
    const cleanHeard = sanitizeTranscriptText(candidate.heard, 160);
    const band: 'high' | 'medium' =
      candidate.band || (candidate.confidence >= 0.85 ? 'high' : 'medium');

    // Check if an existing active card can be merged in place (SG-5)
    // Also check if a chapter-only scripture card on the same book+chapter should upgrade in place to a specific verse!
    let existingIdx = this.suggestions.findIndex((s) => s.id === id);
    if (existingIdx < 0 && candidate.kind === 'scripture') {
      const sp = candidate.payload as ScripturePayload;
      existingIdx = this.suggestions.findIndex((s) => {
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

    if (existingIdx >= 0) {
      const prev = this.suggestions[existingIdx];
      const updated: Suggestion = {
        ...prev,
        id,
        reason: candidate.reason,
        confidence: Math.max(prev.confidence, candidate.confidence),
        band: prev.band === 'high' || band === 'high' ? 'high' : 'medium',
        heard: cleanHeard || prev.heard,
        expiresAt: prev.pinned ? prev.expiresAt : now + SUGGESTION_TTL_MS,
        payload: candidate.payload,
      };
      this.suggestions[existingIdx] = updated;
      this.sortAndCap();
      return { changed: true, createdNew: false, suggestions: this.getActive(now) };
    }

    // Check 2-minute cooldown for dismissed or already-shown items (SG-4)
    const coolUntil = this.cooldownUntil.get(id);
    if (coolUntil && now < coolUntil) {
      return { changed: false, createdNew: false, suggestions: this.getActive(now) };
    }

    // Rate-limit new card creation (max 1 new card per second: PRD §8)
    if (!options.bypassRateLimit && this.lastNewCardAt > 0 && now - this.lastNewCardAt < SUGGESTION_RATE_LIMIT_MS) {
      return { changed: false, createdNew: false, suggestions: this.getActive(now) };
    }

    const newCard: Suggestion = {
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
    };

    this.lastNewCardAt = now;
    this.suggestions.unshift(newCard);
    this.sortAndCap();
    return { changed: true, createdNew: true, suggestions: this.getActive(now) };
  }

  /**
   * Marks a suggestion as shown or dismissed: removes it from the tray and places it on a 2-minute cooldown.
   */
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
    for (const [k, until] of this.cooldownUntil.entries()) {
      if (now >= until) this.cooldownUntil.delete(k);
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
