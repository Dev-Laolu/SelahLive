/**
 * Test-only fixtures for Selah Live core smoke and unit tests.
 * Per CODE_STANDARDS.md §3.2 & §8, production code MUST NEVER import from `tests/fixtures/`.
 */

export interface TestBibleBookRecord {
  readonly n: number;
  readonly name: string;
  readonly chapters: readonly (readonly string[])[];
}

export interface TestBiblePackFixture {
  readonly id: string;
  readonly type: 'bible';
  readonly code: string;
  readonly name: string;
  readonly language: string;
  readonly version: string;
  readonly books: readonly TestBibleBookRecord[];
}

export function buildBiblePackFixture(): TestBiblePackFixture {
  const psalmChapters: string[][] = Array.from({ length: 32 }, () => []);
  psalmChapters[22] = [
    'The LORD is my shepherd; I shall not want.',
    'He maketh me to lie down in green pastures: he leadeth me beside the still waters.',
  ];
  psalmChapters[31] = [
    'Blessed is he whose transgression is forgiven, whose sin is covered.',
  ];

  const johnChapters: string[][] = [[], [], []];
  const jn3: string[] = Array.from({ length: 17 }, () => '');
  jn3[15] =
    'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
  jn3[16] =
    'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.';
  johnChapters[2] = jn3;

  return {
    id: 'kjv-test',
    type: 'bible',
    code: 'KJV',
    name: 'King James Version (Test Fixture)',
    language: 'English',
    version: '1.0.0',
    books: [
      {
        n: 19,
        name: 'Psalm',
        chapters: psalmChapters,
      },
      {
        n: 43,
        name: 'John',
        chapters: johnChapters,
      },
    ],
  };
}
