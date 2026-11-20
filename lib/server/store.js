// SERVER ONLY. Master library (Neon Postgres + writable temp/local persistence) and analytics/admin store.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { gzipSync } from "fflate";
import { neon } from "@neondatabase/serverless";
import { getAdminAuth, getAdminFirestore } from "./admin.js";
import { uploadPackToS3 } from "./s3.js";

// On Vercel serverless, process.cwd() (/var/task) is read-only; use os.tmpdir() when running on Vercel.
const WRITABLE_BASE = process.env.VERCEL ? path.join(os.tmpdir(), "selah-live") : path.join(process.cwd(), ".data");
const STORE_FILE = path.join(WRITABLE_BASE, "server-store.json");
const DRAFTS_DIR = path.join(WRITABLE_BASE, "drafts");
const PUBLIC_DATA_DIR = path.join(process.cwd(), "public", "data");
const PACKS_DIR = process.env.VERCEL ? path.join(WRITABLE_BASE, "packs") : path.join(PUBLIC_DATA_DIR, "packs");
const MANIFEST_FILE = path.join(PUBLIC_DATA_DIR, "manifest.json");

let memoryStore = null;

function getSql() {
  const conn = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
  if (!conn) return null;
  try {
    return neon(conn);
  } catch {
    return null;
  }
}

function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

const DUMMY_USER_IDS = new Set(["u-grace", "u-bethel", "u-hope", "u-calvary"]);
const DUMMY_AUDIT_IDS = new Set(["aud-1", "aud-2"]);

function isoFromFs(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val.toDate === "function") return val.toDate().toISOString();
  if (val._seconds) return new Date(val._seconds * 1000).toISOString();
  return "";
}

async function readManifestFile() {
  try {
    const raw = await fs.readFile(MANIFEST_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      version: 2,
      defaultBibleId: "kjv",
      starterSongPackId: "starter-101",
      announcement: "",
      packs: [
        {
          id: "kjv",
          type: "bible",
          code: "KJV",
          name: "King James Version",
          language: "English",
          license: "Public domain",
          version: "1.0.0",
          sizeBytes: 1219584,
          sha256: null,
          url: "/data/kjv-sample.json.gz",
          notes: "Full 66-book King James Version (31,102 verses).",
        },
        {
          id: "starter-101",
          type: "songpack",
          name: "Selah Live Song Library 101",
          language: "English",
          license: "Public domain",
          version: "1.0.0",
          songCount: 22,
          sizeBytes: 5120,
          sha256: null,
          url: "/data/songs-sample.json.gz",
          notes: "Starter song pack (22 hymns, 2 lines per slide).",
        },
      ],
    };
  }
}

async function defaultStore() {
  const manifest = await readManifestFile();
  const kjvEntry = (manifest.packs || []).find((p) => p.id === "kjv");
  const songEntry = (manifest.packs || []).find((p) => p.id === "starter-101");
  return {
    manifestVersion: manifest.version || 2,
    settings: {
      defaultBibleId: "kjv",
      starterSongPackId: "starter-101",
      announcement: "",
      admins: [{ uid: "devlaolu", email: "devlaolu@selahlive.admin", name: "Dev Laolu", addedAt: "2026-11-01T09:00:00Z" }],
    },
    bibles: [
      {
        id: "kjv",
        code: "KJV",
        name: "King James Version",
        language: "English",
        license: "Public domain",
        isPublicDomain: true,
        version: kjvEntry?.version || "1.0.0",
        verseCount: 31102,
        bookCount: 66,
        status: "published",
        publishedAt: "2026-11-01T10:00:00Z",
        url: kjvEntry?.url || "/data/kjv-sample.json.gz",
        sizeBytes: kjvEntry?.sizeBytes || 1219584,
        sha256: kjvEntry?.sha256 || null,
        downloads: 0,
      },
    ],
    songPacks: [
      {
        id: "starter-101",
        name: "Selah Live Song Library 101",
        language: "English",
        license: "Public domain",
        version: songEntry?.version || "1.0.0",
        songCount: 22,
        status: "published",
        publishedAt: "2026-11-01T10:05:00Z",
        url: songEntry?.url || "/data/songs-sample.json.gz",
        sizeBytes: songEntry?.sizeBytes || 5120,
        sha256: songEntry?.sha256 || null,
        downloads: 0,
      },
    ],
    releases: [
      {
        id: "rel-kjv-1",
        type: "bible",
        refId: "kjv",
        name: "King James Version",
        version: "1.0.0",
        notes: "Full 66-book King James Version (31,102 verses).",
        notificationText: "King James Version (KJV) is ready to download.",
        notify: true,
        active: true,
        publishedAt: "2026-11-01T10:00:00Z",
      },
      {
        id: "rel-songs-101",
        type: "songpack",
        refId: "starter-101",
        name: "Selah Live Song Library 101",
        version: "1.0.0",
        notes: "Starter pack of 22 classic public-domain hymns (2 lines per slide).",
        notificationText: "New song pack: Selah Live Song Library 101 is ready to download.",
        notify: true,
        active: true,
        publishedAt: "2026-11-01T10:05:00Z",
      },
    ],
    users: [],
    auditLog: [],
    analyticsDaily: {},
    cleanedDummyV1: true,
  };
}

async function cleanLegacyDummyData(store) {
  if (!store || store.cleanedDummyV1) return store;
  store.users = (store.users || []).filter(
    (u) => u && !DUMMY_USER_IDS.has(u.uid) && u.email !== "devlaolu@selahlive.admin"
  );
  store.auditLog = (store.auditLog || []).filter((a) => a && !DUMMY_AUDIT_IDS.has(a.id));
  // Clear pre-launch dummy seeded analytics (real events going forward + Firestore analytics_daily remain intact)
  store.analyticsDaily = {};
  (store.bibles || []).forEach((b) => { if (b.id === "kjv" && b.downloads === 64) b.downloads = 0; });
  (store.songPacks || []).forEach((s) => { if (s.id === "starter-101" && s.downloads === 58) s.downloads = 0; });
  store.cleanedDummyV1 = true;
  await saveStore(store);
  return store;
}

