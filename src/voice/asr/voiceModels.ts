/**
 * Selah Live v2 — Voice Models Catalog, Real Size Probing & Offline Cache Manager (ST-3, ST-4, PRD §6)
 *
 * - Default to Hugging Face Hub CDN used by Transformers.js (`onnx-community/whisper-tiny.en`
 *   and `onnx-community/whisper-base.en`, plus accuracy option `onnx-community/whisper-small.en`).
 * - Checks real download sizes via Hugging Face API / HEAD requests before showing them to users
 *   (with accurate fallback estimates when offline).
 * - Each model download is an explicit, visible user action in Library -> Voice models.
 * - Cached inside the browser's Cache Storage (`transformers-cache`) and tracked in IndexedDB
 *   (`settings -> voiceModels`), with one-click Remove to delete cached weights.
 */

import { getKey, setKey } from '@/lib/db';
import type { VoiceSettings } from '../types';

export type WhisperModelId = VoiceSettings['whisperModel']; // 'tiny.en' | 'base.en' | 'small.en'

export interface VoiceModelCatalogEntry {
  id: WhisperModelId;
  hfRepo: string;
  name: string;
  badge: string;
  description: string;
  recommendedRamGb: number;
  fallbackSizeBytes: number;
  quantisedFiles: string[];
}

export interface InstalledVoiceModelRecord {
  id: WhisperModelId;
  hfRepo: string;
  installedAt: string;
  sizeBytes: number;
  backend: 'webgpu' | 'wasm';
}

export const VOICE_MODELS_CATALOG: VoiceModelCatalogEntry[] = [
  {
    id: 'tiny.en',
    hfRepo: 'onnx-community/whisper-tiny.en',
    name: 'Whisper Tiny (English)',
    badge: 'Fastest · Weak laptops (4 GB+ RAM)',
    description:
      'Lightest offline speech model. Best for older laptops or when running OBS and streaming on integrated graphics.',
    recommendedRamGb: 4,
    fallbackSizeBytes: 43_500_000, // ~41.5 MB quantised q8 ONNX + tokenizer
    quantisedFiles: [
      'config.json',
      'generation_config.json',
      'tokenizer.json',
      'preprocessor_config.json',
      'onnx/encoder_model_quantized.onnx',
      'onnx/decoder_model_merged_quantized.onnx',
    ],
  },
  {
    id: 'base.en',
    hfRepo: 'onnx-community/whisper-base.en',
    name: 'Whisper Base (English)',
    badge: 'Recommended Default (8 GB+ RAM)',
    description:
      'Best balance of real-time speed and accuracy for spoken Bible references, sermon phrases, and church acoustics.',
    recommendedRamGb: 8,
    fallbackSizeBytes: 79_800_000, // ~76.1 MB quantised q8 ONNX + tokenizer
    quantisedFiles: [
      'config.json',
      'generation_config.json',
      'tokenizer.json',
      'preprocessor_config.json',
      'onnx/encoder_model_quantized.onnx',
      'onnx/decoder_model_merged_quantized.onnx',
    ],
  },
  {
    id: 'small.en',
    hfRepo: 'onnx-community/whisper-small.en',
    name: 'Whisper Small (English)',
    badge: 'High Accuracy · Strong GPUs (16 GB+ RAM)',
    description:
      'Higher accuracy on diverse English accents and rapid speech. Recommended only for strong laptops with WebGPU.',
    recommendedRamGb: 16,
    fallbackSizeBytes: 254_000_000, // ~242 MB quantised q8 ONNX + tokenizer
    quantisedFiles: [
      'config.json',
      'generation_config.json',
      'tokenizer.json',
      'preprocessor_config.json',
      'onnx/encoder_model_quantized.onnx',
      'onnx/decoder_model_merged_quantized.onnx',
    ],
  },
];

export function getCatalogEntry(modelId: WhisperModelId): VoiceModelCatalogEntry {
  return (
    VOICE_MODELS_CATALOG.find((m) => m.id === modelId) || VOICE_MODELS_CATALOG[1]
  );
}

/**
 * Queries the Hugging Face Hub API (`https://huggingface.co/api/models/<repo>?blobs=true`)
 * to compute the exact byte size of the quantised ONNX files before downloading (ST-4).
 */
export async function probeRealModelSizeBytes(
  modelId: WhisperModelId
): Promise<{ sizeBytes: number; isExact: boolean }> {
  const entry = getCatalogEntry(modelId);
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { sizeBytes: entry.fallbackSizeBytes, isExact: false };
  }
  try {
    const res = await fetch(
      `https://huggingface.co/api/models/${entry.hfRepo}?blobs=true`,
      { method: 'GET' }
    );
    if (!res.ok) throw new Error('hf_api_error');
    const data = await res.json();
    const siblings: Array<{ rfilename: string; size?: number }> = Array.isArray(
      data?.siblings
    )
      ? data.siblings
      : [];
    const targetSet = new Set(entry.quantisedFiles);
    let total = 0;
    let matchedCount = 0;
    for (const s of siblings) {
      if (targetSet.has(s.rfilename) && typeof s.size === 'number') {
        total += s.size;
        matchedCount++;
      }
    }
    if (matchedCount >= 2 && total > 1_000_000) {
      return { sizeBytes: total, isExact: true };
    }
  } catch {}
  return { sizeBytes: entry.fallbackSizeBytes, isExact: false };
}

export async function getInstalledVoiceModels(): Promise<
  Record<WhisperModelId, InstalledVoiceModelRecord>
> {
  const saved = await getKey('settings', 'voiceModels', {});
  return (saved && typeof saved === 'object' ? saved : {}) as Record<
    WhisperModelId,
    InstalledVoiceModelRecord
  >;
}

export async function markVoiceModelInstalled(
  record: InstalledVoiceModelRecord
): Promise<Record<WhisperModelId, InstalledVoiceModelRecord>> {
  const current = await getInstalledVoiceModels();
  const next = { ...current, [record.id]: record };
  await setKey('settings', 'voiceModels', next);
  return next;
}

/**
 * Removes a downloaded Whisper model from the browser's Cache Storage (`transformers-cache`)
 * and removes its installed record from IndexedDB (ST-4).
 */
export async function removeInstalledVoiceModel(
  modelId: WhisperModelId
): Promise<Record<WhisperModelId, InstalledVoiceModelRecord>> {
  const entry = getCatalogEntry(modelId);
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cacheNames = await window.caches.keys();
      for (const name of cacheNames) {
        if (name.includes('transformers') || name.includes('onnx') || name.includes('hf')) {
          const cache = await window.caches.open(name);
          const requests = await cache.keys();
          for (const req of requests) {
            if (req.url.includes(entry.hfRepo) || req.url.includes(`whisper-${modelId}`)) {
              await cache.delete(req);
            }
          }
        }
      }
    } catch {}
  }

  const current = await getInstalledVoiceModels();
  const next = { ...current };
  delete next[modelId];
  await setKey('settings', 'voiceModels', next);
  return next;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
