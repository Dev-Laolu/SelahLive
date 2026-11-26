import type { Suggestion, SuggestionActionType } from '../type';
import type { OperatorActionCallbacks, OperatorGestureEvent } from './type';

export type { OperatorActionCallbacks, OperatorGestureEvent } from './type';

export function sanitizeTranscriptText(raw: unknown, maxLength = 500): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function isExplicitOperatorGesture(
  event: OperatorGestureEvent | null | undefined
): boolean {
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'click') return true;
  if (event.type === 'keydown') return Boolean(event.altKey);
  return false;
}

export function dispatchOperatorSuggestionAction(
  action: SuggestionActionType,
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
