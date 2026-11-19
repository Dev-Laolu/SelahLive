"use client";
// IndexedDB wrapper (idb). Library data, themes, saved texts, and uploaded assets NEVER go in localStorage.
import { openDB } from "idb";

let _db;
export function db() {
  if (!_db) {
    _db = openDB("selah-live", 3, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("packs")) d.createObjectStore("packs");           // key: `${type}:${id}`
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings");     // key: name
        if (!d.objectStoreNames.contains("lists")) d.createObjectStore("lists");           // recent/pinned/favSongs/customSongs/recentTexts/songStats
        if (!d.objectStoreNames.contains("assets")) d.createObjectStore("assets");         // key: assetId (sha256) -> { assetId, mime, dataUrl, width, height, sizeBytes, remoteUrl? }
        if (!d.objectStoreNames.contains("themes")) d.createObjectStore("themes");         // key: themeId -> theme JSON (v2)
        if (!d.objectStoreNames.contains("savedTexts")) d.createObjectStore("savedTexts"); // key: id -> { id, title, body, tags[], favourite, templateId?, useCount, lastUsedAt, createdAt, updatedAt, deleted? }
      },
    });
  }
  return _db;
}

export async function getKey(store, key, fallback = null) {
  try {
    const v = await (await db()).get(store, key);
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export async function setKey(store, key, val) {
  try {
    await (await db()).put(store, val, key);
  } catch { }
}

export async function delKey(store, key) {
  try {
    await (await db()).delete(store, key);
  } catch { }
}

export async function allPacks() {
  try {
    const d = await db();
    const keys = await d.getAllKeys("packs");
    return Promise.all(keys.map(async (k) => ({ key: k, ...(await d.get("packs", k)) })));
  } catch {
    return [];
  }
}

export async function allStoreEntries(store) {
  try {
    const d = await db();
    const keys = await d.getAllKeys(store);
    return Promise.all(keys.map(async (k) => ({ key: k, ...(await d.get(store, k)) })));
  } catch {
    return [];
  }
}
