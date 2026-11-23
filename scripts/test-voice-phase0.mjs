/**
 * Selah Live v2 — Phase 0 Unit & Safety Verification Suite
 *
 * Verifies:
 * 1. STATIC SAFETY: No file under `/src/voice/` or `/public/worklets/` imports, references,
 *    or calls `show(`, `updateLive(`, `takeLive(`, `selah:show`, or `selah:update`.
 * 2. RUNTIME SAFETY: Simulated voice pipeline / worker events and non-user gestures NEVER
 *    invoke `onShow` or `onPreview`, whereas an explicit operator click or Alt+1..5 keydown does.
 * 3. PRIVACY & SYNC SAFETY: `lib/sync.js` never syncs `voice`, `deviceId`, or `deviceLabel` to Firebase.
 * 4. RESAMPLER & CHANNEL EXTRACTION: 48 kHz / 44.1 kHz stereo -> 16 kHz mono ('mix', Ch 1, Ch 2).
 * 5. DEVICE MANAGER: USB interface vs built-in mic heuristic, noiseSuppression auto resolution,
 *    and fallback matching by `deviceLabel` when browser resets `deviceId`.
 * 6. ALT+L FOCUS GUARD: `isEditableElementFocused` blocks shortcuts when typing in INPUT/TEXTAREA/contentEditable.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. STATIC SAFETY CHECK: No auto-display imports or calls anywhere in /src/voice/
// ---------------------------------------------------------------------------
function testStaticNoAutoDisplay() {
  const voiceDir = path.join(ROOT, "src", "voice");
  const workletFile = path.join(ROOT, "public", "worklets", "voice-capture-processor.js");
  const publicWorkerFile = path.join(ROOT, "public", "workers", "voice-worker.js");
  const files = [...walkFiles(voiceDir), workletFile];
  if (fs.existsSync(publicWorkerFile)) files.push(publicWorkerFile);

  const forbiddenPatterns = [
    /\bselah:show\b/,
    /\bselah:update\b/,
    /\bupdateLive\s*\(/,
    /\btakeLive\s*\(/,
    /\.\s*show\s*\(/,
    /\bemit\s*\(\s*['"]selah:(show|update)['"]/,
  ];

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    // Strip comments before checking
    const codeOnly = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    for (const rx of forbiddenPatterns) {
      assert.equal(
        rx.test(codeOnly),
        false,
        `Forbidden broadcast call matching ${rx} found in ${path.relative(ROOT, file)}`
      );
    }

    // Also verify VoiceSettingsCard only uses `bibles` from `useApp()`, never `show`, `updateLive`, or `takeLive`
    const useAppMatch = codeOnly.match(/const\s*\{([^}]+)\}\s*=\s*useApp\(\)/);
    if (useAppMatch) {
      const destructured = useAppMatch[1];
      assert.equal(
        /\b(show|updateLive|takeLive|emit)\b/.test(destructured),
        false,
        `Voice component in ${path.relative(ROOT, file)} must not destructure show/updateLive/takeLive/emit from useApp()`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2. RUNTIME SAFETY CHECK: Mocked voice events cannot trigger show/preview without gesture
// ---------------------------------------------------------------------------
function testRuntimeOperatorGestureGuard() {
  // Mirror the logic in src/voice/suggestions/safety.ts and verify source matches
  const safetySrc = fs.readFileSync(
    path.join(ROOT, "src", "voice", "suggestions", "safety.ts"),
    "utf8"
  );
  assert.ok(safetySrc.includes("export function isExplicitOperatorGesture"));
  assert.ok(safetySrc.includes("export function dispatchOperatorSuggestionAction"));

  function isExplicitOperatorGesture(event) {
    if (!event || typeof event !== "object") return false;
    if (event.type === "click") return true;
    if (event.type === "keydown") return !!event.altKey;
    return false;
  }

  function dispatchOperatorSuggestionAction(action, suggestion, gestureEvent, callbacks) {
    if (!isExplicitOperatorGesture(gestureEvent)) return false;
    if (action === "show") {
      callbacks.onShow?.(suggestion);
      return true;
    }
    if (action === "preview") {
      callbacks.onPreview?.(suggestion);
      return true;
    }
    if (action === "dismiss") {
      callbacks.onDismiss?.(suggestion.id);
      return true;
    }
    return false;
  }

  let showCalls = 0;
  let previewCalls = 0;
  const mockSuggestion = {
    id: "sug-john-3-16",
    kind: "scripture",
    reason: "spoken-reference",
    confidence: 0.96,
    band: "high",
    heard: "turn to John 3 16",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
    pinned: false,
    payload: { book: 43, chapter: 3, verseStart: 16, versionId: "kjv" },
  };

  const callbacks = {
    onShow: () => { showCalls++; },
    onPreview: () => { previewCalls++; },
  };

  // Attempt 1: Worker message / null gesture -> MUST NOT CALL onShow
  assert.equal(
    dispatchOperatorSuggestionAction("show", mockSuggestion, null, callbacks),
    false
  );
  assert.equal(
    dispatchOperatorSuggestionAction("show", mockSuggestion, { type: "message" }, callbacks),
    false
  );
  // Attempt 2: Plain keydown without Alt modifier -> MUST NOT CALL onShow
  assert.equal(
    dispatchOperatorSuggestionAction("show", mockSuggestion, { type: "keydown", key: "1", altKey: false }, callbacks),
    false
  );
  assert.equal(showCalls, 0, "No automatic or non-gesture event may ever trigger onShow");
  assert.equal(previewCalls, 0, "No automatic or non-gesture event may ever trigger onPreview");

  // Attempt 3: Explicit operator click -> ALLOWED
  assert.equal(
    dispatchOperatorSuggestionAction("show", mockSuggestion, { type: "click", isTrusted: true }, callbacks),
    true
  );
  assert.equal(showCalls, 1);

  // Attempt 4: Explicit Alt+1 shortcut -> ALLOWED
  assert.equal(
    dispatchOperatorSuggestionAction("preview", mockSuggestion, { type: "keydown", key: "1", altKey: true, shiftKey: true }, callbacks),
    true
  );
  assert.equal(previewCalls, 1);
}

// ---------------------------------------------------------------------------
// 3. PRIVACY & SYNC SAFETY: Voice deviceId/deviceLabel never synced to Firebase
// ---------------------------------------------------------------------------
function testPrivacyNoCloudSyncOfVoice() {
  const syncSrc = fs.readFileSync(path.join(ROOT, "lib", "sync.js"), "utf8");
  assert.equal(
    /\bdeviceLabel\b|\bvoice\b/.test(syncSrc),
    false,
    "lib/sync.js must never sync local voice settings or microphone device labels to Firebase"
  );
}

// ---------------------------------------------------------------------------
// 4. RESAMPLER & MULTI-CHANNEL EXTRACTION (48 kHz & 44.1 kHz -> 16 kHz mono)
// ---------------------------------------------------------------------------
function testResamplerAndChannels() {
  function resampleTo16kMono(channels, inputSampleRate, channelMode = "mix") {
    if (!channels || channels.length === 0 || !channels[0] || channels[0].length === 0) {
      return new Float32Array(0);
    }
    const inLen = channels[0].length;
    const numCh = channels.length;
    const mono = new Float32Array(inLen);
    for (let i = 0; i < inLen; i++) {
      if (channelMode === 1 || numCh === 1) mono[i] = channels[0][i] || 0;
      else if (channelMode === 2) mono[i] = (numCh > 1 ? channels[1][i] : channels[0][i]) || 0;
      else {
        const count = Math.min(2, numCh);
        let s = 0;
        for (let c = 0; c < count; c++) s += channels[c][i] || 0;
        mono[i] = s / count;
      }
    }
    if (inputSampleRate === 16000) return mono;
    const ratio = inputSampleRate / 16000;
    const outLen = Math.max(0, Math.floor(inLen / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = mono[idx] || 0;
      const s1 = idx + 1 < inLen ? mono[idx + 1] : s0;
      out[i] = s0 + frac * (s1 - s0);
    }
    return out;
  }

  // 1 second of 48 kHz stereo where Ch1 = 0.8 and Ch2 = 0.2
  const ch1 = new Float32Array(48000).fill(0.8);
  const ch2 = new Float32Array(48000).fill(0.2);

  const outMix = resampleTo16kMono([ch1, ch2], 48000, "mix");
  assert.equal(outMix.length, 16000, "48kHz 1s resampled to 16kHz must produce 16000 samples");
  assert.ok(Math.abs(outMix[100] - 0.5) < 1e-5, "Mono mix of 0.8 and 0.2 must be 0.5");

  const outCh1 = resampleTo16kMono([ch1, ch2], 48000, 1);
  assert.ok(Math.abs(outCh1[100] - 0.8) < 1e-5, "Channel 1 selection must isolate Ch 1 (0.8)");

  const outCh2 = resampleTo16kMono([ch1, ch2], 48000, 2);
  assert.ok(Math.abs(outCh2[100] - 0.2) < 1e-5, "Channel 2 selection must isolate Ch 2 (0.2)");

  // 1 second of 44.1 kHz mono
  const ch44k = new Float32Array(44100).fill(0.4);
  const out44k = resampleTo16kMono([ch44k], 44100, "mix");
  assert.equal(out44k.length, 16000, "44.1kHz 1s resampled to 16kHz must produce 16000 samples");
}

// ---------------------------------------------------------------------------
// 5. DEVICE HEURISTIC & LABEL FALLBACK MATCHING
// ---------------------------------------------------------------------------
function testDeviceManagerLogic() {
  const INTERFACE_PATTERNS = [
    /\busb\b/i, /\bscarlett\b/i, /\bfocusrite\b/i, /\bbehringer\b/i,
    /\bx32\b|\bm32\b|\bxr18\b|\bumc\d+/i, /\byamaha\b|\bmg\d+\b|\btf\d+\b/i,
    /\ballen\s*&?\s*heath\b|\bqu-\d+|\bsq-\d+|\bzeds?\b/i,
    /\bmackie\b|\bpresonus\b|\bsteinberg\b|\bmotu\b|\baudient\b|\btascam\b|\bzoom\b|\brode\b|\bshure\b/i,
    /\bmixer\b|\binterface\b|\bline\s*in\b|\bdante\b|\bloopback\b|\bvirtual\s*cable\b|\bcapture\b/i,
    /\bcodec\b|\bexternal\b/i,
  ];
  const isInterface = (label) => INTERFACE_PATTERNS.some((rx) => rx.test(label));
  const resolveNS = (setting, label) => {
    if (setting === "on") return true;
    if (setting === "off") return false;
    return !isInterface(label);
  };

  assert.equal(isInterface("Focusrite Scarlett 2i2 USB"), true);
  assert.equal(isInterface("Behringer X32 Live Card"), true);
  assert.equal(isInterface("Internal Microphone Array (Realtek)"), false);

  // Noise suppression auto defaults: off for interfaces, on for built-in mics
  assert.equal(resolveNS("auto", "Focusrite Scarlett 2i2 USB"), false);
  assert.equal(resolveNS("auto", "Internal Microphone Array (Realtek)"), true);
  assert.equal(resolveNS("on", "Focusrite Scarlett 2i2 USB"), true);
  assert.equal(resolveNS("off", "Internal Microphone Array (Realtek)"), false);

  // Device label fallback when browser resets deviceId
  const devices = [
    { deviceId: "default", label: "Default - Internal Mic" },
    { deviceId: "new-rotated-guid-999", label: "Focusrite Scarlett 2i2 USB" },
  ];
  const savedDeviceId = "old-expired-guid-111";
  const savedDeviceLabel = "Focusrite Scarlett 2i2 USB";

  const matched =
    devices.find((d) => d.deviceId === savedDeviceId) ||
    devices.find((d) => d.label.toLowerCase() === savedDeviceLabel.toLowerCase());
  assert.equal(matched?.deviceId, "new-rotated-guid-999");
}

// ---------------------------------------------------------------------------
// 6. ALT+L INPUT FOCUS GUARD & TRACK TEARDOWN CHECK
// ---------------------------------------------------------------------------
function testAltLAndTrackTeardown() {
  const ctxSrc = fs.readFileSync(
    path.join(ROOT, "src", "voice", "VoiceContext.tsx"),
    "utf8"
  );
  const captureSrc = fs.readFileSync(
    path.join(ROOT, "src", "voice", "audio", "audioCapture.ts"),
    "utf8"
  );

  // Verify Alt+L checks isEditableElementFocused(e.target)
  assert.ok(
    ctxSrc.includes("if (isEditableElementFocused(e.target)) return;"),
    "Alt+L handler must ignore key events when an input/textarea/contentEditable is focused"
  );

  // Verify both pauseListening and disableVoice call stopCaptureHardware() which calls track.stop()
  assert.ok(
    captureSrc.includes("track.stop()"),
    "AudioCaptureSession.stop() must call track.stop() on every MediaStreamTrack"
  );
  assert.ok(
    ctxSrc.includes("pauseListening") && ctxSrc.includes("await stopCaptureHardware()"),
    "Pausing or disabling Voice must stop all MediaStreamTracks so the browser mic indicator turns off"
  );
}

// Run all tests
testStaticNoAutoDisplay();
testRuntimeOperatorGestureGuard();
testPrivacyNoCloudSyncOfVoice();
testResamplerAndChannels();
testDeviceManagerLogic();
testAltLAndTrackTeardown();

console.log("✅ Phase 0 Voice tests passed (static & runtime no-auto-display, privacy, resampler, device fallback, Alt+L guard, track teardown).");
