'use client';

import React, { useState } from 'react';
import Icon from '@/components/Icon';
import Select from '@/components/Select';
import { useApp } from '@/lib/store';
import { useVoice } from '../VoiceContext';
import { LevelMeter } from './LevelMeter';

/**
 * Settings -> Voice panel (Phase 0: Audio foundation + disabled shells for Phase 1/2 engine, model, and sensitivity controls).
 * NOTE FOR DESIGN REVIEW: Flagged as a new v2 screen built strictly with existing `/design/` tokens and components.
 */
export function VoiceSettingsCard() {
  const { bibles } = useApp();
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
    enableAndStartListening,
    disableVoice,
    pauseListening,
    resumeListening,
    runMicTest,
  } = useVoice();

  const [showPermissionIntro, setShowPermissionIntro] = useState(false);

  const handleToggleEnabled = async () => {
    if (settings.enabled) {
      await disableVoice();
      setShowPermissionIntro(false);
    } else if (permissionState === 'unrequested') {
      // PRD §8: Ask for mic permission only after an explanation screen; never on first launch.
      setShowPermissionIntro(true);
    } else {
      await enableAndStartListening();
    }
  };

  const confirmPermissionAndEnable = async () => {
    setShowPermissionIntro(false);
    await enableAndStartListening();
  };

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

  const bibleOptions =
    bibles && bibles.length > 0
      ? bibles.map((b: { id: string; name: string; code?: string }) => ({
          value: b.id,
          label: b.name,
          sub: b.code || '',
        }))
      : [{ value: '', label: 'Default installed Bible', sub: '' }];

  return (
    <div className="card col" id="voice-settings">
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="col" style={{ gap: 2 }}>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="mic" size={18} className="gold" />
            <h3 style={{ margin: 0 }}>Voice Suggestions (v2 Audio Foundation)</h3>
            {settings.enabled ? (
              isListening && !isPaused ? (
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
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Listens on-device to suggest Bible verses, songs, and cues. Nothing is ever displayed automatically—you always decide.
          </span>
        </div>

        <div className="row" style={{ gap: 10 }}>
          {settings.enabled && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => (isListening && !isPaused ? pauseListening() : resumeListening())}
            >
              <Icon name={isListening && !isPaused ? 'pause' : 'mic'} size={14} />
              {isListening && !isPaused ? 'Pause listening' : 'Resume listening'}
            </button>
          )}
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.enabled}
            aria-label="Enable Voice Suggestions"
            onClick={handleToggleEnabled}
          />
        </div>
      </div>

      {/* PRD §8: Explanation screen before requesting browser microphone permission */}
      {showPermissionIntro && (
        <div
          className="card raised col"
          style={{
            gap: 10,
            border: '1px solid var(--gold)',
            padding: 14,
          }}
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
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowPermissionIntro(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={confirmPermissionAndEnable}
            >
              <Icon name="mic" size={15} />
              Allow microphone &amp; start listening
            </button>
          </div>
        </div>
      )}

      {/* Clear permission and hardware error banners (VA-2 & VA-4) */}
      {permissionError && (
        <div className="banner bad">
          <Icon name="alertc" size={18} />
          <div className="col grow" style={{ gap: 2 }}>
            <b>
              {permissionState === 'denied'
                ? 'Microphone permission denied'
                : permissionState === 'no-device'
                  ? 'No audio input device detected'
                  : permissionState === 'in-use'
                    ? 'Audio device is in use by another app'
                    : 'Audio input error'}
            </b>
            <span style={{ fontSize: 13 }}>{permissionError}</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => resumeListening()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Audio Input Controls (VA-1, VA-3, VA-5) */}
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
            value={String(settings.channel || 'mix')}
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

      {/* Raw Audio / Noise Suppression Control (VA-3) */}
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="col" style={{ gap: 2 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            Noise suppression ({effectiveNoiseSuppression ? 'Active' : 'Off — raw feed'})
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            Auto turns noise suppression <b>off</b> for USB interfaces/mixers and <b>on</b> for built-in laptop mics. Echo cancellation and auto-gain are always off.
          </span>
        </div>
        <div className="seg" style={{ width: 240 }} role="group" aria-label="Noise suppression mode">
          <button
            type="button"
            aria-pressed={(settings.noiseSuppression || 'auto') === 'auto'}
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

      {/* Live Level Meter + 3-second Test Mic (VA-2) */}
      <div
        className="card raised col"
        style={{ gap: 10, padding: 14, background: 'var(--raised)' }}
      >
        <div className="row between wrap" style={{ gap: 10 }}>
          <div className="grow" style={{ minWidth: 220 }}>
            <LevelMeter
              level={level}
              active={(isListening && !isPaused) || isTestingMic}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={isTestingMic}
            onClick={() => {
              if (permissionState === 'unrequested' && !settings.enabled) {
                setShowPermissionIntro(true);
              } else {
                runMicTest();
              }
            }}
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
            <Icon
              name={micTestReport.status === 'good' ? 'checkc' : 'alertc'}
              size={16}
            />
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
      </div>

      {/* Phase 1/2 Disabled Engine, Model & Sensitivity Shells (per Phase 0 scope instruction) */}
      <div
        className="col"
        style={{
          gap: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
          opacity: 0.72,
        }}
        aria-disabled="true"
      >
        <div className="row between wrap">
          <span className="label">Speech Recognition &amp; Matching (Activates in Phase 1)</span>
          <span className="chip" style={{ fontSize: 11 }}>
            Phase 1 Shell
          </span>
        </div>

        <div className="grid2">
          <div className="field">
            <label>Speech engine (Whisper primary)</label>
            <div className="seg" role="group" aria-label="Speech engine (disabled in Phase 0)">
              <button type="button" disabled aria-pressed={settings.engine === 'auto'}>
                Auto (recommended)
              </button>
              <button type="button" disabled aria-pressed={settings.engine === 'whisper'}>
                Whisper (offline)
              </button>
              <button type="button" disabled aria-pressed={settings.engine === 'browser'}>
                Browser (backup)
              </button>
            </div>
          </div>

          <div className="field">
            <label>Offline Whisper model</label>
            <div className="seg" role="group" aria-label="Whisper model (disabled in Phase 0)">
              <button type="button" disabled aria-pressed={settings.whisperModel === 'tiny.en'}>
                tiny.en
              </button>
              <button type="button" disabled aria-pressed={settings.whisperModel === 'base.en'}>
                base.en (default)
              </button>
              <button type="button" disabled aria-pressed={settings.whisperModel === 'small.en'}>
                small.en
              </button>
            </div>
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label>Suggestion sensitivity</label>
            <div className="seg" role="group" aria-label="Suggestion sensitivity (disabled in Phase 0)">
              <button type="button" disabled aria-pressed={settings.sensitivity === 'careful'}>
                Careful (≥ 85%)
              </button>
              <button type="button" disabled aria-pressed={settings.sensitivity === 'balanced'}>
                Balanced (≥ 70%)
              </button>
              <button type="button" disabled aria-pressed={settings.sensitivity === 'eager'}>
                Eager (≥ 55%)
              </button>
            </div>
          </div>

          <div className="field">
            <label>Default Bible version for voice suggestions</label>
            <Select
              ariaLabel="Default Bible version for suggestions"
              value={settings.defaultVersionId || bibleOptions[0]?.value || ''}
              onChange={(defaultVersionId: string) =>
                updateVoiceSettings({ defaultVersionId })
              }
              options={bibleOptions}
            />
          </div>
        </div>

        <div className="muted" style={{ fontSize: 12 }}>
          <b>Shortcut:</b> Press <span className="kbd">Alt+L</span> anywhere in the app (outside text boxes) to pause or resume listening and close the microphone immediately.
        </div>
      </div>
    </div>
  );
}
