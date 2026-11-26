'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import Select from '@/components/Select';
import { useApp } from '@/lib/store';
import type { WhisperModelId } from '../../asr/type';
import type { BiblePack } from '../../type';
import { useVoice } from '../../VoiceContext';

const WHISPER_MODEL_IDS: readonly WhisperModelId[] = ['tiny.en', 'base.en', 'small.en'];

export function VoiceEngineSection() {
  const { bibles = [] }: { bibles?: BiblePack[] | undefined } = useApp();
  const {
    settings,
    updateVoiceSettings,
    activeAsrMode,
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
    feedbackCounters,
    resetFeedbackCounters,
  } = useVoice();

  const bibleOptions =
    bibles.length > 0
      ? bibles.map((b) => ({ value: b.id, label: b.name, sub: b.code ?? '' }))
      : [{ value: '', label: 'Default installed Bible', sub: '' }];

  const selectedModelInstalled = Boolean(installedModels[settings.whisperModel]);
  const hasFeedbackStats =
    feedbackCounters.shownCount > 0 ||
    feedbackCounters.previewedCount > 0 ||
    feedbackCounters.dismissedCount > 0;

  return (
    <div
      className="col"
      style={{ gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}
    >
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="col" style={{ gap: 2 }}>
          <span className="label">Speech Recognition &amp; Engine Management</span>
          <span className="muted" style={{ fontSize: 11 }}>
            Recommended for this computer: <b className="gold">{recommendedModel}</b> —{' '}
            {recommendationReason}
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
          <Link
            href="/app/library?tab=voice"
            className="btn btn-secondary btn-sm"
            style={{ minHeight: 28, padding: '2px 10px', fontSize: 12 }}
          >
            <Icon name="download" size={13} /> Manage Voice Models in Library
          </Link>
        </div>
      </div>

      {(showRetryWhisper ||
        activeAsrMode === 'browser-fallback' ||
        activeAsrMode === 'browser-bridge') &&
        engineNotice && (
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
            <b>
              Speed check ({speedCheckResult.testedModelId} ·{' '}
              {speedCheckResult.backend.toUpperCase()}):
            </b>{' '}
            {speedCheckResult.inferenceMs} ms for 2.0 s audio (
            {speedCheckResult.rtf.toFixed(2)}× real-time). {speedCheckResult.summary}
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
          <span id="voice-engine-lbl" className="label">
            Speech engine (Whisper is primary)
          </span>
          <div className="seg" role="group" aria-labelledby="voice-engine-lbl">
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
          <span id="voice-model-lbl" className="label">Offline Whisper model</span>
          <div className="seg" role="group" aria-labelledby="voice-model-lbl">
            {WHISPER_MODEL_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={settings.whisperModel === id}
                onClick={() => updateVoiceSettings({ whisperModel: id })}
              >
                {id} {installedModels[id] ? '✓' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <span id="voice-sens-lbl" className="label">Suggestion sensitivity</span>
          <div className="seg" role="group" aria-labelledby="voice-sens-lbl">
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
          <label htmlFor="voice-default-bible">Default Bible version for voice suggestions</label>
          <Select
            id="voice-default-bible"
            ariaLabel="Default Bible version for suggestions"
            value={settings.defaultVersionId || bibleOptions[0]?.value || ''}
            onChange={(defaultVersionId: string) => updateVoiceSettings({ defaultVersionId })}
            options={bibleOptions}
          />
        </div>
      </div>

      <div className="row wrap" style={{ gap: 18 }}>
        <label htmlFor="voice-perf-mode" className="check" style={{ fontSize: 13 }}>
          <input
            id="voice-perf-mode"
            name="voicePerformanceMode"
            type="checkbox"
            checked={settings.performanceMode}
            onChange={(e) => updateVoiceSettings({ performanceMode: e.target.checked })}
          />
          <span>
            <b>Performance mode</b> (uses lighter model &amp; final-only decoding to keep CPU low while streaming)
          </span>
        </label>

        <label htmlFor="voice-show-transcript" className="check" style={{ fontSize: 13 }}>
          <input
            id="voice-show-transcript"
            name="voiceShowTranscript"
            type="checkbox"
            checked={settings.showTranscript}
            onChange={(e) => updateVoiceSettings({ showTranscript: e.target.checked })}
          />
          <span>Show collapsible live transcript panel on Overview &amp; Scripture</span>
        </label>

        <label htmlFor="voice-chime" className="check" style={{ fontSize: 13 }}>
          <input
            id="voice-chime"
            name="voiceChime"
            type="checkbox"
            checked={settings.chime}
            onChange={(e) => updateVoiceSettings({ chime: e.target.checked })}
          />
          <span>Play soft chime when a new suggestion arrives</span>
        </label>
      </div>

      <div className="card raised col" style={{ gap: 6, padding: 12, border: '1px solid var(--border)' }}>
        <label htmlFor="voice-allow-cloud" className="check" style={{ fontSize: 13 }}>
          <input
            id="voice-allow-cloud"
            name="voiceAllowCloudBrowserEngine"
            type="checkbox"
            checked={settings.allowCloudBrowserEngine}
            onChange={(e) => updateVoiceSettings({ allowCloudBrowserEngine: e.target.checked })}
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
        {hasFeedbackStats && (
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
    </div>
  );
}
