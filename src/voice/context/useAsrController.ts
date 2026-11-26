import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BrowserSpeechEngine,
  isBrowserSpeechRecognitionSupported,
  supportsProcessLocally,
} from '../asr/browserSpeechEngine';
import { RtfMonitor, selectActiveAsrEngine } from '../asr/engineManager';
import type { SpeedCheckResult, WhisperModelId } from '../asr/type';
import {
  getCatalogEntry,
  markVoiceModelInstalled,
  removeInstalledVoiceModel,
} from '../asr/voiceModels';
import type { ActiveAsrMode, VoiceSettings } from '../type';
import { VoiceWorkerClient } from '../workers/workerClient';
import { runWorkerSpeedBenchmark } from './speedBenchmark';
import { readSetting, writeSetting } from './storage';
import type { UseAsrControllerParams, UseAsrControllerResult } from './type';

export function useAsrController({
  settingsRef,
  setSettings,
  hardwareProfileRef,
  installedModelsRef,
  setInstalledModels,
  probedModelSizes,
  setSpeedCheckResult,
  isListeningRef,
  isPausedRef,
  onSegment,
}: UseAsrControllerParams): UseAsrControllerResult {
  const [activeAsrMode, setActiveAsrMode] = useState<ActiveAsrMode>('idle');
  const [activeEngineDetail, setActiveEngineDetail] = useState('');
  const [engineNotice, setEngineNotice] = useState('');
  const [showRetryWhisper, setShowRetryWhisper] = useState(false);
  const [isRunningSpeedCheck, setIsRunningSpeedCheck] = useState(false);
  const [lastRtf, setLastRtf] = useState<number | null>(null);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<
    Partial<Record<WhisperModelId, number>>
  >({});
  const [modelError, setModelError] = useState('');

  const workerRef = useRef<VoiceWorkerClient | null>(null);
  const browserEngineRef = useRef<BrowserSpeechEngine | null>(null);
  const whisperFailedModelsRef = useRef<Set<WhisperModelId>>(new Set());
  const whisperSlowModelsRef = useRef<Set<WhisperModelId>>(new Set());
  const rtfMonitorRef = useRef<RtfMonitor>(new RtfMonitor());
  const progressRef = useRef<Partial<Record<WhisperModelId, number>>>({});
  const startAsrRef = useRef<((cfg: VoiceSettings) => Promise<void>) | null>(null);

  useEffect(() => { progressRef.current = modelDownloadProgress; }, [modelDownloadProgress]);

  const clearModelProgress = useCallback((modelId: WhisperModelId) => {
    setModelDownloadProgress((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  }, []);

  const ensureWorker = useCallback((): VoiceWorkerClient => {
    if (!workerRef.current) {
      const client = new VoiceWorkerClient();
      client.setCallbacks({
        onTranscriptSegment: onSegment,
        onRtfMetric: (metric) => {
          setLastRtf(metric.rtf);
          const check = rtfMonitorRef.current.recordUtterance(
            metric.audioDurationMs,
            metric.inferenceMs
          );
          if (check.isSustainedSlow && metric.modelId) {
            whisperSlowModelsRef.current.add(metric.modelId);
            rtfMonitorRef.current.reset();
            if (isListeningRef.current && !isPausedRef.current) {
              startAsrRef.current?.(settingsRef.current);
            }
          }
        },
        onModelProgress: (ev) =>
          setModelDownloadProgress((prev) => ({ ...prev, [ev.modelId]: ev.progress })),
        onModelReady: async (info) => {
          setModelError('');
          clearModelProgress(info.modelId);
          setActiveAsrMode('whisper');
          setActiveEngineDetail(`Whisper ${info.modelId} (${info.backend.toUpperCase()})`);
          if (browserEngineRef.current) {
            await browserEngineRef.current.destroy();
            browserEngineRef.current = null;
          }
        },
        onModelError: (info) => {
          clearModelProgress(info.modelId);
          setModelError(info.error);
          whisperFailedModelsRef.current.add(info.modelId);
          if (isListeningRef.current && !isPausedRef.current) {
            startAsrRef.current?.(settingsRef.current);
          }
        },
        onDecodeError: (info) => setModelError(info.error),
      });
      client.start();
      client.setPerformanceMode(Boolean(settingsRef.current.performanceMode));
      workerRef.current = client;
    }
    return workerRef.current;
  }, [clearModelProgress, isListeningRef, isPausedRef, onSegment, settingsRef]);

  const resetModelFailures = useCallback(() => {
    whisperFailedModelsRef.current.clear();
    whisperSlowModelsRef.current.clear();
    rtfMonitorRef.current.reset();
  }, []);

  const stopAsrEngines = useCallback(async (terminateWorker = false) => {
    if (browserEngineRef.current) {
      await browserEngineRef.current.destroy();
      browserEngineRef.current = null;
    }
    if (terminateWorker && workerRef.current) {
      workerRef.current.stop();
      workerRef.current = null;
    }
  }, []);

  const runFirstRunSpeedCheck = useCallback(
    async (modelId?: WhisperModelId): Promise<SpeedCheckResult | null> => {
      const targetModel = modelId || settingsRef.current.whisperModel || 'base.en';
      setIsRunningSpeedCheck(true);
      try {
        const result = await runWorkerSpeedBenchmark(
          ensureWorker(),
          targetModel,
          hardwareProfileRef.current
        );
        setSpeedCheckResult(result);
        setLastRtf(result.rtf);
        await writeSetting('voiceSpeedCheck', result);

        if (
          result.testedModelId === 'base.en' &&
          result.rtf > 0.9 &&
          result.recommendedModel === 'tiny.en'
        ) {
          const next = { ...settingsRef.current, whisperModel: 'tiny.en' as const };
          setSettings(next);
          settingsRef.current = next;
          await writeSetting('voice', next);
        }
        setIsRunningSpeedCheck(false);
        return result;
      } catch (err) {
        setModelError((err as { message?: string })?.message || 'Speed check failed.');
        setIsRunningSpeedCheck(false);
        return null;
      }
    },
    [ensureWorker, hardwareProfileRef, setSettings, setSpeedCheckResult, settingsRef]
  );

  const startAsrForSettings = useCallback(
    async (cfg: VoiceSettings) => {
      const client = ensureWorker();
      client.setPerformanceMode(Boolean(cfg.performanceMode));
      client.resume();

      const buildDecision = () =>
        selectActiveAsrEngine({
          preferredEngine: cfg.engine,
          preferredWhisperModel: cfg.whisperModel || 'base.en',
          performanceMode: Boolean(cfg.performanceMode),
          installedModels: Object.keys(installedModelsRef.current) as WhisperModelId[],
          whisperFailedModels: Array.from(whisperFailedModelsRef.current),
          whisperSlowModels: Array.from(whisperSlowModelsRef.current),
          browserSupported: isBrowserSpeechRecognitionSupported(),
          browserProcessLocally: supportsProcessLocally(),
          allowCloudBrowserEngine: Boolean(cfg.allowCloudBrowserEngine),
          isDownloadingWhisper: Object.keys(progressRef.current).length > 0,
        });

      let decision = buildDecision();
      setEngineNotice(decision.notice);
      setShowRetryWhisper(decision.showRetryWhisper);

      if (decision.targetEngine === 'whisper' && decision.targetWhisperModel) {
        const targetModel = decision.targetWhisperModel;
        setActiveAsrMode('loading-whisper');
        setActiveEngineDetail(`Loading Whisper ${targetModel}…`);
        try {
          await client.downloadOrLoadModel(targetModel, getCatalogEntry(targetModel).hfRepo);
          return;
        } catch {
          whisperFailedModelsRef.current.add(targetModel);
          decision = buildDecision();
          setEngineNotice(decision.notice);
          setShowRetryWhisper(decision.showRetryWhisper);
          if (decision.targetEngine !== 'browser') {
            setActiveAsrMode('unavailable');
            setActiveEngineDetail(decision.notice);
            return;
          }
        }
      }

      if (decision.targetEngine === 'browser') {
        if (!browserEngineRef.current) browserEngineRef.current = new BrowserSpeechEngine();
        const mode: ActiveAsrMode =
          decision.mode === 'browser-bridge'
            ? 'browser-bridge'
            : decision.mode === 'browser-fallback'
              ? 'browser-fallback'
              : 'browser-backup';
        setActiveAsrMode(mode);
        setActiveEngineDetail(decision.notice);

        await browserEngineRef.current.init(cfg, {
          onSegment,
          onStatusChange: (_st, detail) => {
            if (detail && mode === 'browser-backup') setActiveEngineDetail(detail);
          },
          onError: setModelError,
        });
        return;
      }

      await stopAsrEngines(false);
      setActiveAsrMode(decision.mode === 'awaiting-model' ? 'awaiting-model' : 'unavailable');
      setActiveEngineDetail(decision.notice);
    },
    [ensureWorker, installedModelsRef, onSegment, stopAsrEngines]
  );

  useEffect(() => { startAsrRef.current = startAsrForSettings; }, [startAsrForSettings]);

  const downloadVoiceModel = useCallback(
    async (modelId: WhisperModelId): Promise<boolean> => {
      setModelError('');
      setModelDownloadProgress((prev) => ({ ...prev, [modelId]: 0.01 }));
      const entry = getCatalogEntry(modelId);
      try {
        const { backend } = await ensureWorker().downloadOrLoadModel(modelId, entry.hfRepo);
        const sizeInfo = probedModelSizes[modelId] ?? {
          sizeBytes: entry.fallbackSizeBytes,
          isExact: false,
        };
        const updated = await markVoiceModelInstalled({
          id: modelId,
          hfRepo: entry.hfRepo,
          installedAt: new Date().toISOString(),
          sizeBytes: sizeInfo.sizeBytes,
          backend,
        });
        setInstalledModels(updated);
        installedModelsRef.current = updated;
        whisperFailedModelsRef.current.delete(modelId);
        whisperSlowModelsRef.current.delete(modelId);

        if (!(await readSetting('voiceSpeedCheck', null))) {
          await runFirstRunSpeedCheck(modelId);
        }
        if (isListeningRef.current && !isPausedRef.current) {
          await startAsrForSettings(settingsRef.current);
        }
        return true;
      } catch (err) {
        setModelError(
          (err as { message?: string })?.message ||
            'Could not download voice model. Check your internet connection.'
        );
        return false;
      }
    },
    [
      ensureWorker,
      installedModelsRef,
      isListeningRef,
      isPausedRef,
      probedModelSizes,
      runFirstRunSpeedCheck,
      setInstalledModels,
      settingsRef,
      startAsrForSettings,
    ]
  );

  const removeVoiceModel = useCallback(
    async (modelId: WhisperModelId) => {
      workerRef.current?.unloadModel(modelId);
      const updated = await removeInstalledVoiceModel(modelId);
      setInstalledModels(updated);
      installedModelsRef.current = updated;
      if (isListeningRef.current && !isPausedRef.current) {
        await startAsrForSettings(settingsRef.current);
      }
    },
    [installedModelsRef, isListeningRef, isPausedRef, setInstalledModels, settingsRef, startAsrForSettings]
  );

  const retryWhisperEngine = useCallback(async () => {
    resetModelFailures();
    setShowRetryWhisper(false);
    setModelError('');
    await stopAsrEngines(false);
    if (isListeningRef.current && !isPausedRef.current) {
      await startAsrForSettings(settingsRef.current);
    }
  }, [isListeningRef, isPausedRef, resetModelFailures, settingsRef, startAsrForSettings, stopAsrEngines]);

  return {
    workerRef,
    ensureWorker,
    stopAsrEngines,
    resetModelFailures,
    activeAsrMode,
    setActiveAsrMode,
    activeEngineDetail,
    engineNotice,
    showRetryWhisper,
    isRunningSpeedCheck,
    lastRtf,
    modelDownloadProgress,
    modelError,
    setModelError,
    startAsrForSettings,
    runFirstRunSpeedCheck,
    downloadVoiceModel,
    removeVoiceModel,
    retryWhisperEngine,
  };
}
