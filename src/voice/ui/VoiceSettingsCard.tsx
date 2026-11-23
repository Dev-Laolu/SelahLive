'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import Select from '@/components/Select';
import { useToast } from '@/components/Toast';
import { useApp } from '@/lib/store';
import { useVoice } from '../VoiceContext';
import { sanitizeTranscriptText } from '../suggestions/safety';
import { LevelMeter } from './LevelMeter';

/**
 * Settings -> Voice panel (Phase 1: Active Whisper primary engine, model selector, sensitivity,
 * cloud browser opt-in with explicit warning, transcript & chime toggles).
 */
export function VoiceSettingsCard() {
  const { bibles, savedTexts } = useApp();
  const toast = useToast();
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
    activeAsrMode,
    activeEngineDetail,
    engineNotice,
    showRetryWhisper,
    retryWhisperEngine,
    recommendedModel,
    recommendationReason,
    speedCheckResult,
    isRunningSpeedCheck,
    runFirstRunSpeedCheck,
    lastRtf,
    installedModels,
    modelError,
    transcript,
    clearTranscript,
    triggerRules,
    saveTriggerRule,
    deleteTriggerRule,
    feedbackCounters,
    resetFeedbackCounters,
  } = useVoice();

  const recentTranscriptText = transcript
    .slice(-3)
    .map((s) => sanitizeTranscriptText(s.text, 160))
    .filter(Boolean)
    .join(' · ');

  const [showPermissionIntro, setShowPermissionIntro] = useState(false);
  const [newTrgTextId, setNewTrgTextId] = useState('');
  const [newTrgPhrases, setNewTrgPhrases] = useState('');
  const [vocabInput, setVocabInput] = useState(
    (settings.customVocabulary || []).join(', ')
  );

  // Sync vocabulary input when IndexedDB voice settings finish loading
  useEffect(() => {
    setVocabInput((settings.customVocabulary || []).join(', '));
  }, [settings.customVocabulary]);

  const handleToggleEnabled = async () => {
    if (settings.enabled) {
      await disableVoice();
      setShowPermissionIntro(false);
    } else if (permissionState === 'unrequested') {
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

  const selectedModelInstalled = Boolean(installedModels[settings.whisperModel]);

  return (
    <div className="card col" id="voice-settings">
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="col" style={{ gap: 2 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <Icon name="mic" size={18} className="gold" />
            <h3 style={{ margin: 0 }}>Voice Suggestions (v2.0)</h3>
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

        {/* Always-visible Live Transcript Preview on Settings while Voice is enabled */}
        {settings.enabled && (
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
              <span
                className={`dot ${
                  isListening && !isPaused
                    ? level.db > -45
                      ? 'ok pulse'
                      : 'gold'
                    : 'warn'
                }`}
                style={{ marginTop: 4 }}
              />
              <b style={{ flexShrink: 0 }}>Live transcript:</b>
              <span
                style={{
                  color: recentTranscriptText ? 'var(--text)' : 'var(--text-2)',
                  fontStyle: recentTranscriptText ? 'normal' : 'italic',
                  wordBreak: 'break-word',
                }}
              >
                {recentTranscriptText
                  ? `“${recentTranscriptText}”`
                  : isListening && !isPaused
                    ? level.db > -45
                      ? 'Capturing speech… transcribing utterance…'
                      : 'Listening for speech… speak into the microphone'
                    : 'Voice listening is paused'}
              </span>
            </div>
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
        )}

        {modelError && (
          <div className="banner bad" style={{ fontSize: 12 }}>
            <Icon name="alertc" size={15} />
            <span className="grow">{modelError}</span>
          </div>
        )}
      </div>

      {/* Speech Engine, Whisper Model & Sensitivity Controls (ST-1, ST-2, ST-4, SG-1) */}
      <div
        className="col"
        style={{
          gap: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
        }}
      >
        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="col" style={{ gap: 2 }}>
            <span className="label">Speech Recognition &amp; Engine Management</span>
            <span className="muted" style={{ fontSize: 11 }}>
              Recommended for this computer: <b className="gold">{recommendedModel}</b> — {recommendationReason}
              {lastRtf != null && ` · Latest speed: ${lastRtf.toFixed(2)}× real-time`}
            </span>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {Object.keys(installedModels).length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ minHeight: 28, padding: '2px 10px', fontSize: 12 }}
                disabled={isRunningSpeedCheck}
                onClick={() => runFirstRunSpeedCheck()}
              >
                <Icon name="bolt" size={13} />
                {isRunningSpeedCheck ? 'Benchmarking…' : 'Speed check'}
              </button>
            )}
            <Link href="/app/library?tab=voice" className="btn btn-secondary btn-sm" style={{ minHeight: 28, padding: '2px 10px', fontSize: 12 }}>
              <Icon name="download" size={13} /> Manage Voice Models in Library
            </Link>
          </div>
        </div>

        {/* ST-8.3 Fallback notice + Retry Whisper button */}
        {(showRetryWhisper || activeAsrMode === 'browser-fallback' || activeAsrMode === 'browser-bridge') && engineNotice && (
          <div className="banner warn" style={{ fontSize: 12 }}>
            <Icon name="alert" size={16} />
            <span className="grow">{engineNotice}</span>
            {showRetryWhisper && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => retryWhisperEngine()}
              >
                <Icon name="refresh" size={13} /> Retry Whisper
              </button>
            )}
          </div>
        )}

        {speedCheckResult && (
          <div className="banner ok" style={{ fontSize: 12 }}>
            <Icon name="bolt" size={16} />
            <span className="grow">
              <b>Speed check ({speedCheckResult.testedModelId} · {speedCheckResult.backend.toUpperCase()}):</b>{' '}
              {speedCheckResult.inferenceMs} ms for 2.0 s audio ({speedCheckResult.rtf.toFixed(2)}× real-time).{' '}
              {speedCheckResult.summary}
            </span>
          </div>
        )}

        {!selectedModelInstalled && activeAsrMode !== 'browser-bridge' && (
          <div className="banner warn" style={{ fontSize: 12 }}>
            <Icon name="download" size={16} />
            <span className="grow">
              Offline Whisper model <b>{settings.whisperModel}</b> is not downloaded yet. Open Library → Voice models to download it once for offline use.
            </span>
            <Link href="/app/library?tab=voice" className="btn btn-primary btn-sm">
              Open Library
            </Link>
          </div>
        )}

        <div className="grid2">
          <div className="field">
            <label>Speech engine (Whisper is primary)</label>
            <div className="seg" role="group" aria-label="Speech engine">
              <button
                type="button"
                aria-pressed={settings.engine === 'auto'}
                onClick={() => updateVoiceSettings({ engine: 'auto' })}
              >
                Auto (recommended)
              </button>
              <button
                type="button"
                aria-pressed={settings.engine === 'whisper'}
                onClick={() => updateVoiceSettings({ engine: 'whisper' })}
              >
                Whisper (offline)
              </button>
              <button
                type="button"
                aria-pressed={settings.engine === 'browser'}
                onClick={() => updateVoiceSettings({ engine: 'browser' })}
              >
                Browser (backup)
              </button>
            </div>
          </div>

          <div className="field">
            <label>Offline Whisper model</label>
            <div className="seg" role="group" aria-label="Whisper model">
              <button
                type="button"
                aria-pressed={settings.whisperModel === 'tiny.en'}
                onClick={() => updateVoiceSettings({ whisperModel: 'tiny.en' })}
              >
                tiny.en {installedModels['tiny.en'] ? '✓' : ''}
              </button>
              <button
                type="button"
                aria-pressed={settings.whisperModel === 'base.en'}
                onClick={() => updateVoiceSettings({ whisperModel: 'base.en' })}
              >
                base.en {installedModels['base.en'] ? '✓' : ''}
              </button>
              <button
                type="button"
                aria-pressed={settings.whisperModel === 'small.en'}
                onClick={() => updateVoiceSettings({ whisperModel: 'small.en' })}
              >
                small.en {installedModels['small.en'] ? '✓' : ''}
              </button>
            </div>
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label>Suggestion sensitivity</label>
            <div className="seg" role="group" aria-label="Suggestion sensitivity">
              <button
                type="button"
                aria-pressed={settings.sensitivity === 'careful'}
                onClick={() => updateVoiceSettings({ sensitivity: 'careful' })}
              >
                Careful (≥ 85%)
              </button>
              <button
                type="button"
                aria-pressed={settings.sensitivity === 'balanced'}
                onClick={() => updateVoiceSettings({ sensitivity: 'balanced' })}
              >
                Balanced (≥ 70%)
              </button>
              <button
                type="button"
                aria-pressed={settings.sensitivity === 'eager'}
                onClick={() => updateVoiceSettings({ sensitivity: 'eager' })}
              >
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

        <div className="row wrap" style={{ gap: 18 }}>
          <label className="check" style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={settings.performanceMode}
              onChange={(e) => updateVoiceSettings({ performanceMode: e.target.checked })}
            />
            <span>
              <b>Performance mode</b> (uses lighter model &amp; final-only decoding to keep CPU low while streaming)
            </span>
          </label>

          <label className="check" style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={settings.showTranscript}
              onChange={(e) => updateVoiceSettings({ showTranscript: e.target.checked })}
            />
            <span>Show collapsible live transcript panel on Overview &amp; Scripture</span>
          </label>

          <label className="check" style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={settings.chime}
              onChange={(e) => updateVoiceSettings({ chime: e.target.checked })}
            />
            <span>Play soft chime when a new suggestion arrives</span>
          </label>
        </div>

        {/* Cloud browser recognition explicit opt-in with plain warning (ST-2 & PRD §8) */}
        <div
          className="card raised col"
          style={{ gap: 6, padding: 12, border: '1px solid var(--border)' }}
        >
          <label className="check" style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={settings.allowCloudBrowserEngine}
              onChange={(e) =>
                updateVoiceSettings({ allowCloudBrowserEngine: e.target.checked })
              }
            />
            <span>
              <b>Allow Cloud Browser Speech Recognition</b> (backup bridge before Whisper model is downloaded)
            </span>
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            Warning: When cloud browser recognition is used, audio is sent to your browser vendor (Google Chrome or Microsoft Edge) for transcription. Leave this off to keep 100% of audio on-device with Whisper.
          </span>
        </div>

        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            <b>Shortcuts:</b> <span className="kbd">Alt+1…5</span> Show suggestion ·{' '}
            <span className="kbd">Shift+Alt+1…5</span> Preview suggestion ·{' '}
            <span className="kbd">Alt+D</span> Dismiss top card ·{' '}
            <span className="kbd">Alt+L</span> Pause/resume listening.
          </div>
          {(feedbackCounters.shownCount > 0 ||
            feedbackCounters.previewedCount > 0 ||
            feedbackCounters.dismissedCount > 0) && (
            <div className="row wrap" style={{ gap: 8, fontSize: 11 }}>
              <span className="chip" style={{ fontSize: 11 }}>
                Local stats: <b>{feedbackCounters.shownCount}</b> shown ·{' '}
                <b>{feedbackCounters.previewedCount}</b> previewed ·{' '}
                <b>{feedbackCounters.dismissedCount}</b> dismissed
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
                onClick={() => resetFeedbackCounters()}
              >
                Reset stats
              </button>
            </div>
          )}
        </div>

        {/* MD-6 & ST-7: Custom Trigger Phrases & Custom Vocabulary Manager */}
        <div
          className="col"
          style={{
            gap: 10,
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
          }}
        >
          <span className="label">Intent Trigger Phrases &amp; Custom Vocabulary (MD-6 / ST-7)</span>
          <span className="muted" style={{ fontSize: 12 }}>
            Built-in triggers already match <b>Offering / Tithes</b>, <b>Welcome</b>, <b>Prayer</b>, <b>Announcements</b>, and <b>Thank You</b> slides by title or tag. Add your own trigger phrases below for any Saved Text.{' '}
            <i>Note: Whisper tiny.en and base.en are English-only models, so non-English phrases (such as Yoruba or Pidgin) have limited recognition accuracy in v2.0.</i>
          </span>

          {savedTexts && savedTexts.length > 0 && (
            <div className="card raised col" style={{ gap: 8, padding: 12 }}>
              <div className="grid2">
                <div className="field">
                  <label>Saved Text slide to suggest</label>
                  <Select
                    ariaLabel="Saved Text for trigger rule"
                    value={newTrgTextId || savedTexts[0]?.id || ''}
                    onChange={(val: string) => setNewTrgTextId(val)}
                    options={savedTexts.map((t: { id: string; title: string }) => ({
                      value: t.id,
                      label: t.title,
                    }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="voice-trg-phrases">Spoken trigger phrases (comma-separated)</label>
                  <div className="row" style={{ gap: 6 }}>
                    <input
                      id="voice-trg-phrases"
                      className="input grow"
                      placeholder="e.g. offering time, bring your seed, time to give"
                      value={newTrgPhrases}
                      onChange={(e) => setNewTrgPhrases(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={!newTrgPhrases.trim()}
                      onClick={async () => {
                        const targetId = newTrgTextId || savedTexts[0]?.id;
                        if (!targetId) return;
                        const phrases = newTrgPhrases
                          .split(',')
                          .map((p) => p.trim())
                          .filter(Boolean);
                        if (phrases.length === 0) return;
                        await saveTriggerRule({
                          savedTextId: targetId,
                          phrases,
                          enabled: true,
                        });
                        setNewTrgPhrases('');
                      }}
                    >
                      <Icon name="plus" size={14} /> Add Rule
                    </button>
                  </div>
                </div>
              </div>

              {triggerRules.length > 0 && (
                <div className="col" style={{ gap: 6, marginTop: 4 }}>
                  {triggerRules.map((rule) => {
                    const matchedSaved = savedTexts.find(
                      (t: { id: string; title: string }) => t.id === rule.savedTextId
                    );
                    return (
                      <div
                        key={rule.id}
                        className="row between wrap"
                        style={{
                          gap: 8,
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <b className="gold">{matchedSaved?.title || 'Saved Text'}</b>
                          <span className="muted"> → when pastor says: </span>
                          <span>{rule.phrases.map((p) => `"${p}"`).join(', ')}</span>
                        </div>
                        <button
                          type="button"
                          className="iconbtn"
                          style={{ width: 26, height: 26 }}
                          aria-label="Delete trigger rule"
                          onClick={() => deleteTriggerRule(rule.id)}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="voice-custom-vocab">
              Custom vocabulary (church name, pastor names, special terms — comma-separated)
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input
                id="voice-custom-vocab"
                className="input grow"
                placeholder="e.g. Selah Fellowship, Pastor Adeyemi, Shiloh"
                value={vocabInput}
                onChange={(e) => setVocabInput(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  const list = vocabInput
                    .split(',')
                    .map((w) => w.trim())
                    .filter(Boolean)
                    .slice(0, 100);
                  await updateVoiceSettings({ customVocabulary: list });
                  toast(`Saved ${list.length} custom vocabulary ${list.length === 1 ? 'term' : 'terms'}.`);
                }}
              >
                Save vocabulary
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
