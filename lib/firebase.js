"use client";
// Firebase client initialization (Auth, Firestore, Analytics).
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseEnabled = !!cfg.apiKey;

export function getFirebaseApp() {
  if (!firebaseEnabled) return null;
  return getApps()[0] || initializeApp(cfg);
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

export function getFirebaseDb() {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

let analyticsInstance = null;

export function shouldSuppressAnalytics() {
  if (typeof window === "undefined") return true;
  if (window.__selahObsConnected) return true;
  try {
    if (window.sessionStorage?.getItem("selah_obs_connected") === "1") return true;
  } catch { }
  const host = window.location?.hostname || "";
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  const path = window.location?.pathname || "";
  if (path.startsWith("/overlay") || path.startsWith("/dock")) return true;
  return false;
}

export async function setObsAnalyticsSuppressed(suppressed) {
  if (typeof window === "undefined") return;
  window.__selahObsConnected = !!suppressed;
  try {
    if (suppressed) window.sessionStorage?.setItem("selah_obs_connected", "1");
    else window.sessionStorage?.removeItem("selah_obs_connected");
  } catch { }
  if (cfg.measurementId) {
    window[`ga-disable-${cfg.measurementId}`] = !!suppressed;
  }
  if (analyticsInstance) {
    try {
      const { setAnalyticsCollectionEnabled } = await import("firebase/analytics");
      setAnalyticsCollectionEnabled(analyticsInstance, !suppressed);
    } catch { }
  }
}

export async function initFirebaseAnalytics() {
  if (!firebaseEnabled || typeof window === "undefined") return null;
  if (shouldSuppressAnalytics()) {
    if (cfg.measurementId) window[`ga-disable-${cfg.measurementId}`] = true;
    return null;
  }
  if (analyticsInstance) return analyticsInstance;
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) {
      analyticsInstance = getAnalytics(getFirebaseApp());
      return analyticsInstance;
    }
  } catch { }
  return null;
}
