'use client';

import React, { useCallback, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { BOOK_NAMES, getVerse } from '@/lib/bible';
import { useVoice, isEditableElementFocused } from '../VoiceContext';
import type { ScripturePayload, Suggestion, SuggestionKind } from '../types';
import {
  dispatchOperatorSuggestionAction,
  type OperatorGestureEvent,
} from '../suggestions/safety';

export interface ResolvedSuggestionView {
  title: string;
  subtitle: string;
  body: string;
  ref?: string;
  book?: number;
  chapter?: number;
  verse?: number;
}

export interface SuggestionTrayProps {
  /** Filter suggestions by kind (e.g. 'scripture' on Scripture screen, or undefined for all on Overview) */
  filterKind?: SuggestionKind;
  /** Installed Bible packs from AppProvider so ScripturePayload resolves to actual verse text */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bibles: any[];
  activeBibleId?: string;
  /** Invoked ONLY when the operator explicitly clicks Show or presses Alt+1..5 */
  onOperatorShow: (item: {
    kind: SuggestionKind;
    title: string;
    subtitle: string;
    body: string;
    ref?: string;
    book?: number;
    chapter?: number;
    verse?: number;
  }) => void;
  /** Invoked ONLY when the operator explicitly clicks Preview or presses Shift+Alt+1..5 */
  onOperatorPreview: (item: {
    kind: SuggestionKind;
    title: string;
    subtitle: string;
    body: string;
    ref?: string;
    book?: number;
    chapter?: number;
    verse?: number;
  }) => void;
}

/**
 * Resolves a Suggestion's payload against the user's installed Bible packs in IndexedDB.
 */
export function resolveScriptureSuggestion(
  suggestion: Suggestion,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bibles: any[],
  activeBibleId?: string,
  defaultVersionId?: string
): ResolvedSuggestionView {
  const p = suggestion.payload as ScripturePayload;
  const pack =
    bibles.find((b) => b.id === (p.versionId || defaultVersionId || activeBibleId)) ||
    bibles.find((b) => b.id === activeBibleId) ||
    bibles[0];

  const bookName = BOOK_NAMES[(p.book || 1) - 1] || 'Scripture';
  const vStart = p.verseStart || 1;
  const vEnd = p.verseEnd && p.verseEnd > vStart ? p.verseEnd : undefined;
  const refTitle = vEnd
    ? `${bookName} ${p.chapter}:${vStart}-${vEnd}`
    : `${bookName} ${p.chapter}:${vStart}`;

  if (!pack) {
    return {
      title: refTitle,
      subtitle: '',
      body: 'Download a Bible version in Library to load verse text.',
      ref: refTitle,
      book: p.book,
      chapter: p.chapter,
      verse: vStart,
    };
  }

  if (vEnd) {
    const parts: string[] = [];
    for (let v = vStart; v <= vEnd; v++) {
      const gv = getVerse(pack, p.book, p.chapter, v);
      if (gv?.text) {
        parts.push(`${v} ${gv.text}`);
      }
    }
    return {
      title: refTitle,
      subtitle: pack.code || pack.name || '',
      body: parts.join(' ') || `Open ${refTitle}`,
      ref: refTitle,
      book: p.book,
      chapter: p.chapter,
      verse: vStart,
    };
  }

  const gv = getVerse(pack, p.book, p.chapter, vStart);
  return {
    title: refTitle,
    subtitle: pack.code || pack.name || '',
    body: gv?.text || `Open ${refTitle}`,
    ref: refTitle,
    book: p.book,
    chapter: p.chapter,
    verse: vStart,
  };
}

/**
 * Suggestion Tray (SG-1 through SG-8).
 *
 * - Displays up to 5 suggestion cards with: icon, title (e.g. John 3:16), 1-2 line snippet,
 *   confidence chip (High/Medium), "heard: ..." excerpt, and Show / Preview / Pin / Dismiss buttons.
 * - Shortcuts (SG-7):
 *   - Alt+1..5 -> Show card N
 *   - Shift+Alt+1..5 -> Preview card N
 *   - Alt+D -> Dismiss top card
 * - Passes every Show/Preview action through `dispatchOperatorSuggestionAction` so no code path
 *   can ever display a suggestion without an explicit operator gesture (SG-3).
 */
export function SuggestionTray({
  filterKind,
  bibles,
  activeBibleId,
  onOperatorShow,
  onOperatorPreview,
}: SuggestionTrayProps) {
  const {
    settings,
    isListening,
    isPaused,
    activeAsrMode,
    activeEngineDetail,
    engineNotice,
    showRetryWhisper,
    retryWhisperEngine,
    suggestions,
    markSuggestionActed,
    togglePinSuggestion,
  } = useVoice();

  const visibleSuggestions = (
    filterKind ? suggestions.filter((s) => s.kind === filterKind) : suggestions
  ).slice(0, 5);

  const handleOperatorAction = useCallback(
    (
      action: 'show' | 'preview' | 'dismiss',
      suggestion: Suggestion,
      gestureEvent: OperatorGestureEvent
    ) => {
      dispatchOperatorSuggestionAction(action, suggestion, gestureEvent, {
        onShow: (sug) => {
          const resolved = resolveScriptureSuggestion(
            sug,
            bibles,
            activeBibleId,
            settings.defaultVersionId
          );
          onOperatorShow({
            kind: sug.kind,
            title: resolved.title,
            subtitle: resolved.subtitle,
            body: resolved.body,
            ref: resolved.ref,
            book: resolved.book,
            chapter: resolved.chapter,
            verse: resolved.verse,
          });
          markSuggestionActed(sug.id);
        },
        onPreview: (sug) => {
          const resolved = resolveScriptureSuggestion(
            sug,
            bibles,
            activeBibleId,
            settings.defaultVersionId
          );
          onOperatorPreview({
            kind: sug.kind,
            title: resolved.title,
            subtitle: resolved.subtitle,
            body: resolved.body,
            ref: resolved.ref,
            book: resolved.book,
            chapter: resolved.chapter,
            verse: resolved.verse,
          });
        },
        onDismiss: (id) => {
          markSuggestionActed(id);
        },
      });
    },
    [
      activeBibleId,
      bibles,
      markSuggestionActed,
      onOperatorPreview,
      onOperatorShow,
      settings.defaultVersionId,
    ]
  );

  // SG-7 Keyboard shortcuts: Alt+1..5 (Show), Shift+Alt+1..5 (Preview), Alt+D (Dismiss top card)
  useEffect(() => {
    if (visibleSuggestions.length === 0) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableElementFocused(e.target)) return;
      if (!e.altKey || e.ctrlKey || e.metaKey) return;

      // Alt+D: dismiss top card
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

      // Digit 1..5 (check e.code Digit1..Digit5 so Shift+Alt+1 works even when e.key is '!')
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
      aria-label="Suggested from voice"
      style={{
        gap: 10,
        padding: 12,
        borderColor: visibleSuggestions.length > 0 ? 'var(--gold)' : 'var(--border)',
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
                  : activeAsrMode === 'browser-bridge' || activeAsrMode === 'loading-whisper'
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
                    : activeAsrMode === 'browser-backup'
                      ? activeEngineDetail || 'Browser backup engine'
                      : isListening && !isPaused
                        ? 'Listening'
                        : 'Voice paused'}
            </span>
          )}
        </div>

        <div className="row wrap" style={{ gap: 8, fontSize: 11 }}>
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
          {activeAsrMode === 'awaiting-model' && (
            <Link href="/app/library?tab=voice" className="btn btn-secondary btn-sm" style={{ minHeight: 26, padding: '2px 10px', fontSize: 11 }}>
              <Icon name="download" size={12} /> Download Whisper model
            </Link>
          )}
          <span className="muted">
            <span className="kbd">Alt+1…5</span> show · <span className="kbd">Shift+Alt+1…5</span> preview ·{' '}
            <span className="kbd">Alt+D</span> dismiss
          </span>
        </div>
      </div>

      {(activeAsrMode === 'browser-bridge' || activeAsrMode === 'browser-fallback' || showRetryWhisper) && engineNotice && (
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

      {visibleSuggestions.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {activeAsrMode === 'awaiting-model'
            ? activeEngineDetail
            : isListening && !isPaused
              ? 'No active voice suggestions yet. When the pastor names a Scripture (e.g. "Turn to Psalm 32" or "Romans 8:28"), it appears here for one-click Show or Preview.'
              : 'Voice listening is paused. Press Alt+L to resume listening.'}
        </div>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {visibleSuggestions.map((sug, idx) => {
            const resolved = resolveScriptureSuggestion(
              sug,
              bibles,
              activeBibleId,
              settings.defaultVersionId
            );
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
                    <b style={{ fontSize: 14 }}>{resolved.title}</b>
                    {resolved.subtitle && (
                      <span className="chip" style={{ fontSize: 11 }}>
                        {resolved.subtitle}
                      </span>
                    )}
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