export async function getStore() {
  // 1. Try Neon Postgres `admin_settings` (`key = 'server_store'`) if configured
  const sql = getSql();
  if (sql) {
    try {
      const rows = await sql`SELECT value FROM admin_settings WHERE key = 'server_store' LIMIT 1`;
      if (rows[0]?.value) {
        memoryStore = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
        return await cleanLegacyDummyData(memoryStore);
      }
    } catch { }
  }

  // 2. Try local / tmp file
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    memoryStore = JSON.parse(raw);
    return await cleanLegacyDummyData(memoryStore);
  } catch { }

  // 3. Fallback to memory or default store (never throw on read-only filesystem)
  if (memoryStore) return await cleanLegacyDummyData(memoryStore);
  const init = await defaultStore();
  await saveStore(init);
  return init;
}

export async function saveStore(store) {
  memoryStore = store;
  const sql = getSql();
  if (sql) {
    try {
      await sql`
        INSERT INTO admin_settings (key, value, updated_at)
        VALUES ('server_store', ${JSON.stringify(store)}::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
    } catch { }
  }
  try {
    await fs.mkdir(WRITABLE_BASE, { recursive: true });
    await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch { }
}

export async function logAudit(admin, action, target, storeInstance = null) {
  const who = admin?.uid || admin?.email || "admin";
  const createdAt = new Date().toISOString();
  const sql = getSql();
  if (sql) {
    try {
      await sql`INSERT INTO admin_audit_log (admin_uid, action, target, created_at) VALUES (${who}, ${action}, ${target}, ${createdAt})`;
    } catch { }
  }
  const s = storeInstance || (await getStore());
  s.auditLog.unshift({
    id: "aud-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    adminUid: who,
    action,
    target,
    createdAt,
  });
  s.auditLog = s.auditLog.slice(0, 500);
  if (!storeInstance) await saveStore(s);
}

function normalizePackUrl(url) {
  if (!url) return url;
  // Proxy private S3/Neon object-storage URLs through our signed same-origin route
  if (/^https?:\/\//i.test(url)) {
    const m = url.match(/\/packs\/([a-z0-9][a-z0-9._-]*\.json\.gz)(?:$|\?)/i);
    if (m) return `/api/packs/${m[1]}`;
  }
  return url;
}

export function buildManifestObjectFromStore(store) {
  const packs = [];
  for (const b of store.bibles || []) {
    if (b.status === "published" && b.url) {
      const rel = (store.releases || []).find((r) => r.type === "bible" && r.refId === b.id && r.active);
      packs.push({
        id: b.id,
        type: "bible",
        code: b.code,
        name: b.name,
        language: b.language || "English",
        license: b.license || "Public domain",
        version: b.version,
        sizeBytes: b.sizeBytes || 0,
        sha256: b.sha256 || null,
        url: normalizePackUrl(b.url),
        notify: rel ? rel.notify !== false : true,
        notes: rel?.notificationText || rel?.notes || `${b.name} (${b.code}) is ready to download.`,
      });
    }
  }
  for (const sp of store.songPacks || []) {
    if (sp.status === "published" && sp.url) {
      const rel = (store.releases || []).find((r) => r.type === "songpack" && r.refId === sp.id && r.active);
      packs.push({
        id: sp.id,
        type: "songpack",
        name: sp.name,
        language: sp.language || "English",
        license: sp.license || "Public domain",
        version: sp.version,
        songCount: sp.songCount,
        sizeBytes: sp.sizeBytes || 0,
        sha256: sp.sha256 || null,
        url: normalizePackUrl(sp.url),
        notify: rel ? rel.notify !== false : true,
        notes: rel?.notificationText || rel?.notes || `New song pack: ${sp.name} is ready to download.`,
      });
    }
  }
  return {
    version: store.manifestVersion || 2,
    defaultBibleId: store.settings?.defaultBibleId || "kjv",
    starterSongPackId: store.settings?.starterSongPackId || "starter-101",
    announcement: store.settings?.announcement || "",
    packs,
  };
}

export async function syncManifestFromStore(store) {
  store.manifestVersion = (store.manifestVersion || 1) + 1;
  const manifest = buildManifestObjectFromStore(store);
  try {
    if (!process.env.VERCEL) {
      await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });
      await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
    }
  } catch { }
  return manifest;
}

export async function getPublicManifest() {
  try {
    const store = await getStore();
    return buildManifestObjectFromStore(store);
  } catch {
    return await readManifestFile();
  }
}

function bumpVersion(ver = "1.0.0") {
  const parts = String(ver).split(".").map((x) => parseInt(x, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[1] += 1;
  parts[2] = 0;
  return parts.join(".");
}

export async function saveBibleDraft(admin, meta, validated) {
  if (!meta.rights) throw new Error("You must confirm distribution rights before saving.");
  if (!meta.name?.trim() || !meta.code?.trim()) throw new Error("Bible name and short code are required.");
  const store = await getStore();
  const code = meta.code.trim().toUpperCase();
  const id = code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existing = store.bibles.find((b) => b.id === id || b.code.toUpperCase() === code);
  const version = existing ? bumpVersion(existing.version) : "1.0.0";

  const draftPayload = {
    id,
    type: "bible",
    code,
    name: meta.name.trim(),
    language: (meta.language || "English").trim(),
    license: meta.license || "Public domain",
    version,
    verseCount: validated.counts.verses,
    books: validated.books,
  };
  const draftJson = JSON.stringify(draftPayload);

  try {
    await fs.mkdir(DRAFTS_DIR, { recursive: true });
    await fs.writeFile(path.join(DRAFTS_DIR, `bible-${id}.json`), draftJson, "utf8");
  } catch { }

  const sql = getSql();
  if (sql) {
    try {
      await sql`
        INSERT INTO admin_settings (key, value, updated_at)
        VALUES (${`draft:bible:${id}`}, ${draftJson}::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
      const rows = await sql`
        INSERT INTO translations (code, name, language, license, is_public_domain, version, verse_count)
        VALUES (${code}, ${draftPayload.name}, ${draftPayload.language}, ${draftPayload.license}, ${draftPayload.license === "Public domain"}, ${parseInt(version.split(".")[1] || "1", 10) || 1}, ${validated.counts.verses})
        RETURNING id
      `;
      const tid = rows[0]?.id;
      if (tid) {
        const bNums = validated.books.map((b) => b.n);
        const bNames = validated.books.map((b) => b.name);
        const bAbbrs = validated.books.map((b) => b.abbr || b.name.slice(0, 3));
        await sql`
          INSERT INTO books (translation_id, number, name, abbreviation)
          SELECT ${tid}, * FROM UNNEST(${bNums}::int[], ${bNames}::text[], ${bAbbrs}::text[])
        `;
        const vBooks = [], vChs = [], vNums = [], vTexts = [];
        for (const b of validated.books) {
          (b.chapters || []).forEach((ch, ci) => {
            if (!Array.isArray(ch)) return;
            ch.forEach((txt, vi) => {
              if (txt && txt.trim()) {
                vBooks.push(b.n);
                vChs.push(ci + 1);
                vNums.push(vi + 1);
                vTexts.push(txt);
              }
            });
          });
        }
        const CHUNK = 5000;
        for (let i = 0; i < vTexts.length; i += CHUNK) {
          await sql`
            INSERT INTO verses (translation_id, book_number, chapter, verse, text)
            SELECT ${tid}, * FROM UNNEST(
              ${vBooks.slice(i, i + CHUNK)}::int[],
              ${vChs.slice(i, i + CHUNK)}::int[],
              ${vNums.slice(i, i + CHUNK)}::int[],
              ${vTexts.slice(i, i + CHUNK)}::text[]
            )
          `;
        }
      }
    } catch { }
  }

  const record = {
    id,
    code,
    name: draftPayload.name,
    language: draftPayload.language,
    license: draftPayload.license,
    isPublicDomain: draftPayload.license === "Public domain",
    version,
    verseCount: validated.counts.verses,
    bookCount: validated.counts.books,
    status: "draft",
    publishedAt: existing?.publishedAt || null,
    url: existing?.url || null,
    sizeBytes: existing?.sizeBytes || 0,
    sha256: existing?.sha256 || null,
    previousVersion: existing?.status === "published" ? {
      version: existing.version,
      url: existing.url,
      sizeBytes: existing.sizeBytes,
      sha256: existing.sha256,
    } : existing?.previousVersion || null,
    downloads: existing?.downloads || 0,
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    store.bibles.unshift(record);
  }
  await logAudit(admin, "bible.draft", `${record.name} (${record.code}) v${record.version}`, store);
  await saveStore(store);
  return record;
}

export async function publishBible(admin, id, { notes = "", notificationText = "", notify = true } = {}) {
  const store = await getStore();
  const bible = store.bibles.find((b) => b.id === id);
  if (!bible) throw new Error("Bible version not found.");

  let rawJson = null;
  try {
    rawJson = await fs.readFile(path.join(DRAFTS_DIR, `bible-${id}.json`), "utf8");
  } catch { }
  if (!rawJson) {
    const sql = getSql();
    if (sql) {
      try {
        const rows = await sql`SELECT value FROM admin_settings WHERE key = ${`draft:bible:${id}`} LIMIT 1`;
        if (rows[0]?.value) rawJson = typeof rows[0].value === "string" ? rows[0].value : JSON.stringify(rows[0].value);
      } catch { }
    }
  }
  if (!rawJson && bible.url) {
    const p = path.join(process.cwd(), "public", bible.url.replace(/^\//, "").replace(/\.gz$/, ""));
    rawJson = await fs.readFile(p, "utf8");
  }
  if (!rawJson) throw new Error("Draft data file not found for this Bible version.");

  const jsonBytes = Buffer.from(rawJson, "utf8");
  const gzBytes = Buffer.from(gzipSync(new Uint8Array(jsonBytes)));
  const sha256 = crypto.createHash("sha256").update(jsonBytes).digest("hex");

  const fileName = `bible-${id}-v${bible.version}.json.gz`;
  try {
    await fs.mkdir(PACKS_DIR, { recursive: true });
    await fs.writeFile(path.join(PACKS_DIR, fileName), gzBytes);
  } catch { }
  const s3Url = await uploadPackToS3(`packs/${fileName}`, gzBytes);

  bible.url = s3Url ? `/api/packs/${fileName}` : `/data/packs/${fileName}`;
  bible.sizeBytes = gzBytes.byteLength;
  bible.sha256 = sha256;
  bible.status = "published";
  bible.publishedAt = new Date().toISOString();

  const rel = {
    id: `rel-bible-${id}-${bible.version}-${Date.now()}`,
    type: "bible",
    refId: id,
    name: bible.name,
    version: bible.version,
    notes: notes || `Published ${bible.name} (${bible.code}) v${bible.version}.`,
    notificationText: notificationText || `New Bible version: ${bible.name} (${bible.code}) is ready to download.`,
    notify: notify !== false,
    active: true,
    publishedAt: bible.publishedAt,
  };
  store.releases.forEach((r) => {
    if (r.type === "bible" && r.refId === id) r.active = false;
  });
  store.releases.unshift(rel);

  const sql = getSql();
  if (sql) {
    try {
      await sql`UPDATE translations SET published_at = now() WHERE code = ${bible.code}`;
      await sql`INSERT INTO releases (type, ref_id, name, version, notes, notification_text, notify, active, published_at) VALUES ('bible', ${id}, ${bible.name}, ${bible.version}, ${rel.notes}, ${rel.notificationText}, ${rel.notify}, true, now())`;
    } catch { }
  }

  await syncManifestFromStore(store);
  await logAudit(admin, "bible.publish", `${bible.name} (${bible.code}) v${bible.version}`, store);
  await saveStore(store);
  return { bible, release: rel };
}

export async function unpublishBible(admin, id) {
  const store = await getStore();
  const bible = store.bibles.find((b) => b.id === id);
  if (!bible) throw new Error("Bible version not found.");
  if (bible.previousVersion) {
    const prev = bible.previousVersion;
    bible.version = prev.version;
    bible.url = prev.url;
    bible.sizeBytes = prev.sizeBytes;
    bible.sha256 = prev.sha256;
    bible.status = "published";
    bible.previousVersion = null;
  } else {
    bible.status = "unpublished";
  }
  store.releases.forEach((r) => {
    if (r.type === "bible" && r.refId === id) r.active = false;
  });
  await syncManifestFromStore(store);
  await logAudit(admin, "bible.unpublish", `${bible.name} (${bible.code})`, store);
  await saveStore(store);
  return bible;
}

export async function deleteBible(admin, id) {
  const store = await getStore();
  const idx = store.bibles.findIndex((b) => b.id === id);
  if (idx < 0) throw new Error("Bible version not found.");
  const [removed] = store.bibles.splice(idx, 1);
  store.releases = store.releases.filter((r) => !(r.type === "bible" && r.refId === id));
  await syncManifestFromStore(store);
  await logAudit(admin, "bible.delete", `${removed.name} (${removed.code})`, store);
  await saveStore(store);
  return removed;
}

export async function nextSongPackDefaultName() {
  const store = await getStore();
  let maxNum = 100;
  for (const sp of store.songPacks) {
    const m = sp.name.match(/(\d+)\s*$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return `Selah Live Song Library ${maxNum + 1}`;
}

export async function saveSongPackDraft(admin, meta, songs) {
  if (!meta.rights) throw new Error("You must confirm distribution rights before saving.");
  const minSongs = Math.max(5, Number(meta.packSize) || 5);
  if (!Array.isArray(songs) || songs.length < minSongs) {
    throw new Error(`A song pack of this size requires at least ${minSongs} songs (found ${songs?.length || 0}).`);
  }
  const store = await getStore();
  const defaultName = await nextSongPackDefaultName();
  const name = (meta.name || "").trim() || defaultName;
  const id = (meta.id || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const existing = store.songPacks.find((s) => s.id === id || s.name.toLowerCase() === name.toLowerCase());
  const version = existing ? bumpVersion(existing.version) : "1.0.0";

  const normalizedSongs = songs.map((s, idx) => ({
    id: s.id || `${id}-s${idx + 1}`,
    title: (s.title || `Song ${idx + 1}`).trim(),
    author: (s.author || "").trim(),
    language: (s.language || meta.language || "English").trim(),
    ccli: (s.ccli || "").trim(),
    sections: s.sections || [],
  }));
  const draftPayload = {
    id,
    type: "songpack",
    name,
    language: (meta.language || "English").trim(),
    license: meta.license || "Public domain",
    version,
    songCount: normalizedSongs.length,
    songs: normalizedSongs,
  };
  const draftJson = JSON.stringify(draftPayload);

  try {
    await fs.mkdir(DRAFTS_DIR, { recursive: true });
    await fs.writeFile(path.join(DRAFTS_DIR, `songs-${id}.json`), draftJson, "utf8");
  } catch { }

  const sql = getSql();
  if (sql) {
    try {
      await sql`
        INSERT INTO admin_settings (key, value, updated_at)
        VALUES (${`draft:songs:${id}`}, ${draftJson}::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
      const rows = await sql`
        INSERT INTO song_packs (name, version, song_count)
        VALUES (${name}, ${parseInt(version.split(".")[1] || "1", 10) || 1}, ${normalizedSongs.length})
        RETURNING id
      `;
      const pid = rows[0]?.id;
      if (pid) {
        for (const s of normalizedSongs) {
          await sql`
            INSERT INTO songs (pack_id, title, author, language, ccli_number, sections)
            VALUES (${pid}, ${s.title}, ${s.author}, ${s.language}, ${s.ccli || null}, ${JSON.stringify(s.sections)}::jsonb)
          `;
        }
      }
    } catch { }
  }

  const record = {
    id,
    name,
    language: draftPayload.language,
    license: draftPayload.license,
    version,
    songCount: normalizedSongs.length,
    packSize: minSongs,
    status: "draft",
    publishedAt: existing?.publishedAt || null,
    url: existing?.url || null,
    sizeBytes: existing?.sizeBytes || 0,
    sha256: existing?.sha256 || null,
    previousVersion: existing?.status === "published" ? {
      version: existing.version,
      url: existing.url,
      sizeBytes: existing.sizeBytes,
      sha256: existing.sha256,
    } : existing?.previousVersion || null,
    downloads: existing?.downloads || 0,
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    store.songPacks.unshift(record);
  }
  await logAudit(admin, "songs.draft", `${record.name} (${record.songCount} songs, v${record.version})`, store);
  await saveStore(store);
  return record;
}

export async function publishSongPack(admin, packId, { notes = "", notificationText = "", notify = true } = {}) {
  const store = await getStore();
  const pack = store.songPacks.find((s) => s.id === packId);
  if (!pack) throw new Error("Song pack not found.");
  const minSongs = Math.max(5, Number(pack.packSize) || 5);
  if (pack.songCount < minSongs) throw new Error(`Cannot publish: this song pack requires at least ${minSongs} songs (has ${pack.songCount}).`);

  let rawJson = null;
  try {
    rawJson = await fs.readFile(path.join(DRAFTS_DIR, `songs-${packId}.json`), "utf8");
  } catch { }
  if (!rawJson) {
    const sql = getSql();
    if (sql) {
      try {
        const rows = await sql`SELECT value FROM admin_settings WHERE key = ${`draft:songs:${packId}`} LIMIT 1`;
        if (rows[0]?.value) rawJson = typeof rows[0].value === "string" ? rows[0].value : JSON.stringify(rows[0].value);
      } catch { }
    }
  }
  if (!rawJson && pack.url) {
    const p = path.join(process.cwd(), "public", pack.url.replace(/^\//, "").replace(/\.gz$/, ""));
    rawJson = await fs.readFile(p, "utf8");
  }
  if (!rawJson) throw new Error("Draft data file not found for this song pack.");

  const parsed = JSON.parse(rawJson);
  if (!parsed.songs || parsed.songs.length < minSongs) {
    throw new Error(`Cannot publish: song pack has fewer than ${minSongs} songs.`);
  }

  const jsonBytes = Buffer.from(rawJson, "utf8");
  const gzBytes = Buffer.from(gzipSync(new Uint8Array(jsonBytes)));
  const sha256 = crypto.createHash("sha256").update(jsonBytes).digest("hex");

  const fileName = `songs-${packId}-v${pack.version}.json.gz`;
  try {
    await fs.mkdir(PACKS_DIR, { recursive: true });
    await fs.writeFile(path.join(PACKS_DIR, fileName), gzBytes);
  } catch { }
  const s3Url = await uploadPackToS3(`packs/${fileName}`, gzBytes);

  pack.url = s3Url ? `/api/packs/${fileName}` : `/data/packs/${fileName}`;
  pack.sizeBytes = gzBytes.byteLength;
  pack.sha256 = sha256;
  pack.status = "published";
  pack.publishedAt = new Date().toISOString();

  const rel = {
    id: `rel-songs-${packId}-${pack.version}-${Date.now()}`,
    type: "songpack",
    refId: packId,
    name: pack.name,
    version: pack.version,
    notes: notes || `Published ${pack.name} (${pack.songCount} songs).`,
    notificationText: notificationText || `New song pack: ${pack.name} is ready to download.`,
    notify: notify !== false,
    active: true,
    publishedAt: pack.publishedAt,
  };
  store.releases.forEach((r) => {
    if (r.type === "songpack" && r.refId === packId) r.active = false;
  });
  store.releases.unshift(rel);

  const sql = getSql();
  if (sql) {
    try {
      await sql`UPDATE song_packs SET published_at = now() WHERE name = ${pack.name}`;
      await sql`INSERT INTO releases (type, ref_id, name, version, notes, notification_text, notify, active, published_at) VALUES ('songpack', ${packId}, ${pack.name}, ${pack.version}, ${rel.notes}, ${rel.notificationText}, ${rel.notify}, true, now())`;
    } catch { }
  }

  await syncManifestFromStore(store);
  await logAudit(admin, "songs.publish", `${pack.name} (v${pack.version})`, store);
  await saveStore(store);
  return { pack, release: rel };
}

export async function unpublishSongPack(admin, packId) {
  const store = await getStore();
  const pack = store.songPacks.find((s) => s.id === packId);
  if (!pack) throw new Error("Song pack not found.");
  if (pack.previousVersion) {
    const prev = pack.previousVersion;
    pack.version = prev.version;
    pack.url = prev.url;
    pack.sizeBytes = prev.sizeBytes;
    pack.sha256 = prev.sha256;
    pack.status = "published";
    pack.previousVersion = null;
  } else {
    pack.status = "unpublished";
  }
  store.releases.forEach((r) => {
    if (r.type === "songpack" && r.refId === packId) r.active = false;
  });
  await syncManifestFromStore(store);
  await logAudit(admin, "songs.unpublish", pack.name, store);
  await saveStore(store);
  return pack;
}

export async function deleteSongPack(admin, packId) {
  const store = await getStore();
  const idx = store.songPacks.findIndex((s) => s.id === packId);
  if (idx < 0) throw new Error("Song pack not found.");
  const [removed] = store.songPacks.splice(idx, 1);
  store.releases = store.releases.filter((r) => !(r.type === "songpack" && r.refId === packId));
  await syncManifestFromStore(store);
  await logAudit(admin, "songs.delete", removed.name, store);
  await saveStore(store);
  return removed;
}

export async function unpublishRelease(admin, releaseId) {
  const store = await getStore();
  const rel = store.releases.find((r) => r.id === releaseId);
  if (!rel) throw new Error("Release not found.");
  rel.active = false;
  if (rel.type === "bible") {
    const b = store.bibles.find((x) => x.id === rel.refId);
    if (b) {
      if (b.previousVersion) {
        Object.assign(b, b.previousVersion, { previousVersion: null, status: "published" });
      } else {
        b.status = "unpublished";
      }
    }
  } else if (rel.type === "songpack") {
    const sp = store.songPacks.find((x) => x.id === rel.refId);
    if (sp) {
      if (sp.previousVersion) {
        Object.assign(sp, sp.previousVersion, { previousVersion: null, status: "published" });
      } else {
        sp.status = "unpublished";
      }
    }
  }
  await syncManifestFromStore(store);
  await logAudit(admin, "release.unpublish", `${rel.name} v${rel.version}`, store);
  await saveStore(store);
  return rel;
}

export async function recordAnalyticsEvent({ event, uid, email, name, churchName, packId }) {
  try {
    const store = await getStore();
    const now = new Date();
    const key = todayStr(now);
    const isSunday = now.getDay() === 0;
    if (!store.analyticsDaily) store.analyticsDaily = {};
    if (!store.analyticsDaily[key]) {
      store.analyticsDaily[key] = { date: key, isSunday, installs: 0, visits: 0, activeUsers: 0 };
    }
    const day = store.analyticsDaily[key];
    if (event === "install") day.installs += 1;
    if (event === "visit" || event === "app_open") day.visits += 1;
    if (event === "app_open") day.activeUsers += 1;
    if (event === "download" && packId) {
      const b = store.bibles.find((x) => x.id === packId);
      if (b) b.downloads = (b.downloads || 0) + 1;
      const sp = store.songPacks.find((x) => x.id === packId);
      if (sp) sp.downloads = (sp.downloads || 0) + 1;
    }

    if (uid || email) {
      if (!store.users) store.users = [];
      let u = store.users.find((x) => (uid && x.uid === uid) || (email && x.email === email));
      if (!u) {
        u = {
          uid: uid || "u-" + Date.now(),
          name: name || (email ? email.split("@")[0] : "Church Volunteer"),
          email: email || "",
          churchName: churchName || "Grace Fellowship Church",
          createdAt: now.toISOString(),
          lastActiveAt: now.toISOString(),
          daysActive: 1,
          installs: event === "install" ? 1 : 0,
          status: "active",
          admin: false,
          latestPacks: true,
        };
        store.users.unshift(u);
      } else {
        const prevDay = (u.lastActiveAt || "").slice(0, 10);
        if (prevDay !== key) u.daysActive = (u.daysActive || 1) + 1;
        u.lastActiveAt = now.toISOString();
        if (name) u.name = name;
        if (churchName) u.churchName = churchName;
        if (event === "install") u.installs = (u.installs || 0) + 1;
      }
    }

    await saveStore(store);

    const fsDb = getAdminFirestore();
    if (fsDb) {
      await fsDb.collection("analytics_events").add({
        event,
        createdAt: now.toISOString(),
      });
      const docRef = fsDb.collection("analytics_daily").doc(key);
      const snap = await docRef.get();
      const cur = snap.exists ? snap.data() : { installs: 0, visits: 0, activeUsers: 0 };
      await docRef.set(
        {
          date: key,
          isSunday,
          installs: (cur.installs || 0) + (event === "install" ? 1 : 0),
          visits: (cur.visits || 0) + (event === "visit" || event === "app_open" ? 1 : 0),
          activeUsers: (cur.activeUsers || 0) + (event === "app_open" ? 1 : 0),
        },
        { merge: true }
      );
    }
  } catch { }
}

export async function getLiveUsers() {
  const store = await getStore();
  const byUid = new Map();

  // 1. Start with real activity records stored in Neon server_store
  for (const u of store.users || []) {
    if (!u || DUMMY_USER_IDS.has(u.uid) || u.email === "devlaolu@selahlive.admin") continue;
    byUid.set(u.uid, { ...u });
  }

  // 2. Pull live accounts from Firebase Auth (every registered user)
  const fbAuth = getAdminAuth();
  if (fbAuth) {
    try {
      const res = await fbAuth.listUsers(1000);
      for (const rec of res.users || []) {
        const existing = byUid.get(rec.uid) || {};
        byUid.set(rec.uid, {
          uid: rec.uid,
          name: rec.displayName || existing.name || (rec.email ? rec.email.split("@")[0] : "User"),
          email: rec.email || existing.email || "",
          churchName: existing.churchName || "—",
          createdAt: rec.metadata?.creationTime ? new Date(rec.metadata.creationTime).toISOString() : (existing.createdAt || ""),
          lastActiveAt: rec.metadata?.lastSignInTime
            ? new Date(rec.metadata.lastSignInTime).toISOString()
            : (existing.lastActiveAt || ""),
          daysActive: existing.daysActive || 1,
          installs: existing.installs || 0,
          status: rec.disabled ? "disabled" : (existing.status || "active"),
          admin: !!rec.customClaims?.admin || !!existing.admin,
          latestPacks: existing.latestPacks !== false,
        });
      }
    } catch { }
  }

  // 3. Enrich with live Firestore `users` profiles (churchName, lastActiveAt, name)
  const fsDb = getAdminFirestore();
  if (fsDb) {
    try {
      const snap = await fsDb.collection("users").limit(1000).get();
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const uid = doc.id;
        if (DUMMY_USER_IDS.has(uid)) return;
        const existing = byUid.get(uid) || {};
        const fsLast = isoFromFs(d.lastActiveAt) || isoFromFs(d.updatedAt);
        const fsCreated = isoFromFs(d.createdAt);
        const bestLast = fsLast && (!existing.lastActiveAt || fsLast > existing.lastActiveAt) ? fsLast : (existing.lastActiveAt || fsLast);
        byUid.set(uid, {
          uid,
          name: d.name || existing.name || (d.email ? d.email.split("@")[0] : "User"),
          email: d.email || existing.email || "",
          churchName: d.churchName || existing.churchName || "—",
          createdAt: existing.createdAt || fsCreated || "",
          lastActiveAt: bestLast || "",
          daysActive: existing.daysActive || 1,
          installs: existing.installs || 0,
          status: existing.status || "active",
          admin: !!existing.admin,
          latestPacks: existing.latestPacks !== false,
        });
      });
    } catch { }
  }

  return Array.from(byUid.values()).sort((a, b) =>
    String(b.lastActiveAt || b.createdAt || "").localeCompare(String(a.lastActiveAt || a.createdAt || ""))
  );
}

export async function getLiveAuditLogs() {
  const store = await getStore();
  const logs = [];
  const seen = new Set();

  // 1. Read authoritative audit log from Neon Postgres `admin_audit_log`
  const sql = getSql();
  if (sql) {
    try {
      const rows = await sql`
        SELECT id, admin_uid, action, target, created_at
        FROM admin_audit_log
        ORDER BY created_at DESC
        LIMIT 300
      `;
      for (const r of rows) {
        const createdAt = r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || "");
        const sig = `${r.admin_uid}|${r.action}|${r.target}|${createdAt.slice(0, 19)}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        logs.push({
          id: `pg-${r.id}`,
          adminUid: r.admin_uid,
          action: r.action,
          target: r.target,
          createdAt,
        });
      }
    } catch { }
  }

  // 2. Merge any in-store audit entries not already present in Postgres
  for (const a of store.auditLog || []) {
    if (!a || DUMMY_AUDIT_IDS.has(a.id)) continue;
    const sig = `${a.adminUid}|${a.action}|${a.target}|${String(a.createdAt || "").slice(0, 19)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    logs.push(a);
  }

  return logs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 300);
}

export async function getAnalyticsDashboard(range = "30d") {
  const store = await getStore();
  const daysMap = { "7d": 7, "30d": 30, "90d": 90, all: 3650 };
  const maxDays = daysMap[range] || 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const cutoffStr = todayStr(cutoff);

  // Merge real daily analytics from Neon server_store AND Firestore `analytics_daily`
  const dailyMap = {};
  for (const [k, v] of Object.entries(store.analyticsDaily || {})) {
    dailyMap[k] = { ...v, date: v.date || k };
  }
  const fsDb = getAdminFirestore();
  if (fsDb) {
    try {
      const snap = await fsDb.collection("analytics_daily").get();
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const key = d.date || doc.id;
        const cur = dailyMap[key] || { date: key, isSunday: !!d.isSunday, installs: 0, visits: 0, activeUsers: 0 };
        dailyMap[key] = {
          date: key,
          isSunday: d.isSunday !== undefined ? !!d.isSunday : cur.isSunday,
          installs: Math.max(cur.installs || 0, Number(d.installs) || 0),
          visits: Math.max(cur.visits || 0, Number(d.visits) || 0),
          activeUsers: Math.max(cur.activeUsers || 0, Number(d.activeUsers) || 0),
        };
      });
    } catch { }
  }

  const allSeries = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const series = range === "all" ? allSeries : allSeries.filter((d) => d.date >= cutoffStr);

  let installs = 0, visits = 0, sundayActive = 0, sundayDays = 0, weekdayActive = 0, weekdayDays = 0;
  for (const d of series) {
    installs += d.installs || 0;
    visits += d.visits || 0;
    if (d.isSunday || new Date(d.date + "T12:00:00Z").getUTCDay() === 0) {
      sundayActive += d.activeUsers || 0;
      sundayDays += 1;
    } else {
      weekdayActive += d.activeUsers || 0;
      weekdayDays += 1;
    }
  }

  const lastSunday = [...allSeries].reverse().find((d) => d.isSunday || new Date(d.date + "T12:00:00Z").getUTCDay() === 0);
  const activeThisSunday = lastSunday ? lastSunday.activeUsers : 0;
  const last7 = allSeries.slice(-7);
  const activeThisWeek = last7.reduce((acc, d) => acc + (d.activeUsers || 0), 0);

  const users = await getLiveUsers();
  const topUsers = [...users]
    .sort((a, b) => (b.daysActive || 0) - (a.daysActive || 0) || String(b.lastActiveAt || "").localeCompare(String(a.lastActiveAt || "")))
    .slice(0, 10)
    .map((u) => ({
      uid: u.uid,
      name: u.name,
      email: u.email,
      churchName: u.churchName || "—",
      daysActive: u.daysActive || 1,
      lastActiveAt: u.lastActiveAt,
    }));

  const topPacks = [
    ...(store.bibles || []).map((b) => ({ id: b.id, name: `${b.name} (${b.code})`, type: "Bible", version: b.version, downloads: b.downloads || 0 })),
    ...(store.songPacks || []).map((s) => ({ id: s.id, name: s.name, type: "Song pack", version: s.version, downloads: s.downloads || 0 })),
  ].sort((a, b) => b.downloads - a.downloads);

  const onLatest = users.filter((u) => u.latestPacks !== false).length;
  const updateAdoption = users.length ? Math.round((onLatest / users.length) * 100) : 100;

  return {
    range,
    installs,
    visits,
    registeredUsers: users.length,
    activeThisWeek,
    activeThisSunday,
    updateAdoption,
    sundayVsWeekday: {
      sundayAvg: sundayDays ? Math.round(sundayActive / sundayDays) : 0,
      weekdayAvg: weekdayDays ? Math.round(weekdayActive / weekdayDays) : 0,
      sundayTotal: sundayActive,
      weekdayTotal: weekdayActive,
    },
    series,
    topUsers,
    topPacks,
    sources: {
      firebaseAdmin: !!getAdminAuth(),
      neonPostgres: !!getSql(),
    },
  };
}

export async function performUserAction(admin, { uid, action, email, name }) {
  const store = await getStore();
  const fbAuth = getAdminAuth();
  if (!store.users) store.users = [];
  let u = store.users.find((x) => (uid && x.uid === uid) || (email && x.email === email));
  if (!u && fbAuth && (uid || email)) {
    try {
      const fbRec = uid ? await fbAuth.getUser(uid) : await fbAuth.getUserByEmail(email);
      if (fbRec) {
        u = {
          uid: fbRec.uid,
          name: fbRec.displayName || name || (fbRec.email ? fbRec.email.split("@")[0] : "User"),
          email: fbRec.email || email || "",
          churchName: "—",
          createdAt: fbRec.metadata?.creationTime ? new Date(fbRec.metadata.creationTime).toISOString() : new Date().toISOString(),
          lastActiveAt: fbRec.metadata?.lastSignInTime ? new Date(fbRec.metadata.lastSignInTime).toISOString() : new Date().toISOString(),
          daysActive: 1,
          installs: 0,
          status: fbRec.disabled ? "disabled" : "active",
          admin: !!fbRec.customClaims?.admin,
          latestPacks: true,
        };
        store.users.unshift(u);
      }
    } catch { }
  }
  if (!u && action === "grantAdmin" && email) {
    u = {
      uid: "u-" + Date.now(),
      name: name || email.split("@")[0],
      email,
      churchName: "Selah Live Admin",
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      daysActive: 1,
      installs: 1,
      status: "active",
      admin: true,
      latestPacks: true,
    };
    store.users.unshift(u);
  }
  if (!u) throw new Error("User not found.");
  if (action === "disable") {
    u.status = "disabled";
    if (fbAuth && !u.uid.startsWith("u-")) {
      try { await fbAuth.updateUser(u.uid, { disabled: true }); } catch { }
    }
    await logAudit(admin, "user.disable", u.email, store);
  } else if (action === "enable") {
    u.status = "active";
    if (fbAuth && !u.uid.startsWith("u-")) {
      try { await fbAuth.updateUser(u.uid, { disabled: false }); } catch { }
    }
    await logAudit(admin, "user.enable", u.email, store);
  } else if (action === "grantAdmin") {
    u.admin = true;
    if (fbAuth && !u.uid.startsWith("u-")) {
      try { await fbAuth.setCustomUserClaims(u.uid, { admin: true }); } catch { }
    }
    if (!store.settings.admins.find((a) => a.email === u.email)) {
      store.settings.admins.push({ uid: u.uid, email: u.email, name: u.name, addedAt: new Date().toISOString() });
    }
    await logAudit(admin, "user.grant_admin", u.email, store);
  } else if (action === "revokeAdmin") {
    u.admin = false;
    if (fbAuth && !u.uid.startsWith("u-")) {
      try { await fbAuth.setCustomUserClaims(u.uid, { admin: false }); } catch { }
    }
    store.settings.admins = store.settings.admins.filter((a) => a.email !== u.email && a.uid !== u.uid);
    await logAudit(admin, "user.revoke_admin", u.email, store);
  } else if (action === "resetPassword") {
    await logAudit(admin, "user.reset_password", u.email, store);
  } else {
    throw new Error("Unknown user action.");
  }

  await saveStore(store);
  return u;
}

// ============================================================================
// HELP DESK / SUPPORT MESSAGES (Neon Postgres + Firestore + Audit Log)
// ============================================================================
async function ensureSupportTable(sql) {
  if (!sql) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS support_messages (
        id TEXT PRIMARY KEY,
        uid TEXT,
        name TEXT,
        email TEXT,
        church_name TEXT,
        category TEXT,
        subject TEXT,
        message TEXT NOT NULL,
        page TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        admin_note TEXT DEFAULT '',
        resolved_by TEXT DEFAULT '',
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  } catch { }
}

export async function createSupportMessage(input = {}) {
  const message = String(input.message || "").trim().slice(0, 2000);
  if (message.length < 5) throw new Error("Please write a short description (at least 5 characters).");
  const allowedCats = ["OBS Connection", "Bible / Songs", "Display / Overlay", "Account / Sync", "Other"];
  const category = allowedCats.includes(input.category) ? input.category : "OBS Connection";
  const subject = String(input.subject || "").trim().slice(0, 120) || `${category} help request`;
  const rec = {
    id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    uid: String(input.uid || "").slice(0, 128),
    name: String(input.name || "Church Volunteer").trim().slice(0, 100),
    email: String(input.email || "").trim().slice(0, 160),
    churchName: String(input.churchName || "").trim().slice(0, 150),
    category,
    subject,
    message,
    page: String(input.page || "").slice(0, 120),
    status: "open",
    adminNote: "",
    resolvedBy: "",
    resolvedAt: null,
    createdAt: new Date().toISOString(),
  };

  const sql = getSql();
  if (sql) {
    try {
      await ensureSupportTable(sql);
      await sql`
        INSERT INTO support_messages (id, uid, name, email, church_name, category, subject, message, page, status, created_at)
        VALUES (${rec.id}, ${rec.uid}, ${rec.name}, ${rec.email}, ${rec.churchName}, ${rec.category}, ${rec.subject}, ${rec.message}, ${rec.page}, 'open', ${rec.createdAt})
      `;
    } catch { }
  }

  const fsDb = getAdminFirestore();
  if (fsDb) {
    try {
      await fsDb.collection("support_messages").doc(rec.id).set(rec);
    } catch { }
  }

  const store = await getStore();
  if (!Array.isArray(store.supportMessages)) store.supportMessages = [];
  store.supportMessages.unshift(rec);
  store.supportMessages = store.supportMessages.slice(0, 500);
  await saveStore(store);
  return rec;
}

export async function getSupportMessages() {
  const byId = new Map();
  const sql = getSql();
  if (sql) {
    try {
      await ensureSupportTable(sql);
      const rows = await sql`
        SELECT id, uid, name, email, church_name, category, subject, message, page, status, admin_note, resolved_by, resolved_at, created_at
        FROM support_messages
        ORDER BY created_at DESC
        LIMIT 300
      `;
      for (const r of rows) {
        byId.set(r.id, {
          id: r.id,
          uid: r.uid || "",
          name: r.name || "User",
          email: r.email || "",
          churchName: r.church_name || "",
          category: r.category || "Other",
          subject: r.subject || "",
          message: r.message || "",
          page: r.page || "",
          status: r.status || "open",
          adminNote: r.admin_note || "",
          resolvedBy: r.resolved_by || "",
          resolvedAt: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : (r.resolved_at || null),
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || ""),
        });
      }
    } catch { }
  }

  const store = await getStore();
  for (const m of store.supportMessages || []) {
    if (m?.id && !byId.has(m.id)) byId.set(m.id, m);
  }

  return Array.from(byId.values()).sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
}

export async function updateSupportMessage(admin, { id, action, adminNote = "" }) {
  if (!id) throw new Error("Message ID is required.");
  const who = admin?.uid || admin?.username || "admin";
  const now = new Date().toISOString();
  const note = String(adminNote || "").trim().slice(0, 1000);
  const sql = getSql();
  const store = await getStore();
  if (!Array.isArray(store.supportMessages)) store.supportMessages = [];

  if (action === "delete") {
    if (sql) {
      try {
        await ensureSupportTable(sql);
        await sql`DELETE FROM support_messages WHERE id = ${id}`;
      } catch { }
    }
    store.supportMessages = store.supportMessages.filter((m) => m.id !== id);
    await logAudit(admin, "support.delete", id, store);
    await saveStore(store);
    return { deleted: true, id };
  }

  const nextStatus = action === "reopen" ? "open" : "resolved";
  const resolvedAt = nextStatus === "resolved" ? now : null;
  const resolvedBy = nextStatus === "resolved" ? who : "";

  if (sql) {
    try {
      await ensureSupportTable(sql);
      await sql`
        UPDATE support_messages
        SET status = ${nextStatus}, admin_note = ${note}, resolved_by = ${resolvedBy}, resolved_at = ${resolvedAt}
        WHERE id = ${id}
      `;
    } catch { }
  }

  const fsDb = getAdminFirestore();
  if (fsDb) {
    try {
      await fsDb.collection("support_messages").doc(id).set(
        { status: nextStatus, adminNote: note, resolvedBy, resolvedAt },
        { merge: true }
      );
    } catch { }
  }

  const local = store.supportMessages.find((m) => m.id === id);
  if (local) {
    local.status = nextStatus;
    local.adminNote = note;
    local.resolvedBy = resolvedBy;
    local.resolvedAt = resolvedAt;
  }
  await logAudit(admin, nextStatus === "resolved" ? "support.resolve" : "support.reopen", id, store);
  await saveStore(store);
  return { id, status: nextStatus, adminNote: note, resolvedBy, resolvedAt };
}
