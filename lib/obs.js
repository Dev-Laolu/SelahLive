// Minimal obs-websocket v5 client (browser). No dependencies.
// Auth: secret = base64(sha256(password + salt)); auth = base64(sha256(secret + challenge))
const enc = new TextEncoder();
async function sha256b64(str) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  let s = "";
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export const OBS_ERRORS = {
  wrongPassword: "That password didn't work. Check it in OBS under Tools → WebSocket Server Settings.",
  notRunning: "Can't reach OBS. Open OBS and make sure the WebSocket server is enabled.",
  blocked: "Your browser blocked the connection. Allow local network access for this site and try again.",
};

export class ObsClient {
  constructor() {
    this.ws = null;
    this.pending = new Map();
    this.listeners = new Set();
    this.id = 0;
    this.identified = false;
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(ev) {
    this.listeners.forEach((fn) => fn(ev));
  }

  connect({ host = "localhost", port = 4455, password = "" } = {}) {
    return new Promise((resolve, reject) => {
      this.close();
      let ws;
      try {
        ws = new WebSocket(`ws://${host}:${port}`);
      } catch {
        return reject(new Error("blocked"));
      }
      this.ws = ws;
      let settled = false;
      const fail = (code) => {
        if (!settled) {
          settled = true;
          reject(new Error(code));
        }
      };
      ws.onerror = () => fail("notRunning");
      ws.onclose = (e) => {
        this.identified = false;
        if (!settled) fail(e.code === 4009 ? "wrongPassword" : "notRunning");
        else this.emit({ type: "closed" });
      };
      ws.onmessage = async (m) => {
        const msg = JSON.parse(m.data);
        if (msg.op === 0) {
          // Hello
          const identify = { op: 1, d: { rpcVersion: 1, eventSubscriptions: (1 << 9) | 1 } };
          if (msg.d.authentication) {
            const { challenge, salt } = msg.d.authentication;
            const secret = await sha256b64(password + salt);
            identify.d.authentication = await sha256b64(secret + challenge);
          }
          ws.send(JSON.stringify(identify));
        } else if (msg.op === 2) {
          // Identified
          this.identified = true;
          settled = true;
          resolve(msg.d);
        } else if (msg.op === 5) {
          // Event
          this.emit({ type: "event", name: msg.d.eventType, data: msg.d.eventData });
        } else if (msg.op === 7) {
          // RequestResponse
          const p = this.pending.get(msg.d.requestId);
          if (p) {
            this.pending.delete(msg.d.requestId);
            msg.d.requestStatus.result
              ? p.resolve(msg.d.responseData || {})
              : p.reject(Object.assign(new Error(msg.d.requestStatus.comment || "request failed"), { code: msg.d.requestStatus.code }));
          }
        }
      };
    });
  }

  request(requestType, requestData = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1 || !this.identified) return reject(new Error("notConnected"));
      const requestId = String(++this.id);
      this.pending.set(requestId, { resolve, reject });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error("timeout"));
        }
      }, 8000);
    });
  }

  get connected() {
    return !!this.ws && this.ws.readyState === 1 && this.identified;
  }

  close() {
    try {
      this.ws && this.ws.close();
    } catch {}
    this.ws = null;
    this.identified = false;
  }

  getScenes() {
    return this.request("GetSceneList").then((r) => ({
      current: r.currentProgramSceneName,
      scenes: r.scenes.map((s) => s.sceneName),
    }));
  }

  /** Creates (or reuses) the Selah Live Overlay browser source in a scene. */
  async addOverlay({ url, sceneName }) {
    const inputName = "Selah Live Overlay";
    const inputSettings = { url, width: 1920, height: 1080 };
    try {
      return await this.request("CreateInput", {
        sceneName,
        inputName,
        inputKind: "browser_source",
        inputSettings,
        sceneItemEnabled: true,
      });
    } catch (e) {
      if (e.code === 601) {
        await this.request("SetInputSettings", { inputName, inputSettings, overlay: true });
        return { reused: true };
      }
      throw e;
    }
  }

  /** Selah protocol message over BroadcastCustomEvent (v1). */
  send(type, pairId, payload = {}) {
    return this.request("BroadcastCustomEvent", {
      eventData: { app: "selah-live", v: 1, pairId, type, ...payload },
    });
  }
}

// Strict allowlist of Selah Live v1 protocol events (including V1.1 additive messages)
const ALLOWED_TYPES = new Set([
  "selah:ping",
  "selah:pong",
  "selah:show",
  "selah:update",
  "selah:hide",
  "selah:style",
  "selah:overlay-hello",
  "selah:overlay-ok",
  "selah:asset",
  "selah:asset-ack",
  "selah:search",
  "selah:results",
  "selah:state",
  "selah:command",
  "selah:dock-show",
  "selah:dock-hide",
  "selah:dock-step",
  "selah:suggest",
  "selah:suggest-action",
]);

export function isSelah(data, pairId) {
  if (
    !data ||
    typeof data !== "object" ||
    data.app !== "selah-live" ||
    data.v !== 1 ||
    !pairId ||
    data.pairId !== pairId ||
    typeof data.type !== "string" ||
    !ALLOWED_TYPES.has(data.type)
  ) {
    return false;
  }
  // Basic payload length & schema validation per SECURITY.md §9 & PRD §7
  if (typeof data.body === "string" && data.body.length > 8000) return false;
  if (typeof data.title === "string" && data.title.length > 400) return false;
  if (typeof data.query === "string" && data.query.length > 200) return false;
  if (data.type === "selah:suggest") {
    if (!Array.isArray(data.suggestions) || data.suggestions.length > 5) return false;
  }
  if (data.type === "selah:suggest-action") {
    if (!["show", "preview", "dismiss"].includes(data.action)) return false;
    if (typeof data.suggestionId !== "string" || !data.suggestionId || data.suggestionId.length > 160) return false;
  }
  return true;
}
