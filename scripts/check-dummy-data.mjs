/**
 * `scripts/check-dummy-data.mjs` (`CODE_STANDARDS.md §3.2 & §9.3`)
 *
 * Scans production code (`src/`, `app/`, `components/`, `lib/`) excluding tests,
 * fixtures (`tests/fixtures/`, `__fixtures__/`, `*.fixture.*`, `*.mock.*`), and
 * typed shipped data files (`*.data.ts`, `*.constants.ts`, `*.copy.ts`).
 *
 * Flags placeholder markers (`lorem ipsum`, `dummy`, `mockData`, `sampleData`) and
 * hard-coded sample verses/lyrics/placeholder churches outside dedicated data/fixture files.
 *
 * Enforcement mode (CODE_STANDARDS.md §12 Step 1 & Step 4):
 * - Migrated modules (`src/shared/`, `src/modules/`, `src/server/`, `src/app/`) fail immediately with exit 1.
 * - Legacy pre-migration paths (`app/`, `components/`, `lib/`, `src/voice/`) emit warnings until migrated,
 *   unless `--strict` is passed (which fails repo-wide).
 */

import fs from "node:fs";
import path from "node:path";

const strictAll = process.argv.includes("--strict");
const SCAN_ROOTS = ["src", "app", "components", "lib"];

const EXCLUDED_PATH_RE =
  /(?:^|\/)(?:tests\/fixtures|__fixtures__)(?:\/|$)|\.(?:test|spec|fixture|mock|data|constants|copy)\.[jt]sx?$/;

const STRICT_MIGRATED_PREFIXES = [
  "src/shared/",
  "src/modules/",
  "src/server/",
  "src/app/",
];

const PATTERNS = [
  { name: "lorem-ipsum", re: /\blorem\s+ipsum\b/i },
  { name: "dummy-identifier", re: /\b(?:dummyData|mockData|sampleData|fakeData|SAMPLE_VERSE|STARTER_SAVED_TEXTS)\b/ },
  { name: "hardcoded-sample-verse", re: /For God so loved the world, that he gave his only begotten Son/i },
  { name: "hardcoded-sample-lyric", re: /Amazing grace,?\s+how sweet the sound/i },
  { name: "hardcoded-sample-church", re: /["']Grace Fellowship Church["']/ },
];

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      collectFiles(full, out);
    } else if (/\.[jt]sx?$/.test(ent.name)) {
      const rel = full.split(path.sep).join("/");
      if (!EXCLUDED_PATH_RE.test(rel)) out.push(rel);
    }
  }
  return out;
}

const files = SCAN_ROOTS.flatMap((r) => collectFiles(r));
const errors = [];
const warnings = [];

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const isStrictFile =
    strictAll || STRICT_MIGRATED_PREFIXES.some((p) => file.startsWith(p));

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    // Skip placeholder="..." hints in JSX inputs unless they are actual runtime values
    if (/^\s*placeholder=/.test(trimmed)) return;

    for (const pat of PATTERNS) {
      if (pat.re.test(line)) {
        const record = `${file}:${idx + 1} [${pat.name}] ${trimmed.slice(0, 110)}`;
        if (isStrictFile) errors.push(record);
        else warnings.push(record);
      }
    }
  });
}

if (warnings.length > 0) {
  console.log(`⚠️  check:dummy-data: ${warnings.length} legacy occurrence(s) queued for Step 3 migration.`);
}

if (errors.length > 0) {
  console.error("❌ check:dummy-data failed with violations in migrated/strict files:");
  for (const e of errors) console.error(`   • ${e}`);
  process.exit(1);
}

console.log("✅ check:dummy-data passed (0 violations in migrated modules).");
