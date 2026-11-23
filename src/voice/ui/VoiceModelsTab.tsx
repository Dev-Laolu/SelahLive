'use client';

import React from 'react';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { useVoice } from '../VoiceContext';
import { formatBytes, type WhisperModelId } from '../asr/voiceModels';

/**
 * Library -> Voice models tab (ST-4 & PRD §6).
 * NOTE FOR DESIGN REVIEW: New v2 tab inside `/app/library` built strictly with existing `/design/` tokens and `.libwide` / `.card` layout.
 */
export function VoiceModelsTab() {
  const { online } = useApp();
  const toast = useToast();
  const {
    settings,
    updateVoiceSettings,
    hardwareProfile,
    recommendedModel,
    recommendationReason,
    speedCheckResult,
    isRunningSpeedCheck,
    runFirstRunSpeedCheck,
    modelCatalog,
    installedModels,
    probedModelSizes,
    modelDownloadProgress,
    modelError,
    downloadVoiceModel,
    removeVoiceModel,
  } = useVoice();

  const handleDownload = async (modelId: WhisperModelId, name: string) => {
    const ok = await downloadVoiceModel(modelId);
    if (ok) {
      await updateVoiceSettings({ whisperModel: modelId });
      toast(`${name} downloaded and cached for offline voice suggestions.`);
    } else {
      toast(`Could not download ${name}. Check your internet connection.`);
    }
  };

  const handleRemove = async (modelId: WhisperModelId, name: string) => {
    await removeVoiceModel(modelId);
    toast(`Removed ${name} from offline browser cache.`);
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card raised col" style={{ gap: 6, padding: 14 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="mic" size={18} className="gold" />
            <b>Offline Whisper Voice Models (Hugging Face CDN)</b>
          </div>
          <span className="chip ok">100% On-Device · Free</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Download a voice model once while online. After downloading, Selah Live transcribes the pastor&apos;s microphone{' '}
          <b>entirely offline on this computer</b> (using WebGPU or WASM inside a background Web Worker) and suggests Scriptures without ever sending audio to the internet.
        </p>
        <div className="row between wrap" style={{ gap: 8, marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12 }}>
          <div>
            <b>Recommended for this computer:</b>{' '}
            <span className="gold">{recommendedModel}</span>{' '}
            <span className="muted">
              ({hardwareProfile.deviceMemoryGb} GB RAM · {hardwareProfile.hardwareConcurrency} threads ·{' '}
              {hardwareProfile.hasWebGpu ? 'WebGPU ready' : 'WASM CPU'})
            </span>
            <div className="muted" style={{ fontSize: 11 }}>{recommendationReason}</div>
          </div>
          {Object.keys(installedModels).length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isRunningSpeedCheck}
              onClick={async () => {
                const res = await runFirstRunSpeedCheck();
                if (res) {
                  toast(`Speed check: ${res.rtf.toFixed(2)}× real-time (${res.inferenceMs} ms for 2 s clip). Recommended: ${res.recommendedModel}`);
                }
              }}
            >
              <Icon name="bolt" size={14} />
              {isRunningSpeedCheck ? 'Running speed check…' : 'Run speed check (ST-9)'}
            </button>
          )}
        </div>
      </div>

      {modelError && (
        <div className="banner bad">
          <Icon name="alertc" size={18} />
          <span className="grow">{modelError}</span>
        </div>
      )}

      <div className="col" style={{ gap: 8 }}>
        {modelCatalog.map((m) => {
          const installed = installedModels[m.id];
          const pct = modelDownloadProgress[m.id];
          const sizeInfo = probedModelSizes[m.id];
          const displayBytes = installed?.sizeBytes || sizeInfo?.sizeBytes || m.fallbackSizeBytes;
          const isSelectedDefault = settings.whisperModel === m.id;

          return (
            <div key={m.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="libwide" style={{ alignItems: 'center' }}>
                <div className="col" style={{ gap: 3 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <b>{m.name}</b>
                    <span className="chip" style={{ fontSize: 11 }}>
                      {m.badge}
                    </span>
                    {isSelectedDefault && (
                      <span className="chip gold" style={{ fontSize: 11 }}>
                        Active model
                      </span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {m.description}
                  </div>
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    Source: {m.hfRepo} (Quantised ONNX)
                    {installed ? ` · Ready (${installed.backend.toUpperCase()})` : ''}
                  </div>
                </div>

                <span className="muted mono" title={sizeInfo?.isExact ? 'Exact size from Hugging Face Hub' : 'Estimated quantised download size'}>
                  { sizeInfo?.isExact ? '' : '~' }{formatBytes(displayBytes)}
                </span>

                <span className="muted mono">{m.recommendedRamGb} GB+ RAM</span>

                <span className={`chip ${installed ? 'ok' : pct != null ? 'warn' : ''}`}>
                  {installed
                    ? 'Cached offline'
                    : pct != null
                      ? `Downloading ${Math.round(pct * 100)}%`
                      : 'Not downloaded'}
                </span>

                <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                  {!installed ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={pct != null || !online}
                      onClick={() => handleDownload(m.id, m.name)}
                    >
                      <Icon name="download" size={14} />
                      {pct != null ? `${Math.round(pct * 100)}%` : `Download (${formatBytes(displayBytes)})`}
                    </button>
                  ) : (
                    <>
                      {!isSelectedDefault && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            updateVoiceSettings({ whisperModel: m.id });
                            toast(`Switched active Whisper model to ${m.name}.`);
                          }}
                        >
                          Use model
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label={`Remove ${m.name}`}
                        title={`Remove ${m.name} from browser cache`}
                        onClick={() => handleRemove(m.id, m.name)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {pct != null && (
                <div className="progress">
                  <i style={{ width: `${Math.max(3, Math.round(pct * 100))}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
