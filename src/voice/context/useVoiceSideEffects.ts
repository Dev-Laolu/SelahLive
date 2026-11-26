import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { SongForVoiceMatch } from '../detectors/type';
import { resolveSuggestionView } from '../suggestions/resolver';
import type { SuggestionEngine } from '../suggestions/suggestionEngine';
import type {
  BiblePack,
  ObsEmitFn,
  SavedTextItem,
  Suggestion,
  VoiceSettings,
} from '../type';
import { isEditableElementFocused } from './domUtils';

export interface UseVoiceSideEffectsParams {
  suggestions: Suggestion[];
  setSuggestions: Dispatch<SetStateAction<Suggestion[]>>;
  suggestionEngineRef: MutableRefObject<SuggestionEngine>;
  emit?: ObsEmitFn | undefined;
  biblesRef: MutableRefObject<BiblePack[]>;
  activeBibleIdRef: MutableRefObject<string>;
  songsRef: MutableRefObject<SongForVoiceMatch[]>;
  savedTextsRef: MutableRefObject<SavedTextItem[]>;
  settingsRef: MutableRefObject<VoiceSettings>;
  togglePauseListening: () => Promise<void>;
}

export function useVoiceSideEffects({
  suggestions,
  setSuggestions,
  suggestionEngineRef,
  emit,
  biblesRef,
  activeBibleIdRef,
  songsRef,
  savedTextsRef,
  settingsRef,
  togglePauseListening,
}: UseVoiceSideEffectsParams): void {
  useEffect(() => {
    if (!emit) return;
    const top3 = suggestions.slice(0, 3).map((sug) => ({
      id: sug.id,
      kind: sug.kind,
      reason: sug.reason,
      band: sug.band,
      confidence: sug.confidence,
      heard: sug.heard,
      item: resolveSuggestionView(sug, {
        bibles: biblesRef.current,
        activeBibleId: activeBibleIdRef.current,
        defaultVersionId: settingsRef.current.defaultVersionId,
        songs: songsRef.current,
        savedTexts: savedTextsRef.current,
      }),
    }));
    emit('selah:suggest', { suggestions: top3 });
  }, [activeBibleIdRef, biblesRef, emit, savedTextsRef, settingsRef, songsRef, suggestions]);

  useEffect(() => {
    const onDockAction = (e: Event) => {
      const detail = (e as CustomEvent<{ suggestionId?: string; action?: string }>).detail ?? {};
      if (detail.suggestionId && (detail.action === 'show' || detail.action === 'dismiss')) {
        setSuggestions(
          suggestionEngineRef.current.markShownOrDismissed(detail.suggestionId, Date.now())
        );
      }
    };
    window.addEventListener('selah-dock-suggest-action', onDockAction);
    return () => window.removeEventListener('selah-dock-suggest-action', onDockAction);
  }, [setSuggestions, suggestionEngineRef]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (suggestionEngineRef.current.pruneExpired(Date.now())) {
        setSuggestions(suggestionEngineRef.current.getActive());
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [setSuggestions, suggestionEngineRef]);

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
  }, [settingsRef, togglePauseListening]);
}
