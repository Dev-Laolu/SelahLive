import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type {
  HardwareProfile,
  InstalledModelsMap,
  ModelSizeProbe,
  SpeedCheckResult,
  WhisperModelId,
} from '../asr/type';
import type { SongForVoiceMatch } from '../detectors/type';
import type { SuggestionEngine } from '../suggestions/suggestionEngine';
import type {
  ActiveAsrMode,
  AudioInputDevice,
  BiblePack,
  LevelReading,
  MicPermissionState,
  MicTestReport,
  SavedTextItem,
  SuggestionFeedbackCounters,
  TranscriptSegment,
  TriggerRule,
  TriggerRuleInput,
  VoiceSettings,
} from '../type';
import type { VoiceWorkerClient } from '../workers/workerClient';

export interface DetectionPipelineInput {
  rollingText: string;
  segment: TranscriptSegment;
  settings: VoiceSettings;
  activeBibleId: string;
  bibles: BiblePack[];
  songs: SongForVoiceMatch[];
  savedTexts: SavedTextItem[];
  triggerRules: TriggerRule[];
  serviceContext: string[];
  engine: SuggestionEngine;
  now: number;
}

export interface DetectionPipelineOutcome {
  anyChanged: boolean;
  anyNewCard: boolean;
}

export interface UseVoicePersistenceResult {
  settings: VoiceSettings;
  setSettings: Dispatch<SetStateAction<VoiceSettings>>;
  settingsRef: MutableRefObject<VoiceSettings>;
  hardwareProfile: HardwareProfile;
  hardwareProfileRef: MutableRefObject<HardwareProfile>;
  installedModels: InstalledModelsMap;
  setInstalledModels: Dispatch<SetStateAction<InstalledModelsMap>>;
  installedModelsRef: MutableRefObject<InstalledModelsMap>;
  probedModelSizes: Record<WhisperModelId, ModelSizeProbe>;
  speedCheckResult: SpeedCheckResult | null;
  setSpeedCheckResult: Dispatch<SetStateAction<SpeedCheckResult | null>>;
  triggerRules: TriggerRule[];
  triggerRulesRef: MutableRefObject<TriggerRule[]>;
  saveTriggerRule: (input: TriggerRuleInput) => Promise<TriggerRule>;
  deleteTriggerRule: (id: string) => Promise<void>;
  serviceContext: string[];
  serviceContextRef: MutableRefObject<string[]>;
  addServiceContextItem: (label: string) => Promise<void>;
  removeServiceContextItem: (label: string) => Promise<void>;
  clearServiceContext: () => Promise<void>;
  feedbackCounters: SuggestionFeedbackCounters;
  recordFeedbackAction: (actionType: 'show' | 'preview' | 'dismiss') => void;
  resetFeedbackCounters: () => Promise<void>;
  initialBootPaused: boolean;
}

export interface UseAsrControllerParams {
  settingsRef: MutableRefObject<VoiceSettings>;
  setSettings: Dispatch<SetStateAction<VoiceSettings>>;
  hardwareProfileRef: MutableRefObject<HardwareProfile>;
  installedModelsRef: MutableRefObject<InstalledModelsMap>;
  setInstalledModels: Dispatch<SetStateAction<InstalledModelsMap>>;
  probedModelSizes: Record<WhisperModelId, ModelSizeProbe>;
  setSpeedCheckResult: Dispatch<SetStateAction<SpeedCheckResult | null>>;
  isListeningRef: MutableRefObject<boolean>;
  isPausedRef: MutableRefObject<boolean>;
  onSegment: (segment: TranscriptSegment) => void;
}

export interface UseAsrControllerResult {
  workerRef: MutableRefObject<VoiceWorkerClient | null>;
  ensureWorker: () => VoiceWorkerClient;
  stopAsrEngines: (terminateWorker?: boolean) => Promise<void>;
  resetModelFailures: () => void;
  activeAsrMode: ActiveAsrMode;
  setActiveAsrMode: Dispatch<SetStateAction<ActiveAsrMode>>;
  activeEngineDetail: string;
  engineNotice: string;
  showRetryWhisper: boolean;
  isRunningSpeedCheck: boolean;
  lastRtf: number | null;
  modelDownloadProgress: Partial<Record<WhisperModelId, number>>;
  modelError: string;
  setModelError: Dispatch<SetStateAction<string>>;
  startAsrForSettings: (cfg: VoiceSettings) => Promise<void>;
  runFirstRunSpeedCheck: (modelId?: WhisperModelId) => Promise<SpeedCheckResult | null>;
  downloadVoiceModel: (modelId: WhisperModelId) => Promise<boolean>;
  removeVoiceModel: (modelId: WhisperModelId) => Promise<void>;
  retryWhisperEngine: () => Promise<void>;
}

export interface UseAudioCaptureParams {
  settingsRef: MutableRefObject<VoiceSettings>;
  setSettings: Dispatch<SetStateAction<VoiceSettings>>;
  workerRef: MutableRefObject<VoiceWorkerClient | null>;
  ensureWorker: () => VoiceWorkerClient;
  startAsrForSettings: (cfg: VoiceSettings) => Promise<void>;
  stopAsrEngines: (terminateWorker?: boolean) => Promise<void>;
  setActiveAsrMode: Dispatch<SetStateAction<ActiveAsrMode>>;
  initialBootPaused: boolean;
}

export interface UseAudioCaptureResult {
  devices: AudioInputDevice[];
  refreshDevices: () => Promise<AudioInputDevice[]>;
  permissionState: MicPermissionState;
  permissionError: string;
  isListening: boolean;
  isListeningRef: MutableRefObject<boolean>;
  isPaused: boolean;
  setIsPaused: Dispatch<SetStateAction<boolean>>;
  isPausedRef: MutableRefObject<boolean>;
  level: LevelReading;
  isTestingMic: boolean;
  micTestCountdown: number;
  micTestReport: MicTestReport | null;
  clearMicTestReport: () => void;
  startCaptureHardware: (cfg: VoiceSettings) => Promise<boolean>;
  stopCaptureHardware: () => Promise<void>;
  setLiveChannel: (channel: 'mix' | 1 | 2) => boolean;
  runMicTest: () => Promise<MicTestReport | null>;
}
