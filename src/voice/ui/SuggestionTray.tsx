'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import {
  resolveScriptureSuggestion,
  resolveSuggestionView,
} from '../suggestions/resolver';
import { dispatchOperatorSuggestionAction } from '../suggestions/safety';
import type { OperatorGestureEvent, ResolvedSuggestionView } from '../suggestions/type';
import type { ActiveAsrMode, Suggestion, SuggestionActionType, SuggestionKind } from '../type';
import { isEditableElementFocused, useVoice } from '../VoiceContext';
import { LiveHearingStrip } from './LiveHearingStrip';
import { SuggestionCard } from './SuggestionCard';
import type { SuggestionTrayProps } from './type';

export { resolveScriptureSuggestion, resolveSuggestionView };
export type { ResolvedSuggestionView };

function getStatusChipLabel(
  mode: ActiveAsrMode,
  detail: string,
  isListening: boolean,
  isPaused: boolean
): string {
  switch (mode) {
    case 'whisper':
      return detail || 'Whisper (offline)';
    case 'loading-whisper':
      return 'Preparing voice model…';
    case 'browser-bridge':
      return 'Temporary voice engine (download Whisper in Library)';
    case 'browser-fallback':
      return 'Browser fallback engine';
    case 'browser-backup':
      return detail || 'Browser backup engine';
    default:
      return isListening && !isPaused ? 'Listening' : 'Voice paused';
  }
}

function getEmptyHintText(
  mode: ActiveAsrMode,
  detail: string,
  active: boolean,
  filterKind?: SuggestionKind
): string {
  if (mode === 'awaiting-model') return detail;
  if (!active) return 'Voice listening is paused. Press Alt+L to resume listening.';
  if (filterKind === 'song') {
    return 'Listening for song titles ("Let\'s sing Amazing Grace") or consecutive lyric lines…';
  }
  if (filterKind === 'text') {
    return 'Listening for service cues ("offering time", "welcome to church", "let us pray")…';
  }
  return 'Listening for spoken Scriptures ("Turn to Psalm 32"), verse quotes, songs, and service cues…';
}

export function SuggestionTray({
  filterKind,
  bibles = [],
  activeBibleId,
  songs = [],
  savedTexts = [],
  onOperatorShow,
  onOperatorPreview,
}: SuggestionTrayProps) {
  const { style } = useApp() ?? {};
  const {
    settings,
    isListening,
    isPaused,
    activeAsrMode,
    activeEngineDetail,
    engineNotice,
    modelError,
    showRetryWhisper,
    retryWhisperEngine,
    suggestions,
    markSuggestionActed,
    togglePinSuggestion,
  } = useVoice();

  const reduceMotion = Boolean(style?.reduceMotion);
  const visibleSuggestions = useMemo(
    () => (filterKind ? suggestions.filter((s) => s.kind === filterKind) : suggestions).slice(0, 5),
    [suggestions, filterKind]
  );

  const handleOperatorAction = useCallback(
    (action: SuggestionActionType, suggestion: Suggestion, gesture: OperatorGestureEvent) => {
      const resolveOpts = {
        bibles,
        activeBibleId,
        defaultVersionId: settings.defaultVersionId,
        songs,
        savedTexts,
      };
      dispatchOperatorSuggestionAction(action, suggestion, gesture, {
        onShow: (sug) => {
          onOperatorShow(resolveSuggestionView(sug, resolveOpts));
          markSuggestionActed(sug.id, 'show');
        },
        onPreview: (sug) => {
          onOperatorPreview(resolveSuggestionView(sug, resolveOpts));
          markSuggestionActed(sug.id, 'preview');
        },
        onDismiss: (id) => markSuggestionActed(id, 'dismiss'),
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
      const idxStr = codeMatch?.[1] ?? keyMatch?.[0] ?? null;
      if (!idxStr) return;

      const targetCard = visibleSuggestions[parseInt(idxStr, 10) - 1];
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

  const chipTone =
    activeAsrMode === 'whisper'
      ? 'ok'
      : activeAsrMode === 'browser-bridge' ||
        activeAsrMode === 'browser-fallback' ||
        activeAsrMode === 'loading-whisper'
        ? 'warn'
        : '';

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
            <span className={`chip ${chipTone}`} style={{ fontSize: 11 }}>
              {getStatusChipLabel(activeAsrMode, activeEngineDetail, isListening, isPaused)}
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
            <span className="kbd">Alt+1…5</span> show ·{' '}
            <span className="kbd">Shift+Alt+1…5</span> preview ·{' '}
            <span className="kbd">Alt+D</span> dismiss
          </span>
        </div>
      </div>

      {(activeAsrMode === 'browser-bridge' ||
        activeAsrMode === 'browser-fallback' ||
        showRetryWhisper) &&
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

      {modelError && (
        <div className="banner bad" style={{ fontSize: 12, padding: '6px 10px' }}>
          <Icon name="alertc" size={15} />
          <span className="grow">{modelError}</span>
        </div>
      )}

      <LiveHearingStrip label="Hearing:" showDbReadout />

      {visibleSuggestions.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {getEmptyHintText(
            activeAsrMode,
            activeEngineDetail,
            isListening && !isPaused,
            filterKind
          )}
        </div>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {visibleSuggestions.map((sug, idx) => (
            <SuggestionCard
              key={sug.id}
              suggestion={sug}
              resolved={resolveSuggestionView(sug, {
                bibles,
                activeBibleId,
                defaultVersionId: settings.defaultVersionId,
                songs,
                savedTexts,
              })}
              shortcutNumber={idx + 1}
              onAction={handleOperatorAction}
              onTogglePin={togglePinSuggestion}
            />
          ))}
        </div>
      )}
    </section>
  );
}
