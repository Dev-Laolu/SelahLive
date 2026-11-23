/**
 * Selah Live v2 — Phase 3 Unit Test Suite (Quotes, Songs, Intent Cues, Service Context, Protocol Validation)
 *
 * Verifies:
 * 1. VERSE QUOTE MATCHER (MD-4):
 *    - Matches a spoken Bible verse read aloud without naming the reference (e.g. John 3:16, Psalm 23:1, Romans 8:28)
 *    - Requires >= 6 matching content words; rejects short or unrelated conversational sentences
 *    - Searches across installed versions and ranks the default version first
 * 2. SONG TITLE & LYRIC MATCHER (MD-5):
 *    - Detects song title mentions ("let's stand and sing Amazing Grace")
 *    - Detects two consecutive lyric line matches ("Amazing grace how sweet the sound / That saved a wretch like me")
 *      and returns the exact `slideIndex`
 *    - Rejects unrelated speech
 * 3. INTENT TRIGGER MATCHER (MD-6):
 *    - Matches built-in cues ("receive the offering", "welcome to church", "let us bow our heads and pray")
 *      to the user's Saved Texts by title/tag
 *    - Matches custom user-defined `TriggerRule` phrases
 * 4. SERVICE CONTEXT BOOST (MD-7):
 *    - Applies +0.12 confidence boost to items preloaded in today's Service Context list
 * 5. OBS PROTOCOL VALIDATION (`selah:suggest` & `selah:suggest-action` in `lib/obs.js`):
 *    - Accepts valid `selah:suggest` and `selah:suggest-action` messages with matching `pairId`
 *    - Rejects forged `pairId`, invalid actions, or oversized suggestion arrays (> 5)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isSelah } from "../lib/obs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadTsModule(relPath) {
  const fullPath = path.join(ROOT, relPath);
  const src = fs.readFileSync(fullPath, "utf8");
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const module = { exports: {} };
  const fn = new Function("exports", "require", "module", transpiled);
  fn(module.exports, () => ({}), module);
  return module.exports;
}

const quoteMod = loadTsModule("src/voice/detectors/verseQuoteMatcher.ts");
const songMod = loadTsModule("src/voice/detectors/songMatcher.ts");
const intentMod = loadTsModule("src/voice/detectors/intentTriggerMatcher.ts");

const { matchSpokenVerseQuotes } = quoteMod;
const { matchSpokenSongs } = songMod;
const { matchIntentTriggers, applyServiceContextBoost } = intentMod;

// Sample Bible packs for quote matching test
const SAMPLE_KJV_PACK = {
  id: "kjv",
  code: "KJV",
  version: "1.0",
  books: [
    {
      n: 19,
      name: "Psalm",
      chapters: [
        Array.from({ length: 22 }, () => ""),
      ].flat(),
    },
    {
      n: 43,
      name: "John",
      chapters: [
        [],
        [],
        [
          "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
          "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
        ],
      ],
    },
    {
      n: 45,
      name: "Romans",
      chapters: [
        [], [], [], [], [], [], [],
        [
          "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
          "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.",
        ],
      ],
    },
  ],
};
SAMPLE_KJV_PACK.books[0].chapters[22] = [
  "The LORD is my shepherd; I shall not want.",
  "He maketh me to lie down in green pastures: he leadeth me beside the still waters.",
];

const SAMPLE_WEB_PACK = {
  ...SAMPLE_KJV_PACK,
  id: "web",
  code: "WEB",
};

function testVerseQuoteMatcher() {
  // 1. Pastor reads John 3:16 without naming the reference
  const hitsJohn = matchSpokenVerseQuotes(
    "Remember church that God so loved the world that he gave his only begotten Son that whosoever believeth in him should not perish but have everlasting life",
    [SAMPLE_WEB_PACK, SAMPLE_KJV_PACK],
    "kjv" // kjv is default version and should rank first
  );
  assert.ok(hitsJohn.length >= 1, "Must detect John 3:16 when read aloud");
  assert.equal(hitsJohn[0].canonicalRef, "John 3:16");
  assert.equal(hitsJohn[0].versionId, "kjv", "Default Bible version must be ranked first");
  assert.ok(hitsJohn[0].matchedContentWords >= 6);

  // 2. Pastor reads Romans 8:28 aloud
  const hitsRom = matchSpokenVerseQuotes(
    "We know that all things work together for good to them that love God to them who are the called according to his purpose",
    [SAMPLE_KJV_PACK],
    "kjv"
  );
  assert.ok(hitsRom.length >= 1, "Must detect Romans 8:28 when read aloud");
  assert.equal(hitsRom[0].canonicalRef, "Romans 8:28");

  // 3. Less than 6 matching content words -> must NOT suggest
  const tooShort = matchSpokenVerseQuotes(
    "For God so loved the world today",
    [SAMPLE_KJV_PACK],
    "kjv"
  );
  assert.equal(tooShort.length, 0, "Fewer than 6 content words must not trigger a quote suggestion");
}

function testSongMatcher() {
  const songs = [
    {
      id: "song-amazing-grace",
      title: "Amazing Grace",
      author: "John Newton",
      sections: [
        {
          label: "Verse 1",
          text: "Amazing grace how sweet the sound\nThat saved a wretch like me",
        },
        {
          label: "Verse 2",
          text: "I once was lost but now am found\nWas blind but now I see",
        },
      ],
    },
    {
      id: "song-how-great",
      title: "How Great Thou Art",
      author: "Carl Boberg",
      sections: [
        {
          label: "Chorus",
          text: "Then sings my soul my Saviour God to Thee\nHow great Thou art how great Thou art",
        },
      ],
    },
  ];

  // (a) Title mention
  const titleHits = matchSpokenSongs(
    "Church let us stand together and sing Amazing Grace",
    songs
  );
  assert.equal(titleHits.length, 1);
  assert.equal(titleHits[0].songId, "song-amazing-grace");
  assert.equal(titleHits[0].reason, "title-mention");
  assert.equal(titleHits[0].slideIndex, 0);

  // (b) Consecutive lyric line match on Verse 2 (slideIndex = 1)
  const lyricHits = matchSpokenSongs(
    "I once was lost but now am found was blind but now I see",
    songs
  );
  assert.equal(lyricHits.length, 1);
  assert.equal(lyricHits[0].songId, "song-amazing-grace");
  assert.equal(lyricHits[0].reason, "lyric-match");
  assert.equal(lyricHits[0].slideIndex, 1);

  // (c) Unrelated speech -> 0 matches
  const noSong = matchSpokenSongs(
    "Please open your notebooks and write down these three points",
    songs
  );
  assert.equal(noSong.length, 0);
}

function testIntentTriggersAndServiceContext() {
  const savedTexts = [
    {
      id: "starter-offering",
      title: "Offering today",
      body: "Thank you for your generous giving.",
      tags: ["Service", "Giving"],
    },
    {
      id: "starter-welcome",
      title: "Welcome",
      body: "Welcome home!",
      tags: ["Service", "Welcome"],
    },
    {
      id: "starter-prayer",
      title: "Prayer",
      body: "Let us pray.",
      tags: ["Service", "Prayer"],
    },
  ];

  // Built-in offering trigger
  const offHits = matchIntentTriggers(
    "Now it is time to receive the offering as the ushers come forward",
    savedTexts,
    []
  );
  assert.equal(offHits.length, 1);
  assert.equal(offHits[0].savedTextId, "starter-offering");

  // Custom user trigger phrase (e.g. local church phrase)
  const customRules = [
    {
      id: "trg-1",
      savedTextId: "starter-offering",
      phrases: ["blessing basket time"],
      enabled: true,
    },
  ];
  const customHits = matchIntentTriggers(
    "Church it is blessing basket time let us honour the Lord",
    savedTexts,
    customRules
  );
  assert.equal(customHits.length, 1);
  assert.equal(customHits[0].savedTextId, "starter-offering");
  assert.equal(customHits[0].triggerId, "trg-1");

  // Service Context boost (MD-7)
  const boosted = applyServiceContextBoost("Romans 8:28", 0.78, [
    "Romans 8:28",
    "Amazing Grace",
  ]);
  assert.equal(boosted.boosted, true);
  assert.equal(boosted.confidence, 0.90);

  const notBoosted = applyServiceContextBoost("Genesis 1:1", 0.78, [
    "Romans 8:28",
  ]);
  assert.equal(notBoosted.boosted, false);
  assert.equal(notBoosted.confidence, 0.78);
}

function testObsSuggestProtocolValidation() {
  const pairId = "PAIR1234567890";

  // Valid selah:suggest
  assert.equal(
    isSelah(
      {
        app: "selah-live",
        v: 1,
        pairId,
        type: "selah:suggest",
        suggestions: [{ id: "scripture:43:3:16", kind: "scripture" }],
      },
      pairId
    ),
    true
  );

  // Oversized suggestions array (> 5) -> rejected
  assert.equal(
    isSelah(
      {
        app: "selah-live",
        v: 1,
        pairId,
        type: "selah:suggest",
        suggestions: [1, 2, 3, 4, 5, 6],
      },
      pairId
    ),
    false
  );

  // Valid selah:suggest-action
  assert.equal(
    isSelah(
      {
        app: "selah-live",
        v: 1,
        pairId,
        type: "selah:suggest-action",
        action: "show",
        suggestionId: "scripture:43:3:16",
      },
      pairId
    ),
    true
  );

  // Invalid action in selah:suggest-action -> rejected
  assert.equal(
    isSelah(
      {
        app: "selah-live",
        v: 1,
        pairId,
        type: "selah:suggest-action",
        action: "auto-display",
        suggestionId: "scripture:43:3:16",
      },
      pairId
    ),
    false
  );

  // Wrong pairId -> rejected
  assert.equal(
    isSelah(
      {
        app: "selah-live",
        v: 1,
        pairId: "WRONG_PAIR",
        type: "selah:suggest-action",
        action: "show",
        suggestionId: "scripture:43:3:16",
      },
      pairId
    ),
    false
  );
}

testVerseQuoteMatcher();
testSongMatcher();
testIntentTriggersAndServiceContext();
testObsSuggestProtocolValidation();

console.log("✅ Phase 3 Voice tests passed (BM25 + n-gram verse quote matcher, song title & consecutive lyric matcher, intent triggers, service context boost, and OBS protocol validation).");
