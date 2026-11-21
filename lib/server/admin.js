// SERVER ONLY. Admin authentication, 2-step MFA setup/verification, 10-min idle session cookie, CSRF, and throttling.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  safeEqual,
  verifyPassword,
  verifyTotpCode,
  hashRecoveryCode,
  base32Encode,
  signSessionPayload,
  verifySessionToken,
} from "./auth-crypto.js";

export const COOKIE_NAME = "selah_admin_session";
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;      // 10 minutes idle timeout
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours absolute timeout
const PREAUTH_TIMEOUT_MS = 10 * 60 * 1000;          // 10 minutes to complete MFA step

// Default hash for devlaolu / adebambo so Vercel deployments work even before env var is pasted
const DEFAULT_ADMIN_USER = "devlaolu";
const DEFAULT_ADMIN_HASH =
  "scrypt:16384:8:1:bfdb63af6ad592699d78faebd472e3f5:ad7155f50f57450e1925fa467b4109b71a3d1fb97d491b24c711dd2d25de9bab530b85e8434bf4ef21316b33ae48a32b24eea07fb98e090aada4a5ed6444b5fb";
const DEFAULT_SESSION_SECRET =
  "915d175b277727a51f93c09a2a8f0b51036ac2955abc3e73dd3c7d36f4203ef8";

const WRITABLE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "selah-live")
  : path.join(process.cwd(), ".data");
const AUTH_STATE_FILE = path.join(WRITABLE_DIR, "admin-auth-state.json");

function getSql() {
  const conn = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
  if (!conn) return null;
  try {
    return neon(conn);
  } catch {
    return null;
  }
}

export function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || DEFAULT_SESSION_SECRET;
}

export function hasFirebaseAdmin() {
  return !!(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
  );
}

export function getAdminApp() {
  if (getApps().length) return getApps()[0];
  let credObj = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      credObj = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch {
      // Handle base64-encoded service account JSON if pasted that way
      try {
        credObj = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf8"));
      } catch {
        return null;
      }
    }
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    credObj = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
    };
  }
  if (!credObj) return null;
  if (typeof credObj.private_key === "string") {
    credObj.private_key = credObj.private_key.replace(/\\n/g, "\n");
  }
  return initializeApp({ credential: cert(credObj) });
}

export function getAdminAuth() {
  try {
    const app = hasFirebaseAdmin() ? getAdminApp() : null;
    return app ? getAuth(app) : null;
  } catch {
    return null;
  }
}

