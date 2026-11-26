/**
 * `scripts/check-standards.mjs` (`CODE_STANDARDS.md §1, §3, §7, §9`)
 *
 * AST-based enforcement using the TypeScript compiler API:
 * 1. Types/interfaces ONLY in `*.types.ts`, `types/**`, `*.messages.ts`, `*.test.*`, `*.fixture.*`.
 * 2. No `any` (`TSAnyKeyword`) or `as any`.
 * 3. No `@ts-ignore`.
 * 4. No `console.log` in production code.
 * 5. No `export default` except Next.js route conventions (`page`, `layout`, `loading`, `error`, `not-found`, `route`).
 * 6. File size limits (`<= 200` lines for components, `<= 300` lines for non-components).
 * 7. No `.js` / `.jsx` files inside migrated directories (`src/shared`, `src/modules`, `src/server`, `src/app`).
 *
 * Enforcement mode (CODE_STANDARDS.md §12 Step 1 & Step 4):
 * - Migrated directories (`src/shared/`, `src/modules/`, `src/server/`, `src/app/`) are enforced as ERRORS.
 * - Legacy pre-migration paths (`app/`, `components/`, `lib/`, `src/voice/`) report measured WARNING counts
 *   until each module is migrated, unless `--strict` is passed.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const strictAll = process.argv.includes("--strict");
const ROOTS = ["src", "app", "components", "lib"];
const MIGRATED_PREFIXES = ["src/shared/", "src/modules/", "src/server/", "src/app/"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.[jt]sx?$/.test(ent.name)) out.push(full.split(path.sep).join("/"));
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));
const errors = [];
const warnings = [];

function record(isStrict, msg) {
  if (isStrict) errors.push(msg);
  else warnings.push(msg);
}

for (const file of files) {
  const isStrict = strictAll || MIGRATED_PREFIXES.some((p) => file.startsWith(p));
  const isTestOrFixture =
    /(?:^|\/)(?:tests|__fixtures__)(?:\/|$)|\.(?:test|spec|fixture|mock)\.[jt]sx?$/.test(file);
  const isTypeAllowedFile =
    isTestOrFixture ||
    /\.types\.ts$/.test(file) ||
    /\/types\//.test(file) ||
    file.endsWith("/types.ts") ||
    /\.messages\.ts$/.test(file);
  const isNextRouteConvention =
    /^(?:src\/)?app\/.*(?:page|layout|loading|error|not-found|template|default)\.[jt]sx?$/.test(file);
  const isComponent =
    /\/components\//.test(`/${file}`) || /\/ui\//.test(file);

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  // 7. No .js / .jsx in strict/migrated paths
  if (/\.[cm]?jsx?$/.test(file)) {
    record(isStrict, `${file}:1 JavaScript file must be migrated to TypeScript (.ts/.tsx).`);
  }

  // 3. No @ts-ignore
  lines.forEach((ln, idx) => {
    if (/@ts-ignore\b/.test(ln)) {
      errors.push(`${file}:${idx + 1} Forbidden @ts-ignore.`);
    }
  });

  // 6. File size limit
  const maxLines = isComponent ? 200 : 300;
  if (!isTestOrFixture && !/\.data\.ts$/.test(file) && lines.length > maxLines) {
    record(isStrict, `${file}:1 File has ${lines.length} lines (limit ${maxLines}).`);
  }

  // Parse AST for TS/JS syntax checks
  const sf = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const visit = (node) => {
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const lineNo = pos.line + 1;

    // 1. Types only in *.types.ts / types/ / *.messages.ts
    if (
      !isTypeAllowedFile &&
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node))
    ) {
      record(
        isStrict,
        `${file}:${lineNo} Declare type/interface "${node.name.text}" in a *.types.ts file.`
      );
    }

    // 2. No `any`
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      record(isStrict, `${file}:${lineNo} Forbidden "any" type.`);
    }

    // 4. No console.log in production
    if (
      !isTestOrFixture &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "console" &&
      node.expression.name.text === "log"
    ) {
      record(isStrict, `${file}:${lineNo} Forbidden console.log in production code.`);
    }

    // 5. No default export outside Next.js route files
    if (!isNextRouteConvention) {
      if (ts.isExportAssignment(node)) {
        record(isStrict, `${file}:${lineNo} Avoid default export; use named exports.`);
      } else if (
        ts.canHaveModifiers(node) &&
        ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        record(isStrict, `${file}:${lineNo} Avoid default export; use named exports.`);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
}

if (warnings.length > 0) {
  console.log(
    `⚠️  lint (code-standards): ${warnings.length} legacy item(s) tracked for Step 3 module refactor.`
  );
}

if (errors.length > 0) {
  console.error(`❌ lint (code-standards) failed with ${errors.length} error(s) in migrated/strict files:`);
  for (const e of errors.slice(0, 50)) console.error(`   • ${e}`);
  if (errors.length > 50) console.error(`   … and ${errors.length - 50} more.`);
  process.exit(1);
}

console.log("✅ lint (code-standards) passed (0 errors in migrated/strict modules).");
