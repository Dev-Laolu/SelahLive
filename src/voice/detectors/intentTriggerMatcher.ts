/**
 * Selah Live v2 — Intent Triggers & Service Context Matcher (MD-6, MD-7)
 *
 * MD-6 Intent Triggers:
 * - Built-in phrase lists for:
 *   - Offering & Tithes ("offering time", "receive the offering", "tithes and offerings", "bring our tithes", "time to give")
 *   - Welcome ("welcome to church", "first time visitors", "glad you joined us", "welcome home")
 *   - Prayer ("let us pray", "bow our heads", "lift our hearts in prayer", "time of prayer")
 *   - Announcements ("church announcements", "weekly announcements", "upcoming events")
 *   - Benediction / Thank You ("thank you for joining", "god bless you as you go", "have a blessed week")
 * - Mapped automatically to the user's Saved Texts by matching ID, title, or tags,
 *   plus user-editable custom `TriggerRule`s per Saved Text in Settings -> Voice.
 *
 * MD-7 Service Context:
 * - Operator can preload today's expected verses, songs, and saved texts (e.g. "John 3:16", "Psalm 23", "Amazing Grace", "Offering today").
 * - Any suggestion matching an item in Service Context receives a +0.12 confidence boost (up to 0.99)
 *   and is upgraded to the 'high' confidence band so it ranks first.
 */

import type { TriggerRule } from '../types';

export interface SavedTextForTrigger {
  id: string;
  title: string;
  body: string;
  tags?: string[];
  templateId?: string;
}

export interface IntentTriggerMatchResult {
  savedTextId: string;
  title: string;
  triggerId: string;
  matchedPhrase: string;
  confidence: number;
  band: 'high' | 'medium';
  heardExcerpt: string;
}

export interface BuiltInIntentCategory {
  id: string;
  label: string;
  matchKeywords: string[]; // matches against savedText.id, savedText.title, or savedText.tags
  phrases: string[];
}

export const BUILT_IN_INTENT_CATEGORIES: BuiltInIntentCategory[] = [
  {
    id: 'intent-offering',
    label: 'Offering & Tithes',
    matchKeywords: ['offering', 'tithe', 'tithes', 'giving', 'give', 'seed'],
    phrases: [
      'offering time',
      'time for offering',
      'receive the offering',
      'take up the offering',
      'receive our offering',
      'bring your offering',
      'bring our tithes',
      'tithes and offerings',
      'tithe and offering',
      'time to give',
      'give online',
      'giving time',
    ],
  },
  {
    id: 'intent-welcome',
    label: 'Welcome & Visitors',
    matchKeywords: ['welcome', 'visitor', 'visitors', 'guest', 'first time'],
    phrases: [
      'welcome to church',
      'welcome home',
      'first time visitors',
      'first time guests',
      'visiting with us today',
      'glad you joined us',
      'welcome everyone',
    ],
  },
  {
    id: 'intent-prayer',
    label: 'Prayer Moment',
    matchKeywords: ['prayer', 'pray', 'intercession'],
    phrases: [
      'let us pray',
      'lets pray together',
      'bow our heads',
      'bow your heads',
      'lift our hearts in prayer',
      'go to the lord in prayer',
      'time of prayer',
    ],
  },
  {
    id: 'intent-announcements',
    label: 'Announcements',
    matchKeywords: ['announcement', 'announcements', 'events', 'notice', 'news'],
    phrases: [
      'church announcements',
      'weekly announcements',
      'few announcements',
      'upcoming events',
      'listen to the announcements',
    ],
  },
  {
    id: 'intent-thanks',
    label: 'Thank You / Dismissal',
    matchKeywords: ['thank you', 'thanks', 'dismissal', 'benediction', 'goodbye'],
    phrases: [
      'thank you for joining us',
      'thanks for worshipping with us',
      'have a blessed week',
      'service is dismissed',
    ],
  },
];

function cleanPhrase(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the best Saved Text corresponding to a built-in intent category.
 */
function findSavedTextForCategory(
  cat: BuiltInIntentCategory,
  savedTexts: SavedTextForTrigger[]
): SavedTextForTrigger | null {
  for (const st of savedTexts) {
    const hay = `${st.id} ${st.title} ${(st.tags || []).join(' ')}`.toLowerCase();
    if (cat.matchKeywords.some((kw) => hay.includes(kw))) {
      return st;
    }
  }
  return null;
}

/**
 * Matches spoken transcript against user custom `TriggerRule`s and built-in intent categories (MD-6).
 */
export function matchIntentTriggers(
  rawTranscript: string,
  savedTexts: SavedTextForTrigger[],
  customRules: TriggerRule[] = []
): IntentTriggerMatchResult[] {
  if (!rawTranscript || !savedTexts || savedTexts.length === 0) return [];
  const norm = cleanPhrase(rawTranscript);
  if (norm.length < 5) return [];

  const matches: IntentTriggerMatchResult[] = [];
  const matchedTextIds = new Set<string>();

  // 1. Check custom user-configured TriggerRules first (highest priority)
  for (const rule of customRules) {
    if (!rule || !rule.enabled || !rule.savedTextId || !Array.isArray(rule.phrases)) continue;
    const targetText = savedTexts.find((t) => t.id === rule.savedTextId);
    if (!targetText) continue;

    for (const rawPhrase of rule.phrases) {
      const p = cleanPhrase(rawPhrase);
      if (p.length < 3) continue;
      if (norm.includes(p)) {
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

  // 2. Check built-in intent categories
  for (const cat of BUILT_IN_INTENT_CATEGORIES) {
    const targetText = findSavedTextForCategory(cat, savedTexts);
    if (!targetText || matchedTextIds.has(targetText.id)) continue;

    for (const phrase of cat.phrases) {
      const p = cleanPhrase(phrase);
      if (norm.includes(p)) {
        matchedTextIds.add(targetText.id);
        matches.push({
          savedTextId: targetText.id,
          title: targetText.title,
          triggerId: cat.id,
          matchedPhrase: phrase,
          confidence: 0.90,
          band: 'high',
          heardExcerpt: rawTranscript.trim().slice(-80),
        });
        break;
      }
    }
  }

  return matches;
}

/**
 * MD-7 Service Context Boost:
 * Checks whether a candidate reference, song title, or saved text title is in the operator's
 * preloaded Service Context list for today's service, and returns a boosted confidence (+0.12, max 0.99).
 */
export function applyServiceContextBoost(
  itemTitleOrRef: string,
  baseConfidence: number,
  serviceContextItems: string[] = []
): { confidence: number; boosted: boolean } {
  if (!serviceContextItems || serviceContextItems.length === 0 || !itemTitleOrRef) {
    return { confidence: baseConfidence, boosted: false };
  }
  const cleanTarget = cleanPhrase(itemTitleOrRef);
  if (!cleanTarget) return { confidence: baseConfidence, boosted: false };

  for (const rawEntry of serviceContextItems) {
    const cleanEntry = cleanPhrase(rawEntry);
    if (!cleanEntry) continue;
    if (
      cleanTarget === cleanEntry ||
      cleanTarget.startsWith(cleanEntry) ||
      cleanEntry.startsWith(cleanTarget)
    ) {
      const boostedConf = Number(Math.min(0.99, baseConfidence + 0.12).toFixed(2));
      return { confidence: boostedConf, boosted: true };
    }
  }

  return { confidence: baseConfidence, boosted: false };
}
