// SERVER ONLY. Admin authentication, session verification, CSRF protection, and login throttling (per SECURITY.md).
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  safeEqual,
  verifyPassword,
  verifyTotpCode,
  hashRecoveryCode,
  signSessionPayload,
  verifySessionToken,
} from "./auth-crypto";

export const COOKIE_NAME = "selah_admin_session";
const IDLE_TIMEOUT_MS = 20 * 60 * 1000;      // 20 minutes
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const AUTH_STATE_FILE = path.join(process.cwd(), ".data", "admin-auth-state.json");

export function hasFirebaseAdmin() {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

export function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error("FIREBASE_SERVICE_ACCOUNT not set");
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

export function getAdminAuth() {
  return hasFirebaseAdmin() ? getAuth(getAdminApp()) : null;
}

export function getAdminFirestore() {
  return hasFirebaseAdmin() ? getFirestore(getAdminApp()) : null;
}

export function getClientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "127.0.0.1";
}

// In-memory rate limiter for upload and API endpoints
const buckets = new Map();
export function rateLimit(key, maxRequests = 15, windowMs = 60_000) {
  const now = Date.now();
  const entry = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  buckets.set(key, entry);
  return entry.count <= maxRequests;
}

// Persistent server state for sessions, login throttling, TOTP replay step, and used recovery hashes
let memState = null;
async function loadAuthState() {
  if (memState) return memState;
  try {
    const raw = await fs.readFile(AUTH_STATE_FILE, "utf8");
    memState = JSON.parse(raw);
  } catch {
    memState = {
      sessions: {},
      throttles: {},
      lastTotpStep: null,
      usedRecoveryHashes: [],
    };
  }
  return memState;
}

