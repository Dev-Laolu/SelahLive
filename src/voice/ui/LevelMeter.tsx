'use client';

import React from 'react';
import type { LevelReading } from '../types';

export function LevelMeter({
  level,
  active,
}: {
  level: LevelReading;
  active: boolean;
}) {
  // Map dBFS (-60..0) to 0..100% width for a logarithmic broadcast meter feel
  const pct = active
    ? Math.max(0, Math.min(100, ((level.db + 60) / 60) * 100))
    : 0;

  const barColor = !active
    ? 'var(--border)'
    : level.clipping || level.db > -3
      ? 'var(--danger)'
      : level.db > -12
        ? 'var(--warn)'
        : 'var(--ok)';

  const statusLabel = !active
    ? 'Mic off'
    : level.clipping
      ? 'Clipping!'
      : level.db <= -55
        ? 'Silent'
        : `${level.db.toFixed(0)} dB`;

  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row between" style={{ fontSize: 12 }}>
        <span className="muted">Input signal level (16 kHz mono)</span>
        <span
          className="mono"
          style={{
            fontSize: 12,
            color: level.clipping ? 'var(--danger)' : 'var(--text-2)',
            fontWeight: level.clipping ? 700 : 500,
          }}
        >
          {statusLabel}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Microphone input level"
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={Math.round(level.db)}
        style={{
          height: 10,
          borderRadius: 999,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 999,
            transition: 'width 60ms linear, background-color 120ms ease',
          }}
        />
      </div>
    </div>
  );
}
