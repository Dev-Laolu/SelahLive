import { readSetting, writeSetting } from '../context/storage';
import { getCatalogEntry } from './modelCatalog';
import type {
  InstalledModelsMap,
  InstalledVoiceModelRecord,
  ModelSizeProbe,
  WhisperModelId,
} from './type';

interface HuggingFaceSiblingBlob {
  rfilename: string;
  size?: number | undefined;
}

export async function probeRealModelSizeBytes(
  modelId: WhisperModelId
): Promise<ModelSizeProbe> {
  const entry = getCatalogEntry(modelId);
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { sizeBytes: entry.fallbackSizeBytes, isExact: false };
  }

  try {
    const res = await fetch(`https://huggingface.co/api/models/${entry.hfRepo}?blobs=true`);
    if (!res.ok) throw new Error('hf_api_error');

    const data = (await res.json()) as { siblings?: HuggingFaceSiblingBlob[] };
    const siblings = Array.isArray(data?.siblings) ? data.siblings : [];
    const targetFiles = new Set(entry.quantisedFiles);

    let total = 0;
    let matchedCount = 0;
    for (const sibling of siblings) {
      if (targetFiles.has(sibling.rfilename) && typeof sibling.size === 'number') {
        total += sibling.size;
        matchedCount++;
      }
    }

    if (matchedCount >= 2 && total > 1_000_000) {
      return { sizeBytes: total, isExact: true };
    }
  } catch {}

  return { sizeBytes: entry.fallbackSizeBytes, isExact: false };
}

export async function getInstalledVoiceModels(): Promise<InstalledModelsMap> {
  const saved = await readSetting<InstalledModelsMap>('voiceModels', {});
  return saved && typeof saved === 'object' ? saved : {};
}

export async function markVoiceModelInstalled(
  record: InstalledVoiceModelRecord
): Promise<InstalledModelsMap> {
  const current = await getInstalledVoiceModels();
  const next: InstalledModelsMap = { ...current, [record.id]: record };
  await writeSetting('voiceModels', next);
  return next;
}

export async function removeInstalledVoiceModel(
  modelId: WhisperModelId
): Promise<InstalledModelsMap> {
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
  const next: InstalledModelsMap = { ...current };
  delete next[modelId];
  await writeSetting('voiceModels', next);
  return next;
}
