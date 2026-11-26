'use client';

import React from 'react';
import Icon from '@/components/Icon';
import { useVoice } from '../VoiceContext';

export function ListeningIndicator() {
  const { settings, isListening, isPaused, togglePauseListening } = useVoice();

  if (!settings.enabled) return null;

  const active = isListening && !isPaused;

  return (
    <button
      type="button"
      onClick={togglePauseListening}
      className={`chip ${active ? 'ok' : 'warn'}`}
      style={{
        cursor: 'pointer',
        border: '1px solid var(--border)',
        gap: 6,
        padding: '5px 10px',
      }}
      title={
        active
          ? 'Listening on-device for scripture & cues. Click or press Alt+L to pause and release microphone.'
          : 'Voice listening is paused (microphone closed). Click or press Alt+L to resume.'
      }
      aria-label={
        active
          ? 'Voice listening active. Click to pause listening.'
          : 'Voice listening paused. Click to resume listening.'
      }
    >
      <span className={`dot ${active ? 'ok pulse' : 'warn'}`} />
      <Icon name={active ? 'mic' : 'micoff'} size={14} />
      <span>{active ? 'Listening' : 'Voice paused'}</span>
      <span className="muted mono" style={{ fontSize: 10, marginLeft: 2 }}>
        Alt+L
      </span>
    </button>
  );
}
