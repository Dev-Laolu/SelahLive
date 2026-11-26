'use client';

import React from 'react';
import Icon from '@/components/Icon';
import { useVoice } from '../../VoiceContext';
import type { VoiceHeaderSectionProps } from '../type';

export function VoiceHeaderSection({
  showPermissionIntro,
  onToggleEnabled,
  onConfirmPermission,
  onCancelPermission,
}: VoiceHeaderSectionProps) {
  const {
    settings,
    isListening,
    isPaused,
    activeEngineDetail,
    pauseListening,
    resumeListening,
  } = useVoice();

  const active = isListening && !isPaused;

  return (
    <>
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="col" style={{ gap: 2 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <Icon name="mic" size={18} className="gold" />
            <h3 style={{ margin: 0 }}>Voice Suggestions (v2.0)</h3>
            {settings.enabled ? (
              active ? (
                <span className="chip ok">
                  <span className="dot ok pulse" />
                  Listening
                </span>
              ) : (
                <span className="chip warn">
                  <span className="dot warn" />
                  Paused (Mic off)
                </span>
              )
            ) : (
              <span className="chip">Off</span>
            )}
            {settings.enabled && activeEngineDetail && (
              <span className="chip" style={{ fontSize: 11 }}>
                {activeEngineDetail}
              </span>
            )}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Listens on-device to suggest Bible verses. Nothing is ever displayed automatically—you always decide.
          </span>
        </div>

        <div className="row" style={{ gap: 10 }}>
          {settings.enabled && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => (active ? pauseListening() : resumeListening())}
            >
              <Icon name={active ? 'pause' : 'mic'} size={14} />
              {active ? 'Pause listening' : 'Resume listening'}
            </button>
          )}
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.enabled}
            aria-label="Enable Voice Suggestions"
            onClick={onToggleEnabled}
          />
        </div>
      </div>

      {showPermissionIntro && (
        <div
          className="card raised col"
          style={{ gap: 10, border: '1px solid var(--gold)', padding: 14 }}
        >
          <div className="row" style={{ gap: 8 }}>
            <Icon name="shield" size={18} className="gold" />
            <b>On-Device Audio Privacy Notice</b>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Selah Live processes microphone audio <b>locally on this computer</b> to suggest Bible verses and slides.
            Audio is never recorded, stored, or uploaded to our servers, and suggestions never go live on stream without your click or shortcut.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelPermission}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onConfirmPermission}>
              <Icon name="mic" size={15} />
              Allow microphone &amp; start listening
            </button>
          </div>
        </div>
      )}
    </>
  );
}
