import { useCallback, useEffect, useRef, useState } from 'react';
import { writeSetting } from './storage';
import {
  AudioCaptureSession,
  evaluateMicTestSamples,
  rmsToDb,
} from '../audio/audioCapture';
import {
  listAudioInputDevices,
  mapMediaErrorToPermissionState,
  resolvePreferredDevice,
} from '../audio/deviceManager';
import { ZERO_LEVEL } from '../constants';
import type {
  AudioInputDevice,
  LevelReading,
  MicPermissionState,
  MicTestReport,
  VoiceSettings,
} from '../type';
import type { UseAudioCaptureParams, UseAudioCaptureResult } from './type';

export function useAudioCaptureController({
  settingsRef,
  setSettings,
  workerRef,
  ensureWorker,
  startAsrForSettings,
  stopAsrEngines,
  setActiveAsrMode,
  initialBootPaused,
}: UseAudioCaptureParams): UseAudioCaptureResult {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [permissionState, setPermissionState] = useState<MicPermissionState>('unrequested');
  const [permissionError, setPermissionError] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [level, setLevel] = useState<LevelReading>(ZERO_LEVEL);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micTestCountdown, setMicTestCountdown] = useState(0);
  const [micTestReport, setMicTestReport] = useState<MicTestReport | null>(null);

  const captureRef = useRef<AudioCaptureSession | null>(null);
  const isListeningRef = useRef(false);
  const isPausedRef = useRef(false);
  const testBufferRef = useRef<Float32Array[]>([]);
  const isTestingRef = useRef(false);

  useEffect(() => {
    if (initialBootPaused) {
      setIsPaused(true);
      isPausedRef.current = true;
    }
  }, [initialBootPaused]);

  const refreshDevices = useCallback(async (): Promise<AudioInputDevice[]> => {
    const list = await listAudioInputDevices();
    setDevices(list);
    return list;
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const stopCaptureHardware = useCallback(async () => {
    if (captureRef.current) {
      await captureRef.current.stop();
      captureRef.current = null;
    }
    await stopAsrEngines(false);
    isListeningRef.current = false;
    setIsListening(false);
    setLevel(ZERO_LEVEL);
    setActiveAsrMode('idle');
  }, [setActiveAsrMode, stopAsrEngines]);

  const startCaptureHardware = useCallback(
    async (cfg: VoiceSettings): Promise<boolean> => {
      await stopCaptureHardware();
      const client = ensureWorker();
      client.setPerformanceMode(Boolean(cfg.performanceMode));
      client.resume();

      const currentDevices = await refreshDevices();
      const matched = resolvePreferredDevice(currentDevices, cfg.deviceId, cfg.deviceLabel);
      const targetDeviceId = matched?.deviceId || cfg.deviceId || 'default';
      const targetLabel = matched?.label || cfg.deviceLabel || '';

      try {
        const session = new AudioCaptureSession({
          deviceId: targetDeviceId,
          deviceLabel: targetLabel,
          channel: cfg.channel ?? 'mix',
          noiseSuppression: cfg.noiseSuppression ?? 'auto',
          onLevel: setLevel,
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
        const resolvedAfter = resolvePreferredDevice(afterGrant, targetDeviceId, targetLabel);
        if (
          resolvedAfter &&
          (resolvedAfter.deviceId !== cfg.deviceId || resolvedAfter.label !== cfg.deviceLabel)
        ) {
          const next = {
            ...settingsRef.current,
            deviceId: resolvedAfter.deviceId,
            deviceLabel: resolvedAfter.label,
          };
          setSettings(next);
          settingsRef.current = next;
          await writeSetting('voice', next);
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
    [
      ensureWorker,
      refreshDevices,
      setSettings,
      settingsRef,
      startAsrForSettings,
      stopCaptureHardware,
      workerRef,
    ]
  );

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) {
      return;
    }
    const handleDeviceChange = async () => {
      const list = await refreshDevices();
      if (list.length === 0 && isListeningRef.current) {
        setPermissionState('no-device');
        setPermissionError(
          'No audio input devices found. Reconnect your microphone or USB interface.'
        );
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
  }, [refreshDevices, settingsRef, startCaptureHardware, stopCaptureHardware]);

  useEffect(() => {
    return () => {
      captureRef.current?.stop();
      stopAsrEngines(true);
    };
  }, [stopAsrEngines]);

  const setLiveChannel = useCallback((channel: 'mix' | 1 | 2): boolean => {
    if (!captureRef.current?.isActive()) return false;
    captureRef.current.setChannel(channel);
    return true;
  }, []);

  const runMicTest = useCallback(async (): Promise<MicTestReport | null> => {
    if (isTestingRef.current) return null;
    const wasListeningBefore = isListeningRef.current && !isPausedRef.current;

    setMicTestReport(null);
    setIsTestingMic(true);
    isTestingRef.current = true;
    testBufferRef.current = [];
    setMicTestCountdown(3);

    if (!wasListeningBefore) {
      const started = await startCaptureHardware(settingsRef.current);
      if (!started) {
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
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
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
  }, [settingsRef, startCaptureHardware, stopCaptureHardware, workerRef]);

  const clearMicTestReport = useCallback(() => setMicTestReport(null), []);

  return {
    devices,
    refreshDevices,
    permissionState,
    permissionError,
    isListening,
    isListeningRef,
    isPaused,
    setIsPaused,
    isPausedRef,
    level,
    isTestingMic,
    micTestCountdown,
    micTestReport,
    clearMicTestReport,
    startCaptureHardware,
    stopCaptureHardware,
    setLiveChannel,
    runMicTest,
  };
}