export function getAdminFirestore() {
  try {
    const app = hasFirebaseAdmin() ? getAdminApp() : null;
    return app ? getFirestore(app) : null;
  } catch {
    return null;
  }
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

let memState = null;

async function loadAuthState() {
  // 1. Check Neon Postgres `admin_settings` (`key = 'admin_mfa_config'`) first so MFA setup persists across Vercel instances
  const sql = getSql();
  if (sql) {
    try {
      const rows = await sql`SELECT value FROM admin_settings WHERE key = 'admin_mfa_config' LIMIT 1`;
      if (rows[0]?.value) {
        const dbVal = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
        memState = {
          throttles: memState?.throttles || {},
          revokedSids: dbVal.revokedSids || [],
          mfaSetupComplete: !!dbVal.mfaSetupComplete,
          totpSecret: dbVal.totpSecret || null,
          recoveryCodesPlain: dbVal.recoveryCodesPlain || [],
          recoveryHashes: dbVal.recoveryHashes || [],
          usedRecoveryHashes: dbVal.usedRecoveryHashes || [],
          lastTotpStep: dbVal.lastTotpStep || null,
        };
        return memState;
      }
    } catch { }
  }

  if (memState) return memState;
  try {
    const raw = await fs.readFile(AUTH_STATE_FILE, "utf8");
    memState = JSON.parse(raw);
    return memState;
  } catch {
    memState = {
      throttles: {},
      revokedSids: [],
      mfaSetupComplete: false,
      totpSecret: null,
      recoveryCodesPlain: [],
      recoveryHashes: [],
      usedRecoveryHashes: [],
      lastTotpStep: null,
    };
    return memState;
  }
}

async function saveAuthState(state) {
  memState = state;
  const sql = getSql();
  if (sql) {
    try {
      const toSave = {
        revokedSids: (state.revokedSids || []).slice(-200),
        mfaSetupComplete: !!state.mfaSetupComplete,
        totpSecret: state.totpSecret,
        recoveryCodesPlain: state.mfaSetupComplete ? [] : state.recoveryCodesPlain,
        recoveryHashes: state.recoveryHashes || [],
        usedRecoveryHashes: state.usedRecoveryHashes || [],
        lastTotpStep: state.lastTotpStep || null,
      };
      await sql`
        INSERT INTO admin_settings (key, value, updated_at)
        VALUES ('admin_mfa_config', ${JSON.stringify(toSave)}::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
    } catch { }
  }
  try {
    await fs.mkdir(WRITABLE_DIR, { recursive: true });
    await fs.writeFile(AUTH_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch { }
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
  const throttles = state.throttles || {};
  const keys = [`ip:${ip}`, `user:${String(username || "").toLowerCase()}`];
  for (const k of keys) {
    const t = throttles[k];
    if (!t) continue;
    if (t.lockedUntil && now < t.lockedUntil) {
      const waitSec = Math.ceil((t.lockedUntil - now) / 1000);
      return { locked: true, waitSec };
    }
    if (now - t.firstFailedAt > 15 * 60 * 1000 && (!t.lockedUntil || now >= t.lockedUntil)) {
      delete throttles[k];
    }
  }
  return { locked: false };
}

export async function recordLoginFailure(ip, username) {
  const state = await loadAuthState();
  if (!state.throttles) state.throttles = {};
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
  if (state.throttles) {
    delete state.throttles[`ip:${ip}`];
    delete state.throttles[`user:${String(username || "").toLowerCase()}`];
  }
  await saveAuthState(state);
}

function ensurePendingMfaProvision(state, username) {
  if (!state.totpSecret || !state.recoveryHashes?.length || (!state.mfaSetupComplete && !state.recoveryCodesPlain?.length)) {
    const secret = base32Encode(crypto.randomBytes(20));
    const codes = [];
    const hashes = [];
    for (let i = 0; i < 10; i++) {
      const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
      const formatted = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
      codes.push(formatted);
      hashes.push(hashRecoveryCode(formatted));
    }
    state.totpSecret = secret;
    state.recoveryCodesPlain = codes;
    state.recoveryHashes = hashes;
    state.usedRecoveryHashes = [];
  }
  const issuer = "SelahLive";
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${state.totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return {
    secret: state.totpSecret,
    otpauthUrl,
    recoveryCodes: state.recoveryCodesPlain || [],
  };
}

const perAdminMfaMem = new Map();

function isOwnerAccount(adminKey) {
  const expectedUser = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USER;
  return !adminKey || String(adminKey).toLowerCase() === expectedUser.toLowerCase();
}

async function loadAdminMfa(adminKey) {
  if (isOwnerAccount(adminKey)) {
    return await loadAuthState();
  }
  const dbKey = `admin_mfa_config:${String(adminKey).toLowerCase()}`;
  const sql = getSql();
  if (sql) {
    try {
      const rows = await sql`SELECT value FROM admin_settings WHERE key = ${dbKey} LIMIT 1`;
      if (rows[0]?.value) {
        const val = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
        perAdminMfaMem.set(dbKey, val);
        return val;
      }
    } catch { }
  }
  if (perAdminMfaMem.has(dbKey)) return perAdminMfaMem.get(dbKey);
  const fresh = {
    mfaSetupComplete: false,
    totpSecret: "",
    recoveryCodesPlain: [],
    recoveryHashes: [],
    usedRecoveryHashes: [],
    lastTotpStep: null,
  };
  perAdminMfaMem.set(dbKey, fresh);
  return fresh;
}

async function saveAdminMfa(adminKey, mfa) {
  if (isOwnerAccount(adminKey)) {
    const state = await loadAuthState();
    Object.assign(state, mfa);
    await saveAuthState(state);
    return;
  }
  const dbKey = `admin_mfa_config:${String(adminKey).toLowerCase()}`;
  const toSave = {
    mfaSetupComplete: !!mfa.mfaSetupComplete,
    totpSecret: mfa.totpSecret || "",
    recoveryCodesPlain: mfa.mfaSetupComplete ? [] : (mfa.recoveryCodesPlain || []),
    recoveryHashes: mfa.recoveryHashes || [],
    usedRecoveryHashes: mfa.usedRecoveryHashes || [],
    lastTotpStep: mfa.lastTotpStep || null,
  };
  perAdminMfaMem.set(dbKey, toSave);
  const sql = getSql();
  if (sql) {
    try {
      await sql`
        INSERT INTO admin_settings (key, value, updated_at)
        VALUES (${dbKey}, ${JSON.stringify(toSave)}::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
    } catch { }
  }
}

async function verifyPromotedFirebaseAdmin(email, password) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const fbAuth = getAdminAuth();
  if (!apiKey || !fbAuth) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, returnSecureToken: true }),
      }
    );
    if (!r.ok) return null;
    const data = await r.json();
    if (!data?.localId) return null;
    const fbUser = await fbAuth.getUser(data.localId);
    if (!fbUser || fbUser.disabled || fbUser.customClaims?.admin !== true) {
      return null;
    }
    return {
      uid: fbUser.email || fbUser.uid,
      adminKey: fbUser.uid,
      email: fbUser.email || email.trim(),
      name: fbUser.displayName || fbUser.email || "Admin",
      role: "admin",
    };
  } catch {
    return null;
  }
}

