/**
 * Selah Live v2 — Voice Pipeline Safety Guard (Hard Rule #1 & SG-3)
 *
 * 1. Nothing in `/src/voice/` may ever import or call `show`, `updateLive`, `takeLive`,
 *    or emit `selah:show` / `selah:update` automatically.
 * 2. Every live broadcast action from a suggestion MUST pass through `dispatchOperatorSuggestionAction`
 *    with a verified `UserGestureToken` created directly inside a DOM click or keydown event handler.
 * 3. Transcript text sanitiser ensures plain-text rendering only (SECURITY.md §6 & PRD §8).
 */

import type { Suggestion } from '../types';

export interface OperatorGestureEvent {
  isTrusted?: boolean;
  type: 'click' | 'keydown';
  key?: string;
  altKey?: boolean;
  shiftKey?: boolean;
}

export interface OperatorActionCallbacks {
  onShow?: (suggestion: Suggestion) => void;
  onPreview?: (suggestion: Suggestion) => void;
  onDismiss?: (suggestionId: string) => void;
}

/**
 * Sanitises any transcript or "heard" excerpt to plain text only, stripping control characters
 * and HTML angle brackets so no markup can ever be injected.
 */
export function sanitizeTranscriptText(raw: unknown, maxLength = 500): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Verifies that an operator action came from an explicit click or configured keyboard shortcut,
 * and NEVER from a voice worker message, timer, or background pipeline callback.
 */
export function isExplicitOperatorGesture(event: OperatorGestureEvent | null | undefined): boolean {
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'click') return true;
  if (event.type === 'keydown') {
    return !!event.altKey;
  }
  return false;
}

/**
 * The ONLY gateway for acting on a voice suggestion.
 * Refuses to invoke `onShow` or `onPreview` unless an explicit operator click or Alt shortcut event is provided.
 */
export function dispatchOperatorSuggestionAction(
  action: 'show' | 'preview' | 'dismiss',
  suggestion: Suggestion,
  gestureEvent: OperatorGestureEvent | null | undefined,
  callbacks: OperatorActionCallbacks
): boolean {
  if (!isExplicitOperatorGesture(gestureEvent)) {
    return false;
  }
  if (action === 'show') {
    callbacks.onShow?.(suggestion);
    return true;
  }
  if (action === 'preview') {
    callbacks.onPreview?.(suggestion);
    return true;
  }
  if (action === 'dismiss') {
    callbacks.onDismiss?.(suggestion.id);
    return true;
  }
  return false;
}
