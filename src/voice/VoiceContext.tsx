'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { recommendWhisperModel } from './asr/engineManager';
import { VOICE_MODELS_CATALOG } from './asr/voiceModels';
import { playSoftChime } from './audio/chime';
import { resolveNoiseSuppression, resolvePreferredDevice } from './audio/deviceManager';
import { ROLLING_WINDOW_MS } from './constants';
import { isEditableElementFocused, normalizeAllSongs } from './context/domUtils';
import { writeSetting } from './context/storage';
import { mergeTranscriptSegment, runDetectionPipeline } from './context/transcriptPipeline';
import { useAsrController } from './context/useAsrController';
import { useAudioCaptureController } from './context/useAudioCaptureController';
import { useVoicePersistence } from './context/useVoicePersistence';
import { useVoiceSideEffects } from './context/useVoiceSideEffects';
import { sanitizeTranscriptText } from './suggestions/safety';
import { SuggestionEngine } from './suggestions/suggestionEngine';
import type {
  BiblePack,
  SavedTextItem,
  Suggestion,
  SuggestionActionType,
  TranscriptSegment,
  VoiceContextValue,
  VoiceProviderProps,
  VoiceSettings,
} from './type';

export { isEditableElementFocused };

const VoiceCtx = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceCtx);
  if (!ctx) {
    throw new Error('useVoice must be used inside a VoiceProvider');
  }
  return ctx;
}

