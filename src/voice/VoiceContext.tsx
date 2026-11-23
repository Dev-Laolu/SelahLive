'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { getKey, setKey } from '@/lib/db';
import {
  DEFAULT_VOICE_SETTINGS,
  type AudioInputDevice,
  type LevelReading,
  type MicPermissionState,
  type MicTestReport,
  type Suggestion,
  type TranscriptSegment,
  type VoiceSettings,
} from './types';
import {
  listAudioInputDevices,
  mapMediaErrorToPermissionState,
  resolveNoiseSuppression,
  resolvePreferredDevice,
} from './audio/deviceManager';
import {
  AudioCaptureSession,
  evaluateMicTestSamples,
  rmsToDb,
} from './audio/audioCapture';
import { VoiceWorkerClient } from './workers/workerClient';
import {
  getCatalogEntry,
  getInstalledVoiceModels,
  markVoiceModelInstalled,
  probeRealModelSizeBytes,
  removeInstalledVoiceModel,
  VOICE_MODELS_CATALOG,
  type InstalledVoiceModelRecord,
  type VoiceModelCatalogEntry,
  type WhisperModelId,
} from './asr/voiceModels';
import {
  BrowserSpeechEngine,
  isBrowserSpeechRecognitionSupported,
  supportsProcessLocally,
} from './asr/browserSpeechEngine';
import {
  recommendWhisperModel,
  RtfMonitor,
  selectActiveAsrEngine,
  type HardwareProfile,
  type SpeedCheckResult,
} from './asr/engineManager';
import { parseSpokenReferences } from './detectors/spokenReferenceParser';
import { SuggestionEngine } from './suggestions/suggestionEngine';
import { sanitizeTranscriptText } from './suggestions/safety';

export type ActiveAsrMode =
  | 'idle'
  | 'loading-whisper'
  | 'whisper'
  | 'browser-bridge'
  | 'browser-fallback'
  | 'browser-backup'
  | 'awaiting-model'
  | 'unavailable';

export interface VoiceContextValue {
  settings: VoiceSettings;
  updateVoiceSettings: (patch: Partial<VoiceSettings>) => Promise<void>;
  devices: AudioInputDevice[];
  refreshDevices: () => Promise<AudioInputDevice[]>;
  activeDevice: AudioInputDevice | null;
  effectiveNoiseSuppression: boolean;
  permissionState: MicPermissionState;
  permissionError: string;
  isListening: boolean;
  isPaused: boolean;
  level: LevelReading;
  isTestingMic: boolean;
  micTestCountdown: number;
  micTestReport: MicTestReport | null;
  clearMicTestReport: () => void;
  enableAndStartListening: () => Promise<boolean>;
  disableVoice: () => Promise<void>;
  pauseListening: () => Promise<void>;
  resumeListening: () => Promise<boolean>;
  togglePauseListening: () => Promise<void>;
  runMicTest: () => Promise<MicTestReport | null>;

  // Phase 1 & Phase 2 — ASR, Engine Management (ST-8..ST-10), Models, Transcript, and Suggestions
  activeAsrMode: ActiveAsrMode;
  activeEngineDetail: string;
  engineNotice: string;
  showRetryWhisper: boolean;
  retryWhisperEngine: () => Promise<void>;
  hardwareProfile: HardwareProfile;
  recommendedModel: WhisperModelId;
  recommendationReason: string;
  speedCheckResult: SpeedCheckResult | null;
  isRunningSpeedCheck: boolean;
  runFirstRunSpeedCheck: (modelId?: WhisperModelId) => Promise<SpeedCheckResult | null>;
  lastRtf: number | null;
  modelCatalog: VoiceModelCatalogEntry[];
  installedModels: Record<WhisperModelId, InstalledVoiceModelRecord>;
  probedModelSizes: Record<WhisperModelId, { sizeBytes: number; isExact: boolean }>;
  modelDownloadProgress: Record<WhisperModelId, number>;
  modelError: string;
  downloadVoiceModel: (modelId: WhisperModelId) => Promise<boolean>;
  removeVoiceModel: (modelId: WhisperModelId) => Promise<void>;
  transcript: TranscriptSegment[];
  clearTranscript: () => void;
  suggestions: Suggestion[];
  markSuggestionActed: (id: string) => void;
  togglePinSuggestion: (id: string) => void;
  ingestTranscriptText: (text: string, isFinal?: boolean) => void;
}

const VoiceCtx = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceCtx);
  if (!ctx) {
    throw new Error('useVoice must be used inside a VoiceProvider');
  }
  return ctx;
}

