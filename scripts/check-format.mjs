/**
 * `scripts/check-format.mjs` (`CODE_STANDARDS.md §1.5 & §1.6`)
 *
 * Delegates to Prettier when installed in node_modules, and otherwise performs
 * baseline formatting hygiene checks (UTF-8, no tab indentation in TS/TSX, trailing newline)
 * on migrated modules until Prettier is approved and installed.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const prettierBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prettier.cmd" : "prettier"
);

if (fs.existsSync(prettierBin)) {
  const res = spawnSync(prettierBin, ["--check", "src/**/*.{ts,tsx}"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(res.status ?? 0);
}

const MIGRATED_DIRS = ["src/shared", "src/modules", "src/server", "src/app", "src/tests"];
const issues = [];

function checkDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) checkDir(full);
    else if (/\.[jt]sx?$/.test(ent.name)) {
      const text = fs.readFileSync(full, "utf8");
      if (!text.endsWith("\n")) {
        issues.push(`${full}: Missing trailing newline.`);
      }
      const lines = text.split(/\r?\n/);
      lines.forEach((ln, i) => {
        if (/^\t+/.test(ln)) {
          issues.push(`${full}:${i + 1} Tab indentation found (expected 2 spaces).`);
        }
      });
    }
  }
}

MIGRATED_DIRS.forEach(checkDir);

if (issues.length > 0) {
  console.error("❌ format:check failed:");
  for (const msg of issues) console.error(`   • ${msg}`);
  process.exit(1);
}

console.log("✅ format:check passed.");
