import type { ModelSizeProbe, VoiceModelCatalogEntry, WhisperModelId } from './type';

const QUANTISED_WHISPER_FILES = [
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'preprocessor_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

const TINY_MODEL: VoiceModelCatalogEntry = {
  id: 'tiny.en',
  hfRepo: 'onnx-community/whisper-tiny.en',
  name: 'Whisper Tiny (English)',
  badge: 'Fastest · Weak laptops (4 GB+ RAM)',
  description:
    'Lightest offline speech model. Best for older laptops or when running OBS and streaming on integrated graphics.',
  recommendedRamGb: 4,
  fallbackSizeBytes: 43_500_000,
  quantisedFiles: QUANTISED_WHISPER_FILES,
};

const BASE_MODEL: VoiceModelCatalogEntry = {
  id: 'base.en',
  hfRepo: 'onnx-community/whisper-base.en',
  name: 'Whisper Base (English)',
  badge: 'Recommended Default (8 GB+ RAM)',
  description:
    'Best balance of real-time speed and accuracy for spoken Bible references, sermon phrases, and church acoustics.',
  recommendedRamGb: 8,
  fallbackSizeBytes: 79_800_000,
  quantisedFiles: QUANTISED_WHISPER_FILES,
};

const SMALL_MODEL: VoiceModelCatalogEntry = {
  id: 'small.en',
  hfRepo: 'onnx-community/whisper-small.en',
  name: 'Whisper Small (English)',
  badge: 'High Accuracy · Strong GPUs (16 GB+ RAM)',
  description:
    'Higher accuracy on diverse English accents and rapid speech. Recommended only for strong laptops with WebGPU.',
  recommendedRamGb: 16,
  fallbackSizeBytes: 254_000_000,
  quantisedFiles: QUANTISED_WHISPER_FILES,
};

export const VOICE_MODELS_CATALOG: VoiceModelCatalogEntry[] = [
  TINY_MODEL,
  BASE_MODEL,
  SMALL_MODEL,
];

export const DEFAULT_PROBED_MODEL_SIZES: Record<WhisperModelId, ModelSizeProbe> = {
  'tiny.en': { sizeBytes: TINY_MODEL.fallbackSizeBytes, isExact: false },
  'base.en': { sizeBytes: BASE_MODEL.fallbackSizeBytes, isExact: false },
  'small.en': { sizeBytes: SMALL_MODEL.fallbackSizeBytes, isExact: false },
};

export function getCatalogEntry(modelId: WhisperModelId): VoiceModelCatalogEntry {
  return VOICE_MODELS_CATALOG.find((m) => m.id === modelId) ?? BASE_MODEL;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
