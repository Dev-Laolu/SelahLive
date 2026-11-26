'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import Select from '@/components/Select';
import { useToast } from '@/components/Toast';
import { useApp } from '@/lib/store';
import type { SavedTextItem } from '../../type';
import { useVoice } from '../../VoiceContext';

export function VoiceTriggersSection() {
  const { savedTexts = [] }: { savedTexts?: SavedTextItem[] | undefined } = useApp();
  const toast = useToast();
  const {
    settings,
    updateVoiceSettings,
    triggerRules,
    saveTriggerRule,
    deleteTriggerRule,
  } = useVoice();

  const [newTrgTextId, setNewTrgTextId] = useState('');
  const [newTrgPhrases, setNewTrgPhrases] = useState('');
  const [vocabInput, setVocabInput] = useState(
    (settings.customVocabulary ?? []).join(', ')
  );

  useEffect(() => {
    setVocabInput((settings.customVocabulary ?? []).join(', '));
  }, [settings.customVocabulary]);

  const handleAddRule = async () => {
    const targetId = newTrgTextId || savedTexts[0]?.id;
    if (!targetId) return;
    const phrases = newTrgPhrases
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (phrases.length === 0) return;

    await saveTriggerRule({ savedTextId: targetId, phrases, enabled: true });
    setNewTrgPhrases('');
  };

  const handleSaveVocabulary = async () => {
    const list = vocabInput
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean)
      .slice(0, 100);
    await updateVoiceSettings({ customVocabulary: list });
    toast(`Saved ${list.length} custom vocabulary ${list.length === 1 ? 'term' : 'terms'}.`);
  };

  return (
    <div
      className="col"
      style={{ gap: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}
    >
      <span className="label">Intent Trigger Phrases &amp; Custom Vocabulary (MD-6 / ST-7)</span>
      <span className="muted" style={{ fontSize: 12 }}>
        Built-in triggers already match <b>Offering / Tithes</b>, <b>Welcome</b>, <b>Prayer</b>,{' '}
        <b>Announcements</b>, and <b>Thank You</b> slides by title or tag. Add your own trigger phrases below for any Saved Text.{' '}
        <i>
          Note: Whisper tiny.en and base.en are English-only models, so non-English phrases (such as Yoruba or Pidgin) have limited recognition accuracy in v2.0.
        </i>
      </span>

      {savedTexts.length > 0 && (
        <div className="card raised col" style={{ gap: 8, padding: 12 }}>
          <div className="grid2">
            <div className="field">
              <label htmlFor="voice-trg-text">Saved Text slide to suggest</label>
              <Select
                id="voice-trg-text"
                ariaLabel="Saved Text for trigger rule"
                value={newTrgTextId || savedTexts[0]?.id || ''}
                onChange={(val: string) => setNewTrgTextId(val)}
                options={savedTexts.map((t) => ({ value: t.id, label: t.title }))}
              />
            </div>
            <div className="field">
              <label htmlFor="voice-trg-phrases">Spoken trigger phrases (comma-separated)</label>
              <div className="row" style={{ gap: 6 }}>
                <input
                  id="voice-trg-phrases"
                  name="voiceTriggerPhrases"
                  className="input grow"
                  placeholder="e.g. offering time, bring your seed, time to give"
                  value={newTrgPhrases}
                  onChange={(e) => setNewTrgPhrases(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!newTrgPhrases.trim()}
                  onClick={handleAddRule}
                >
                  <Icon name="plus" size={14} /> Add Rule
                </button>
              </div>
            </div>
          </div>

          {triggerRules.length > 0 && (
            <div className="col" style={{ gap: 6, marginTop: 4 }}>
              {triggerRules.map((rule) => {
                const matchedSaved = savedTexts.find((t) => t.id === rule.savedTextId);
                return (
                  <div
                    key={rule.id}
                    className="row between wrap"
                    style={{
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <b className="gold">{matchedSaved?.title || 'Saved Text'}</b>
                      <span className="muted"> → when pastor says: </span>
                      <span>{rule.phrases.map((p) => `"${p}"`).join(', ')}</span>
                    </div>
                    <button
                      type="button"
                      className="iconbtn"
                      style={{ width: 26, height: 26 }}
                      aria-label="Delete trigger rule"
                      onClick={() => deleteTriggerRule(rule.id)}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="voice-custom-vocab">
          Custom vocabulary (church name, pastor names, special terms — comma-separated)
        </label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="voice-custom-vocab"
            name="voiceCustomVocabulary"
            className="input grow"
            placeholder="e.g. Selah Fellowship, Pastor Adeyemi, Shiloh"
            value={vocabInput}
            onChange={(e) => setVocabInput(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleSaveVocabulary}
          >
            Save vocabulary
          </button>
        </div>
      </div>
    </div>
  );
}
