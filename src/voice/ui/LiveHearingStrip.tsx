'use client';

import React from 'react';
import Icon from '@/components/Icon';
import { sanitizeTranscriptText } from '../suggestions/safety';
import { useVoice } from '../VoiceContext';
import type { LiveHearingStripProps } from './type';

export function LiveHearingStrip({
  label = 'Hearing:',
  showDbReadout = true,
}: LiveHearingStripProps) {
  const { settings, isListening, isPaused, level, transcript, clearTranscript } = useVoice();

  if (!settings.enabled) return null;

  const latestText = transcript
    .slice(-3)
    .map((s) => sanitizeTranscriptText(s.text, 160))
    .filter(Boolean)
    .join(' · ');

  const active = isListening && !isPaused;
  const dotClass = active ? (level.db > -45 ? 'ok pulse' : 'gold') : 'warn';

  return (
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
      <div className="row" style={{ gap: 8, minWidth: 0, flex: 1, alignItems: 'flex-start' }}>
        <span className={`dot ${dotClass}`} style={{ marginTop: 4 }} />
        {showDbReadout && (
          <Icon name={active ? 'mic' : 'micoff'} size={14} className="gold" />
        )}
        <b style={{ flexShrink: 0 }}>{label}</b>
        <span
          style={{
            color: latestText ? 'var(--text)' : 'var(--text-2)',
            fontStyle: latestText ? 'normal' : 'italic',
            wordBreak: 'break-word',
          }}
        >
          {latestText
            ? `“${latestText}”`
            : active
              ? level.db > -45
                ? 'Capturing speech… transcribing utterance…'
                : 'Listening for speech… speak into the microphone'
              : 'Voice listening is paused (press Alt+L to resume)'}
        </span>
      </div>

      <div className="row" style={{ gap: 8, flexShrink: 0 }}>
        {showDbReadout && active && (
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
  );
}
