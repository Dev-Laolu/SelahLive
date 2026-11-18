// SERVER ONLY. Verifies the Firebase ID token and admin status on every admin route.
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs/promises";
import path from "node:path";

export function hasFirebaseAdmin() {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

export function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT; // JSON string
  if (!sa) throw new Error("FIREBASE_SERVICE_ACCOUNT not set");
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

export function getAdminAuth() {
  return hasFirebaseAdmin() ? getAuth(getAdminApp()) : null;
}

export function getAdminFirestore() {
  return hasFirebaseAdmin() ? getFirestore(getAdminApp()) : null;
}

// In-memory rate limiter for upload and mutation endpoints
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

async function isStoreAdminOrBootstrap(uid, email, name) {
  const storePath = path.join(process.cwd(), ".data", "server-store.json");
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const store = JSON.parse(raw);
    const admins = store.settings?.admins || [];
    if (admins.some((a) => (uid && a.uid === uid) || (email && a.email?.toLowerCase() === email.toLowerCase()))) {
      return true;
    }
    // If the only admin in the store is the placeholder demo-admin, bootstrap the first signed-in owner account
    const realAdmins = admins.filter((a) => a.uid !== "demo-admin" && a.email !== "admin@selahlive.local");
    if (realAdmins.length === 0 && email) {
      store.settings = store.settings || {};
      store.settings.admins = [
        ...admins,
        { uid, email, name: name || email.split("@")[0], addedAt: new Date().toISOString() },
      ];
      await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
      return true;
    }
    return false;
  } catch {
    return true; // Store not initialized yet; allow first owner bootstrap
  }
}

export async function requireAdmin(request) {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return { error: Response.json({ error: "Sign in required." }, { status: 401 }) };

  // Local demo-admin token when neither Firebase Admin nor Firebase Client is configured
  if (!hasFirebaseAdmin() && !process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NODE_ENV !== "production" && token === "demo-admin") {
    return { uid: "demo-admin", email: "admin@selahlive.local", demo: true };
  }

  // 1. Verify via Firebase Admin SDK when FIREBASE_SERVICE_ACCOUNT is configured
  if (hasFirebaseAdmin()) {
    try {
      const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
      const inStore = await isStoreAdminOrBootstrap(decoded.uid, decoded.email, decoded.name);
      if (decoded.admin !== true && !inStore) {
        return { error: Response.json({ error: "Admins only." }, { status: 403 }) };
      }
      return { uid: decoded.uid, email: decoded.email || decoded.uid };
    } catch {
      return { error: Response.json({ error: "Invalid or expired session." }, { status: 401 }) };
    }
  }

  // 2. Verify Firebase ID token via Google Identity Toolkit when FIREBASE_SERVICE_ACCOUNT is not yet provided
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (apiKey) {
    try {
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      });
      if (!r.ok) return { error: Response.json({ error: "Invalid or expired session." }, { status: 401 }) };
      const data = await r.json();
      const acct = data.users?.[0];
      if (!acct) return { error: Response.json({ error: "Invalid session." }, { status: 401 }) };
      let customClaims = {};
      try {
        if (acct.customAttributes) customClaims = JSON.parse(acct.customAttributes);
      } catch { }
      const allowed = customClaims.admin === true || (await isStoreAdminOrBootstrap(acct.localId, acct.email, acct.displayName));
      if (!allowed) return { error: Response.json({ error: "Admins only." }, { status: 403 }) };
      return { uid: acct.localId, email: acct.email || acct.localId };
    } catch {
      return { error: Response.json({ error: "Could not verify session." }, { status: 401 }) };
    }
  }

  return { error: Response.json({ error: "Admin authentication not configured." }, { status: 401 }) };
}