async function saveAuthState(state) {
  memState = state;
  try {
    await fs.mkdir(path.dirname(AUTH_STATE_FILE), { recursive: true });
    await fs.writeFile(AUTH_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {}
}

function getLockoutDurationMs(failures) {
  if (failures < 5) return 0;
  if (failures < 10) return 15 * 60 * 1000;      // 15 minutes
  if (failures < 15) return 60 * 60 * 1000;      // 1 hour
  return 24 * 60 * 60 * 1000;                    // 24 hours
}

export async function checkLoginThrottle(ip, username) {
  const state = await loadAuthState();
  const now = Date.now();
  const keys = [`ip:${ip}`, `user:${String(username || "").toLowerCase()}`];
  for (const k of keys) {
    const t = state.throttles[k];
    if (!t) continue;
    if (t.lockedUntil && now < t.lockedUntil) {
      const waitSec = Math.ceil((t.lockedUntil - now) / 1000);
      return { locked: true, waitSec };
    }
    if (now - t.firstFailedAt > 15 * 60 * 1000 && (!t.lockedUntil || now >= t.lockedUntil)) {
      delete state.throttles[k];
    }
  }
  return { locked: false };
}

export async function recordLoginFailure(ip, username) {
  const state = await loadAuthState();
  const now = Date.now();
  const keys = [`ip:${ip}`, `user:${String(username || "").toLowerCase()}`];
  for (const k of keys) {
    const cur = state.throttles[k] || { failures: 0, firstFailedAt: now, lockedUntil: 0 };
    cur.failures += 1;
    const lockMs = getLockoutDurationMs(cur.failures);
    if (lockMs > 0) cur.lockedUntil = now + lockMs;
    state.throttles[k] = cur;
  }
  await saveAuthState(state);
}

export async function clearLoginThrottle(ip, username) {
  const state = await loadAuthState();
  delete state.throttles[`ip:${ip}`];
  delete state.throttles[`user:${String(username || "").toLowerCase()}`];
  await saveAuthState(state);
}

export async function authenticateAdminCredentials({ username, password, code, ip }) {
  // Optional IP allowlist check
  const allowlist = (process.env.ADMIN_IP_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(ip)) {
    return { ok: false, error: "Access denied from this IP address.", status: 403 };
  }

  const throttle = await checkLoginThrottle(ip, username);
  if (throttle.locked) {
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(throttle.waitSec / 60)} minute(s).`,
      status: 429,
    };
  }

  const expectedUser = process.env.ADMIN_USERNAME || "devlaolu";
  const expectedHash = process.env.ADMIN_PASSWORD_HASH || "";
  const totpSecret = process.env.ADMIN_TOTP_SECRET || "";
  const recoveryHashes = (process.env.ADMIN_RECOVERY_HASHES || "").split(",").map((s) => s.trim()).filter(Boolean);
  const enforceMfa = process.env.ADMIN_ENFORCE_MFA === "true";

  const userOk = safeEqual(String(username || "").trim(), expectedUser);
  const passOk = verifyPassword(String(password || ""), expectedHash);

  const state = await loadAuthState();
  let mfaOk = true;
  let usedStep = null;
  let usedRecoveryHash = null;

  const cleanCode = String(code || "").trim();
  if (enforceMfa || cleanCode.length > 0) {
    mfaOk = false;
    if (totpSecret) {
      const totpRes = verifyTotpCode(totpSecret, cleanCode, state.lastTotpStep);
      if (totpRes.valid) {
        mfaOk = true;
        usedStep = totpRes.step;
      }
    }
    if (!mfaOk && cleanCode && recoveryHashes.length > 0) {
      const candidateHash = hashRecoveryCode(cleanCode);
      const match = recoveryHashes.find((h) => safeEqual(h, candidateHash));
      if (match && !state.usedRecoveryHashes.includes(match)) {
        mfaOk = true;
        usedRecoveryHash = match;
      }
    }
  }

  if (!userOk || !passOk || !mfaOk) {
    await recordLoginFailure(ip, username);
    // 500ms delay on failed attempt per SECURITY.md §2.4
    await new Promise((r) => setTimeout(r, 500));
    return { ok: false, error: "Invalid credentials.", status: 401 };
  }

  if (usedStep !== null) state.lastTotpStep = usedStep;
  if (usedRecoveryHash) state.usedRecoveryHashes.push(usedRecoveryHash);
  await clearLoginThrottle(ip, username);

  // Create rotated session ID
  const sid = crypto.randomBytes(24).toString("hex");
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  const session = {
    sid,
    uid: expectedUser,
    email: `${expectedUser}@selahlive.admin`,
    csrfToken,
    ip,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: now + ABSOLUTE_TIMEOUT_MS,
    mfaVerified: usedStep !== null || usedRecoveryHash !== null,
  };
  state.sessions[sid] = session;
  await saveAuthState(state);

  const secret = process.env.ADMIN_SESSION_SECRET || "selah-dev-fallback-session-secret-32b";
  const token = signSessionPayload({ sid, uid: session.uid, csrfToken, iat: now }, secret);

  return { ok: true, session, token };
}

export function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

export function makeSessionCookie(token, maxAgeSec = 8 * 3600) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

export async function destroyAdminSession(request) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const rawToken = cookies[COOKIE_NAME];
  const secret = process.env.ADMIN_SESSION_SECRET || "selah-dev-fallback-session-secret-32b";
  const payload = verifySessionToken(rawToken, secret);
  if (payload?.sid) {
    const state = await loadAuthState();
    delete state.sessions[payload.sid];
    await saveAuthState(state);
  }
}

export async function verifyAdminSessionCookie(request, touch = true) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const rawToken = cookies[COOKIE_NAME];
  if (!rawToken) return null;
  const secret = process.env.ADMIN_SESSION_SECRET || "selah-dev-fallback-session-secret-32b";
  const payload = verifySessionToken(rawToken, secret);
  if (!payload?.sid) return null;

  const state = await loadAuthState();
  const sess = state.sessions[payload.sid];
  const now = Date.now();
  if (!sess) {
    // Stateless fallback on serverless cold restart if signed token is within 8h absolute window
    if (payload.iat && now - payload.iat < ABSOLUTE_TIMEOUT_MS) {
      return { uid: payload.uid, email: `${payload.uid}@selahlive.admin`, csrfToken: payload.csrfToken };
    }
    return null;
  }

  // Check 20-minute idle timeout and 8-hour absolute timeout (SECURITY.md §2.5)
  if (now > sess.expiresAt || now - sess.lastActiveAt > IDLE_TIMEOUT_MS) {
    delete state.sessions[payload.sid];
    await saveAuthState(state);
    return null;
  }

  if (touch) {
    sess.lastActiveAt = now;
    await saveAuthState(state);
  }
  return sess;
}

export async function requireAdmin(request) {
  // 1. Primary: Verify HttpOnly signed admin session cookie (SECURITY.md §2.5)
  const sess = await verifyAdminSessionCookie(request, true);
  if (sess) {
    // CSRF protection for state-changing requests
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const csrfHeader = request.headers.get("x-csrf-token");
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      const sameOrigin = origin && host && new URL(origin).host === host;
      const csrfValid = csrfHeader && sess.csrfToken && safeEqual(csrfHeader, sess.csrfToken);
      if (!csrfValid && !sameOrigin) {
        return { error: Response.json({ error: "CSRF validation failed." }, { status: 403 }) };
      }
    }
    return { uid: sess.uid, email: sess.email, csrfToken: sess.csrfToken };
  }

  return { error: Response.json({ error: "Admin sign in required." }, { status: 401 }) };
}
