'use client';

import React, { useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { useVoice } from '../VoiceContext';
import { parseSpokenReferences } from '../detectors/spokenReferenceParser';
import { sanitizeTranscriptText } from '../suggestions/safety';

/**
 * Collapsible Live Transcript Panel (TR-1, TR-2 & PRD §8).
 * - Kept in memory only (last ~5 minutes), never saved or synced.
 * - Renders strictly as escaped plain text (never innerHTML) with detected scripture references highlighted as spans.
 */
export function TranscriptPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { settings, isListening, isPaused, activeEngineDetail, transcript, clearTranscript } =
    useVoice();
  const [open, setOpen] = useState(defaultOpen);

  const visibleSegments = useMemo(() => transcript.slice(-18), [transcript]);

  if (!settings.enabled && transcript.length === 0) return null;

  return (
    <div className="card col" style={{ gap: 10, padding: 12 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ padding: '4px 8px', gap: 8 }}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={`dot ${isListening && !isPaused ? 'ok pulse' : 'warn'}`} />
          <Icon name="mic" size={15} className="gold" />
          <b>Live Voice Transcript</b>
          <span className="muted" style={{ fontSize: 12 }}>
            ({transcript.length} {transcript.length === 1 ? 'utterance' : 'utterances'} · in-memory only)
          </span>
          <Icon name="down" size={14} />
        </button>

        <div className="row" style={{ gap: 8 }}>
          {activeEngineDetail && (
            <span className="muted mono" style={{ fontSize: 11 }}>
              {activeEngineDetail}
            </span>
          )}
          {transcript.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ minHeight: 28, padding: '2px 8px', fontSize: 12 }}
              onClick={clearTranscript}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          className="col"
          style={{
            gap: 6,
            maxHeight: 180,
            overflowY: 'auto',
            padding: 10,
            borderRadius: 'var(--r-ctl)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            fontSize: 13,
          }}
          aria-live="polite"
        >
          {visibleSegments.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              {isListening && !isPaused
                ? 'Listening for speech… Speak into your microphone (for example: "Turn with me to Psalm thirty-two verse one").'
                : 'Voice listening is paused. Press Alt+L or Resume listening to transcribe speech.'}
            </div>
          ) : (
            visibleSegments.map((seg) => {
              const safeText = sanitizeTranscriptText(seg.text, 360);
              const detected = parseSpokenReferences(safeText);
              const timeStr = new Date(seg.endMs).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });
              return (
                <div
                  key={seg.id}
                  className="row wrap"
                  style={{
                    gap: 8,
                    alignItems: 'baseline',
                    opacity: seg.isFinal ? 1 : 0.75,
                  }}
                >
                  <span className="muted mono" style={{ fontSize: 11 }}>
                    {timeStr}
                  </span>
                  <span style={{ flex: 1, minWidth: 180 }}>{safeText}</span>
                  {detected.map((d) => (
                    <span key={d.canonicalRef} className="chip gold" style={{ fontSize: 11 }}>
                      <Icon name="book" size={12} />
                      {d.canonicalRef}
                    </span>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
