import {
  MAX_TRANSCRIPT_SEGMENTS,
  TRANSCRIPT_RETENTION_MS,
} from '../constants';
import {
  applyServiceContextBoost,
  matchIntentTriggers,
  matchSpokenSongs,
  matchSpokenVerseQuotes,
  parseSpokenReferences,
} from '../detectors';
import type { TranscriptSegment } from '../type';
import type { DetectionPipelineInput, DetectionPipelineOutcome } from './type';

export function mergeTranscriptSegment(
  previous: TranscriptSegment[],
  incoming: TranscriptSegment,
  now: number
): TranscriptSegment[] {
  const cutoff = now - TRANSCRIPT_RETENTION_MS;
  const recent = previous.filter((item) => item.endMs >= cutoff);
  const exactIdx = recent.findIndex((item) => item.id === incoming.id);

  if (exactIdx >= 0) {
    return recent.map((item, idx) => (idx === exactIdx ? incoming : item));
  }

  const lastIdx = recent.length - 1;
  const lastItem = lastIdx >= 0 ? recent[lastIdx] : undefined;
  if (
    lastItem &&
    !lastItem.isFinal &&
    incoming.id.split('-')[0] === lastItem.id.split('-')[0]
  ) {
    return [...recent.slice(0, lastIdx), incoming];
  }

  return [...recent, incoming].slice(-MAX_TRANSCRIPT_SEGMENTS);
}

export function runDetectionPipeline(
  input: DetectionPipelineInput
): DetectionPipelineOutcome {
  const {
    rollingText,
    segment,
    settings,
    activeBibleId,
    bibles,
    songs,
    savedTexts,
    triggerRules,
    serviceContext,
    engine,
    now,
  } = input;

  const defaultVer = settings.defaultVersionId || activeBibleId || '';
  const ingestOpts = { sensitivity: settings.sensitivity, now };
  let anyChanged = false;
  let anyNewCard = false;

  const directRefs = parseSpokenReferences(segment.text);
  const rollingRefs = parseSpokenReferences(rollingText);
  const allRefs = [...directRefs];
  for (const ref of rollingRefs) {
    if (!allRefs.some((d) => d.canonicalRef === ref.canonicalRef)) {
      allRefs.push(ref);
    }
  }

  for (const ref of allRefs) {
    const boost = applyServiceContextBoost(ref.canonicalRef, ref.confidence, serviceContext);
    const res = engine.ingest(
      {
        kind: 'scripture',
        reason: boost.boosted ? 'service-context' : 'spoken-reference',
        confidence: boost.confidence,
        band: boost.boosted ? 'high' : ref.band,
        heard: ref.matchedExcerpt,
        payload: {
          book: ref.book,
          chapter: ref.chapter,
          verseStart: ref.verseStart,
          verseEnd: ref.verseEnd,
          versionId: defaultVer,
        },
      },
      ingestOpts
    );
    if (res.changed) anyChanged = true;
    if (res.createdNew) anyNewCard = true;
  }

  const intentMatches = matchIntentTriggers(rollingText, savedTexts, triggerRules);
  for (const im of intentMatches) {
    const boost = applyServiceContextBoost(im.title, im.confidence, serviceContext);
    const res = engine.ingest(
      {
        kind: 'text',
        reason: 'intent-trigger',
        confidence: boost.confidence,
        band: 'high',
        heard: im.matchedPhrase,
        payload: { savedTextId: im.savedTextId, triggerId: im.triggerId },
      },
      ingestOpts
    );
    if (res.changed) anyChanged = true;
    if (res.createdNew) anyNewCard = true;
  }

  const songMatches = matchSpokenSongs(rollingText, songs);
  for (const sm of songMatches) {
    const boost = applyServiceContextBoost(sm.title, sm.confidence, serviceContext);
    const res = engine.ingest(
      {
        kind: 'song',
        reason: sm.reason,
        confidence: boost.confidence,
        band: boost.boosted ? 'high' : sm.band,
        heard: sm.matchedLine || sm.heardExcerpt,
        payload: {
          songId: sm.songId,
          slideIndex: sm.slideIndex,
          matchedLine: sm.matchedLine,
        },
      },
      ingestOpts
    );
    if (res.changed) anyChanged = true;
    if (res.createdNew) anyNewCard = true;
  }

  if (allRefs.length === 0 && (segment.isFinal || rollingText.split(/\s+/).length >= 8)) {
    const quoteMatches = matchSpokenVerseQuotes(rollingText, bibles, defaultVer);
    for (const qm of quoteMatches) {
      const boost = applyServiceContextBoost(qm.canonicalRef, qm.confidence, serviceContext);
      const res = engine.ingest(
        {
          kind: 'scripture',
          reason: 'quote-match',
          confidence: boost.confidence,
          band: boost.boosted ? 'high' : qm.band,
          heard: qm.heardExcerpt,
          payload: {
            book: qm.book,
            chapter: qm.chapter,
            verseStart: qm.verseStart,
            versionId: qm.versionId || defaultVer,
          },
        },
        ingestOpts
      );
      if (res.changed) anyChanged = true;
      if (res.createdNew) anyNewCard = true;
    }
  }

  return { anyChanged, anyNewCard };
}
