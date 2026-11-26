import type { TriggerRule } from '../type';
import { BUILT_IN_INTENT_CATEGORIES } from './intentCategories';
import type {
  BuiltInIntentCategory,
  IntentTriggerMatchResult,
  SavedTextForTrigger,
  ServiceContextBoostResult,
} from './type';

export { BUILT_IN_INTENT_CATEGORIES };

function cleanPhrase(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findSavedTextForCategory(
  category: BuiltInIntentCategory,
  savedTexts: SavedTextForTrigger[]
): SavedTextForTrigger | null {
  for (const item of savedTexts) {
    const haystack = `${item.id} ${item.title} ${(item.tags ?? []).join(' ')}`.toLowerCase();
    if (category.matchKeywords.some((kw) => haystack.includes(kw))) {
      return item;
    }
  }
  return null;
}

export function matchIntentTriggers(
  rawTranscript: string,
  savedTexts: SavedTextForTrigger[],
  customRules: TriggerRule[] = []
): IntentTriggerMatchResult[] {
  if (!rawTranscript || savedTexts.length === 0) return [];
  const norm = cleanPhrase(rawTranscript);
  if (norm.length < 5) return [];

  const matches: IntentTriggerMatchResult[] = [];
  const matchedTextIds = new Set<string>();

  for (const rule of customRules) {
    if (!rule?.enabled || !rule.savedTextId || !Array.isArray(rule.phrases)) continue;
    const targetText = savedTexts.find((t) => t.id === rule.savedTextId);
    if (!targetText) continue;

    for (const rawPhrase of rule.phrases) {
      const phrase = cleanPhrase(rawPhrase);
      if (phrase.length >= 3 && norm.includes(phrase)) {
        matchedTextIds.add(targetText.id);
        matches.push({
          savedTextId: targetText.id,
          title: targetText.title,
          triggerId: rule.id,
          matchedPhrase: rawPhrase.trim(),
          confidence: 0.94,
          band: 'high',
          heardExcerpt: rawTranscript.trim().slice(-80),
        });
        break;
      }
    }
  }

  for (const category of BUILT_IN_INTENT_CATEGORIES) {
    const targetText = findSavedTextForCategory(category, savedTexts);
    if (!targetText || matchedTextIds.has(targetText.id)) continue;

    for (const phrase of category.phrases) {
      const cleaned = cleanPhrase(phrase);
      if (norm.includes(cleaned)) {
        matchedTextIds.add(targetText.id);
        matches.push({
          savedTextId: targetText.id,
          title: targetText.title,
          triggerId: category.id,
          matchedPhrase: phrase,
          confidence: 0.9,
          band: 'high',
          heardExcerpt: rawTranscript.trim().slice(-80),
        });
        break;
      }
    }
  }

  return matches;
}

export function applyServiceContextBoost(
  itemTitleOrRef: string,
  baseConfidence: number,
  serviceContextItems: string[] = []
): ServiceContextBoostResult {
  if (serviceContextItems.length === 0 || !itemTitleOrRef) {
    return { confidence: baseConfidence, boosted: false };
  }
  const cleanTarget = cleanPhrase(itemTitleOrRef);
  if (!cleanTarget) return { confidence: baseConfidence, boosted: false };

  for (const rawEntry of serviceContextItems) {
    const cleanEntry = cleanPhrase(rawEntry);
    if (!cleanEntry) continue;
    const isMatch =
      cleanTarget === cleanEntry ||
      cleanTarget.startsWith(cleanEntry) ||
      cleanEntry.startsWith(cleanTarget);
    if (isMatch) {
      return {
        confidence: Number(Math.min(0.99, baseConfidence + 0.12).toFixed(2)),
        boosted: true,
      };
    }
  }

  return { confidence: baseConfidence, boosted: false };
}
