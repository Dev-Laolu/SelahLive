'use client';

import React, { useState } from 'react';
import { useVoice } from '../VoiceContext';
import { VoiceAudioInputSection } from './settings/VoiceAudioInputSection';
import { VoiceEngineSection } from './settings/VoiceEngineSection';
import { VoiceHeaderSection } from './settings/VoiceHeaderSection';
import { VoiceTriggersSection } from './settings/VoiceTriggersSection';

export function VoiceSettingsCard() {
  const {
    settings,
    permissionState,
    enableAndStartListening,
    disableVoice,
    runMicTest,
  } = useVoice();

  const [showPermissionIntro, setShowPermissionIntro] = useState(false);

  const handleToggleEnabled = async () => {
    if (settings.enabled) {
      await disableVoice();
      setShowPermissionIntro(false);
    } else if (permissionState === 'unrequested') {
      setShowPermissionIntro(true);
    } else {
      await enableAndStartListening();
    }
  };

  const handleConfirmPermission = async () => {
    setShowPermissionIntro(false);
    await enableAndStartListening();
  };

  const handleRequestMicTest = () => {
    if (permissionState === 'unrequested' && !settings.enabled) {
      setShowPermissionIntro(true);
    } else {
      runMicTest();
    }
  };

  return (
    <div className="card col" id="voice-settings">
      <VoiceHeaderSection
        showPermissionIntro={showPermissionIntro}
        onToggleEnabled={handleToggleEnabled}
        onConfirmPermission={handleConfirmPermission}
        onCancelPermission={() => setShowPermissionIntro(false)}
      />
      <VoiceAudioInputSection onRequestMicTest={handleRequestMicTest} />
      <VoiceEngineSection />
      <VoiceTriggersSection />
    </div>
  );
}
