'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { useVoice, isEditableElementFocused } from '../VoiceContext';
import type { Suggestion, SuggestionKind } from '../types';
import {
  dispatchOperatorSuggestionAction,
  sanitizeTranscriptText,
  type OperatorGestureEvent,
} from '../suggestions/safety';
import {
  resolveSuggestionView,
  resolveScriptureSuggestion,
  type ResolvedSuggestionView,
} from '../suggestions/resolver';

export { resolveSuggestionView, resolveScriptureSuggestion };
export type { ResolvedSuggestionView };

export interface SuggestionTrayProps {
  /** Filter suggestions by kind (e.g. 'scripture' on Scripture screen, 'song' on Songs, 'text' on Text, or undefined for all on Overview) */
  filterKind?: SuggestionKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bibles?: any[];
  activeBibleId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  songs?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  savedTexts?: any[];
  /** Invoked ONLY when the operator explicitly clicks Show or presses Alt+1..5 */
  onOperatorShow: (item: ResolvedSuggestionView) => void;
  /** Invoked ONLY when the operator explicitly clicks Preview or presses Shift+Alt+1..5 */
  onOperatorPreview: (item: ResolvedSuggestionView) => void;
}

const REASON_LABELS: Record<string, string> = {
  'spoken-reference': 'Spoken Ref',
  'quote-match': 'Verse Quote',
  'title-mention': 'Song Title',
  'lyric-match': 'Song Lyric',
  'intent-trigger': 'Service Cue',
  'service-context': 'Service Context',
};

