/**
 * `scripts/check-boundaries.mjs` (`CODE_STANDARDS.md §4 & §9.4`)
 *
 * Enforces architectural boundaries and dependency direction:
 * 1. Zero circular dependencies across the entire repository (HARD ERROR).
 * 2. Production files NEVER import from `tests/fixtures/`, `__fixtures__/`, `*.fixture.*`, `*.mock.*` (HARD ERROR).
 * 3. Client code NEVER imports from `server/` or `lib/server/` (HARD ERROR).
 * 4. `shared/` NEVER imports from `modules/`, `server/`, or `app/` (HARD ERROR).
 * 5. Cross-module imports inside `src/modules/<A>/` to `src/modules/<B>/` MUST go through `src/modules/<B>/index.ts` only (HARD ERROR).
 * 6. Intra-module downward layer order (`types <- constants/schemas <- utils/data <- services <- hooks <- components <- app`) (HARD ERROR on `src/shared` & `src/modules`).
 */

import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src", "app", "components", "lib"];
const allFiles = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (/\.[jt]sx?$/.test(ent.name)) {
      allFiles.push(full.split(path.sep).join("/"));
    }
  }
}
ROOTS.forEach(walk);
const fileSet = new Set(allFiles);

function resolveImport(spec, fromFile) {
  let base = null;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  } else {
    return null;
  }

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  return candidates.find((c) => fileSet.has(c)) || null;
}

function getLayerRank(file) {
  if (/\.types\.ts$|\/types\//.test(file) || /\.messages\.ts$/.test(file)) return 1;
  if (/\.constants\.ts$|\/constants\/|\.schema\.ts$|\/schemas\//.test(file)) return 2;
  if (/\.data\.ts$|\/data\/|\/utils\/|\/normalise\/|\/detectors\//.test(file)) return 3;
  if (/\.service\.ts$|\/services\/|\/audio\/|\/asr\/|\/suggestions\/|\/workers\//.test(file)) return 4;
  if (/\/hooks\//.test(file)) return 5;
  if (/\/components\/|\/ui\//.test(file)) return 6;
  if (/^(?:src\/)?app\//.test(file)) return 7;
  return 0;
}

const graph = new Map();
const errors = [];

for (const file of allFiles) {
  const raw = fs.readFileSync(file, "utf8");
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const isTestOrFixture =
    /(?:^|\/)(?:tests|__fixtures__)(?:\/|$)|\.(?:test|spec|fixture|mock)\.[jt]sx?$/.test(file);
  const isServerFile =
    file.startsWith("src/server/") ||
    file.startsWith("lib/server/") ||
    /^(?:src\/)?app\/api\//.test(file);

  const imports = [];
  for (const m of stripped.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)) {
    const spec = m[1];
    const target = resolveImport(spec, file);
    if (!target) continue;
    imports.push({ spec, target, typeOnly: /\bimport\s+type\b/.test(m[0]) });

    // Rule 2: No fixtures in production
    if (
      !isTestOrFixture &&
      /(?:^|\/)(?:tests\/fixtures|__fixtures__)(?:\/|$)|\.(?:fixture|mock)\.[jt]sx?$/.test(target)
    ) {
      errors.push(`${file} -> ${target}: Production code must never import from test fixtures.`);
    }

    // Rule 3: Client code never imports from server
    if (!isServerFile && !isTestOrFixture && (target.startsWith("src/server/") || target.startsWith("lib/server/"))) {
      errors.push(`${file} -> ${target}: Client code must never import from server/.`);
    }

    // Rule 4: shared/ never imports from modules/, server/, or app/
    if (
      file.startsWith("src/shared/") &&
      (target.startsWith("src/modules/") || target.startsWith("src/server/") || target.startsWith("src/app/") || target.startsWith("app/"))
    ) {
      errors.push(`${file} -> ${target}: shared/ must never import from modules/, server/, or app/.`);
    }

    // Rule 5: Cross-module imports must go through module's index.ts
    const fromMod = file.match(/^src\/modules\/([^/]+)\//);
    const toMod = target.match(/^src\/modules\/([^/]+)\/(.+)$/);
    if (fromMod && toMod && fromMod[1] !== toMod[1] && toMod[2] !== "index.ts") {
      errors.push(
        `${file} -> ${target}: Cross-module import from "${fromMod[1]}" into "${toMod[1]}" must use "@/modules/${toMod[1]}" (index.ts) only.`
      );
    }

    // Rule 6: Downward layer direction inside migrated src/shared & src/modules
    if (
      (file.startsWith("src/shared/") || file.startsWith("src/modules/")) &&
      (target.startsWith("src/shared/") || target.startsWith("src/modules/")) &&
      !file.endsWith("/index.ts") &&
      !target.endsWith("/index.ts") &&
      !isTestOrFixture
    ) {
      const fromRank = getLayerRank(file);
      const toRank = getLayerRank(target);
      if (fromRank > 0 && toRank > 0 && toRank > fromRank) {
        errors.push(
          `${file} (layer ${fromRank}) -> ${target} (layer ${toRank}): Upward dependency violates layer order.`
        );
      }
    }
  }
  graph.set(file, imports.map((i) => i.target));
}

// Rule 1: Cycle detection across ALL files
const visited = new Set();
const activeStack = [];
for (const start of allFiles) {
  if (visited.has(start)) continue;
  const dfs = (u) => {
    visited.add(u);
    activeStack.push(u);
    for (const v of graph.get(u) || []) {
      const idx = activeStack.indexOf(v);
      if (idx >= 0) {
        errors.push(`Circular dependency: ${[...activeStack.slice(idx), v].join(" -> ")}`);
      } else if (!visited.has(v)) {
        dfs(v);
      }
    }
    activeStack.pop();
  };
  dfs(start);
}

if (errors.length > 0) {
  console.error("❌ check:boundaries failed:");
  for (const e of errors) console.error(`   • ${e}`);
  process.exit(1);
}

console.log(`✅ check:boundaries passed across ${allFiles.length} files (0 cycles, 0 boundary violations).`);
