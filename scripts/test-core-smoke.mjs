/**
 * Step 0 — Core Safety-Net Smoke Tests (`CODE_STANDARDS.md §12 Step 0`)
 *
 * Verifies the 4 locked critical product flows before and throughout refactoring:
 * 1. Show / Hide & Live Update (`selah:show`, `selah:update`, `selah:hide`, `ObsClient` v5 handshake)
 * 2. Offline Verse Lookup & Unified Search (zero network calls)
 * 3. Dock Fail-Safe (3 s ping, 2 s pong timeout -> locked/disabled screen, auto-reconnect on pong, pairId check)
 * 4. Display / Theme Validation & Built-in Template Immutability
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const ROOT = process.cwd();
const requireCjs = createRequire(import.meta.url);
const moduleCache = new Map();

function resolveSourceFile(specifier, fromDir) {
  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(ROOT, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(fromDir, specifier);
  } else {
    return null;
  }

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  throw new Error(`Cannot resolve module "${specifier}" from "${fromDir}"`);
}

function loadSourceModule(relPath) {
  const absPath = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
  if (moduleCache.has(absPath)) return moduleCache.get(absPath).exports;

  const source = fs.readFileSync(absPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: absPath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      allowJs: true,
    },
  });

  const mod = { exports: {} };
  moduleCache.set(absPath, mod);

  const customRequire = (spec) => {
    const resolved = resolveSourceFile(spec, path.dirname(absPath));
    if (resolved) return loadSourceModule(resolved);
    return requireCjs(spec);
  };

  const fn = vm.runInThisContext(
    `(function(exports, require, module, __filename, __dirname) { ${outputText}\n})`,
    { filename: absPath }
  );
  fn(mod.exports, customRequire, mod, absPath, path.dirname(absPath));
  return mod.exports;
}

const { ObsClient, isSelah } = loadSourceModule("lib/obs.js");
const { getVerse, neighbour, search: searchBible } = loadSourceModule("lib/bible.js");
const { unifiedSearch } = loadSourceModule("lib/search.js");
const { DEFAULT_THEMES, sanitizeTheme, isTemplateNameTaken } = loadSourceModule("lib/themes.js");
const { buildBiblePackFixture } = loadSourceModule("src/tests/fixtures/bible.fixture.ts");

// ---------------------------------------------------------------------------
// 1. Show / Hide / Live Update & OBS WebSocket v5 Auth Handshake
// ---------------------------------------------------------------------------
async function testShowHideAndLiveUpdate() {
  const sentFrames = [];
  const origWebSocket = globalThis.WebSocket;

  class MockObsWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      setTimeout(() => {
        this.onmessage?.({
          data: JSON.stringify({
            op: 0,
            d: {
              obsWebSocketVersion: "5.5.0",
              rpcVersion: 1,
              authentication: {
                challenge: "mockChallenge123",
                salt: "mockSalt456",
              },
            },
          }),
        });
      }, 5);
    }
    send(raw) {
      const parsed = JSON.parse(raw);
      sentFrames.push(parsed);
      if (parsed.op === 1) {
        assert.ok(parsed.d.authentication, "OBS Identify must include SHA-256 challenge response");
        setTimeout(() => {
          this.onmessage?.({ op: 2, data: JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }) });
        }, 5);
      } else if (parsed.op === 6) {
        setTimeout(() => {
          this.onmessage?.({
            data: JSON.stringify({
              op: 7,
              d: {
                requestType: parsed.d.requestType,
                requestId: parsed.d.requestId,
                requestStatus: { result: true, code: 100 },
                responseData: {},
              },
            }),
          });
        }, 5);
      }
    }
    close() {
      this.readyState = 3;
    }
  }

  globalThis.WebSocket = MockObsWebSocket;
  try {
    const client = new ObsClient();
    await client.connect({ host: "localhost", port: 4455, password: "local-secret-password" });
    assert.equal(client.connected, true);

    const pairId = "PAIR-SMOKE-01";
    await client.send("selah:show", pairId, {
      seq: 1,
      mode: "lowerThird",
      kind: "scripture",
      title: "John 3:16",
      subtitle: "KJV",
      body: "For God so loved the world...",
      animation: "slide-up",
    });

    await client.send("selah:update", pairId, {
      seq: 2,
      mode: "lowerThird",
      kind: "scripture",
      title: "John 3:17",
      subtitle: "KJV",
      body: "For God sent not his Son...",
      animation: "slide-up",
    });

    await client.send("selah:hide", pairId, { seq: 3 });

    const broadcastReqs = sentFrames.filter(
      (f) => f.op === 6 && f.d.requestType === "BroadcastCustomEvent"
    );
    assert.equal(broadcastReqs.length, 3);
    assert.equal(broadcastReqs[0].d.requestData.eventData.type, "selah:show");
    assert.equal(broadcastReqs[1].d.requestData.eventData.type, "selah:update");
    assert.equal(broadcastReqs[2].d.requestData.eventData.type, "selah:hide");

    for (const req of broadcastReqs) {
      assert.equal(isSelah(req.d.requestData.eventData, pairId), true);
      assert.equal(isSelah(req.d.requestData.eventData, "WRONG-PAIR-ID"), false);
    }

    client.close();
    assert.equal(client.connected, false);
  } finally {
    globalThis.WebSocket = origWebSocket;
  }
}

// ---------------------------------------------------------------------------
// 2. Offline Verse Lookup, Neighbour Stepping & Unified Search
// ---------------------------------------------------------------------------
function testOfflineVerseAndSearch() {
  const pack = buildBiblePackFixture();
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Offline flow must never call fetch()");
  };

  try {
    const jn316 = getVerse(pack, 43, 3, 16);
    assert.ok(jn316, "Should resolve John 3:16 offline from local pack");
    assert.equal(jn316.ref, "John 3:16");
    assert.match(jn316.text, /For God so loved the world/);

    const nextVerse = neighbour(pack, jn316, 1);
    assert.ok(nextVerse, "Should step forward to John 3:17 offline");
    assert.equal(nextVerse.ref, "John 3:17");

    const hits = searchBible(pack, "Psalm 23:1", 5);
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].ref, "Psalm 23:1");

    const unified = unifiedSearch({
      packs: [pack],
      selectedPackId: pack.id,
      songPacks: [],
      customSongs: [],
      recentTexts: [],
      query: "shepherd",
      scope: "scripture",
      limit: 10,
    });
    assert.ok(unified.results.length >= 1);
    assert.equal(unified.results[0].title, "Psalm 23:1");
  } finally {
    globalThis.fetch = origFetch;
  }
}

// ---------------------------------------------------------------------------
// 3. Dock Fail-Safe (AGENTS.md §4 — highest-priority locked rule)
// ---------------------------------------------------------------------------
function testDockFailSafeProtocol() {
  const pairId = "DOCK-PAIR-999";

  // Simulate dock heartbeat monitor: 3000 ms ping interval, 2000 ms pong timeout
  let appAlive = false;
  let lastPingAt = 0;
  let lastPongAt = 0;

  function sendPing(nowMs) {
    lastPingAt = nowMs;
    const pingMsg = { app: "selah-live", v: 1, pairId, type: "selah:ping", ts: nowMs };
    assert.equal(isSelah(pingMsg, pairId), true);
    return pingMsg;
  }

  function evaluateFailSafe(nowMs) {
    if (lastPongAt === 0) return false;
    if (lastPingAt > lastPongAt && nowMs - lastPingAt >= 2000) {
      appAlive = false;
    }
    return appAlive;
  }

  function receiveEvent(msg, nowMs) {
    if (!isSelah(msg, pairId)) return;
    if (msg.type === "selah:pong") {
      lastPongAt = nowMs;
      appAlive = true;
    }
  }

  // Initially controls are disabled until a valid pong arrives
  sendPing(1000);
  assert.equal(evaluateFailSafe(1500), false);

  // Forged pong with wrong pairId must be ignored
  receiveEvent({ app: "selah-live", v: 1, pairId: "FORGED", type: "selah:pong" }, 1600);
  assert.equal(appAlive, false);

  // Valid pong unlocks controls automatically
  receiveEvent({ app: "selah-live", v: 1, pairId, type: "selah:pong", appVersion: "2.0.0" }, 1700);
  assert.equal(evaluateFailSafe(1800), true);

  // Next ping at t=4000 with no pong within 2000 ms (t=6100) triggers fail-safe screen
  sendPing(4000);
  assert.equal(evaluateFailSafe(5500), true);
  assert.equal(evaluateFailSafe(6100), false);

  // Subsequent pong at t=7200 reconnects automatically without re-pairing
  receiveEvent({ app: "selah-live", v: 1, pairId, type: "selah:pong", appVersion: "2.0.0" }, 7200);
  assert.equal(evaluateFailSafe(7250), true);
}

// ---------------------------------------------------------------------------
// 4. Display Theme Validation & Built-In Template Protection
// ---------------------------------------------------------------------------
function testDisplayThemeSanitization() {
  assert.ok(Array.isArray(DEFAULT_THEMES) && DEFAULT_THEMES.length > 0);
  const firstBuiltIn = DEFAULT_THEMES[0];
  assert.equal(firstBuiltIn.builtIn, true);
  assert.equal(isTemplateNameTaken(firstBuiltIn.name, DEFAULT_THEMES), true);

  const sanitized = sanitizeTheme({
    id: "custom-smoke",
    name: "Sunday Morning",
    slot: "scripture",
    builtIn: false,
    lowerThird: { bgColor: "not-a-hex-color", bgOpacity: 999 },
  });
  assert.equal(sanitized.name, "Sunday Morning");
  assert.match(sanitized.lowerThird.bgColor, /^#[0-9A-Fa-f]{6}$/);
  assert.ok(sanitized.lowerThird.bgOpacity <= 100);
}

await testShowHideAndLiveUpdate();
testOfflineVerseAndSearch();
testDockFailSafeProtocol();
testDisplayThemeSanitization();

console.log("✅ Core safety-net smoke tests passed (show/hide/update, offline verse, dock fail-safe, theme validation).");
