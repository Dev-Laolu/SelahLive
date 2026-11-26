import { useCallback, useEffect, useRef, useState } from 'react';
import { recommendWhisperModel } from '../asr/engineManager';
import { readSetting, writeSetting } from './storage';
import {
  DEFAULT_PROBED_MODEL_SIZES,
  getInstalledVoiceModels,
  probeRealModelSizeBytes,
  VOICE_MODELS_CATALOG,
} from '../asr/voiceModels';
import type {
  HardwareProfile,
  InstalledModelsMap,
  ModelSizeProbe,
  SpeedCheckResult,
  WhisperModelId,
} from '../asr/type';
import { detectHardwareProfile } from '../audio/chime';
import { DEFAULT_VOICE_SETTINGS, ZERO_FEEDBACK_COUNTERS } from '../constants';
import type {
  SuggestionFeedbackCounters,
  TriggerRule,
  TriggerRuleInput,
  VoiceSettings,
} from '../type';
import type { UseVoicePersistenceResult } from './type';

const DEFAULT_HARDWARE: HardwareProfile = {
  deviceMemoryGb: 8,
  hardwareConcurrency: 4,
  hasWebGpu: false,
};

export function useVoicePersistence(): UseVoicePersistenceResult {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile>(DEFAULT_HARDWARE);
  const [installedModels, setInstalledModels] = useState<InstalledModelsMap>({});
  const [probedModelSizes, setProbedModelSizes] = useState<
    Record<WhisperModelId, ModelSizeProbe>
  >(DEFAULT_PROBED_MODEL_SIZES);
  const [speedCheckResult, setSpeedCheckResult] = useState<SpeedCheckResult | null>(null);
  const [triggerRules, setTriggerRules] = useState<TriggerRule[]>([]);
  const [serviceContext, setServiceContext] = useState<string[]>([]);
  const [feedbackCounters, setFeedbackCounters] =
    useState<SuggestionFeedbackCounters>(ZERO_FEEDBACK_COUNTERS);
  const [initialBootPaused, setInitialBootPaused] = useState(false);

  const settingsRef = useRef<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const hardwareProfileRef = useRef<HardwareProfile>(DEFAULT_HARDWARE);
  const installedModelsRef = useRef<InstalledModelsMap>({});
  const triggerRulesRef = useRef<TriggerRule[]>([]);
  const serviceContextRef = useRef<string[]>([]);
  const feedbackCountersRef = useRef<SuggestionFeedbackCounters>(ZERO_FEEDBACK_COUNTERS);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { hardwareProfileRef.current = hardwareProfile; }, [hardwareProfile]);
  useEffect(() => { installedModelsRef.current = installedModels; }, [installedModels]);
  useEffect(() => { triggerRulesRef.current = triggerRules; }, [triggerRules]);
  useEffect(() => { serviceContextRef.current = serviceContext; }, [serviceContext]);

  useEffect(() => {
    (async () => {
      const [
        savedVoice,
        savedModels,
        savedSpeedCheck,
        savedTriggers,
        savedSvcCtx,
        savedFeedback,
        hw,
      ] = await Promise.all([
        readSetting<Partial<VoiceSettings> | null>('voice', null),
        getInstalledVoiceModels(),
        readSetting<SpeedCheckResult | null>('voiceSpeedCheck', null),
        readSetting<TriggerRule[]>('voiceTriggers', []),
        readSetting<string[]>('voiceServiceContext', []),
        readSetting<Partial<SuggestionFeedbackCounters> | null>('voiceFeedbackCounters', null),
        detectHardwareProfile(),
      ]);

      setHardwareProfile(hw);
      hardwareProfileRef.current = hw;

      if (savedFeedback && typeof savedFeedback === 'object') {
        const mergedFb: SuggestionFeedbackCounters = {
          shownCount: Number(savedFeedback.shownCount) || 0,
          previewedCount: Number(savedFeedback.previewedCount) || 0,
          dismissedCount: Number(savedFeedback.dismissedCount) || 0,
        };
        setFeedbackCounters(mergedFb);
        feedbackCountersRef.current = mergedFb;
      }

      if (Array.isArray(savedTriggers)) {
        setTriggerRules(savedTriggers);
        triggerRulesRef.current = savedTriggers;
      }
      if (Array.isArray(savedSvcCtx)) {
        setServiceContext(savedSvcCtx);
        serviceContextRef.current = savedSvcCtx;
      }
      if (savedSpeedCheck && typeof savedSpeedCheck === 'object') {
        setSpeedCheckResult(savedSpeedCheck);
      }

      setInstalledModels(savedModels);
      installedModelsRef.current = savedModels;

      const rec = recommendWhisperModel(hw, savedSpeedCheck?.rtf, savedSpeedCheck?.testedModelId);
      if (savedVoice && typeof savedVoice === 'object') {
        const merged: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS, ...savedVoice };
        setSettings(merged);
        settingsRef.current = merged;
        if (merged.enabled) setInitialBootPaused(true);
      } else {
        const initial: VoiceSettings = {
          ...DEFAULT_VOICE_SETTINGS,
          whisperModel: rec.recommendedModel,
        };
        setSettings(initial);
        settingsRef.current = initial;
      }

      for (const model of VOICE_MODELS_CATALOG) {
        probeRealModelSizeBytes(model.id).then((res) => {
          setProbedModelSizes((prev) => ({ ...prev, [model.id]: res }));
        });
      }
    })();
  }, []);

  const saveTriggerRule = useCallback(async (input: TriggerRuleInput): Promise<TriggerRule> => {
    const rule: TriggerRule = {
      id: input.id || `trg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      savedTextId: input.savedTextId,
      phrases: (input.phrases ?? []).map((p) => String(p).trim()).filter(Boolean),
      enabled: input.enabled !== false,
    };
    const prev = triggerRulesRef.current;
    const idx = prev.findIndex((r) => r.id === rule.id);
    const next = idx >= 0 ? prev.map((r, i) => (i === idx ? rule : r)) : [...prev, rule];
    setTriggerRules(next);
    triggerRulesRef.current = next;
    await writeSetting('voiceTriggers', next);
    return rule;
  }, []);

  const deleteTriggerRule = useCallback(async (id: string) => {
    const next = triggerRulesRef.current.filter((r) => r.id !== id);
    setTriggerRules(next);
    triggerRulesRef.current = next;
    await writeSetting('voiceTriggers', next);
  }, []);

  const addServiceContextItem = useCallback(async (label: string) => {
    const clean = String(label || '').trim();
    if (!clean) return;
    const prev = serviceContextRef.current;
    if (prev.some((x) => x.toLowerCase() === clean.toLowerCase())) return;
    const next = [...prev, clean].slice(0, 40);
    setServiceContext(next);
    serviceContextRef.current = next;
    await writeSetting('voiceServiceContext', next);
  }, []);

  const removeServiceContextItem = useCallback(async (label: string) => {
    const next = serviceContextRef.current.filter((x) => x !== label);
    setServiceContext(next);
    serviceContextRef.current = next;
    await writeSetting('voiceServiceContext', next);
  }, []);

  const clearServiceContext = useCallback(async () => {
    setServiceContext([]);
    serviceContextRef.current = [];
    await writeSetting('voiceServiceContext', []);
  }, []);

  const recordFeedbackAction = useCallback((actionType: 'show' | 'preview' | 'dismiss') => {
    const prev = feedbackCountersRef.current;
    const next: SuggestionFeedbackCounters = {
      shownCount: prev.shownCount + (actionType === 'show' ? 1 : 0),
      previewedCount: prev.previewedCount + (actionType === 'preview' ? 1 : 0),
      dismissedCount: prev.dismissedCount + (actionType === 'dismiss' ? 1 : 0),
    };
    feedbackCountersRef.current = next;
    setFeedbackCounters(next);
    writeSetting('voiceFeedbackCounters', next);
  }, []);

  const resetFeedbackCounters = useCallback(async () => {
    feedbackCountersRef.current = ZERO_FEEDBACK_COUNTERS;
    setFeedbackCounters(ZERO_FEEDBACK_COUNTERS);
    await writeSetting('voiceFeedbackCounters', ZERO_FEEDBACK_COUNTERS);
  }, []);

  return {
    settings,
    setSettings,
    settingsRef,
    hardwareProfile,
    hardwareProfileRef,
    installedModels,
    setInstalledModels,
    installedModelsRef,
    probedModelSizes,
    speedCheckResult,
    setSpeedCheckResult,
    triggerRules,
    triggerRulesRef,
    saveTriggerRule,
    deleteTriggerRule,
    serviceContext,
    serviceContextRef,
    addServiceContextItem,
    removeServiceContextItem,
    clearServiceContext,
    feedbackCounters,
    recordFeedbackAction,
    resetFeedbackCounters,
    initialBootPaused,
  };
}
