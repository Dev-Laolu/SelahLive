'use client';

import React from 'react';
import Icon from '@/components/Icon';
import { REASON_LABELS } from '../constants';
import type { SuggestionCardProps } from './type';

export function SuggestionCard({
  suggestion,
  resolved,
  shortcutNumber,
  onAction,
  onTogglePin,
}: SuggestionCardProps) {
  const iconName =
    suggestion.kind === 'song' ? 'music' : suggestion.kind === 'text' ? 'type' : 'book';

  return (
    <div
      className="card raised col"
      style={{
        gap: 6,
        padding: '10px 12px',
        borderLeft: `3px solid ${suggestion.band === 'high' ? 'var(--gold)' : 'var(--blue)'}`,
      }}
    >
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="kbd" title={`Press Alt+${shortcutNumber} to Show`}>
            Alt+{shortcutNumber}
          </span>
          <Icon name={iconName} size={15} className="gold" />
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
            {REASON_LABELS[suggestion.reason] ?? suggestion.reason}
          </span>
          <span
            className={`chip ${suggestion.band === 'high' ? 'ok' : 'warn'}`}
            style={{ fontSize: 11 }}
          >
            {suggestion.band === 'high' ? 'High' : 'Medium'} (
            {Math.round(suggestion.confidence * 100)}%)
          </span>
          {suggestion.heard && (
            <span className="muted" style={{ fontSize: 12 }}>
              heard: &ldquo;{suggestion.heard}&rdquo;
            </span>
          )}
        </div>

        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ minHeight: 30, padding: '4px 12px' }}
            title={`Show live on screen (Alt+${shortcutNumber})`}
            onClick={(e) =>
              onAction('show', suggestion, { type: 'click', isTrusted: e.isTrusted })
            }
          >
            <Icon name="play" size={13} /> Show
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 30, padding: '4px 10px' }}
            title={`Load into preview only (Shift+Alt+${shortcutNumber})`}
            onClick={(e) =>
              onAction('preview', suggestion, { type: 'click', isTrusted: e.isTrusted })
            }
          >
            <Icon name="eye" size={13} /> Preview
          </button>
          <button
            type="button"
            className={`iconbtn ${suggestion.pinned ? 'gold' : ''}`}
            style={{ width: 30, height: 30 }}
            aria-label={suggestion.pinned ? 'Unpin suggestion' : 'Pin suggestion'}
            title={
              suggestion.pinned
                ? 'Pinned (will not expire)'
                : 'Pin card so it does not expire after 60 s'
            }
            onClick={() => onTogglePin(suggestion.id)}
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
              onAction('dismiss', suggestion, { type: 'click', isTrusted: e.isTrusted })
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
}