export function VoiceProvider({
  children,
  bibles = [],
  activeBibleId = '',
  songPacks = [],
  customSongs = [],
  savedTexts = [],
  lyricsLinesPerSlide = 2,
  emit,
}: VoiceProviderProps) {
  const persistence = useVoicePersistence();
  const { settings, setSettings, settingsRef } = persistence;

  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const allSongs = useMemo(
    () => normalizeAllSongs(customSongs, songPacks, lyricsLinesPerSlide),
    [customSongs, songPacks, lyricsLinesPerSlide]
  );

  const biblesRef = useRef<BiblePack[]>(bibles);
  const activeBibleIdRef = useRef<string>(activeBibleId);
  const songsRef = useRef(allSongs);
  const savedTextsRef = useRef<SavedTextItem[]>(savedTexts);
  const suggestionEngineRef = useRef<SuggestionEngine>(new SuggestionEngine());
  const transcriptRef = useRef<TranscriptSegment[]>([]);
  const isListeningProxyRef = useRef(false);
  const isPausedProxyRef = useRef(false);
  const modelErrorSetterRef = useRef<(msg: string) => void>(() => {});

  useEffect(() => { biblesRef.current = bibles; }, [bibles]);
  useEffect(() => { activeBibleIdRef.current = activeBibleId; }, [activeBibleId]);
  useEffect(() => { songsRef.current = allSongs; }, [allSongs]);
  useEffect(() => { savedTextsRef.current = savedTexts; }, [savedTexts]);

  const handleIncomingSegment = useCallback(
    (rawSeg: TranscriptSegment) => {
      const cleanText = sanitizeTranscriptText(rawSeg.text, 360);
      if (!cleanText) return;
      modelErrorSetterRef.current('');

      const now = Date.now();
      const segment: TranscriptSegment = {
        ...rawSeg,
        text: cleanText,
        endMs: rawSeg.endMs || now,
        startMs: rawSeg.startMs || now - 1200,
      };

      const nextTranscript = mergeTranscriptSegment(transcriptRef.current, segment, now);
      transcriptRef.current = nextTranscript;
      setTranscript(nextTranscript);

      const rollingText = nextTranscript
        .filter((item) => now - item.endMs <= ROLLING_WINDOW_MS)
        .map((item) => item.text)
        .join(' ');

      const outcome = runDetectionPipeline({
        rollingText,
        segment,
        settings: settingsRef.current,
        activeBibleId: activeBibleIdRef.current,
        bibles: biblesRef.current,
        songs: songsRef.current,
        savedTexts: savedTextsRef.current,
        triggerRules: persistence.triggerRulesRef.current,
        serviceContext: persistence.serviceContextRef.current,
        engine: suggestionEngineRef.current,
        now,
      });

      if (outcome.anyChanged) setSuggestions(suggestionEngineRef.current.getActive(now));
      if (outcome.anyNewCard && settingsRef.current.chime) playSoftChime();
    },
    [persistence.serviceContextRef, persistence.triggerRulesRef, settingsRef]
  );

  const asr = useAsrController({
    settingsRef,
    setSettings,
    hardwareProfileRef: persistence.hardwareProfileRef,
    installedModelsRef: persistence.installedModelsRef,
    setInstalledModels: persistence.setInstalledModels,
    probedModelSizes: persistence.probedModelSizes,
    setSpeedCheckResult: persistence.setSpeedCheckResult,
    isListeningRef: isListeningProxyRef,
    isPausedRef: isPausedProxyRef,
    onSegment: handleIncomingSegment,
  });
  modelErrorSetterRef.current = asr.setModelError;

  const capture = useAudioCaptureController({
    settingsRef,
    setSettings,
    workerRef: asr.workerRef,
    ensureWorker: asr.ensureWorker,
    startAsrForSettings: asr.startAsrForSettings,
    stopAsrEngines: asr.stopAsrEngines,
    setActiveAsrMode: asr.setActiveAsrMode,
    initialBootPaused: persistence.initialBootPaused,
  });

  useEffect(() => { isListeningProxyRef.current = capture.isListening; }, [capture.isListening]);
  useEffect(() => { isPausedProxyRef.current = capture.isPaused; }, [capture.isPaused]);

  const updateVoiceSettings = useCallback(
    async (patch: Partial<VoiceSettings>) => {
      let next: VoiceSettings = { ...settingsRef.current, ...patch };
      if (patch.deviceId !== undefined) {
        const found = capture.devices.find((d) => d.deviceId === patch.deviceId);
        if (found) next = { ...next, deviceLabel: found.label };
      }
      if (patch.performanceMode !== undefined) {
        asr.workerRef.current?.setPerformanceMode(Boolean(next.performanceMode));
      }
      if (patch.whisperModel !== undefined || patch.engine !== undefined) {
        asr.resetModelFailures();
      }

      setSettings(next);
      settingsRef.current = next;
      await writeSetting('voice', next);

      const liveAndUnpaused = capture.isListeningRef.current && !capture.isPausedRef.current;
      if (
        (patch.engine !== undefined ||
          patch.whisperModel !== undefined ||
          patch.performanceMode !== undefined ||
          patch.allowCloudBrowserEngine !== undefined) &&
        liveAndUnpaused
      ) {
        await asr.stopAsrEngines(false);
        await asr.startAsrForSettings(next);
      }

      if (
        patch.channel !== undefined &&
        patch.deviceId === undefined &&
        patch.noiseSuppression === undefined &&
        capture.setLiveChannel(next.channel ?? 'mix')
      ) {
        return;
      }

      if ((patch.deviceId !== undefined || patch.noiseSuppression !== undefined) && liveAndUnpaused) {
        await capture.startCaptureHardware(next);
      }
    },
    [asr, capture, setSettings, settingsRef]
  );

  const enableAndStartListening = useCallback(async (): Promise<boolean> => {
    const next: VoiceSettings = { ...settingsRef.current, enabled: true };
    setSettings(next);
    settingsRef.current = next;
    await writeSetting('voice', next);
    return capture.startCaptureHardware(next);
  }, [capture, setSettings, settingsRef]);

  const disableVoice = useCallback(async (): Promise<void> => {
    const next: VoiceSettings = { ...settingsRef.current, enabled: false };
    setSettings(next);
    settingsRef.current = next;
    await writeSetting('voice', next);
    capture.isPausedRef.current = false;
    capture.setIsPaused(false);
    await capture.stopCaptureHardware();
    await asr.stopAsrEngines(true);
  }, [asr, capture, setSettings, settingsRef]);

  const pauseListening = useCallback(async (): Promise<void> => {
    capture.isPausedRef.current = true;
    capture.setIsPaused(true);
    asr.workerRef.current?.pause();
    await capture.stopCaptureHardware();
  }, [asr.workerRef, capture]);

  const resumeListening = useCallback(async (): Promise<boolean> => {
    if (!settingsRef.current.enabled) return enableAndStartListening();
    return capture.startCaptureHardware(settingsRef.current);
  }, [capture, enableAndStartListening, settingsRef]);

  const togglePauseListening = useCallback(async (): Promise<void> => {
    if (!settingsRef.current.enabled) return;
    if (capture.isListeningRef.current && !capture.isPausedRef.current) {
      await pauseListening();
    } else {
      await resumeListening();
    }
  }, [capture.isListeningRef, capture.isPausedRef, pauseListening, resumeListening, settingsRef]);

  useVoiceSideEffects({
    suggestions,
    setSuggestions,
    suggestionEngineRef,
    emit,
    biblesRef,
    activeBibleIdRef,
    songsRef,
    savedTextsRef,
    settingsRef,
    togglePauseListening,
  });

  const clearTranscript = useCallback(() => {
    transcriptRef.current = [];
    setTranscript([]);
  }, []);

  const markSuggestionActed = useCallback(
    (id: string, actionType: SuggestionActionType = 'dismiss') => {
      persistence.recordFeedbackAction(actionType);
      if (actionType === 'show' || actionType === 'dismiss') {
        setSuggestions(suggestionEngineRef.current.markShownOrDismissed(id, Date.now()));
      }
    },
    [persistence]
  );

  const togglePinSuggestion = useCallback((id: string) => {
    setSuggestions(suggestionEngineRef.current.togglePin(id, Date.now()));
  }, []);

  const ingestTranscriptText = useCallback(
    (text: string, isFinal = true) => {
      const now = Date.now();
      handleIncomingSegment({
        id: `manual-${now}`,
        text,
        isFinal,
        startMs: now - 1000,
        endMs: now,
        confidence: 0.95,
      });
    },
    [handleIncomingSegment]
  );

  const activeDevice = resolvePreferredDevice(capture.devices, settings.deviceId, settings.deviceLabel);
  const effectiveNoiseSuppression = resolveNoiseSuppression(
    settings.noiseSuppression,
    activeDevice?.label || settings.deviceLabel || ''
  );
  const modelRec = recommendWhisperModel(
    persistence.hardwareProfile,
    persistence.speedCheckResult?.rtf,
    persistence.speedCheckResult?.testedModelId
  );

  const value: VoiceContextValue = {
    settings,
    updateVoiceSettings,
    devices: capture.devices,
    refreshDevices: capture.refreshDevices,
    activeDevice,
    effectiveNoiseSuppression,
    permissionState: capture.permissionState,
    permissionError: capture.permissionError,
    isListening: capture.isListening,
    isPaused: capture.isPaused,
    level: capture.level,
    isTestingMic: capture.isTestingMic,
    micTestCountdown: capture.micTestCountdown,
    micTestReport: capture.micTestReport,
    clearMicTestReport: capture.clearMicTestReport,
    enableAndStartListening,
    disableVoice,
    pauseListening,
    resumeListening,
    togglePauseListening,
    runMicTest: capture.runMicTest,
    activeAsrMode: asr.activeAsrMode,
    activeEngineDetail: asr.activeEngineDetail,
    engineNotice: asr.engineNotice,
    showRetryWhisper: asr.showRetryWhisper,
    retryWhisperEngine: asr.retryWhisperEngine,
    hardwareProfile: persistence.hardwareProfile,
    recommendedModel: modelRec.recommendedModel,
    recommendationReason: modelRec.reason,
    speedCheckResult: persistence.speedCheckResult,
    isRunningSpeedCheck: asr.isRunningSpeedCheck,
    runFirstRunSpeedCheck: asr.runFirstRunSpeedCheck,
    lastRtf: asr.lastRtf,
    modelCatalog: VOICE_MODELS_CATALOG,
    installedModels: persistence.installedModels,
    probedModelSizes: persistence.probedModelSizes,
    modelDownloadProgress: asr.modelDownloadProgress,
    modelError: asr.modelError,
    downloadVoiceModel: asr.downloadVoiceModel,
    removeVoiceModel: asr.removeVoiceModel,
    transcript,
    clearTranscript,
    suggestions,
    markSuggestionActed,
    togglePinSuggestion,
    ingestTranscriptText,
    feedbackCounters: persistence.feedbackCounters,
    resetFeedbackCounters: persistence.resetFeedbackCounters,
    triggerRules: persistence.triggerRules,
    saveTriggerRule: persistence.saveTriggerRule,
    deleteTriggerRule: persistence.deleteTriggerRule,
    serviceContext: persistence.serviceContext,
    addServiceContextItem: persistence.addServiceContextItem,
    removeServiceContextItem: persistence.removeServiceContextItem,
    clearServiceContext: persistence.clearServiceContext,
  };

  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}
