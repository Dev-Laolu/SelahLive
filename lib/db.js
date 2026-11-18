"use client";
// IndexedDB wrapper (idb). Library data NEVER goes in localStorage.
import { openDB } from "idb";

let _db;
export function db() {
  if (!_db) _db = openDB("selah-live", 1, {
    upgrade(d) {
      d.createObjectStore("packs");        // key: `${type}:${id}`
      d.createObjectStore("settings");     // key: name
      d.createObjectStore("lists");        // recent/pinned/customSongs/recentTexts
    },
  });
  return _db;
}
export async function getKey(store, key, fallback = null) { try { const v = await (await db()).get(store, key); return v === undefined ? fallback : v; } catch { return fallback; } }
export async function setKey(store, key, val) { try { await (await db()).put(store, val, key); } catch {} }
export async function delKey(store, key) { try { await (await db()).delete(store, key); } catch {} }
export async function allPacks() { try { const d = await db(); const keys = await d.getAllKeys("packs"); return Promise.all(keys.map(async (k) => ({ key: k, ...(await d.get("packs", k)) }))); } catch { return []; } }
