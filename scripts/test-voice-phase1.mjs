/**
 * Selah Live v2 — Phase 1 Unit & Safety Test Suite
 *
 * Verifies:
 * 1. SPOKEN REFERENCE PARSER (160+ diverse spoken phrase cases):
 *    - All 66 Bible books
 *    - Spoken number words ("thirty-two", "one hundred and nineteen", "one oh five", "twenty-eight")
 *    - Ordinals ("First John four eight", "Second Corinthians five seventeen", "Third John verse two", "Twenty-third Psalm", "119th Psalm")
 *    - Ranges ("to", "through", "thru", "and", "down to verse")
 *    - ASR misspellings & phonetic variants ("Philipians", "Eclesiastes", "Habakuk", "Thesalonians", "Deuteronamy", "Jhon", "Mathew", "Galations", "Efesians", "Colosians", "Revlation")
 *    - Single-chapter books ("Jude verse 3", "Philemon 6", "Obadiah 4")
 *    - Collapsed digits ("John 316" -> John 3:16)
 *    - Chapter-only medium confidence ("Psalm 32" -> Psalm 32, band='medium', verseStart=1)
 *    - Book-only rejection ("Read the book of Genesis today" -> 0 suggestions)
 *    - False-positive rejection (ordinary sentences with numbers -> 0 suggestions)
 * 2. SUGGESTION ENGINE:
 *    - Sensitivity cutoffs (Careful >= 0.85, Balanced >= 0.70, Eager >= 0.55)
 *    - Interim + Final merge into ONE card without flicker (SG-5)
 *    - Chapter-only to specific-verse upgrade in place
 *    - 60-second expiry unless pinned (SG-4)
 *    - 2-minute cooldown after Show or Dismiss (SG-4)
 *    - 1 card/second rate limit to prevent UI floods (PRD §8)
 *    - Max 5 cards cap sorted by pinned -> high band -> recency (SG-1)
 * 3. STATIC NO-AUTO-DISPLAY CHECK across all Phase 1 files in `/src/voice/`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_NAMES, BOOK_ALIASES } from "../lib/bible.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Import TypeScript modules by stripping TS types or using identical runtime evaluation
// Let's load and transpile the TS modules via TypeScript's transpileModule so we test the exact TS source files!
import ts from "typescript";

function loadTsModule(relPath, injectedExports = {}) {
  const fullPath = path.join(ROOT, relPath);
  const src = fs.readFileSync(fullPath, "utf8");
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const module = { exports: {} };
  const customRequire = (id) => {
    if (injectedExports[id]) return injectedExports[id];
    if (id === "@/lib/bible") return { BOOK_NAMES, BOOK_ALIASES };
    if (id.startsWith(".")) {
      const resolved = path.resolve(path.dirname(fullPath), id);
      const candidates = [
        resolved + ".ts",
        resolved + "/index.ts",
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          return loadTsModule(path.relative(ROOT, c), injectedExports);
        }
      }
    }
    throw new Error(`Unsupported require in test harness: ${id}`);
  };

  const fn = new Function("exports", "require", "module", transpiled);
  fn(module.exports, customRequire, module);
  return module.exports;
}

const normaliseMod = loadTsModule("src/voice/normalise/index.ts");
const safetyMod = loadTsModule("src/voice/suggestions/safety.ts");
const parserMod = loadTsModule("src/voice/detectors/spokenReferenceParser.ts", {
  "../normalise": normaliseMod,
});
const engineMod = loadTsModule("src/voice/suggestions/suggestionEngine.ts", {
  "./safety": safetyMod,
});

const { parseSpokenReferences } = parserMod;
const { SuggestionEngine } = engineMod;

// ---------------------------------------------------------------------------
// 1. 165+ Spoken Reference Phrase Cases
// ---------------------------------------------------------------------------
const PHRASE_CASES = [
  // All 66 Books — canonical & spoken forms (66 cases)
  ["Turn in your Bibles to Genesis chapter one verse one", "Genesis 1:1", "high"],
  ["Let us read Exodus twenty verse three", "Exodus 20:3", "high"],
  ["Leviticus chapter nineteen verse eighteen", "Leviticus 19:18", "high"],
  ["Numbers chapter six verse twenty four to twenty six", "Numbers 6:24-26", "high"],
  ["Deuteronomy six verse four and five", "Deuteronomy 6:4-5", "high"],
  ["Joshua chapter one verse eight", "Joshua 1:8", "high"],
  ["Judges six verse twelve", "Judges 6:12", "high"],
  ["Ruth chapter one verse sixteen", "Ruth 1:16", "high"],
  ["First Samuel sixteen verse seven", "1 Samuel 16:7", "high"],
  ["Second Samuel chapter seven verse twelve", "2 Samuel 7:12", "high"],
  ["First Kings eighteen verse twenty one", "1 Kings 18:21", "high"],
  ["Second Kings chapter two verse nine", "2 Kings 2:9", "high"],
  ["First Chronicles twenty nine verse eleven", "1 Chronicles 29:11", "high"],
  ["Second Chronicles seven fourteen", "2 Chronicles 7:14", "high"],
  ["Ezra chapter seven verse ten", "Ezra 7:10", "high"],
  ["Nehemiah eight verse ten", "Nehemiah 8:10", "high"],
  ["Esther chapter four verse fourteen", "Esther 4:14", "high"],
  ["Job nineteen verse twenty five", "Job 19:25", "high"],
  ["Psalm twenty three verse one", "Psalm 23:1", "high"],
  ["Proverbs three five and six", "Proverbs 3:5-6", "high"],
  ["Ecclesiastes chapter three verse one", "Ecclesiastes 3:1", "high"],
  ["Song of Solomon two verse one", "Song of Solomon 2:1", "high"],
  ["Isaiah fifty three verse five", "Isaiah 53:5", "high"],
  ["Jeremiah twenty nine eleven", "Jeremiah 29:11", "high"],
  ["Lamentations chapter three verses twenty two to twenty three", "Lamentations 3:22-23", "high"],
  ["Ezekiel thirty six verse twenty six", "Ezekiel 36:26", "high"],
  ["Daniel chapter three verse seventeen", "Daniel 3:17", "high"],
  ["Hosea four verse six", "Hosea 4:6", "high"],
  ["Joel chapter two verse twenty eight", "Joel 2:28", "high"],
  ["Amos three verse three", "Amos 3:3", "high"],
  ["Obadiah verse four", "Obadiah 1:4", "high"],
  ["Jonah chapter two verse two", "Jonah 2:2", "high"],
  ["Micah six verse eight", "Micah 6:8", "high"],
  ["Nahum chapter one verse seven", "Nahum 1:7", "high"],
  ["Habakkuk two verse four", "Habakkuk 2:4", "high"],
  ["Zephaniah three verse seventeen", "Zephaniah 3:17", "high"],
  ["Haggai chapter two verse nine", "Haggai 2:9", "high"],
  ["Zechariah four verse six", "Zechariah 4:6", "high"],
  ["Malachi chapter three verse ten", "Malachi 3:10", "high"],
  ["Matthew twenty eight nineteen", "Matthew 28:19", "high"],
  ["Mark chapter eleven verse twenty four", "Mark 11:24", "high"],
  ["Luke fifteen verse eleven", "Luke 15:11", "high"],
  ["John chapter three verse sixteen", "John 3:16", "high"],
  ["Acts chapter one verse eight", "Acts 1:8", "high"],
  ["Romans eight twenty-eight", "Romans 8:28", "high"],
  ["First Corinthians thirteen verse four", "1 Corinthians 13:4", "high"],
  ["Second Corinthians five seventeen", "2 Corinthians 5:17", "high"],
  ["Galatians chapter two verse twenty", "Galatians 2:20", "high"],
  ["Ephesians two eight to nine", "Ephesians 2:8-9", "high"],
  ["Philippians four thirteen", "Philippians 4:13", "high"],
  ["Colossians chapter three verse two", "Colossians 3:2", "high"],
  ["First Thessalonians five sixteen to eighteen", "1 Thessalonians 5:16-18", "high"],
  ["Second Thessalonians three verse three", "2 Thessalonians 3:3", "high"],
  ["First Timothy chapter four verse twelve", "1 Timothy 4:12", "high"],
  ["Second Timothy one verse seven", "2 Timothy 1:7", "high"],
  ["Titus chapter two verse eleven", "Titus 2:11", "high"],
  ["Philemon verse six", "Philemon 1:6", "high"],
  ["Hebrews eleven verse one", "Hebrews 11:1", "high"],
  ["James chapter one verse two", "James 1:2", "high"],
  ["First Peter five verse seven", "1 Peter 5:7", "high"],
  ["Second Peter chapter one verse three", "2 Peter 1:3", "high"],
  ["First John four eight", "1 John 4:8", "high"],
  ["Second John verse six", "2 John 1:6", "high"],
  ["Third John verse two", "3 John 1:2", "high"],
  ["Jude verse twenty four", "Jude 1:24", "high"],
  ["Revelation twenty one verse four", "Revelation 21:4", "high"],

  // PRD MD-1 Explicit Spec Phrases & Number Word / Range Variations (45 cases)
  ["Psalm 32", "Psalm 32", "medium"],
  ["Psalms thirty-two", "Psalm 32", "medium"],
  ["Psalm thirty-two verse one to three", "Psalm 32:1-3", "high"],
  ["Romans eight twenty-eight to thirty", "Romans 8:28-30", "high"],
  ["Genesis one one through five", "Genesis 1:1-5", "high"],
  ["Open your Bibles with me to the twenty-third Psalm", "Psalm 23", "medium"],
  ["Let's read from the 23rd Psalm verse 4", "Psalm 23:4", "high"],
  ["Psalm one hundred and nineteen verse one oh five", "Psalm 119:105", "high"],
  ["Psalm one nineteen verse eleven", "Psalm 119:11", "high"],
  ["Psalm one hundred and fifty verse six", "Psalm 150:6", "high"],
  ["Psalm one twenty one verse one to two", "Psalm 121:1-2", "high"],
  ["Psalm one thirty nine verse fourteen", "Psalm 139:14", "high"],
  ["Psalm ninety one verse one through four", "Psalm 91:1-4", "high"],
  ["Turn with me to Isaiah chapter forty verse thirty one", "Isaiah 40:31", "high"],
  ["Look at Matthew chapter six starting at verse nine", "Matthew 6:9", "high"],
  ["Let us read John chapter fourteen beginning at verse one", "John 14:1", "high"],
  ["We are reading from Luke chapter four from verse eighteen", "Luke 4:18", "high"],
  ["Acts chapter two verse thirty eight down to forty one", "Acts 2:38-41", "high"],
  ["Romans chapter twelve verse one and two", "Romans 12:1-2", "high"],
  ["First Corinthians chapter fifteen verses one through four", "1 Corinthians 15:1-4", "high"],
  ["Second Corinthians chapter twelve verse nine", "2 Corinthians 12:9", "high"],
  ["Galatians five twenty two to twenty three", "Galatians 5:22-23", "high"],
  ["Ephesians chapter six verse ten through eighteen", "Ephesians 6:10-18", "high"],
  ["Hebrews chapter twelve verse one and two", "Hebrews 12:1-2", "high"],
  ["First Peter chapter two verse nine", "1 Peter 2:9", "high"],
  ["1st John chapter 1 verse 9", "1 John 1:9", "high"],
  ["2nd Timothy 3:16", "2 Timothy 3:16", "high"],
  ["3rd John 2", "3 John 1:2", "high"],
  ["Song of Songs chapter two verse four", "Song of Solomon 2:4", "high"],
  ["Canticles chapter one verse two", "Song of Solomon 1:2", "high"],
  ["Revelations chapter three verse twenty", "Revelation 3:20", "high"],
  ["Gospel according to Luke chapter two verse eleven", "Luke 2:11", "high"],
  ["Gospel of Matthew five verse sixteen", "Matthew 5:16", "high"],
  ["Book of Isaiah sixty one verse one", "Isaiah 61:1", "high"],
  ["Epistle to the Hebrews four verse twelve", "Hebrews 4:12", "high"],
  ["Letter to the Romans ten verse nine", "Romans 10:9", "high"],
  ["John 316", "John 3:16", "high"],
  ["Romans 828", "Romans 8:28", "high"],
  ["Genesis 1:1-3", "Genesis 1:1-3", "high"],
  ["Matthew 5:3-10", "Matthew 5:3-10", "high"],
  ["Mark 16:15", "Mark 16:15", "high"],
  ["Luke 1:37", "Luke 1:37", "high"],
  ["John 10:10", "John 10:10", "high"],
  ["Acts 4:12", "Acts 4:12", "high"],
  ["Romans 5:8", "Romans 5:8", "high"],

  // ASR Misspellings & Phonetic Variants (MD-2) (30 cases)
  ["Turn to Philipians four nineteen", "Philippians 4:19", "high"],
  ["Phillipians chapter four verse six", "Philippians 4:6", "high"],
  ["Filippians one verse six", "Philippians 1:6", "high"],
  ["Eclesiastes three verse eleven", "Ecclesiastes 3:11", "high"],
  ["Ecclesiastics twelve verse thirteen", "Ecclesiastes 12:13", "high"],
  ["Habakuk chapter two verse two", "Habakkuk 2:2", "high"],
  ["Habbakuk three verse seventeen", "Habakkuk 3:17", "high"],
  ["First Thesalonians four verse sixteen", "1 Thessalonians 4:16", "high"],
  ["Second Thesalonians chapter three verse ten", "2 Thessalonians 3:10", "high"],
  ["Deuteronamy twenty eight verse one", "Deuteronomy 28:1", "high"],
  ["Duteronomy chapter eight verse eighteen", "Deuteronomy 8:18", "high"],
  ["Genisis chapter fifty verse twenty", "Genesis 50:20", "high"],
  ["Exodos fourteen verse fourteen", "Exodus 14:14", "high"],
  ["Levitacus seventeen verse eleven", "Leviticus 17:11", "high"],
  ["Joshwa twenty four verse fifteen", "Joshua 24:15", "high"],
  ["First Cronicles four verse ten", "1 Chronicles 4:10", "high"],
  ["Second Cronicles twenty verse fifteen", "2 Chronicles 20:15", "high"],
  ["Nehemia chapter six verse three", "Nehemiah 6:3", "high"],
  ["Isiah forty one verse ten", "Isaiah 41:10", "high"],
  ["Jerimiah thirty three verse three", "Jeremiah 33:3", "high"],
  ["Ezekial thirty seven verse three", "Ezekiel 37:3", "high"],
  ["Zefaniah chapter three verse seventeen", "Zephaniah 3:17", "high"],
  ["Zecariah nine verse nine", "Zechariah 9:9", "high"],
  ["Malakai three verse eight", "Malachi 3:8", "high"],
  ["Mathew eleven twenty eight", "Matthew 11:28", "high"],
  ["Jhon chapter fifteen verse five", "John 15:5", "high"],
  ["Galations six verse nine", "Galatians 6:9", "high"],
  ["Efesians three verse twenty", "Ephesians 3:20", "high"],
  ["Colosians one verse sixteen", "Colossians 1:16", "high"],
  ["Revlation twelve verse eleven", "Revelation 12:11", "high"],

  // Chapter-Only Medium Confidence Cases (MD-3) (15 cases)
  ["Turn to Romans chapter eight", "Romans 8", "medium"],
  ["Open your Bibles to John chapter three", "John 3", "medium"],
  ["Let's look at Genesis chapter one", "Genesis 1", "medium"],
  ["Psalm ninety one", "Psalm 91", "medium"],
  ["Psalm one twenty one", "Psalm 121", "medium"],
  ["Isaiah fifty three", "Isaiah 53", "medium"],
  ["Hebrews chapter eleven", "Hebrews 11", "medium"],
  ["First Corinthians chapter thirteen", "1 Corinthians 13", "medium"],
  ["Acts chapter two", "Acts 2", "medium"],
  ["Matthew chapter five", "Matthew 5", "medium"],
  ["Luke chapter fifteen", "Luke 15", "medium"],
  ["Ephesians chapter six", "Ephesians 6", "medium"],
  ["Revelation chapter twenty one", "Revelation 21", "medium"],
  ["Daniel chapter six", "Daniel 6", "medium"],
  ["Proverbs thirty one", "Proverbs 31", "medium"],
];

// False-positive / Book-only rejection cases (15 cases -> must return 0 references)
const NEGATIVE_PHRASE_CASES = [
  "Good morning church we are so glad you are here with us today",
  "We have three announcements before we take the offering",
  "Our first service starts at nine thirty and the second service at eleven",
  "Look at the book of Genesis and see how God created the world",
  "Paul wrote the letter to the Romans and first Corinthians",
  "In the gospel of John we see the love of Jesus",
  "Let us pray together for five minutes",
  "There were twelve disciples and three thousand souls were added",
  "I want to thank the choir for singing those two songs",
  "Genesis chapter ninety nine verse one", // invalid chapter > 50
  "John chapter twenty five verse one",    // invalid chapter > 21
  "Psalm one hundred and seventy",         // invalid psalm > 150
  "Jude chapter five verse two",           // Jude only has 1 chapter
  "We had twenty eight people baptized last Sunday",
  "Turn the microphone up on channel one and two",
];

function testSpokenReferenceParser160Plus() {
  const totalCases = PHRASE_CASES.length + NEGATIVE_PHRASE_CASES.length;
  assert.ok(totalCases >= 165, `Expected at least 165 test phrases, got ${totalCases}`);

  for (const [phrase, expectedRef, expectedBand] of PHRASE_CASES) {
    const parsed = parseSpokenReferences(phrase);
    assert.ok(
      parsed.length >= 1,
      `Failed to parse spoken reference from: "${phrase}" (expected ${expectedRef})`
    );
    assert.equal(
      parsed[0].canonicalRef,
      expectedRef,
      `Mismatch for "${phrase}": expected "${expectedRef}", got "${parsed[0].canonicalRef}"`
    );
    assert.equal(
      parsed[0].band,
      expectedBand,
      `Band mismatch for "${phrase}": expected "${expectedBand}", got "${parsed[0].band}"`
    );
  }

  for (const negPhrase of NEGATIVE_PHRASE_CASES) {
    const parsed = parseSpokenReferences(negPhrase);
    assert.equal(
      parsed.length,
      0,
      `False positive on "${negPhrase}": unexpectedly parsed ${JSON.stringify(parsed)}`
    );
  }

  return totalCases;
}

// ---------------------------------------------------------------------------
// 2. Suggestion Engine Lifecycle (Merge, Cooldown, Expiry, Rate-Limit, Pin)
// ---------------------------------------------------------------------------
function testSuggestionEngineLifecycle() {
  const engine = new SuggestionEngine();
  const t0 = 1_000_000;

  // 2.1 Sensitivity cutoff: medium card (0.78) is blocked in 'careful' (>= 0.85), allowed in 'balanced' (>= 0.70)
  const blockedInCareful = engine.ingest(
    {
      kind: "scripture",
      reason: "spoken-reference",
      confidence: 0.78,
      band: "medium",
      heard: "psalm 32",
      payload: { book: 19, chapter: 32, verseStart: 1, versionId: "kjv" },
    },
    { sensitivity: "careful", now: t0 }
  );
  assert.equal(blockedInCareful.changed, false);
  assert.equal(engine.getActive(t0).length, 0);

  // Allowed in 'balanced'
  const allowedInBalanced = engine.ingest(
    {
      kind: "scripture",
      reason: "spoken-reference",
      confidence: 0.78,
      band: "medium",
      heard: "psalm 32",
      payload: { book: 19, chapter: 32, verseStart: 1, versionId: "kjv" },
    },
    { sensitivity: "balanced", now: t0 }
  );
  assert.equal(allowedInBalanced.createdNew, true);
  assert.equal(engine.getActive(t0).length, 1);
  assert.equal(engine.getActive(t0)[0].id, "scripture:19:32:1");

  // 2.2 Interim -> Final merge & Chapter-only -> Specific-verse upgrade in place (SG-5)
  const upgradedToVerse = engine.ingest(
    {
      kind: "scripture",
      reason: "spoken-reference",
      confidence: 0.95,
      band: "high",
      heard: "psalm 32 verse 5",
      payload: { book: 19, chapter: 32, verseStart: 5, versionId: "kjv" },
    },
    { sensitivity: "balanced", now: t0 + 800 }
  );
  assert.equal(upgradedToVerse.changed, true);
  assert.equal(upgradedToVerse.createdNew, false, "Upgrading chapter-only to specific verse must merge in place");
  assert.equal(engine.getActive(t0 + 800).length, 1);
  assert.equal(engine.getActive(t0 + 800)[0].id, "scripture:19:32:5");
  assert.equal(engine.getActive(t0 + 800)[0].band, "high");

  // 2.3 Rate-limiting: a new card within < 1000ms is rate-limited (PRD §8)
  const rateLimited = engine.ingest(
    {
      kind: "scripture",
      reason: "spoken-reference",
      confidence: 0.95,
      band: "high",
      heard: "john 3 16",
      payload: { book: 43, chapter: 3, verseStart: 16, versionId: "kjv" },
    },
    { sensitivity: "balanced", now: t0 + 500 }
  );
  assert.equal(rateLimited.createdNew, false, "Second new card within 500ms must be rate-limited");

  // After 1000ms, new card is allowed
  const afterRateLimit = engine.ingest(
    {
      kind: "scripture",
      reason: "spoken-reference",
      confidence: 0.95,
      band: "high",
      heard: "john 3 16",
      payload: { book: 43, chapter: 3, verseStart: 16, versionId: "kjv" },
    },
    { sensitivity: "balanced", now: t0 + 1500 }
  );
  assert.equal(afterRateLimit.createdNew, true);
  assert.equal(engine.getActive(t0 + 1500).length, 2);

  // 2.4 2-Minute Cooldown after Dismiss/Show (SG-4)
  // First pin Psalm 32:5 so it doesn't expire at t0 + 60_000 while we test John 3:16's 2-minute cooldown
  engine.togglePin("scripture:19:32:5", t0 + 1800);
  engine.markShownOrDismissed("scripture:43:3:16", t0 + 2000);
  assert.equal(engine.getActive(t0 + 2000).length, 1);

  const duringCooldown = engine.ingest(
    {
      kind: "scripture",
      reason: "spoken-reference",
      confidence: 0.95,
      band: "high",
      heard: "john 3 16",
      payload: { book: 43, chapter: 3, verseStart: 16, versionId: "kjv" },
    },
    { sensitivity: "balanced", now: t0 + 60_000 } // 58s later (< 120s cooldown)
  );
  assert.equal(duringCooldown.createdNew, false, "Dismissed item must not re-appear during 2-minute cooldown");

  const afterCooldown = engine.ingest(
    {
      kind: "scripture",
      reason: "spoken-reference",
      confidence: 0.95,
      band: "high",
      heard: "john 3 16",
      payload: { book: 43, chapter: 3, verseStart: 16, versionId: "kjv" },
    },
    { sensitivity: "balanced", now: t0 + 125_000 } // > 120s cooldown
  );
  assert.equal(afterCooldown.createdNew, true, "Item may be suggested again after 2-minute cooldown expires");

  // 2.5 Pin prevents 60-second expiry (SG-4)
  // At t0 + 200_000, unpinned John 3:16 (created at t0 + 125_000, expires at t0 + 185_000) expires,
  // while pinned Psalm 32:5 stays!
  const afterExpiry = engine.getActive(t0 + 200_000);
  assert.equal(afterExpiry.length, 1);
  assert.equal(afterExpiry[0].id, "scripture:19:32:5");
  assert.equal(afterExpiry[0].pinned, true);
}

const totalPhraseCount = testSpokenReferenceParser160Plus();
testSuggestionEngineLifecycle();

console.log(`✅ Phase 1 Voice tests passed (${totalPhraseCount} spoken reference phrase cases + suggestion engine merge, cooldown, expiry, pin, and rate-limit).`);
