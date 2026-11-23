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

/**
 * Helper to check if the current DOM focus is inside an editable input, textarea,
 * select, or contentEditable element so global hotkeys (like Alt+L) never fire while typing.
 */
export function isEditableElementFocused(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest('[contenteditable="true"]')) return true;
  return false;
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

  const settingsRef = useRef<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const captureRef = useRef<AudioCaptureSession | null>(null);
  const workerRef = useRef<VoiceWorkerClient | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const testBufferRef = useRef<Float32Array[]>([]);
  const isTestingRef = useRef<boolean>(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const refreshDevices = useCallback(async (): Promise<AudioInputDevice[]> => {
    const list = await listAudioInputDevices();
    setDevices(list);
    return list;
  }, []);

  // Load local voice settings from IndexedDB on boot (NEVER requests mic permission on launch: PRD §8)
  useEffect(() => {
    (async () => {
      const saved = await getKey('settings', 'voice', null);
      if (saved && typeof saved === 'object') {
        const merged: VoiceSettings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...saved,
          // Never auto-open the microphone on cold app boot without user action or paused state
        };
        setSettings(merged);
        settingsRef.current = merged;
        if (merged.enabled) {
          // Start in paused state on cold boot so the mic never opens silently on first launch
          setIsPaused(true);
          isPausedRef.current = true;
        }
      }
      await refreshDevices();
    })();
  }, [refreshDevices]);

  // Stop capture tracks & worker completely
  const stopCaptureHardware = useCallback(async () => {
    if (captureRef.current) {
      await captureRef.current.stop();
      captureRef.current = null;
    }
    isListeningRef.current = false;
    setIsListening(false);
    setLevel(ZERO_LEVEL);
  }, []);

  // Start hardware capture session for the given settings
  const startCaptureHardware = useCallback(
    async (cfg: VoiceSettings): Promise<boolean> => {
      await stopCaptureHardware();

      if (!workerRef.current) {
        workerRef.current = new VoiceWorkerClient();
      }
      workerRef.current.start();
      workerRef.current.resume();

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
            // Device was unplugged while active (VA-4)
            refreshDevices().then((updatedList) => {
              if (updatedList.length === 0) {
                setPermissionState('no-device');
                setPermissionError(
                  'The active microphone was disconnected. Plug it back in or choose another input device.'
                );
                stopCaptureHardware();
              } else if (settingsRef.current.enabled && !isPausedRef.current) {
                // Attempt seamless hot-switch to fallback device
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

        // Refresh device labels now that permission is granted
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
    [refreshDevices, stopCaptureHardware]
  );

  // VA-4: Handle devicechange (USB hot-plug / unplug) without restarting the app
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
      // If our preferred device (by saved label) was just plugged back in while listening on fallback, switch to it
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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      captureRef.current?.stop();
      workerRef.current?.stop();
    };
  }, []);

  const updateVoiceSettings = useCallback(
    async (patch: Partial<VoiceSettings>) => {
      const prev = settingsRef.current;
      let next: VoiceSettings = { ...prev, ...patch };

      // If deviceId changed, also store its human-readable label locally for fallback
      if (patch.deviceId !== undefined) {
        const found = devices.find((d) => d.deviceId === patch.deviceId);
        if (found) {
          next = { ...next, deviceLabel: found.label };
        }
      }

      setSettings(next);
      settingsRef.current = next;
      // Local IndexedDB only — never included in runAccountSync (deviceId & label stay local to this PC)
      await setKey('settings', 'voice', next);

      // Live channel change without restarting stream
      if (
        patch.channel !== undefined &&
        patch.deviceId === undefined &&
        patch.noiseSuppression === undefined &&
        captureRef.current?.isActive()
      ) {
        captureRef.current.setChannel(next.channel || 'mix');
        return;
      }

      // If device or noiseSuppression changed while actively listening, restart capture on the new device
      if (
        (patch.deviceId !== undefined || patch.noiseSuppression !== undefined) &&
        isListeningRef.current &&
        !isPausedRef.current
      ) {
        await startCaptureHardware(next);
      }
    },
    [devices, startCaptureHardware]
  );

  const enableAndStartListening = useCallback(async (): Promise<boolean> => {
    const next: VoiceSettings = { ...settingsRef.current, enabled: true };
    setSettings(next);
    settingsRef.current = next;
    await setKey('settings', 'voice', next);
    return startCaptureHardware(next);
  }, [startCaptureHardware]);

  /**
   * Disabling Voice stops all MediaStream tracks immediately so the browser's mic indicator turns off.
   */
  const disableVoice = useCallback(async (): Promise<void> => {
    const next: VoiceSettings = { ...settingsRef.current, enabled: false };
    setSettings(next);
    settingsRef.current = next;
    await setKey('settings', 'voice', next);
    isPausedRef.current = false;
    setIsPaused(false);
    await stopCaptureHardware();
    workerRef.current?.stop();
  }, [stopCaptureHardware]);

  /**
   * Pausing listening stops all MediaStream tracks so the browser's mic indicator turns off
   * (not just the Selah topbar pill).
   */
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

  // VA-6 & SG-7: Global Alt+L shortcut to pause/resume listening (never fires when typing in an input)
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

  /**
   * VA-2: Test mic (record 3 seconds in memory, evaluate signal health via worker harness, discard buffer).
   * If Voice wasn't actively listening before the test, stops the stream tracks again right after the 3s test.
   */
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

    // Collect local frames & clear buffer immediately
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
        new Promise<null>((r) => setTimeout(() => r(null), 400)),
      ]);
      if (workerRes) {
        const dbStr = rmsToDb(workerRes.avgRms).toFixed(1);
        workerSummaryNote = `Worker received ${(workerRes.sampleCount / 16000).toFixed(1)} s @ 16 kHz mono (avg ${dbStr} dBFS). Ready for Whisper ASR in Phase 1.`;
      }
    }

    const report = evaluateMicTestSamples(merged, 3000, workerSummaryNote);
    setMicTestReport(report);

    // If user wasn't actively listening before clicking "Test mic", release the mic hardware tracks immediately
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
  };

  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}