// Step 1: Verify Username/Email & Password (Owner OR Promoted Firebase Admin), then require MFA Setup or MFA Code
export async function verifyAdminPasswordStep({ username, password, ip }) {
  const allowlist = (process.env.ADMIN_IP_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(ip)) {
    return { ok: false, error: "Access denied from this IP address.", status: 403 };
  }

  const cleanInput = String(username || "").trim();
  const throttle = await checkLoginThrottle(ip, cleanInput);
  if (throttle.locked) {
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(throttle.waitSec / 60)} minute(s).`,
      status: 429,
    };
  }

  const expectedUser = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USER;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_HASH;

  let actor = null;
  if (safeEqual(cleanInput, expectedUser) && verifyPassword(String(password || ""), expectedHash)) {
    actor = {
      uid: expectedUser,
      adminKey: expectedUser,
      email: `${expectedUser}@selahlive.admin`,
      name: expectedUser,
      role: "owner",
    };
  } else if (cleanInput.includes("@")) {
    actor = await verifyPromotedFirebaseAdmin(cleanInput, String(password || ""));
  }

  if (!actor) {
    await recordLoginFailure(ip, cleanInput);
    await new Promise((r) => setTimeout(r, 500));
    return { ok: false, error: "Invalid credentials or account does not have admin access.", status: 401 };
  }

  const mfaState = await loadAdminMfa(actor.adminKey);
  const mfaSetupComplete = !!mfaState.mfaSetupComplete;
  let mfaSetup = null;

  if (!mfaSetupComplete) {
    mfaSetup = ensurePendingMfaProvision(mfaState, actor.email || actor.uid);
    await saveAdminMfa(actor.adminKey, mfaState);
  }

  // Embed the TOTP secret & recovery hashes inside the HMAC-signed preAuthToken so Step 2 works across any Vercel serverless container
  const preAuthToken = signSessionPayload(
    {
      purpose: "mfa_preauth",
      uid: actor.uid,
      adminKey: actor.adminKey,
      email: actor.email,
      role: actor.role,
      ip,
      mfaSetupComplete,
      totpSecret: mfaState.totpSecret,
      recoveryHashes: mfaState.recoveryHashes,
      exp: Date.now() + PREAUTH_TIMEOUT_MS,
    },
    getSessionSecret()
  );

  return {
    ok: true,
    nextStep: mfaSetupComplete ? "verify_mfa" : "setup_mfa",
    preAuthToken,
    mfaSetup,
  };
}

// Step 2: Verify 6-digit TOTP or Recovery Code (completes MFA setup on first run, then issues session cookie)
export async function verifyAdminMfaStep({ preAuthToken, code, ip }) {
  const pre = verifySessionToken(preAuthToken, getSessionSecret());
  if (!pre || pre.purpose !== "mfa_preauth" || Date.now() > pre.exp) {
    return { ok: false, error: "Your login step expired. Please enter your username and password again.", status: 401 };
  }

  const throttle = await checkLoginThrottle(ip, pre.uid);
  if (throttle.locked) {
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(throttle.waitSec / 60)} minute(s).`,
      status: 429,
    };
  }

  const adminKey = pre.adminKey || pre.uid;
  const mfaState = await loadAdminMfa(adminKey);
  const totpSecret = mfaState.totpSecret || pre.totpSecret || (isOwnerAccount(adminKey) ? process.env.ADMIN_TOTP_SECRET : "") || "";
  const recoveryHashes = (mfaState.recoveryHashes?.length ? mfaState.recoveryHashes : pre.recoveryHashes) || [];
  const cleanCode = String(code || "").trim();

  if (!cleanCode) {
    return { ok: false, error: "Enter your 6-digit Google Authenticator code.", status: 400 };
  }

  let mfaOk = false;
  let usedStep = null;
  let usedRecoveryHash = null;

  if (totpSecret) {
    const totpRes = verifyTotpCode(totpSecret, cleanCode, mfaState.lastTotpStep);
    if (totpRes.valid) {
      mfaOk = true;
      usedStep = totpRes.step;
    }
  }

  if (!mfaOk && recoveryHashes.length > 0) {
    const candidateHash = hashRecoveryCode(cleanCode);
    const match = recoveryHashes.find((h) => safeEqual(h, candidateHash));
    if (match && !(mfaState.usedRecoveryHashes || []).includes(match)) {
      mfaOk = true;
      usedRecoveryHash = match;
    }
  }

  if (!mfaOk) {
    await recordLoginFailure(ip, pre.uid);
    await new Promise((r) => setTimeout(r, 500));
    return { ok: false, uid: pre.uid, error: "Invalid or expired verification code. Check Google Authenticator and try again.", status: 401 };
  }

  // Persist MFA completion & replay protection for this specific admin
  const wasFirstSetup = !mfaState.mfaSetupComplete;
  mfaState.totpSecret = totpSecret;
  mfaState.recoveryHashes = recoveryHashes;
  mfaState.mfaSetupComplete = true;
  mfaState.recoveryCodesPlain = [];
  if (usedStep !== null) mfaState.lastTotpStep = usedStep;
  if (usedRecoveryHash) {
    if (!mfaState.usedRecoveryHashes) mfaState.usedRecoveryHashes = [];
    mfaState.usedRecoveryHashes.push(usedRecoveryHash);
  }
  await saveAdminMfa(adminKey, mfaState);
  await clearLoginThrottle(ip, pre.uid);

  const sid = crypto.randomBytes(24).toString("hex");
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  const session = {
    sid,
    uid: pre.uid,
    adminKey,
    email: pre.email || `${pre.uid}@selahlive.admin`,
    role: pre.role || "owner",
    csrfToken,
    iat: now,
    lastActiveAt: now,
    exp: now + ABSOLUTE_TIMEOUT_MS,
  };
  const token = signSessionPayload(session, getSessionSecret());

  return { ok: true, session, token, wasFirstSetup };
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
  const payload = verifySessionToken(rawToken, getSessionSecret());
  if (payload?.sid) {
    const state = await loadAuthState();
    if (!state.revokedSids) state.revokedSids = [];
    state.revokedSids.push(payload.sid);
    await saveAuthState(state);
  }
}

