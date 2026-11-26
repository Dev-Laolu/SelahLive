'use client';

import React from 'react';
import Icon from '@/components/Icon';
import Select from '@/components/Select';
import { useVoice } from '../../VoiceContext';
import { LevelMeter } from '../LevelMeter';
import { LiveHearingStrip } from '../LiveHearingStrip';
import type { VoiceAudioInputSectionProps } from '../type';

export function VoiceAudioInputSection({ onRequestMicTest }: VoiceAudioInputSectionProps) {
  const {
    settings,
    updateVoiceSettings,
    devices,
    refreshDevices,
    activeDevice,
    effectiveNoiseSuppression,
    permissionState,
    permissionError,
    isListening,
    isPaused,
    level,
    isTestingMic,
    micTestCountdown,
    micTestReport,
    clearMicTestReport,
    resumeListening,
    modelError,
  } = useVoice();

  const deviceOptions =
    devices.length > 0
      ? devices.map((d) => ({
          value: d.deviceId,
          label: d.label,
          sub: d.isLikelyInterface ? 'USB / Mixer' : 'Mic',
        }))
      : [{ value: 'default', label: 'System default microphone', sub: 'Default' }];

  const selectedDeviceValue =
    activeDevice?.deviceId || settings.deviceId || deviceOptions[0]?.value || 'default';

  const permissionHeading =
    permissionState === 'denied'
      ? 'Microphone permission denied'
      : permissionState === 'no-device'
        ? 'No audio input device detected'
        : permissionState === 'in-use'
          ? 'Audio device is in use by another app'
          : 'Audio input error';

  return (
    <>
      {permissionError && (
        <div className="banner bad">
          <Icon name="alertc" size={18} />
          <div className="col grow" style={{ gap: 2 }}>
            <b>{permissionHeading}</b>
            <span style={{ fontSize: 13 }}>{permissionError}</span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => resumeListening()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid2">
        <div className="field">
          <div className="row between">
            <label htmlFor="voice-device-pick">Microphone / USB Audio Interface</label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ minHeight: 24, padding: '2px 8px', fontSize: 12 }}
              onClick={() => refreshDevices()}
            >
              <Icon name="refresh" size={12} /> Refresh
            </button>
          </div>
          <Select
            id="voice-device-pick"
            ariaLabel="Audio input device"
            value={selectedDeviceValue}
            onChange={(deviceId: string) => updateVoiceSettings({ deviceId })}
            options={deviceOptions}
          />
          <span className="muted" style={{ fontSize: 11 }}>
            Saved only on this computer. A line feed from the sound desk or USB interface gives the best accuracy.
          </span>
        </div>

        <div className="field">
          <label htmlFor="voice-channel-pick">Input channel (multi-channel interfaces)</label>
          <Select
            id="voice-channel-pick"
            ariaLabel="Audio input channel"
            value={String(settings.channel ?? 'mix')}
            onChange={(val: string) =>
              updateVoiceSettings({
                channel: val === '1' ? 1 : val === '2' ? 2 : 'mix',
              })
            }
            options={[
              { value: 'mix', label: 'Mono mix (Channel 1 + 2)', sub: 'Default' },
              { value: '1', label: 'Channel 1 only (Left / Input 1)', sub: 'Ch 1' },
              { value: '2', label: 'Channel 2 only (Right / Input 2)', sub: 'Ch 2' },
            ]}
          />
          <span className="muted" style={{ fontSize: 11 }}>
            If the pastor&apos;s mic enters Channel 1 or 2 on a USB interface, pick that channel to isolate it.
          </span>
        </div>
      </div>

      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="col" style={{ gap: 2 }}>
          <span id="voice-ns-lbl" style={{ fontSize: 13, fontWeight: 600 }}>
            Noise suppression ({effectiveNoiseSuppression ? 'Active' : 'Off — raw feed'})
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            Auto turns noise suppression <b>off</b> for USB interfaces/mixers and <b>on</b> for built-in laptop mics. Echo cancellation and auto-gain are always off.
          </span>
        </div>
        <div className="seg" style={{ width: 240 }} role="group" aria-labelledby="voice-ns-lbl">
          <button
            type="button"
            aria-pressed={(settings.noiseSuppression ?? 'auto') === 'auto'}
            onClick={() => updateVoiceSettings({ noiseSuppression: 'auto' })}
          >
            Auto
          </button>
          <button
            type="button"
            aria-pressed={settings.noiseSuppression === 'on'}
            onClick={() => updateVoiceSettings({ noiseSuppression: 'on' })}
          >
            On
          </button>
          <button
            type="button"
            aria-pressed={settings.noiseSuppression === 'off'}
            onClick={() => updateVoiceSettings({ noiseSuppression: 'off' })}
          >
            Off
          </button>
        </div>
      </div>

      <div className="card raised col" style={{ gap: 10, padding: 14, background: 'var(--raised)' }}>
        <div className="row between wrap" style={{ gap: 10 }}>
          <div className="grow" style={{ minWidth: 220 }}>
            <LevelMeter level={level} active={(isListening && !isPaused) || isTestingMic} />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={isTestingMic}
            onClick={onRequestMicTest}
          >
            <Icon name="mic" size={15} />
            {isTestingMic ? `Testing mic… (${micTestCountdown}s)` : 'Test mic (3 s)'}
          </button>
        </div>

        {micTestReport && (
          <div
            className={`banner ${
              micTestReport.status === 'good'
                ? 'ok'
                : micTestReport.status === 'clipping'
                  ? 'bad'
                  : 'warn'
            }`}
            style={{ fontSize: 13 }}
          >
            <Icon name={micTestReport.status === 'good' ? 'checkc' : 'alertc'} size={16} />
            <div className="col grow" style={{ gap: 3 }}>
              <b>{micTestReport.summary}</b>
              {micTestReport.transcriptPreview && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {micTestReport.transcriptPreview}
                </span>
              )}
            </div>
            <button
              type="button"
              className="iconbtn"
              aria-label="Dismiss mic test report"
              onClick={clearMicTestReport}
              style={{ width: 28, height: 28 }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        <LiveHearingStrip label="Live transcript:" showDbReadout={false} />

        {modelError && (
          <div className="banner bad" style={{ fontSize: 12 }}>
            <Icon name="alertc" size={15} />
            <span className="grow">{modelError}</span>
          </div>
        )}
      </div>
    </>
  );
}
