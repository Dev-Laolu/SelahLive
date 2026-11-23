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
import { parseSpokenReferences } from './detectors/spokenReferenceParser';
import { SuggestionEngine } from './suggestions/suggestionEngine';
import { sanitizeTranscriptText } from './suggestions/safety';

export type ActiveAsrMode =
  | 'idle'
  | 'loading-whisper'
  | 'whisper'
  | 'browser-bridge'
  | 'browser-backup'
  | 'awaiting-model';

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

  // Phase 1 — ASR, Models, Transcript, and Suggestions
  activeAsrMode: ActiveAsrMode;
  activeEngineDetail: string;
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
const TRANSCRIPT_RETENTION_MS = 5 * 60 * 1000; // TR-2: last ~5 minutes in memory only
const ROLLING_WINDOW_MS = 7500;                // ST-5: ~6-8s rolling window so cross-segment references are caught

export function isEditableElementFocused(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest('[contenteditable="true"]')) return true;
  return false;
}

/**
 * Optional soft chime using Web Audio API oscillator (SG-6: off by default).
 */
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
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14); // A5
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.23);
    setTimeout(() => ctx.close().catch(() => {}), 300);
  } catch {}
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

  // Phase 1 state
  const [activeAsrMode, setActiveAsrMode] = useState<ActiveAsrMode>('idle');
  const [activeEngineDetail, setActiveEngineDetail] = useState<string>('');
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
  const captureRef = useRef<AudioCaptureSession | null>(null);
  const workerRef = useRef<VoiceWorkerClient | null>(null);
  const browserEngineRef = useRef<BrowserSpeechEngine | null>(null);
  const suggestionEngineRef = useRef<SuggestionEngine>(new SuggestionEngine());
  const transcriptRef = useRef<TranscriptSegment[]>([]);
  const isListeningRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const testBufferRef = useRef<Float32Array[]>([]);
  const isTestingRef = useRef<boolean>(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    installedModelsRef.current = installedModels;
  }, [installedModels]);

  const refreshDevices = useCallback(async (): Promise<AudioInputDevice[]> => {
    const list = await listAudioInputDevices();
    setDevices(list);
    return list;
  }, []);

  /**
   * Processes an incoming transcript segment (interim or final) from Whisper or Browser ASR:
   * 1. Appends/updates the in-memory transcript stream (trimmed to last 5 minutes: TR-2).
   * 2. Combines a 6-8 second rolling window of recent segments (ST-5) so references split across
   *    two utterances (e.g. "Turn to Romans chapter 8" ... "verse 28") are detected seamlessly.
   * 3. Runs the Spoken Reference Parser (MD-1..MD-3) and feeds the Suggestion Engine (SG-1..SG-6).
   * 4. NEVER triggers any broadcast display action (SG-3).
   */
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

    // Update in-memory transcript (merge interim with same id, prune > 5 minutes)
    const cutoff = now - TRANSCRIPT_RETENTION_MS;
    const prevList = transcriptRef.current.filter((t) => t.endMs >= cutoff);
    const existingIdx = prevList.findIndex((t) => t.id === seg.id);
    let nextList: TranscriptSegment[];
    if (existingIdx >= 0) {
      nextList = prevList.map((t, i) => (i === existingIdx ? seg : t));
    } else {
      // Also replace trailing non-final segment if this is a newer segment from the same engine
      const lastIdx = prevList.length - 1;
      if (lastIdx >= 0 && !prevList[lastIdx].isFinal && seg.id.split('-')[0] === prevList[lastIdx].id.split('-')[0]) {
        nextList = [...prevList.slice(0, lastIdx), seg];
      } else {
        nextList = [...prevList, seg].slice(-80);
      }
    }
    transcriptRef.current = nextList;
    setTranscript(nextList);

    // Build rolling 7.5-second window + current segment for cross-utterance detection (ST-5)
    const recentWindowSegments = nextList.filter(
      (t) => now - t.endMs <= ROLLING_WINDOW_MS
    );
    const rollingText = recentWindowSegments.map((t) => t.text).join(' ');

    // Parse spoken scripture references from both current segment and rolling window
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
          // If Browser bridge was temporarily running while Whisper loaded, stop browser bridge between utterances (ST-8.2, ST-10)
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
        },
      });
      client.start();
      workerRef.current = client;
    }
    return workerRef.current;
  }, [handleIncomingSegment]);

  // Boot: load voice settings, installed models, and probe real Hugging Face model sizes
  useEffect(() => {
    (async () => {
      const [savedVoice, savedModels] = await Promise.all([
        getKey('settings', 'voice', null),
        getInstalledVoiceModels(),
      ]);
      if (savedModels) {
        setInstalledModels(savedModels);
        installedModelsRef.current = savedModels;
      }
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
      }
      await refreshDevices();

      // Probe real quantised download sizes from Hugging Face Hub API (ST-4)
      for (const m of VOICE_MODELS_CATALOG) {
        probeRealModelSizeBytes(m.id).then((res) => {
          setProbedModelSizes((prev) => ({ ...prev, [m.id]: res }));
        });
      }
    })();
  }, [refreshDevices]);

  // Periodically prune expired suggestions (every 2 seconds: SG-4 60s expiry)
  useEffect(() => {
    const timer = setInterval(() => {
      if (suggestionEngineRef.current.pruneExpired(Date.now())) {
        setSuggestions(suggestionEngineRef.current.getActive());
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Explicit model download triggered by the user in Library -> Voice models (ST-4)
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
        return true;
      } catch (err) {
        setModelError(
          (err as { message?: string })?.message ||
            'Could not download voice model. Check your internet connection.'
        );
        return false;
      }
    },
    [ensureWorker, probedModelSizes]
  );

  const removeVoiceModel = useCallback(async (modelId: WhisperModelId) => {
    workerRef.current?.unloadModel(modelId);
    const updated = await removeInstalledVoiceModel(modelId);
    setInstalledModels(updated);
    installedModelsRef.current = updated;
  }, []);

  /**
   * Starts the selected ASR engine (ST-1, ST-8):
   * - Primary: Whisper in Web Worker if the selected (or any installed) Whisper model is downloaded.
   * - Backup / First-run bridge: Browser SpeechRecognition if Whisper model isn't downloaded yet
   *   (or if engine === 'browser'), subject to on-device or explicit cloud opt-in (ST-2).
   */
  const startAsrForSettings = useCallback(
    async (cfg: VoiceSettings) => {
      const client = ensureWorker();
      client.resume();

      const installed = installedModelsRef.current;
      const preferredModel: WhisperModelId = cfg.whisperModel || 'base.en';
      const installedModelId: WhisperModelId | null = installed[preferredModel]
        ? preferredModel
        : installed['base.en']
          ? 'base.en'
          : installed['tiny.en']
            ? 'tiny.en'
            : installed['small.en']
              ? 'small.en'
              : null;

      // Mode 1: Explicit Whisper or Auto with an installed Whisper model
      if (
        (cfg.engine === 'whisper' || cfg.engine === 'auto') &&
        installedModelId
      ) {
        setActiveAsrMode('loading-whisper');
        setActiveEngineDetail(`Loading Whisper ${installedModelId}…`);
        try {
          const entry = getCatalogEntry(installedModelId);
          await client.downloadOrLoadModel(installedModelId, entry.hfRepo);
          return;
        } catch {
          if (cfg.engine === 'whisper') {
            setActiveAsrMode('awaiting-model');
            setActiveEngineDetail('Whisper model could not be loaded.');
            return;
          }
        }
      }

      // Mode 2: Whisper requested explicitly, but no model downloaded yet
      if (cfg.engine === 'whisper' && !installedModelId) {
        setActiveAsrMode('awaiting-model');
        setActiveEngineDetail(
          'Offline Whisper model not downloaded yet. Download it in Library → Voice models.'
        );
        return;
      }

      // Mode 3: Browser SpeechRecognition (either explicit 'browser' or first-run bridge in 'auto')
      if (isBrowserSpeechRecognitionSupported()) {
        const canLocal = supportsProcessLocally();
        if (canLocal || cfg.allowCloudBrowserEngine) {
          if (!browserEngineRef.current) {
            browserEngineRef.current = new BrowserSpeechEngine();
          }
          const isBridge = cfg.engine === 'auto' && !installedModelId;
          setActiveAsrMode(isBridge ? 'browser-bridge' : 'browser-backup');
          setActiveEngineDetail(
            isBridge
              ? 'Using temporary browser voice engine until an offline Whisper model is downloaded'
              : canLocal
                ? 'Browser speech engine (on-device)'
                : 'Browser speech engine (cloud opt-in)'
          );
          await browserEngineRef.current.init(cfg, {
            onSegment: (seg) => handleIncomingSegment(seg),
            onStatusChange: (_st, detail) => {
              if (detail) setActiveEngineDetail(detail);
            },
            onError: (msg) => setModelError(msg),
          });
          return;
        }
      }

      // No engine available without downloading Whisper or opting into cloud browser recognition
      setActiveAsrMode('awaiting-model');
      setActiveEngineDetail(
        'Download an offline Whisper model in Library → Voice models (or enable Cloud Browser Recognition in Settings → Voice).'
      );
    },
    [ensureWorker, handleIncomingSegment]
  );

  // Stop capture tracks & ASR engines completely
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

        // Launch active ASR engine (Whisper primary, Browser backup/bridge)
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

      setSettings(next);
      settingsRef.current = next;
      await setKey('settings', 'voice', next);

      // Seamless engine or model switch without clearing suggestions or interrupting live output (ST-10)
      if (
        (patch.engine !== undefined ||
          patch.whisperModel !== undefined ||
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

  // Global Alt+L shortcut to pause/resume listening (never fires when typing in an input)
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

  // VA-2: 3-second Test Mic (records 3s in memory, runs signal diagnostic + live Whisper transcript if loaded, discards buffer)
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