export function SuggestionTray({
  filterKind,
  bibles = [],
  activeBibleId,
  songs = [],
  savedTexts = [],
  onOperatorShow,
  onOperatorPreview,
}: SuggestionTrayProps) {
  const { style } = useApp() || {};
  const {
    settings,
    isListening,
    isPaused,
    level,
    activeAsrMode,
    activeEngineDetail,
    engineNotice,
    showRetryWhisper,
    retryWhisperEngine,
    transcript,
    clearTranscript,
    suggestions,
    markSuggestionActed,
    togglePinSuggestion,
  } = useVoice();

  const reduceMotion = Boolean(style?.reduceMotion);
  const latestSegments = transcript.slice(-3);
  const latestText =
    latestSegments.length > 0
      ? sanitizeTranscriptText(latestSegments[latestSegments.length - 1].text, 240)
      : '';

  const visibleSuggestions = useMemo(
    () => (filterKind ? suggestions.filter((s) => s.kind === filterKind) : suggestions).slice(0, 5),
    [suggestions, filterKind]
  );

  const handleOperatorAction = useCallback(
    (
      action: 'show' | 'preview' | 'dismiss',
      suggestion: Suggestion,
      gestureEvent: OperatorGestureEvent
    ) => {
      dispatchOperatorSuggestionAction(action, suggestion, gestureEvent, {
        onShow: (sug) => {
          const resolved = resolveSuggestionView(sug, {
            bibles,
            activeBibleId,
            defaultVersionId: settings.defaultVersionId,
            songs,
            savedTexts,
          });
          onOperatorShow(resolved);
          markSuggestionActed(sug.id, 'show');
        },
        onPreview: (sug) => {
          const resolved = resolveSuggestionView(sug, {
            bibles,
            activeBibleId,
            defaultVersionId: settings.defaultVersionId,
            songs,
            savedTexts,
          });
          onOperatorPreview(resolved);
          markSuggestionActed(sug.id, 'preview');
        },
        onDismiss: (id) => {
          markSuggestionActed(id, 'dismiss');
        },
      });
    },
    [
      activeBibleId,
      bibles,
      markSuggestionActed,
      onOperatorPreview,
      onOperatorShow,
      savedTexts,
      settings.defaultVersionId,
      songs,
    ]
  );

  // SG-7 Keyboard shortcuts: Alt+1..5 (Show), Shift+Alt+1..5 (Preview), Alt+D (Dismiss top card)
  useEffect(() => {
    if (visibleSuggestions.length === 0) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableElementFocused(e.target)) return;
      if (!e.altKey || e.ctrlKey || e.metaKey) return;

      if (!e.shiftKey && e.key.toLowerCase() === 'd') {
        const top = visibleSuggestions[0];
        if (!top) return;
        e.preventDefault();
        handleOperatorAction('dismiss', top, {
          type: 'keydown',
          key: e.key,
          altKey: true,
          shiftKey: false,
          isTrusted: e.isTrusted,
        });
        return;
      }

      const codeMatch = (e.code || '').match(/^Digit([1-5])$/);
      const keyMatch = (e.key || '').match(/^[1-5]$/);
      const idxStr = codeMatch ? codeMatch[1] : keyMatch ? keyMatch[0] : null;
      if (!idxStr) return;

      const cardIndex = parseInt(idxStr, 10) - 1;
      const targetCard = visibleSuggestions[cardIndex];
      if (!targetCard) return;

      e.preventDefault();
      handleOperatorAction(e.shiftKey ? 'preview' : 'show', targetCard, {
        type: 'keydown',
        key: e.key,
        altKey: true,
        shiftKey: e.shiftKey,
        isTrusted: e.isTrusted,
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleOperatorAction, visibleSuggestions]);

  if (!settings.enabled && visibleSuggestions.length === 0) {
    return null;
  }

  return (
    <section
      className="card col"
      role="region"
      aria-label="Suggested from voice"
      aria-live="polite"
      style={{
        gap: 10,
        padding: 12,
        borderColor: visibleSuggestions.length > 0 ? 'var(--gold)' : 'var(--border)',
        transition: reduceMotion ? 'none' : 'border-color 150ms ease',
      }}
    >
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Icon name="sparkle" size={16} className="gold" />
          <b style={{ fontSize: 13 }}>Suggested from voice</b>
          {settings.enabled && (
            <span
              className={`chip ${
                activeAsrMode === 'whisper'
                  ? 'ok'
                  : activeAsrMode === 'browser-bridge' ||
                      activeAsrMode === 'browser-fallback' ||
                      activeAsrMode === 'loading-whisper'
                    ? 'warn'
                    : ''
              }`}
              style={{ fontSize: 11 }}
            >
              {activeAsrMode === 'whisper'
                ? activeEngineDetail || 'Whisper (offline)'
                : activeAsrMode === 'loading-whisper'
                  ? 'Preparing voice model…'
                  : activeAsrMode === 'browser-bridge'
                    ? 'Temporary voice engine (download Whisper in Library)'
                    : activeAsrMode === 'browser-fallback'
                      ? 'Browser fallback engine'
                      : activeAsrMode === 'browser-backup'
                        ? activeEngineDetail || 'Browser backup engine'
                        : isListening && !isPaused
                          ? 'Listening'
                          : 'Voice paused'}
            </span>
          )}
        </div>

        <div className="row wrap" style={{ gap: 8, fontSize: 11 }}>
          {activeAsrMode === 'awaiting-model' && (
            <Link
              href="/app/library?tab=voice"
              className="btn btn-secondary btn-sm"
              style={{ minHeight: 26, padding: '2px 10px', fontSize: 11 }}
            >
              <Icon name="download" size={12} /> Download Whisper model
            </Link>
          )}
          <span className="muted">
            <span className="kbd">Alt+1…5</span> show · <span className="kbd">Shift+Alt+1…5</span> preview ·{' '}
            <span className="kbd">Alt+D</span> dismiss
          </span>
        </div>
      </div>

      {(activeAsrMode === 'browser-bridge' || activeAsrMode === 'browser-fallback' || showRetryWhisper) &&
        engineNotice && (
          <div className="banner warn" style={{ fontSize: 12, padding: '6px 10px' }}>
            <Icon name="alert" size={15} />
            <span className="grow">{engineNotice}</span>
            {showRetryWhisper && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ minHeight: 26, padding: '2px 10px', fontSize: 11 }}
                onClick={() => retryWhisperEngine()}
              >
                <Icon name="refresh" size={12} /> Retry Whisper
              </button>
            )}
          </div>
        )}

      {/* Always-visible Live Hearing Transcript Strip so the operator sees what the voice model is hearing in real time */}
      {settings.enabled && (
        <div
          className="row between wrap"
          style={{
            gap: 8,
            padding: '8px 10px',
            borderRadius: 'var(--r-ctl)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            fontSize: 12,
          }}
          aria-live="polite"
        >
          <div className="row" style={{ gap: 8, minWidth: 0, flex: 1 }}>
            <span
              className={`dot ${
                isListening && !isPaused
                  ? level.db > -42
                    ? 'ok pulse'
                    : 'gold'
                  : 'warn'
              }`}
            />
            <Icon name={isListening && !isPaused ? 'mic' : 'micoff'} size={14} className="gold" />
            <b style={{ flexShrink: 0 }}>Hearing:</b>
            <span
              style={{
                color: latestText ? 'var(--text)' : 'var(--text-2)',
                fontStyle: latestText ? 'normal' : 'italic',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {latestText
                ? `“${latestText}”`
                : isListening && !isPaused
                  ? level.db > -45
                    ? 'Capturing speech… transcribing utterance…'
                    : 'Listening for speech… speak into the microphone'
                  : 'Voice listening is paused (press Alt+L to resume)'}
            </span>
          </div>
          <div className="row" style={{ gap: 8, flexShrink: 0 }}>
            {isListening && !isPaused && (
              <span className="muted mono" style={{ fontSize: 11 }}>
                {level.db <= -55 ? 'Silent' : `${level.db.toFixed(0)} dB`}
              </span>
            )}
            {transcript.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ minHeight: 22, padding: '1px 6px', fontSize: 11 }}
                onClick={clearTranscript}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {visibleSuggestions.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {activeAsrMode === 'awaiting-model'
            ? activeEngineDetail
            : isListening && !isPaused
              ? filterKind === 'song'
                ? 'Listening for song titles ("Let\'s sing Amazing Grace") or consecutive lyric lines…'
                : filterKind === 'text'
                  ? 'Listening for service cues ("offering time", "welcome to church", "let us pray")…'
                  : 'Listening for spoken Scriptures ("Turn to Psalm 32"), verse quotes, songs, and service cues…'
              : 'Voice listening is paused. Press Alt+L to resume listening.'}
        </div>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {visibleSuggestions.map((sug, idx) => {
            const resolved = resolveSuggestionView(sug, {
              bibles,
              activeBibleId,
              defaultVersionId: settings.defaultVersionId,
              songs,
              savedTexts,
            });
            const shortcutNum = idx + 1;

            return (
              <div
                key={sug.id}
                className="card raised col"
                style={{
                  gap: 6,
                  padding: '10px 12px',
                  borderLeft: `3px solid ${sug.band === 'high' ? 'var(--gold)' : 'var(--blue)'}`,
                }}
              >
                <div className="row between wrap" style={{ gap: 8 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="kbd" title={`Press Alt+${shortcutNum} to Show`}>
                      Alt+{shortcutNum}
                    </span>
                    <Icon
                      name={sug.kind === 'song' ? 'music' : sug.kind === 'text' ? 'type' : 'book'}
                      size={15}
                      className="gold"
                    />
                    <b style={{ fontSize: 14 }}>
                      {resolved.title}
                      {resolved.label ? ` · ${resolved.label}` : ''}
                    </b>
                    {resolved.subtitle && (
                      <span className="chip" style={{ fontSize: 11 }}>
                        {resolved.subtitle}
                      </span>
                    )}
                    <span className="chip" style={{ fontSize: 10 }}>
                      {REASON_LABELS[sug.reason] || sug.reason}
                    </span>
                    <span
                      className={`chip ${sug.band === 'high' ? 'ok' : 'warn'}`}
                      style={{ fontSize: 11 }}
                    >
                      {sug.band === 'high' ? 'High' : 'Medium'} ({Math.round(sug.confidence * 100)}%)
                    </span>
                    {sug.heard && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        heard: &ldquo;{sug.heard}&rdquo;
                      </span>
                    )}
                  </div>

                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ minHeight: 30, padding: '4px 12px' }}
                      title={`Show live on screen (Alt+${shortcutNum})`}
                      onClick={(e) =>
                        handleOperatorAction('show', sug, {
                          type: 'click',
                          isTrusted: e.isTrusted,
                        })
                      }
                    >
                      <Icon name="play" size={13} /> Show
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ minHeight: 30, padding: '4px 10px' }}
                      title={`Load into preview only (Shift+Alt+${shortcutNum})`}
                      onClick={(e) =>
                        handleOperatorAction('preview', sug, {
                          type: 'click',
                          isTrusted: e.isTrusted,
                        })
                      }
                    >
                      <Icon name="eye" size={13} /> Preview
                    </button>
                    <button
                      type="button"
                      className={`iconbtn ${sug.pinned ? 'gold' : ''}`}
                      style={{ width: 30, height: 30 }}
                      aria-label={sug.pinned ? 'Unpin suggestion' : 'Pin suggestion (keep from expiring)'}
                      title={sug.pinned ? 'Pinned (will not expire)' : 'Pin card so it does not expire after 60 s'}
                      onClick={() => togglePinSuggestion(sug.id)}
                    >
                      <Icon name="pin" size={14} />
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      style={{ width: 30, height: 30 }}
                      aria-label="Dismiss suggestion"
                      title="Dismiss suggestion (2 min cooldown)"
                      onClick={(e) =>
                        handleOperatorAction('dismiss', sug, {
                          type: 'click',
                          isTrusted: e.isTrusted,
                        })
                      }
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                </div>

                <div
                  className="muted"
                  style={{
                    fontSize: 13,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {resolved.body}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