const ZERO_LEVEL: LevelReading = { rms: 0, peak: 0, db: -60, clipping: false };
const TRANSCRIPT_RETENTION_MS = 5 * 60 * 1000;
const ROLLING_WINDOW_MS = 7500;

export function isEditableElementFocused(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest('[contenteditable="true"]')) return true;
  return false;
}

function playSoftChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.23);
    setTimeout(() => ctx.close().catch(() => {}), 300);
  } catch {}
}

async function detectHardwareProfile(): Promise<HardwareProfile> {
  if (typeof navigator === 'undefined') {
    return { deviceMemoryGb: 8, hardwareConcurrency: 4, hasWebGpu: false };
  }
  const nav = navigator as unknown as {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    gpu?: { requestAdapter?: () => Promise<unknown> };
  };
  let hasWebGpu = false;
  try {
    if (nav.gpu?.requestAdapter) {
      const adapter = await nav.gpu.requestAdapter();
      hasWebGpu = Boolean(adapter);
    }
  } catch {}
  return {
    deviceMemoryGb: Number(nav.deviceMemory) || 8,
    hardwareConcurrency: Number(nav.hardwareConcurrency) || 4,
    hasWebGpu,
  };
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [permissionState, setPermissionState] = useState<MicPermissionState>('unrequested');
  const [permissionError, setPermissionError] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [level, setLevel] = useState<LevelReading>(ZERO_LEVEL);
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [micTestCountdown, setMicTestCountdown] = useState<number>(0);
  const [micTestReport, setMicTestReport] = useState<MicTestReport | null>(null);

  // Phase 1 & Phase 2 state
  const [activeAsrMode, setActiveAsrMode] = useState<ActiveAsrMode>('idle');
  const [activeEngineDetail, setActiveEngineDetail] = useState<string>('');
  const [engineNotice, setEngineNotice] = useState<string>('');
  const [showRetryWhisper, setShowRetryWhisper] = useState<boolean>(false);
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile>({
    deviceMemoryGb: 8,
    hardwareConcurrency: 4,
    hasWebGpu: false,
  });
  const [speedCheckResult, setSpeedCheckResult] = useState<SpeedCheckResult | null>(null);
  const [isRunningSpeedCheck, setIsRunningSpeedCheck] = useState<boolean>(false);
  const [lastRtf, setLastRtf] = useState<number | null>(null);

  const [installedModels, setInstalledModels] = useState<
    Record<WhisperModelId, InstalledVoiceModelRecord>
  >({} as Record<WhisperModelId, InstalledVoiceModelRecord>);
  const [probedModelSizes, setProbedModelSizes] = useState<
    Record<WhisperModelId, { sizeBytes: number; isExact: boolean }>
  >({
    'tiny.en': { sizeBytes: 43_500_000, isExact: false },
    'base.en': { sizeBytes: 79_800_000, isExact: false },
    'small.en': { sizeBytes: 254_000_000, isExact: false },
  });
  const [modelDownloadProgress, setModelDownloadProgress] = useState<
    Record<WhisperModelId, number>
  >({} as Record<WhisperModelId, number>);
  const [modelError, setModelError] = useState<string>('');
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const settingsRef = useRef<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const installedModelsRef = useRef<Record<WhisperModelId, InstalledVoiceModelRecord>>(
    {} as Record<WhisperModelId, InstalledVoiceModelRecord>
  );
  const whisperFailedModelsRef = useRef<Set<WhisperModelId>>(new Set());
  const whisperSlowModelsRef = useRef<Set<WhisperModelId>>(new Set());
  const rtfMonitorRef = useRef<RtfMonitor>(new RtfMonitor());
  const hardwareProfileRef = useRef<HardwareProfile>(hardwareProfile);
  const captureRef = useRef<AudioCaptureSession | null>(null);
  const workerRef = useRef<VoiceWorkerClient | null>(null);
  const browserEngineRef = useRef<BrowserSpeechEngine | null>(null);
  const suggestionEngineRef = useRef<SuggestionEngine>(new SuggestionEngine());
  const transcriptRef = useRef<TranscriptSegment[]>([]);
  const isListeningRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const testBufferRef = useRef<Float32Array[]>([]);
  const isTestingRef = useRef<boolean>(false);
  const startAsrRef = useRef<((cfg: VoiceSettings) => Promise<void>) | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    installedModelsRef.current = installedModels;
  }, [installedModels]);

  useEffect(() => {
    hardwareProfileRef.current = hardwareProfile;
  }, [hardwareProfile]);

  const refreshDevices = useCallback(async (): Promise<AudioInputDevice[]> => {
    const list = await listAudioInputDevices();
    setDevices(list);
    return list;
  }, []);

  const handleIncomingSegment = useCallback((rawSeg: TranscriptSegment) => {
    const cleanText = sanitizeTranscriptText(rawSeg.text, 360);
    if (!cleanText) return;

    const now = Date.now();
    const seg: TranscriptSegment = {
      ...rawSeg,
      text: cleanText,
      endMs: rawSeg.endMs || now,
      startMs: rawSeg.startMs || now - 1200,
    };

    const cutoff = now - TRANSCRIPT_RETENTION_MS;
    const prevList = transcriptRef.current.filter((t) => t.endMs >= cutoff);
    const existingIdx = prevList.findIndex((t) => t.id === seg.id);
    let nextList: TranscriptSegment[];
    if (existingIdx >= 0) {
      nextList = prevList.map((t, i) => (i === existingIdx ? seg : t));
    } else {
      const lastIdx = prevList.length - 1;
      if (
        lastIdx >= 0 &&
        !prevList[lastIdx].isFinal &&
        seg.id.split('-')[0] === prevList[lastIdx].id.split('-')[0]
      ) {
        nextList = [...prevList.slice(0, lastIdx), seg];
      } else {
        nextList = [...prevList, seg].slice(-80);
      }
    }
    transcriptRef.current = nextList;
    setTranscript(nextList);

    const recentWindowSegments = nextList.filter(
      (t) => now - t.endMs <= ROLLING_WINDOW_MS
    );
    const rollingText = recentWindowSegments.map((t) => t.text).join(' ');

    const directRefs = parseSpokenReferences(seg.text);
    const rollingRefs = parseSpokenReferences(rollingText);
    const allRefs = [...directRefs];
    for (const r of rollingRefs) {
      if (!allRefs.some((d) => d.canonicalRef === r.canonicalRef)) {
        allRefs.push(r);
      }
    }

    if (allRefs.length > 0) {
      let anyNewCard = false;
      let anyChanged = false;
      const cfg = settingsRef.current;

      for (const ref of allRefs) {
        const res = suggestionEngineRef.current.ingest(
          {
            kind: 'scripture',
            reason: 'spoken-reference',
            confidence: ref.confidence,
            band: ref.band,
            heard: ref.matchedExcerpt,
            payload: {
              book: ref.book,
              chapter: ref.chapter,
              verseStart: ref.verseStart,
              verseEnd: ref.verseEnd,
              versionId: cfg.defaultVersionId || '',
            },
          },
          { sensitivity: cfg.sensitivity, now }
        );
        if (res.changed) anyChanged = true;
        if (res.createdNew) anyNewCard = true;
      }

      if (anyChanged) {
        setSuggestions(suggestionEngineRef.current.getActive(now));
      }
      if (anyNewCard && cfg.chime) {
        playSoftChime();
      }
    }
  }, []);

  const ensureWorker = useCallback((): VoiceWorkerClient => {
    if (!workerRef.current) {
      const client = new VoiceWorkerClient();
      client.setCallbacks({
        onTranscriptSegment: (seg) => {
          handleIncomingSegment(seg);
        },
        onRtfMetric: (metric) => {
          setLastRtf(metric.rtf);
          const check = rtfMonitorRef.current.recordUtterance(
            metric.audioDurationMs,
            metric.inferenceMs
          );
          // ST-8.3: If sustained RTF > 1.0 over 3 consecutive utterances, mark model slow and re-run ST-8 selection between utterances
          if (check.isSustainedSlow && metric.modelId) {
            whisperSlowModelsRef.current.add(metric.modelId);
            rtfMonitorRef.current.reset();
            if (isListeningRef.current && !isPausedRef.current) {
              startAsrRef.current?.(settingsRef.current);
            }
          }
        },
        onModelProgress: (ev) => {
          setModelDownloadProgress((prev) => ({
            ...prev,
            [ev.modelId]: ev.progress,
          }));
        },
        onModelReady: async (info) => {
          setModelDownloadProgress((prev) => {
            const next = { ...prev };
            delete next[info.modelId];
            return next;
          });
          setActiveAsrMode('whisper');
          setActiveEngineDetail(
            `Whisper ${info.modelId} (${info.backend.toUpperCase()})`
          );
          // ST-8.2 & ST-10: Automatically stop temporary browser bridge between utterances when Whisper is ready
          if (browserEngineRef.current) {
            await browserEngineRef.current.destroy();
            browserEngineRef.current = null;
          }
        },
        onModelError: (info) => {
          setModelDownloadProgress((prev) => {
            const next = { ...prev };
            delete next[info.modelId];
            return next;
          });
          setModelError(info.error);
          whisperFailedModelsRef.current.add(info.modelId);
          if (isListeningRef.current && !isPausedRef.current) {
            startAsrRef.current?.(settingsRef.current);
          }
        },
      });
      client.start();
      client.setPerformanceMode(Boolean(settingsRef.current.performanceMode));
      workerRef.current = client;
    }
    return workerRef.current;
  }, [handleIncomingSegment]);

  // Boot: load voice settings, installed models, speed check history, hardware profile, and probe HF sizes
  useEffect(() => {
    (async () => {
      const [savedVoice, savedModels, savedSpeedCheck, hw] = await Promise.all([
        getKey('settings', 'voice', null),
        getInstalledVoiceModels(),
        getKey('settings', 'voiceSpeedCheck', null),
        detectHardwareProfile(),
      ]);

      setHardwareProfile(hw);
      hardwareProfileRef.current = hw;

      if (savedSpeedCheck && typeof savedSpeedCheck === 'object') {
        setSpeedCheckResult(savedSpeedCheck as SpeedCheckResult);
      }

      if (savedModels) {
        setInstalledModels(savedModels);
        installedModelsRef.current = savedModels;
      }

      const rec = recommendWhisperModel(
        hw,
        (savedSpeedCheck as SpeedCheckResult | null)?.rtf,
        (savedSpeedCheck as SpeedCheckResult | null)?.testedModelId
      );

      if (savedVoice && typeof savedVoice === 'object') {
        const merged: VoiceSettings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...savedVoice,
        };
        setSettings(merged);
        settingsRef.current = merged;
        if (merged.enabled) {
          setIsPaused(true);
          isPausedRef.current = true;
        }
      } else {
        // First run: apply hardware-recommended Whisper model ('base.en' default, 'tiny.en' on 4GB weak laptops)
        const initial: VoiceSettings = {
          ...DEFAULT_VOICE_SETTINGS,
          whisperModel: rec.recommendedModel,
        };
        setSettings(initial);
        settingsRef.current = initial;
      }

      await refreshDevices();

      for (const m of VOICE_MODELS_CATALOG) {
        probeRealModelSizeBytes(m.id).then((res) => {
          setProbedModelSizes((prev) => ({ ...prev, [m.id]: res }));
        });
      }
    })();
  }, [refreshDevices]);

  // Periodically prune expired suggestions (SG-4 60s expiry)
  useEffect(() => {
    const timer = setInterval(() => {
      if (suggestionEngineRef.current.pruneExpired(Date.now())) {
        setSuggestions(suggestionEngineRef.current.getActive());
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  /**
   * ST-9 First-run Speed Check: runs a 2.0s synthetic benchmark clip on the loaded Whisper model,
   * computes Real-Time Factor (`RTF`), recommends `base.en` / `tiny.en` / `small.en`, and persists the result locally.
   */
  const runFirstRunSpeedCheck = useCallback(
    async (modelId?: WhisperModelId): Promise<SpeedCheckResult | null> => {
      const targetModel: WhisperModelId =
        modelId || settingsRef.current.whisperModel || 'base.en';
      setIsRunningSpeedCheck(true);
      try {
        const client = ensureWorker();
        const bench = await client.runSpeedBenchmark(targetModel);
        const rec = recommendWhisperModel(
          hardwareProfileRef.current,
          bench.rtf,
          bench.modelId
        );
        const result: SpeedCheckResult = {
          testedModelId: bench.modelId,
          backend: bench.backend,
          audioDurationMs: bench.audioDurationMs,
          inferenceMs: bench.inferenceMs,
          rtf: bench.rtf,
          recommendedModel: rec.recommendedModel,
          summary: rec.reason,
          timestamp: new Date().toISOString(),
        };
        setSpeedCheckResult(result);
        setLastRtf(bench.rtf);
        await setKey('settings', 'voiceSpeedCheck', result);

        // If the speed check on base.en came back slow (> 0.9 RTF), auto-select tiny.en (per owner instruction)
        if (
          bench.modelId === 'base.en' &&
          bench.rtf > 0.9 &&
          rec.recommendedModel === 'tiny.en'
        ) {
          const next = { ...settingsRef.current, whisperModel: 'tiny.en' as const };
          setSettings(next);
          settingsRef.current = next;
          await setKey('settings', 'voice', next);
        }

        setIsRunningSpeedCheck(false);
        return result;
      } catch (err) {
        setModelError(
          (err as { message?: string })?.message || 'Speed check failed.'
        );
        setIsRunningSpeedCheck(false);
        return null;
      }
    },
    [ensureWorker]
  );

  /**
   * ST-8 Auto Engine Selection execution:
   * Evaluates `selectActiveAsrEngine` and seamlessly activates Whisper or Browser bridge/fallback
   * without clearing suggestions or interrupting live output (ST-10).
   */
  const startAsrForSettings = useCallback(
    async (cfg: VoiceSettings) => {
      const client = ensureWorker();
      client.setPerformanceMode(Boolean(cfg.performanceMode));
      client.resume();

      const installedIds = Object.keys(installedModelsRef.current) as WhisperModelId[];
      const isDownloadingAny = Object.keys(modelDownloadProgress).length > 0;

      const decision = selectActiveAsrEngine({
        preferredEngine: cfg.engine,
        preferredWhisperModel: cfg.whisperModel || 'base.en',
        performanceMode: Boolean(cfg.performanceMode),
        installedModels: installedIds,
        whisperFailedModels: Array.from(whisperFailedModelsRef.current),
        whisperSlowModels: Array.from(whisperSlowModelsRef.current),
        browserSupported: isBrowserSpeechRecognitionSupported(),
        browserProcessLocally: supportsProcessLocally(),
        allowCloudBrowserEngine: Boolean(cfg.allowCloudBrowserEngine),
        isDownloadingWhisper: isDownloadingAny,
      });

      setEngineNotice(decision.notice);
      setShowRetryWhisper(decision.showRetryWhisper);

      if (decision.targetEngine === 'whisper' && decision.targetWhisperModel) {
        const targetModel = decision.targetWhisperModel;
        setActiveAsrMode('loading-whisper');
        setActiveEngineDetail(`Loading Whisper ${targetModel}…`);
        try {
          const entry = getCatalogEntry(targetModel);
          await client.downloadOrLoadModel(targetModel, entry.hfRepo);
          return;
        } catch {
          whisperFailedModelsRef.current.add(targetModel);
          // Re-evaluate fallback immediately
          const retryDecision = selectActiveAsrEngine({
            preferredEngine: cfg.engine,
            preferredWhisperModel: cfg.whisperModel || 'base.en',
            performanceMode: Boolean(cfg.performanceMode),
            installedModels: installedIds,
            whisperFailedModels: Array.from(whisperFailedModelsRef.current),
            whisperSlowModels: Array.from(whisperSlowModelsRef.current),
            browserSupported: isBrowserSpeechRecognitionSupported(),
            browserProcessLocally: supportsProcessLocally(),
            allowCloudBrowserEngine: Boolean(cfg.allowCloudBrowserEngine),
            isDownloadingWhisper: isDownloadingAny,
          });
          setEngineNotice(retryDecision.notice);
          setShowRetryWhisper(retryDecision.showRetryWhisper);
          if (retryDecision.targetEngine !== 'browser') {
            setActiveAsrMode('unavailable');
            setActiveEngineDetail(retryDecision.notice);
            return;
          }
        }
      }

      if (decision.targetEngine === 'browser') {
        if (!browserEngineRef.current) {
          browserEngineRef.current = new BrowserSpeechEngine();
        }
        const mode: ActiveAsrMode =
          decision.mode === 'browser-bridge'
            ? 'browser-bridge'
            : decision.mode === 'browser-fallback'
              ? 'browser-fallback'
              : 'browser-backup';
        setActiveAsrMode(mode);
        setActiveEngineDetail(decision.notice);

        await browserEngineRef.current.init(cfg, {
          onSegment: (seg) => handleIncomingSegment(seg),
          onStatusChange: (_st, detail) => {
            if (detail && mode === 'browser-backup') {
              setActiveEngineDetail(detail);
            }
          },
          onError: (msg) => setModelError(msg),
        });
        return;
      }

      // targetEngine === 'none'
      if (browserEngineRef.current) {
        await browserEngineRef.current.destroy();
        browserEngineRef.current = null;
      }
      setActiveAsrMode(
        decision.mode === 'awaiting-model' ? 'awaiting-model' : 'unavailable'
      );
      setActiveEngineDetail(decision.notice);
    },
    [ensureWorker, handleIncomingSegment, modelDownloadProgress]
  );

  useEffect(() => {
    startAsrRef.current = startAsrForSettings;
  }, [startAsrForSettings]);

  // Explicit model download triggered by user in Library -> Voice models (ST-4, ST-8.2, ST-9)
  const downloadVoiceModel = useCallback(
    async (modelId: WhisperModelId): Promise<boolean> => {
      setModelError('');
      setModelDownloadProgress((prev) => ({ ...prev, [modelId]: 0.01 }));
      const entry = getCatalogEntry(modelId);
      const client = ensureWorker();
      try {
        const { backend } = await client.downloadOrLoadModel(modelId, entry.hfRepo);
        const sizeInfo = probedModelSizes[modelId] || {
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

        // ST-9: On first model download, run the quick speed check benchmark automatically
        const existingSpeedCheck = await getKey('settings', 'voiceSpeedCheck', null);
        if (!existingSpeedCheck) {
          await runFirstRunSpeedCheck(modelId);
        }

        // ST-8.2 & ST-10: If voice is currently listening on the temporary browser bridge, switch to Whisper automatically between utterances!
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
    [ensureWorker, probedModelSizes, runFirstRunSpeedCheck, startAsrForSettings]
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
    [startAsrForSettings]
  );

  /**
   * ST-8.3 Retry Whisper button: clears slow/failed flags, resets RTF monitor, and switches back to Whisper seamlessly (ST-10).
   */
  const retryWhisperEngine = useCallback(async () => {
    whisperFailedModelsRef.current.clear();
    whisperSlowModelsRef.current.clear();
    rtfMonitorRef.current.reset();
    setShowRetryWhisper(false);
    setModelError('');
    if (browserEngineRef.current) {
      await browserEngineRef.current.destroy();
      browserEngineRef.current = null;
    }
    if (isListeningRef.current && !isPausedRef.current) {
      await startAsrForSettings(settingsRef.current);
    }
  }, [startAsrForSettings]);

  const stopCaptureHardware = useCallback(async () => {
    if (captureRef.current) {
      await captureRef.current.stop();
      captureRef.current = null;
    }
    if (browserEngineRef.current) {
      await browserEngineRef.current.destroy();
      browserEngineRef.current = null;
    }
    isListeningRef.current = false;
    setIsListening(false);
    setLevel(ZERO_LEVEL);
    setActiveAsrMode('idle');
  }, []);

  const startCaptureHardware = useCallback(
    async (cfg: VoiceSettings): Promise<boolean> => {
      await stopCaptureHardware();
      const client = ensureWorker();
      client.setPerformanceMode(Boolean(cfg.performanceMode));
      client.resume();

      const currentDevices = await refreshDevices();
      const matched = resolvePreferredDevice(
        currentDevices,
        cfg.deviceId,
        cfg.deviceLabel
      );

      const targetDeviceId = matched?.deviceId || cfg.deviceId || 'default';
      const targetLabel = matched?.label || cfg.deviceLabel || '';

      try {
        const session = new AudioCaptureSession({
          deviceId: targetDeviceId,
          deviceLabel: targetLabel,
          channel: cfg.channel || 'mix',
          noiseSuppression: cfg.noiseSuppression || 'auto',
          onLevel: (reading) => {
            setLevel(reading);
          },
          onPcmFrame: (samples16k) => {
            workerRef.current?.sendPcmFrame(samples16k);
            if (isTestingRef.current) {
              testBufferRef.current.push(new Float32Array(samples16k));
            }
          },
          onStreamEnded: () => {
            refreshDevices().then((updatedList) => {
              if (updatedList.length === 0) {
                setPermissionState('no-device');
                setPermissionError(
                  'The active microphone was disconnected. Plug it back in or choose another input device.'
                );
                stopCaptureHardware();
              } else if (settingsRef.current.enabled && !isPausedRef.current) {
                startCaptureHardware(settingsRef.current);
              }
            });
          },
        });

        await session.start();
        captureRef.current = session;
        isListeningRef.current = true;
        isPausedRef.current = false;
        setIsListening(true);
        setIsPaused(false);
        setPermissionState('granted');
        setPermissionError('');

        startAsrForSettings(cfg);

        const afterGrant = await refreshDevices();
        const resolvedAfter = resolvePreferredDevice(
          afterGrant,
          targetDeviceId,
          targetLabel
        );
        if (
          resolvedAfter &&
          (resolvedAfter.deviceId !== cfg.deviceId ||
            resolvedAfter.label !== cfg.deviceLabel)
        ) {
          const next = {
            ...settingsRef.current,
            deviceId: resolvedAfter.deviceId,
            deviceLabel: resolvedAfter.label,
          };
          setSettings(next);
          settingsRef.current = next;
          await setKey('settings', 'voice', next);
        }

        return true;
      } catch (err) {
        const mapped = mapMediaErrorToPermissionState(err);
        setPermissionState(mapped.state);
        setPermissionError(mapped.message);
        await stopCaptureHardware();
        return false;
      }
    },
    [ensureWorker, refreshDevices, startAsrForSettings, stopCaptureHardware]
  );

  // VA-4: Handle devicechange hot-plug
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) {
      return;
    }
    const handleDeviceChange = async () => {
      const list = await refreshDevices();
      if (list.length === 0 && isListeningRef.current) {
        setPermissionState('no-device');
        setPermissionError('No audio input devices found. Reconnect your microphone or USB interface.');
        await stopCaptureHardware();
        return;
      }
      if (isListeningRef.current && !isPausedRef.current) {
        const preferred = resolvePreferredDevice(
          list,
          settingsRef.current.deviceId,
          settingsRef.current.deviceLabel
        );
        if (preferred && !captureRef.current?.isActive()) {
          await startCaptureHardware(settingsRef.current);
        }
      }
    };
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices, startCaptureHardware, stopCaptureHardware]);

  useEffect(() => {
    return () => {
      captureRef.current?.stop();
      browserEngineRef.current?.destroy();
      workerRef.current?.stop();
    };
  }, []);

  const updateVoiceSettings = useCallback(
    async (patch: Partial<VoiceSettings>) => {
      const prev = settingsRef.current;
      let next: VoiceSettings = { ...prev, ...patch };

      if (patch.deviceId !== undefined) {
        const found = devices.find((d) => d.deviceId === patch.deviceId);
        if (found) {
          next = { ...next, deviceLabel: found.label };
        }
      }

      if (patch.performanceMode !== undefined) {
        workerRef.current?.setPerformanceMode(Boolean(next.performanceMode));
      }

      // If user explicitly changed whisperModel or engine, clear slow/failed flags for that model
      if (patch.whisperModel !== undefined || patch.engine !== undefined) {
        whisperFailedModelsRef.current.clear();
        whisperSlowModelsRef.current.clear();
        rtfMonitorRef.current.reset();
      }

      setSettings(next);
      settingsRef.current = next;
      await setKey('settings', 'voice', next);

      // ST-10: Seamless engine or model switch without clearing suggestions or interrupting live output
      if (
        (patch.engine !== undefined ||
          patch.whisperModel !== undefined ||
          patch.performanceMode !== undefined ||
          patch.allowCloudBrowserEngine !== undefined) &&
        isListeningRef.current &&
        !isPausedRef.current
      ) {
        if (browserEngineRef.current) {
          await browserEngineRef.current.destroy();
          browserEngineRef.current = null;
        }
        await startAsrForSettings(next);
      }

      if (
        patch.channel !== undefined &&
        patch.deviceId === undefined &&
        patch.noiseSuppression === undefined &&
        captureRef.current?.isActive()
      ) {
        captureRef.current.setChannel(next.channel || 'mix');
        return;
      }

      if (
        (patch.deviceId !== undefined || patch.noiseSuppression !== undefined) &&
        isListeningRef.current &&
        !isPausedRef.current
      ) {
        await startCaptureHardware(next);
      }
    },
    [devices, startAsrForSettings, startCaptureHardware]
  );

  const enableAndStartListening = useCallback(async (): Promise<boolean> => {
    const next: VoiceSettings = { ...settingsRef.current, enabled: true };
    setSettings(next);
    settingsRef.current = next;
    await setKey('settings', 'voice', next);
    return startCaptureHardware(next);
  }, [startCaptureHardware]);

  const disableVoice = useCallback(async (): Promise<void> => {
    const next: VoiceSettings = { ...settingsRef.current, enabled: false };
    setSettings(next);
    settingsRef.current = next;
    await setKey('settings', 'voice', next);
    isPausedRef.current = false;
    setIsPaused(false);
    await stopCaptureHardware();
    workerRef.current?.stop();
    workerRef.current = null;
  }, [stopCaptureHardware]);

  const pauseListening = useCallback(async (): Promise<void> => {
    isPausedRef.current = true;
    setIsPaused(true);
    workerRef.current?.pause();
    await stopCaptureHardware();
  }, [stopCaptureHardware]);

  const resumeListening = useCallback(async (): Promise<boolean> => {
    if (!settingsRef.current.enabled) {
      return enableAndStartListening();
    }
    return startCaptureHardware(settingsRef.current);
  }, [enableAndStartListening, startCaptureHardware]);

  const togglePauseListening = useCallback(async (): Promise<void> => {
    if (!settingsRef.current.enabled) return;
    if (isListeningRef.current && !isPausedRef.current) {
      await pauseListening();
    } else {
      await resumeListening();
    }
  }, [pauseListening, resumeListening]);

  // Global Alt+L shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableElementFocused(e.target)) return;
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'l') {
        if (!settingsRef.current.enabled) return;
        e.preventDefault();
        togglePauseListening();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePauseListening]);

  // VA-2: 3-second Test Mic
  const runMicTest = useCallback(async (): Promise<MicTestReport | null> => {
    if (isTestingRef.current) return null;
    const wasListeningBefore = isListeningRef.current && !isPausedRef.current;

    setMicTestReport(null);
    setIsTestingMic(true);
    isTestingRef.current = true;
    testBufferRef.current = [];
    setMicTestCountdown(3);

    if (!wasListeningBefore) {
      const ok = await startCaptureHardware(settingsRef.current);
      if (!ok) {
        setIsTestingMic(false);
        isTestingRef.current = false;
        setMicTestCountdown(0);
        return null;
      }
    }

    const workerPromise = workerRef.current?.runMicTest(3000);

    for (let rem = 3; rem >= 1; rem--) {
      setMicTestCountdown(rem);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setMicTestCountdown(0);

    const chunks = testBufferRef.current;
    testBufferRef.current = [];
    isTestingRef.current = false;
    setIsTestingMic(false);

    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    let workerSummaryNote: string | undefined;
    if (workerPromise) {
      const workerRes = await Promise.race([
        workerPromise,
        new Promise<null>((r) => setTimeout(() => r(null), 2500)),
      ]);
      if (workerRes) {
        const dbStr = rmsToDb(workerRes.avgRms).toFixed(1);
        if (workerRes.transcriptPreview) {
          workerSummaryNote = `Heard (${workerRes.modelLoaded || 'Whisper'}): "${workerRes.transcriptPreview}" (${dbStr} dBFS)`;
        } else if (workerRes.modelLoaded) {
          workerSummaryNote = `Captured ${(workerRes.sampleCount / 16000).toFixed(1)} s @ 16 kHz (${dbStr} dBFS). No clear speech words detected in the 3 s clip.`;
        } else {
          workerSummaryNote = `Captured ${(workerRes.sampleCount / 16000).toFixed(1)} s @ 16 kHz (${dbStr} dBFS). Download a Whisper model in Library → Voice models for offline transcription.`;
        }
      }
    }

    const report = evaluateMicTestSamples(merged, 3000, workerSummaryNote);
    merged.fill(0);
    setMicTestReport(report);

    if (!wasListeningBefore) {
      await stopCaptureHardware();
      if (settingsRef.current.enabled) {
        setIsPaused(true);
        isPausedRef.current = true;
      }
    }

    return report;
  }, [startCaptureHardware, stopCaptureHardware]);

  const clearMicTestReport = useCallback(() => setMicTestReport(null), []);

  const clearTranscript = useCallback(() => {
    transcriptRef.current = [];
    setTranscript([]);
  }, []);

  const markSuggestionActed = useCallback((id: string) => {
    const next = suggestionEngineRef.current.markShownOrDismissed(id, Date.now());
    setSuggestions(next);
  }, []);

  const togglePinSuggestion = useCallback((id: string) => {
    const next = suggestionEngineRef.current.togglePin(id, Date.now());
    setSuggestions(next);
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

  const activeDevice = resolvePreferredDevice(
    devices,
    settings.deviceId,
    settings.deviceLabel
  );

  const effectiveNoiseSuppression = resolveNoiseSuppression(
    settings.noiseSuppression,
    activeDevice?.label || settings.deviceLabel || ''
  );

  const modelRec = recommendWhisperModel(
    hardwareProfile,
    speedCheckResult?.rtf,
    speedCheckResult?.testedModelId
  );

  const value: VoiceContextValue = {
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
    togglePauseListening,
    runMicTest,
    activeAsrMode,
    activeEngineDetail,
    engineNotice,
    showRetryWhisper,
    retryWhisperEngine,
    hardwareProfile,
    recommendedModel: modelRec.recommendedModel,
    recommendationReason: modelRec.reason,
    speedCheckResult,
    isRunningSpeedCheck,
    runFirstRunSpeedCheck,
    lastRtf,
    modelCatalog: VOICE_MODELS_CATALOG,
    installedModels,
    probedModelSizes,
    modelDownloadProgress,
    modelError,
    downloadVoiceModel,
    removeVoiceModel,
    transcript,
    clearTranscript,
    suggestions,
    markSuggestionActed,
    togglePinSuggestion,
    ingestTranscriptText,
  };

  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}