export async function verifyAdminSessionCookie(request) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const rawToken = cookies[COOKIE_NAME];
  if (!rawToken) return null;
  const payload = verifySessionToken(rawToken, getSessionSecret());
  if (!payload?.sid || !payload?.uid) return null;

  const now = Date.now();
  // Enforce 10-minute idle timeout and 8-hour absolute timeout
  const exp = payload.exp || payload.iat + ABSOLUTE_TIMEOUT_MS;
  const lastActive = payload.lastActiveAt || payload.iat;
  if (now > exp || now - lastActive > IDLE_TIMEOUT_MS) {
    return null;
  }

  // Refresh sliding window token
  const refreshedSession = {
    ...payload,
    lastActiveAt: now,
  };
  const refreshedToken = signSessionPayload(refreshedSession, getSessionSecret());

  return {
    ...refreshedSession,
    refreshedToken,
  };
}

export async function verifyAdminActionMfa(code, adminKey = "") {
  const mfaState = await loadAdminMfa(adminKey);
  const totpSecret = mfaState.totpSecret || (isOwnerAccount(adminKey) ? process.env.ADMIN_TOTP_SECRET : "") || "";
  const recoveryHashes = mfaState.recoveryHashes || [];
  const cleanCode = String(code || "").trim();
  if (!totpSecret) return { ok: true }; // MFA not provisioned yet
  if (!cleanCode) return { ok: false, error: "Please enter your 6-digit Google Authenticator MFA code." };

  const totpRes = verifyTotpCode(totpSecret, cleanCode, null);
  if (totpRes.valid) return { ok: true };

  if (recoveryHashes.length > 0) {
    const candidateHash = hashRecoveryCode(cleanCode);
    const match = recoveryHashes.find((h) => safeEqual(h, candidateHash));
    if (match && !(mfaState.usedRecoveryHashes || []).includes(match)) {
      if (!mfaState.usedRecoveryHashes) mfaState.usedRecoveryHashes = [];
      mfaState.usedRecoveryHashes.push(match);
      await saveAdminMfa(adminKey, mfaState);
      return { ok: true };
    }
  }
  return { ok: false, error: "Invalid MFA code. Check Google Authenticator and try again." };
}

export async function requireAdmin(request) {
  const sess = await verifyAdminSessionCookie(request);
  if (sess) {
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
    return {
      uid: sess.uid,
      adminKey: sess.adminKey || sess.uid,
      email: sess.email,
      role: sess.role || "owner",
      csrfToken: sess.csrfToken,
      refreshedToken: sess.refreshedToken,
    };
  }

  return { error: Response.json({ error: "Admin session expired or not signed in." }, { status: 401 }) };
}
