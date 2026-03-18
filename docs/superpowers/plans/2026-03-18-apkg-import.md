# Anki .apkg Deck Import — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to import Anki .apkg decks as first-class bundles with self-rated recall review, working across the challenge screen, home screen widget, and lock screen widget.

**Architecture:** Imported decks plug into the existing multi-bundle system as bundles with `type: 'imported'`. A new `SimpleCard` type represents front/back cards (vs existing `ClozeCard`). A new `selfRated` answer type is added alongside `mc4` and `text`, usable by both card types. The .apkg file (a ZIP containing SQLite + media) is parsed at import time and stored to `FileSystem.documentDirectory`. Card FSRS scheduling reuses the existing infrastructure unchanged.

**Tech Stack:** expo-document-picker (file selection), expo-sqlite (parse Anki DB), react-native-zip-archive (unzip .apkg), expo-file-system (media storage)

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/types/simpleCard.ts` | `SimpleCard` interface + `ImportedDeckMeta` type |
| `src/services/apkgImporter.ts` | Unzip .apkg, parse SQLite, extract cards + media, save to filesystem |
| `src/services/importedDeckStore.ts` | CRUD for imported deck registry (MMKV) + load deck data from filesystem |
| `src/components/SelfRatedCard.tsx` | Front/back card display with reveal + 4 rating buttons |
| `src/services/apkgImporter.test.ts` | Tests for .apkg parsing and card extraction |
| `src/services/importedDeckStore.test.ts` | Tests for deck registry CRUD + filesystem loading |
| `src/components/SelfRatedCard.test.tsx` | Tests for self-rated card component rendering |

### Modified Files
| File | Change |
|------|--------|
| `src/types/vocabulary.ts` | Add `selfRated` to `SessionCard.answerType` union |
| `src/types/bundle.ts` | Add `type: 'builtin' \| 'imported'` + optional fields to `BundleConfig` |
| `src/content/bundles/index.ts` | Extend `getBundle()`, `AVAILABLE_BUNDLES`, `getCardById()` to include imported decks |
| `src/content/activeBundleProvider.tsx` | Handle imported bundles in `getBundle()` calls |
| `src/services/cardSelector.ts` | Handle `SimpleCard` in session building; force `selfRated` for imported cards |
| `src/services/widgetService.ts` | Add `selfRated` widget mode with reveal/rate deep links |
| `src/services/widgetService.web.ts` | Add web stubs for new widget functions |
| `src/utils/deepLinkHandler.ts` | Add `widget-reveal` and `widget-rate` deep link routes |
| `src/components/BundlePicker.tsx` | Add import button + imported deck display + delete |
| `app/challenge.tsx` | Add `selfRated` rendering branch |
| `widgets/VocabularyWidget.tsx` | Add self-rated widget mode (front → reveal → rate) |
| `package.json` | Add `expo-document-picker`, `expo-sqlite`, `react-native-zip-archive`, `expo-file-system` |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new dependencies**

```bash
cd /mnt/Shared/Code/projects/LingoLock
npx expo install expo-document-picker expo-sqlite expo-file-system
npm install react-native-zip-archive
```

- [ ] **Step 2: Verify installation**

Run: `cat package.json | grep -E "expo-document-picker|expo-sqlite|expo-file-system|react-native-zip-archive"`
Expected: All four packages listed in dependencies

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dependencies for apkg import (expo-document-picker, expo-sqlite, expo-file-system, react-native-zip-archive)"
```

---

## Task 2: Data Model — SimpleCard + Bundle Type Extension

**Files:**
- Create: `src/types/simpleCard.ts`
- Modify: `src/types/vocabulary.ts`
- Modify: `src/types/bundle.ts`

- [ ] **Step 1: Create SimpleCard type**

Create `src/types/simpleCard.ts`:

```typescript
/**
 * A simple front/back flashcard imported from an external source (e.g., Anki .apkg).
 * Unlike ClozeCard, SimpleCard has no cloze deletion, distractors, or sentence context.
 * Always reviewed in self-rated mode (user reveals back, then rates recall).
 */
export interface SimpleCard {
  /** Unique ID: just the note ID (e.g., "42"). Namespacing with bundleId
   *  happens at the storage layer, same as ClozeCard. */
  id: string;
  /** Front side text (plain text, HTML stripped during import) */
  front: string;
  /** Back side text (plain text, HTML stripped during import) */
  back: string;
  /** Optional file:// URI to a locally stored image */
  image?: string;
  /** Optional file:// URI to a locally stored audio file */
  audio?: string;
  /** Parent imported deck ID */
  deckId: string;
}

/**
 * Metadata for an imported deck, stored in MMKV registry.
 * The actual card data lives in FileSystem.documentDirectory.
 */
export interface ImportedDeckMeta {
  /** Unique deck ID (slugified name + short hash) */
  id: string;
  /** Display name (from Anki deck name) */
  name: string;
  /** Total number of cards in the deck */
  cardCount: number;
  /** ISO date when the deck was imported */
  importedAt: string;
  /** Size in bytes of the deck directory on disk */
  sizeBytes: number;
}
```

- [ ] **Step 2: Extend SessionCard answerType and card type**

In `src/types/vocabulary.ts`:

1. Change `answerType` on line 131:
```typescript
  answerType: 'mc4' | 'text' | 'selfRated';
```

2. Change `card` type on line 130 to support both card types:
```typescript
import type { SimpleCard } from './simpleCard';

/** Card in the active session queue — combines content + state + answer type */
export interface SessionCard {
  card: ClozeCard | SimpleCard;
  answerType: 'mc4' | 'text' | 'selfRated';
  // ...rest unchanged
}
```

**IMPORTANT**: All existing code that accesses ClozeCard-specific fields (e.g., `card.wordInContext`, `card.distractors`, `card.germanHint`) must first check `answerType !== 'selfRated'` or use a type guard like `'wordInContext' in card`. The challenge screen already branches on `answerType`, so ClozeCard fields are only accessed in the `mc4`/`text` branches — this is safe.

- [ ] **Step 3: Extend BundleConfig with type field**

In `src/types/bundle.ts`, add the `type` field and optional imported-deck fields to `BundleConfig`:

```typescript
export interface BundleConfig {
  id: string;
  /** 'builtin' for pipeline-generated bundles, 'imported' for user-imported decks */
  type: 'builtin' | 'imported';
  nativeLanguage: string;
  targetLanguage: string;
  displayLabel: string;
  greetings: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  motivational: {
    perfect: string;
    great: string;
    good: string;
    encouragement: string;
  };
  spellCharacters: string[];
  searchPlaceholder: string;
  /** Total cards (only for imported decks — builtin decks derive from chapters) */
  cardCount?: number;
  /** ISO date of import (only for imported decks) */
  importedAt?: string;
}
```

Also update the `Bundle` interface to include `simpleCards`:

```typescript
export interface Bundle {
  config: BundleConfig;
  chapters: import('./vocabulary').ChapterData[];
  /** Simple front/back cards (imported decks only, empty array for builtin) */
  simpleCards: import('./simpleCard').SimpleCard[];
  cardImages: Record<string, number>;
  cardAudios: Record<string, number>;
}
```

Note: `cardImages`/`cardAudios` stay as `Record<string, number>` (Metro require IDs). Imported decks don't use these maps — their media URIs are stored directly on `SimpleCard.image`/`SimpleCard.audio` as `file://` strings. This avoids cascading type changes throughout the codebase.

- [ ] **Step 4: Add `type: 'builtin'` to existing bundle registration**

In `src/content/bundles/index.ts`, update the BUNDLE_MAP entry to include `type: 'builtin'` in the config and add `simpleCards: []`:

```typescript
const BUNDLE_MAP: Record<string, Bundle> = {
  'es-de-buenos-aires': {
    config: { ...esDeBuenosAires.config, type: 'builtin' },
    chapters: esDeBuenosAires.CHAPTERS,
    simpleCards: [],
    cardImages: esDeBuenosAires.cardImages,
    cardAudios: esDeBuenosAires.cardAudios,
  },
};
```

Also add `type: 'builtin'` to the generated config in the bundle's own config file (or handle it at the BUNDLE_MAP level as shown above — the spread approach is cleaner since the build script doesn't need to change).

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in files that reference `SessionCard.answerType` or `Bundle` — these will be fixed in subsequent tasks. No errors in the new type files themselves.

- [ ] **Step 6: Commit**

```bash
git add src/types/simpleCard.ts src/types/vocabulary.ts src/types/bundle.ts src/content/bundles/index.ts
git commit -m "feat: add SimpleCard type, selfRated answer mode, and bundle type discriminator"
```

---

## Task 3: Imported Deck Store — Registry CRUD + Filesystem Loader

**Files:**
- Create: `src/services/importedDeckStore.ts`
- Create: `src/services/importedDeckStore.test.ts`

- [ ] **Step 1: Write tests for imported deck store**

Create `src/services/importedDeckStore.test.ts`:

```typescript
/**
 * Tests for importedDeckStore — registry CRUD + filesystem loading
 */

jest.mock('./storage', () => ({
  statsStorage: {
    getString: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));

import { statsStorage } from './storage';
import * as FileSystem from 'expo-file-system';
import {
  getImportedDecks,
  saveImportedDeck,
  removeImportedDeck,
  getImportedDeckDir,
  loadImportedDeckCards,
} from './importedDeckStore';
import type { ImportedDeckMeta } from '../types/simpleCard';

const mockMeta: ImportedDeckMeta = {
  id: 'spanish-vocab-a3f2',
  name: 'Spanish Vocab',
  cardCount: 100,
  importedAt: '2026-03-18T12:00:00.000Z',
  sizeBytes: 1024000,
};

describe('importedDeckStore', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getImportedDecks returns empty array when no data stored', () => {
    (statsStorage.getString as jest.Mock).mockReturnValue(undefined);
    expect(getImportedDecks()).toEqual([]);
  });

  test('getImportedDecks parses stored JSON', () => {
    (statsStorage.getString as jest.Mock).mockReturnValue(JSON.stringify([mockMeta]));
    expect(getImportedDecks()).toEqual([mockMeta]);
  });

  test('saveImportedDeck adds to empty registry', () => {
    (statsStorage.getString as jest.Mock).mockReturnValue(undefined);
    saveImportedDeck(mockMeta);
    expect(statsStorage.set).toHaveBeenCalledWith(
      'importedDecks',
      JSON.stringify([mockMeta]),
    );
  });

  test('saveImportedDeck appends to existing registry', () => {
    const existing: ImportedDeckMeta = { ...mockMeta, id: 'other-deck-b1c3' };
    (statsStorage.getString as jest.Mock).mockReturnValue(JSON.stringify([existing]));
    saveImportedDeck(mockMeta);
    expect(statsStorage.set).toHaveBeenCalledWith(
      'importedDecks',
      JSON.stringify([existing, mockMeta]),
    );
  });

  test('removeImportedDeck removes from registry and deletes filesystem dir', async () => {
    (statsStorage.getString as jest.Mock).mockReturnValue(JSON.stringify([mockMeta]));
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    await removeImportedDeck(mockMeta.id);
    expect(statsStorage.set).toHaveBeenCalledWith('importedDecks', JSON.stringify([]));
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      '/mock/documents/imported-decks/spanish-vocab-a3f2',
      { idempotent: true },
    );
  });

  test('getImportedDeckDir returns correct path', () => {
    expect(getImportedDeckDir('spanish-vocab-a3f2')).toBe(
      '/mock/documents/imported-decks/spanish-vocab-a3f2',
    );
  });

  test('loadImportedDeckCards reads and parses deck.json', async () => {
    const cards = [{ id: '1', front: 'hola', back: 'hello', deckId: 'spanish-vocab-a3f2' }];
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(cards));
    const result = await loadImportedDeckCards('spanish-vocab-a3f2');
    expect(result).toEqual(cards);
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
      '/mock/documents/imported-decks/spanish-vocab-a3f2/deck.json',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/services/importedDeckStore.test.ts 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Implement importedDeckStore**

Create `src/services/importedDeckStore.ts`:

```typescript
/**
 * Imported Deck Store — CRUD for the imported deck registry (MMKV) and
 * filesystem operations for deck data.
 *
 * Registry: list of ImportedDeckMeta stored as JSON in statsStorage.
 * Deck data: SimpleCard[] stored as deck.json in FileSystem.documentDirectory.
 * Media: image/audio files stored in {deckDir}/media/.
 */
import * as FileSystem from 'expo-file-system';
import { statsStorage } from './storage';
import type { SimpleCard } from '../types/simpleCard';
import type { ImportedDeckMeta } from '../types/simpleCard';

const IMPORTED_DECKS_KEY = 'importedDecks';
const IMPORTED_DECKS_DIR = 'imported-decks';

// ---------------------------------------------------------------------------
// Registry (MMKV)
// ---------------------------------------------------------------------------

/** Load all imported deck metadata from MMKV. */
export function getImportedDecks(): ImportedDeckMeta[] {
  const raw = statsStorage.getString(IMPORTED_DECKS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ImportedDeckMeta[];
  } catch {
    return [];
  }
}

/** Add a deck to the registry. */
export function saveImportedDeck(meta: ImportedDeckMeta): void {
  const decks = getImportedDecks();
  decks.push(meta);
  statsStorage.set(IMPORTED_DECKS_KEY, JSON.stringify(decks));
}

/** Remove a deck from the registry and delete its filesystem directory. */
export async function removeImportedDeck(deckId: string): Promise<void> {
  const decks = getImportedDecks().filter(d => d.id !== deckId);
  statsStorage.set(IMPORTED_DECKS_KEY, JSON.stringify(decks));
  await FileSystem.deleteAsync(getImportedDeckDir(deckId), { idempotent: true });
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

/** Get the base directory for imported decks. */
export function getImportedDecksBaseDir(): string {
  return `${FileSystem.documentDirectory}${IMPORTED_DECKS_DIR}`;
}

/** Get the directory path for a specific imported deck. */
export function getImportedDeckDir(deckId: string): string {
  return `${getImportedDecksBaseDir()}/${deckId}`;
}

/** Load SimpleCard[] from a deck's deck.json file. */
export async function loadImportedDeckCards(deckId: string): Promise<SimpleCard[]> {
  const path = `${getImportedDeckDir(deckId)}/deck.json`;
  const raw = await FileSystem.readAsStringAsync(path);
  return JSON.parse(raw) as SimpleCard[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/services/importedDeckStore.test.ts -v`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/importedDeckStore.ts src/services/importedDeckStore.test.ts
git commit -m "feat: imported deck store with MMKV registry and filesystem loader"
```

---

## Task 4: .apkg Importer — Parse, Extract, Save

**Files:**
- Create: `src/services/apkgImporter.ts`
- Create: `src/services/apkgImporter.test.ts`

- [ ] **Step 1: Write tests for apkg importer**

Create `src/services/apkgImporter.test.ts`:

```typescript
/**
 * Tests for apkgImporter — .apkg parsing and card extraction
 *
 * Tests the pure functions (stripHtml, generateDeckId, parseAnkiNotes)
 * without requiring actual filesystem or SQLite access.
 */

import { stripHtml, generateDeckId, parseAnkiNotes } from './apkgImporter';

describe('stripHtml', () => {
  test('removes simple HTML tags', () => {
    expect(stripHtml('<b>bold</b> text')).toBe('bold text');
  });

  test('removes nested tags', () => {
    expect(stripHtml('<div><span>hello</span></div>')).toBe('hello');
  });

  test('converts <br> to newline', () => {
    expect(stripHtml('line1<br>line2')).toBe('line1\nline2');
  });

  test('converts <br/> and <br /> variants', () => {
    expect(stripHtml('a<br/>b<br />c')).toBe('a\nb\nc');
  });

  test('decodes HTML entities', () => {
    expect(stripHtml('&amp; &lt; &gt; &quot;')).toBe('& < > "');
  });

  test('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  test('handles string with no HTML', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });

  test('trims whitespace', () => {
    expect(stripHtml('  <p>  hello  </p>  ')).toBe('hello');
  });
});

describe('generateDeckId', () => {
  test('slugifies deck name', () => {
    expect(generateDeckId('Spanish Vocab')).toMatch(/^spanish-vocab-[a-f0-9]{4}$/);
  });

  test('handles special characters', () => {
    expect(generateDeckId('Español — Básico!')).toMatch(/^espa-ol-b-sico-[a-f0-9]{4}$/);
  });

  test('generates unique IDs for same name', () => {
    const id1 = generateDeckId('Test');
    const id2 = generateDeckId('Test');
    // Hash is random-seeded, so they should differ
    // (or could be same — just verify format)
    expect(id1).toMatch(/^test-[a-f0-9]{4}$/);
  });

  test('truncates long names', () => {
    const longName = 'A'.repeat(100);
    const id = generateDeckId(longName);
    // Slug portion should be capped at 50 chars
    expect(id.length).toBeLessThanOrEqual(55); // 50 + dash + 4 hex
  });
});

describe('parseAnkiNotes', () => {
  test('splits pipe-delimited fields into front/back', () => {
    const rows = [
      { id: 1, flds: 'hola\x1fhello', mid: 1 },
      { id: 2, flds: 'gato\x1fcat', mid: 1 },
    ];
    const cards = parseAnkiNotes(rows, 'test-deck');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      id: '1',
      front: 'hola',
      back: 'hello',
      deckId: 'test-deck',
    });
    expect(cards[1]).toEqual({
      id: '2',
      front: 'gato',
      back: 'cat',
      deckId: 'test-deck',
    });
  });

  test('strips HTML from fields', () => {
    const rows = [
      { id: 1, flds: '<b>front</b>\x1f<i>back</i>', mid: 1 },
    ];
    const cards = parseAnkiNotes(rows, 'deck');
    expect(cards[0].front).toBe('front');
    expect(cards[0].back).toBe('back');
  });

  test('handles notes with more than 2 fields (only uses first two)', () => {
    const rows = [
      { id: 1, flds: 'front\x1fback\x1fextra\x1fmore', mid: 1 },
    ];
    const cards = parseAnkiNotes(rows, 'deck');
    expect(cards[0].front).toBe('front');
    expect(cards[0].back).toBe('back');
  });

  test('skips notes with fewer than 2 fields', () => {
    const rows = [
      { id: 1, flds: 'only-one-field', mid: 1 },
    ];
    const cards = parseAnkiNotes(rows, 'deck');
    expect(cards).toHaveLength(0);
  });

  test('detects media references in fields', () => {
    const rows = [
      { id: 1, flds: '[sound:audio.mp3]\x1fback text', mid: 1 },
      { id: 2, flds: '<img src="image.jpg">\x1fanswer', mid: 1 },
    ];
    const cards = parseAnkiNotes(rows, 'deck');
    expect(cards[0].audio).toBe('audio.mp3');
    expect(cards[1].image).toBe('image.jpg');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/services/apkgImporter.test.ts 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Implement apkgImporter**

Create `src/services/apkgImporter.ts`:

```typescript
/**
 * .apkg Importer — parse Anki deck packages and save to local filesystem.
 *
 * Import pipeline:
 *   1. Copy .apkg to cache directory
 *   2. Unzip (it's a ZIP file)
 *   3. Open collection.anki2 (SQLite database)
 *   4. Query notes table → extract front/back fields + media references
 *   5. Read media JSON mapping → copy media files to deck directory
 *   6. Save SimpleCard[] as deck.json
 *   7. Register deck in MMKV via importedDeckStore
 *   8. Clean up temp files
 */

import * as FileSystem from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
import * as SQLite from 'expo-sqlite';
import type { SimpleCard } from '../types/simpleCard';
import type { ImportedDeckMeta } from '../types/simpleCard';
import { saveImportedDeck, getImportedDeckDir, getImportedDecksBaseDir } from './importedDeckStore';

// ---------------------------------------------------------------------------
// Pure utility functions (exported for testing)
// ---------------------------------------------------------------------------

/** Strip HTML tags from a string, convert <br> to newline, decode entities. */
export function stripHtml(html: string): string {
  if (!html) return '';
  let text = html;
  // Convert <br> variants to newline
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Remove all other HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return text.trim();
}

/** Generate a unique deck ID from a deck name. */
export function generateDeckId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const hash = Math.random().toString(16).slice(2, 6);
  return `${slug}-${hash}`;
}

/** Anki note row shape from SQLite query. */
interface AnkiNoteRow {
  id: number;
  flds: string;
  mid: number;
}

/**
 * Parse Anki note rows into SimpleCard[].
 * Fields are separated by \x1f (unit separator). First field = front, second = back.
 * Detects [sound:filename] and <img src="filename"> for media references.
 */
export function parseAnkiNotes(rows: AnkiNoteRow[], deckId: string): SimpleCard[] {
  const cards: SimpleCard[] = [];

  for (const row of rows) {
    const fields = row.flds.split('\x1f');
    if (fields.length < 2) continue;

    const rawFront = fields[0];
    const rawBack = fields[1];

    // Detect media references before stripping HTML
    const soundMatch = rawFront.match(/\[sound:(.+?)\]/) ?? rawBack.match(/\[sound:(.+?)\]/);
    const imgMatch = rawFront.match(/<img[^>]+src="([^"]+)"/) ?? rawBack.match(/<img[^>]+src="([^"]+)"/);

    const card: SimpleCard = {
      id: String(row.id),
      front: stripHtml(rawFront.replace(/\[sound:[^\]]+\]/g, '')),
      back: stripHtml(rawBack.replace(/\[sound:[^\]]+\]/g, '')),
      deckId,
    };

    if (soundMatch) card.audio = soundMatch[1];
    if (imgMatch) card.image = imgMatch[1];

    cards.push(card);
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Import pipeline (async, uses filesystem + SQLite)
// ---------------------------------------------------------------------------

export interface ImportProgress {
  stage: 'extracting' | 'parsing' | 'saving' | 'done';
  message: string;
}

/**
 * Import an .apkg file into LingoLock.
 *
 * @param sourceUri - URI of the .apkg file (from document picker)
 * @param onProgress - Optional callback for progress updates
 * @returns ImportedDeckMeta for the newly imported deck
 * @throws Error if the file is invalid, empty, or corrupt
 */
export async function importApkg(
  sourceUri: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportedDeckMeta> {
  const cacheDir = `${FileSystem.cacheDirectory}apkg-import-${Date.now()}`;

  try {
    // Step 1: Copy to cache
    onProgress?.({ stage: 'extracting', message: 'Extracting deck...' });
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    const apkgPath = `${cacheDir}/deck.apkg`;
    await FileSystem.copyAsync({ from: sourceUri, to: apkgPath });

    // Step 2: Unzip
    const extractDir = `${cacheDir}/extracted`;
    await unzip(apkgPath, extractDir);

    // Step 3: Find and open SQLite database
    onProgress?.({ stage: 'parsing', message: 'Reading cards...' });
    // Anki uses either "collection.anki2" or "collection.anki21"
    let dbFilename = 'collection.anki2';
    const anki21Info = await FileSystem.getInfoAsync(`${extractDir}/collection.anki21`);
    if (anki21Info.exists) dbFilename = 'collection.anki21';

    const dbPath = `${extractDir}/${dbFilename}`;
    const dbInfo = await FileSystem.getInfoAsync(dbPath);
    if (!dbInfo.exists) {
      throw new Error('Invalid .apkg file: no Anki database found');
    }

    // NOTE: expo-sqlite SDK 55 may require copying the DB to its managed directory.
    // If openDatabaseAsync rejects an absolute path, copy collection.anki2 to
    // FileSystem.documentDirectory first and open by name with { directory } option.
    const db = await SQLite.openDatabaseAsync(dbPath);

    // Step 4: Get deck name from col table
    let deckName = 'Imported Deck';
    try {
      const colRow = await db.getFirstAsync<{ decks: string }>('SELECT decks FROM col LIMIT 1');
      if (colRow?.decks) {
        const decksObj = JSON.parse(colRow.decks);
        // Get first non-default deck name
        const deckEntries = Object.values(decksObj) as Array<{ name: string }>;
        const nonDefault = deckEntries.find(d => d.name !== 'Default' && d.name !== '');
        deckName = nonDefault?.name ?? deckEntries[0]?.name ?? 'Imported Deck';
      }
    } catch {
      // Fallback to default name
    }

    const deckId = generateDeckId(deckName);

    // Step 5: Query notes
    const noteRows = await db.getAllAsync<AnkiNoteRow>('SELECT id, flds, mid FROM notes');
    if (noteRows.length === 0) {
      throw new Error('This deck appears to be empty');
    }

    const cards = parseAnkiNotes(noteRows, deckId);
    if (cards.length === 0) {
      throw new Error('No valid cards found in deck');
    }

    await db.closeAsync();

    // Step 6: Set up deck directory and copy media
    onProgress?.({ stage: 'saving', message: 'Saving cards...' });
    const deckDir = getImportedDeckDir(deckId);
    const mediaDir = `${deckDir}/media`;
    await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true });

    // Read media mapping (if exists)
    const mediaMapPath = `${extractDir}/media`;
    const mediaMapInfo = await FileSystem.getInfoAsync(mediaMapPath);
    let mediaMap: Record<string, string> = {};
    if (mediaMapInfo.exists) {
      try {
        const mediaJson = await FileSystem.readAsStringAsync(mediaMapPath);
        mediaMap = JSON.parse(mediaJson);
      } catch {
        // No media mapping — proceed without media
      }
    }

    // Copy media files and update card references
    const reverseMediaMap: Record<string, string> = {};
    for (const [numericId, originalName] of Object.entries(mediaMap)) {
      const sourcePath = `${extractDir}/${numericId}`;
      const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
      if (sourceInfo.exists) {
        const destPath = `${mediaDir}/${originalName}`;
        await FileSystem.copyAsync({ from: sourcePath, to: destPath });
        reverseMediaMap[originalName] = `${mediaDir}/${originalName}`;
      }
    }

    // Update card media references to file:// URIs
    for (const card of cards) {
      if (card.audio && reverseMediaMap[card.audio]) {
        card.audio = reverseMediaMap[card.audio];
      } else {
        delete card.audio;
      }
      if (card.image && reverseMediaMap[card.image]) {
        card.image = reverseMediaMap[card.image];
      } else {
        delete card.image;
      }
    }

    // Step 7: Save deck.json
    await FileSystem.writeAsStringAsync(
      `${deckDir}/deck.json`,
      JSON.stringify(cards),
    );

    // Step 8: Calculate size and register
    const deckInfo = await FileSystem.getInfoAsync(deckDir, { size: true });
    const meta: ImportedDeckMeta = {
      id: deckId,
      name: deckName,
      cardCount: cards.length,
      importedAt: new Date().toISOString(),
      sizeBytes: (deckInfo as any).size ?? 0,
    };

    saveImportedDeck(meta);
    onProgress?.({ stage: 'done', message: `Imported ${cards.length} cards` });

    return meta;
  } finally {
    // Cleanup temp files
    await FileSystem.deleteAsync(cacheDir, { idempotent: true }).catch(() => {});
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/services/apkgImporter.test.ts -v`
Expected: All tests for `stripHtml`, `generateDeckId`, and `parseAnkiNotes` PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/apkgImporter.ts src/services/apkgImporter.test.ts
git commit -m "feat: apkg importer with SQLite parsing, media extraction, and HTML stripping"
```

---

## Task 5: Bundle Registry Integration — Include Imported Decks

**Files:**
- Modify: `src/content/bundles/index.ts`
- Modify: `src/content/activeBundleProvider.tsx`

- [ ] **Step 1: Extend bundles/index.ts to include imported decks**

The key changes to `src/content/bundles/index.ts`:

1. `AVAILABLE_BUNDLES` must include imported deck configs
2. `getBundle()` must handle imported deck IDs
3. `getCardById()` must search imported decks

```typescript
import type { BundleConfig, Bundle } from '../../types/bundle';
import type { ClozeCard, ChapterData } from '../../types/vocabulary';
import type { SimpleCard } from '../../types/simpleCard';
import { loadEnabledBundles, DEFAULT_BUNDLE_ID } from '../../services/storage';
import { getImportedDecks } from '../../services/importedDeckStore';

import * as esDeBuenosAires from './es-de-buenos-aires';

const BUILTIN_BUNDLE_MAP: Record<string, Bundle> = {
  'es-de-buenos-aires': {
    config: { ...esDeBuenosAires.config, type: 'builtin' },
    chapters: esDeBuenosAires.CHAPTERS,
    simpleCards: [],
    cardImages: esDeBuenosAires.cardImages,
    cardAudios: esDeBuenosAires.cardAudios,
  },
};

/** In-memory cache of loaded imported deck bundles. */
const importedBundleCache: Record<string, Bundle> = {};

/** Register a loaded imported deck in the runtime cache. */
export function registerImportedBundle(deckId: string, bundle: Bundle): void {
  importedBundleCache[deckId] = bundle;
}

/** Remove an imported deck from the runtime cache. */
export function unregisterImportedBundle(deckId: string): void {
  delete importedBundleCache[deckId];
}

/** All available bundle configs (for picker UI) — builtin + imported. */
export function getAvailableBundles(): BundleConfig[] {
  const builtin = Object.values(BUILTIN_BUNDLE_MAP).map(b => b.config);
  const imported = getImportedDecks().map(meta => ({
    id: meta.id,
    type: 'imported' as const,
    nativeLanguage: '',
    targetLanguage: '',
    displayLabel: meta.name,
    greetings: { morning: '', afternoon: '', evening: '' },
    motivational: { perfect: '', great: '', good: '', encouragement: '' },
    spellCharacters: [],
    searchPlaceholder: '',
    cardCount: meta.cardCount,
    importedAt: meta.importedAt,
  }));
  return [...builtin, ...imported];
}

// Keep backwards-compat export for existing code that reads AVAILABLE_BUNDLES
export const AVAILABLE_BUNDLES: BundleConfig[] = Object.values(BUILTIN_BUNDLE_MAP).map(b => b.config);

/** Get a full bundle by ID. Checks builtin first, then imported cache. */
export function getBundle(bundleId: string): Bundle {
  const builtin = BUILTIN_BUNDLE_MAP[bundleId];
  if (builtin) return builtin;
  const imported = importedBundleCache[bundleId];
  if (imported) return imported;
  throw new Error(`Bundle not found: ${bundleId}. If imported, it may not be loaded yet.`);
}

/** Check if a bundle ID is an imported deck. */
export function isImportedBundle(bundleId: string): boolean {
  return !BUILTIN_BUNDLE_MAP[bundleId];
}

// ... keep existing extractBundleId, extractOriginalCardId, getBundleForCard ...

/**
 * Find a card by namespaced ID across all bundles (builtin + imported).
 * Returns ClozeCard | SimpleCard — callers must narrow with 'wordInContext' in card
 * or check the bundle's config.type before accessing type-specific fields.
 */
export function getCardById(namespacedCardId: string): { card: ClozeCard | SimpleCard; bundle: Bundle } | null {
  const bundleId = extractBundleId(namespacedCardId);
  const bundle = BUILTIN_BUNDLE_MAP[bundleId] ?? importedBundleCache[bundleId];
  if (!bundle) return null;
  const originalId = extractOriginalCardId(namespacedCardId);

  // Search builtin chapters
  for (const chapter of bundle.chapters) {
    const card = chapter.cards.find(c => c.id === originalId);
    if (card) return { card, bundle };
  }

  // Search imported simple cards
  const simpleCard = bundle.simpleCards.find(c => c.id === originalId);
  if (simpleCard) return { card: simpleCard, bundle };

  return null;
}

/** Get combined chapters from all enabled builtin bundles. */
export function getAllEnabledChapters(): ChapterData[] {
  const enabledIds = loadEnabledBundles();
  const chapters: ChapterData[] = [];
  for (const id of enabledIds) {
    const bundle = BUILTIN_BUNDLE_MAP[id];
    if (bundle) chapters.push(...bundle.chapters);
  }
  return chapters;
}
```

- [ ] **Step 2: Update activeBundleProvider to handle imported bundles**

In `src/content/activeBundleProvider.tsx`, the provider needs to handle the case where the active bundle is an imported deck. The imported deck's `chapters` will be empty (it uses `simpleCards` instead), and `cardImages`/`cardAudios` will be empty objects.

Update the `ActiveBundleContextValue` interface to include `simpleCards`:

```typescript
import type { SimpleCard } from '../types/simpleCard';

interface ActiveBundleContextValue {
  config: BundleConfig;
  chapters: ChapterData[];
  simpleCards: SimpleCard[];
  cardImages: Record<string, number>;
  cardAudios: Record<string, number>;
  switchBundle: (bundleId: string) => void;
}
```

Update the `useMemo` to include `simpleCards`:

```typescript
const value = useMemo(() => {
  const bundle = getBundle(bundleId);
  return {
    config: bundle.config,
    chapters: bundle.chapters,
    simpleCards: bundle.simpleCards,
    cardImages: bundle.cardImages,
    cardAudios: bundle.cardAudios,
    switchBundle,
  };
}, [bundleId, switchBundle]);
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Errors may remain in challenge.tsx and widgetService.ts (addressed in later tasks), but no errors in the bundle files themselves.

- [ ] **Step 4: Commit**

```bash
git add src/content/bundles/index.ts src/content/activeBundleProvider.tsx
git commit -m "feat: bundle registry includes imported decks with runtime cache"
```

---

## Task 6: SelfRatedCard Component

**Files:**
- Create: `src/components/SelfRatedCard.tsx`

- [ ] **Step 1: Create SelfRatedCard component**

Create `src/components/SelfRatedCard.tsx`:

```typescript
/**
 * SelfRatedCard — Front/back card display with reveal + self-rating buttons.
 *
 * Two states:
 *   1. Front: Shows front text (+ optional image). User taps "Reveal" to flip.
 *   2. Revealed: Shows front (smaller) + back (prominent) + 4 rating buttons.
 *
 * Used for imported deck cards (always selfRated) and optionally for
 * builtin cloze cards on the widget.
 */
import React, { useState } from 'react';
import { View, StyleSheet, Image, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme, getGlassStyle } from '../theme';
import type { SimpleCard } from '../types/simpleCard';
import type { ReviewGrade } from '../services/fsrs';

interface SelfRatedCardProps {
  card: SimpleCard;
  onRate: (grade: ReviewGrade) => void;
}

const GRADE_BUTTONS: Array<{ grade: ReviewGrade; label: string; color: string }> = [
  { grade: 'again', label: 'Again', color: '#EF5350' },
  { grade: 'hard', label: 'Hard', color: '#FF9800' },
  { grade: 'good', label: 'Good', color: '#66BB6A' },
  { grade: 'easy', label: 'Easy', color: '#42A5F5' },
];

export function SelfRatedCard({ card, onRate }: SelfRatedCardProps) {
  const [revealed, setRevealed] = useState(false);
  const theme = useAppTheme();
  const glassStyle = getGlassStyle(theme);

  if (!revealed) {
    // Front state — show front text + reveal button
    return (
      <View style={styles.container}>
        {card.image && (
          <Image source={{ uri: card.image }} style={styles.image} resizeMode="cover" />
        )}
        <View style={[styles.card, glassStyle]}>
          <Text variant="headlineSmall" style={[styles.frontText, { color: theme.colors.onSurface }]}>
            {card.front}
          </Text>
        </View>
        <Pressable
          onPress={() => setRevealed(true)}
          style={[styles.revealButton, { backgroundColor: theme.colors.primary }]}
          accessibilityLabel="Reveal answer"
          accessibilityRole="button"
        >
          <Text style={[styles.revealButtonText, { color: theme.colors.onPrimary }]}>
            Reveal
          </Text>
        </Pressable>
      </View>
    );
  }

  // Revealed state — show front + back + rating buttons
  return (
    <View style={styles.container}>
      {card.image && (
        <Image source={{ uri: card.image }} style={styles.image} resizeMode="cover" />
      )}
      <View style={[styles.card, glassStyle]}>
        <Text variant="bodyLarge" style={[styles.frontTextSmall, { color: theme.colors.onSurfaceVariant }]}>
          {card.front}
        </Text>
        <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
        <Text variant="headlineSmall" style={[styles.backText, { color: theme.colors.onSurface }]}>
          {card.back}
        </Text>
      </View>

      {/* Rating buttons */}
      <View style={styles.ratingRow}>
        {GRADE_BUTTONS.map(({ grade, label, color }) => (
          <Pressable
            key={grade}
            onPress={() => onRate(grade)}
            style={[styles.ratingButton, { backgroundColor: color }]}
            accessibilityLabel={`Rate ${label}`}
            accessibilityRole="button"
          >
            <Text style={styles.ratingButtonText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  image: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: 12,
    maxHeight: 200,
  },
  frontText: {
    textAlign: 'center',
    fontWeight: '600',
  },
  frontTextSmall: {
    textAlign: 'center',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  backText: {
    textAlign: 'center',
    fontWeight: '600',
  },
  revealButton: {
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 20,
  },
  revealButtonText: {
    fontSize: 17,
    fontWeight: '700',
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  ratingButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SelfRatedCard.tsx
git commit -m "feat: SelfRatedCard component with reveal + 4-button self-rating"
```

---

## Task 7: Challenge Screen — Add Self-Rated Branch

**Files:**
- Modify: `app/challenge.tsx`
- Modify: `src/services/cardSelector.ts`

- [ ] **Step 1: Update cardSelector to handle imported decks**

In `src/services/cardSelector.ts`, add support for building sessions from `SimpleCard[]`:

Add a new exported function `buildImportedSession` that creates a session from simple cards:

```typescript
import type { SimpleCard } from '../types/simpleCard';

/**
 * Build a session for an imported deck (SimpleCard[]).
 * All cards use selfRated answer type. Same FSRS due-date logic for reviews,
 * same daily new-word budget for new cards.
 */
export function buildImportedSession(
  cards: SimpleCard[],
  dailyNewWordBudget: number,
  bundleId: string,
): SessionCard[] {
  const dueCards: SimpleCard[] = [];
  const newCards: SimpleCard[] = [];

  for (const card of cards) {
    const namespacedId = `${bundleId}:${card.id}`;
    const state = loadCardState(namespacedId);
    if (state === null) {
      newCards.push(card);
    } else if (isDue(state)) {
      dueCards.push(card);
    }
  }

  const remainingBudget = Math.max(0, dailyNewWordBudget - loadNewWordsIntroducedToday());
  const selectedNew = newCards.slice(0, remainingBudget);
  const selected = [...shuffle(dueCards), ...selectedNew];

  return selected.map((card) => ({
    card,
    answerType: 'selfRated' as const,
    isFirstEncounter: loadCardState(`${bundleId}:${card.id}`) === null,
  }));
}
```

- [ ] **Step 2: Add selfRated branch to challenge.tsx**

In `app/challenge.tsx`, add the import and rendering branch:

1. Import `SelfRatedCard`:
```typescript
import { SelfRatedCard } from '../src/components/SelfRatedCard';
import type { SimpleCard } from '../src/types/simpleCard';
```

2. Add a `handleSelfRate` handler alongside existing handlers:
```typescript
const handleSelfRate = (grade: ReviewGrade) => {
  if (!currentCard) return;
  updateCardFSRS(currentCard, grade);
  if (currentCard.isFirstEncounter) answeredNewCardIds.current.add(currentCard.card.id);
  const isPositive = grade !== 'again';
  if (isPositive) {
    setCorrectCount((c) => {
      const next = c + 1;
      correctCountRef.current = next;
      return next;
    });
  }
  setShowAnswer(true);
  // Auto-advance after rating (no reveal needed — user already saw the card)
  advanceToNext();
};
```

3. Add a third rendering branch inside the content area, after the existing MC and text branches:

```typescript
{answerType === 'selfRated' && (
  <View style={styles.mcArea}>
    <SelfRatedCard
      card={currentCard.card as SimpleCard}
      onRate={handleSelfRate}
    />
  </View>
)}
```

- [ ] **Step 3: Update session initialization to handle imported bundles**

In the `useEffect` for session initialization, check if the active bundle is imported:

```typescript
useEffect(() => {
  pauseNotifications().catch(console.error);

  let session: SessionCard[];
  if (config.type === 'imported') {
    session = buildImportedSession(simpleCards, loadNewWordsPerDay(), config.id);
  } else if (mode === 'continuous') {
    session = buildSession(chapters, loadNewWordsPerDay(), params.source);
  } else {
    session = buildSession(chapters, parseInt(params.count || '3', 10), params.source);
  }
  // ... rest unchanged
}, []);
```

Add `simpleCards` to the destructured values from `useActiveBundle()`:

```typescript
const { config, chapters, simpleCards } = useActiveBundle();
```

- [ ] **Step 4: Handle missing motivational messages for imported decks**

Imported bundles have empty motivational messages. Add a fallback:

```typescript
function getMotivationalMessage(accuracy: number): string {
  const m = config.motivational;
  if (accuracy === 100) return m.perfect || 'Perfect!';
  if (accuracy >= 80) return m.great || 'Great job!';
  if (accuracy >= 60) return m.good || 'Good work!';
  return m.encouragement || 'Keep going!';
}
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors in challenge.tsx

- [ ] **Step 6: Commit**

```bash
git add app/challenge.tsx src/services/cardSelector.ts
git commit -m "feat: self-rated review mode in challenge screen for imported decks"
```

---

## Task 8: BundlePicker — Import Button + Deck Management

**Files:**
- Modify: `src/components/BundlePicker.tsx`

- [ ] **Step 1: Add import functionality to BundlePicker**

Rewrite `src/components/BundlePicker.tsx` to include:
- Import button (replaces "Download more" placeholder)
- Imported deck entries with size display
- Long-press delete for imported decks
- Loading indicator during import

```typescript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { getAvailableBundles, getBundle, isImportedBundle, registerImportedBundle, unregisterImportedBundle } from '../content/bundles';
import { loadActiveBundle } from '../services/storage';
import { getCardsDueCount } from '../services/statsService';
import { importApkg, type ImportProgress } from '../services/apkgImporter';
import { removeImportedDeck, loadImportedDeckCards } from '../services/importedDeckStore';
import { cardStorage } from '../services/storage';
import type { Bundle } from '../types/bundle';

interface BundlePickerProps {
  visible: boolean;
  onClose: () => void;
  onBundleChanged: (bundleId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BundlePicker({ visible, onClose, onBundleChanged }: BundlePickerProps) {
  const theme = useTheme();
  const activeBundleId = loadActiveBundle();
  const [importing, setImporting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const bundles = getAvailableBundles();

  const handleSelect = (bundleId: string) => {
    // For imported bundles, ensure cards are loaded into cache
    onBundleChanged(bundleId);
    onClose();
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // .apkg has no standard MIME type
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      if (!file.name?.endsWith('.apkg')) {
        Alert.alert('Invalid file', 'Please select an Anki .apkg file.');
        return;
      }

      setImporting(true);
      const meta = await importApkg(file.uri, (p: ImportProgress) => {
        setProgressMsg(p.message);
      });

      // Load cards and register bundle in runtime cache
      const cards = await loadImportedDeckCards(meta.id);
      const bundle: Bundle = {
        config: {
          id: meta.id,
          type: 'imported',
          nativeLanguage: '',
          targetLanguage: '',
          displayLabel: meta.name,
          greetings: { morning: '', afternoon: '', evening: '' },
          motivational: { perfect: '', great: '', good: '', encouragement: '' },
          spellCharacters: [],
          searchPlaceholder: '',
          cardCount: meta.cardCount,
          importedAt: meta.importedAt,
        },
        chapters: [],
        simpleCards: cards,
        cardImages: {},
        cardAudios: {},
      };
      registerImportedBundle(meta.id, bundle);

      setImporting(false);
      setRefreshKey(k => k + 1);
      onBundleChanged(meta.id);
      onClose();
    } catch (error: any) {
      setImporting(false);
      Alert.alert('Import failed', error.message || 'Failed to import deck');
    }
  };

  const handleDelete = (bundleId: string, bundleName: string) => {
    Alert.alert(
      'Delete deck?',
      `"${bundleName}" and all its progress will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Remove FSRS states for this deck's cards
            const allKeys = cardStorage.getAllKeys();
            for (const key of allKeys) {
              if (key.startsWith(`${bundleId}:`)) {
                cardStorage.remove(key);
              }
            }
            unregisterImportedBundle(bundleId);
            await removeImportedDeck(bundleId);
            setRefreshKey(k => k + 1);
            if (activeBundleId === bundleId) {
              onBundleChanged('es-de-buenos-aires'); // fallback to default
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Decks</Text>

          {bundles.map((bundle) => {
            const isActive = bundle.id === activeBundleId;
            const isImported = bundle.type === 'imported';
            let dueCount = 0;
            try {
              if (!isImported) {
                dueCount = getCardsDueCount(getBundle(bundle.id).chapters);
              }
            } catch {}

            return (
              <TouchableOpacity
                key={bundle.id}
                style={[styles.row, isActive && { backgroundColor: theme.colors.primaryContainer }]}
                onPress={() => handleSelect(bundle.id)}
                onLongPress={isImported ? () => handleDelete(bundle.id, bundle.displayLabel) : undefined}
              >
                <View>
                  <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                    {bundle.displayLabel}
                  </Text>
                  <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
                    {isImported
                      ? `${bundle.cardCount} cards · Imported`
                      : `${dueCount} due`}
                  </Text>
                  {isActive && (
                    <Text style={[styles.active, { color: theme.colors.primary }]}>Active</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Import button */}
          {importing ? (
            <View style={[styles.row, styles.importingRow]}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={{ color: theme.colors.onSurfaceVariant, marginLeft: 12 }}>
                {progressMsg || 'Importing...'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.row} onPress={handleImport}>
              <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>
                + Import your own deck
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  active: {
    fontSize: 12,
    marginTop: 2,
  },
  importingRow: {
    opacity: 0.7,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BundlePicker.tsx
git commit -m "feat: BundlePicker with apkg import button and deck deletion"
```

---

## Task 9: Deep Links — Widget Reveal + Rate Routes

**Files:**
- Modify: `src/utils/deepLinkHandler.ts`
- Modify: `src/types/vocabulary.ts`

- [ ] **Step 1: Add WidgetRevealParams and WidgetRateParams types**

In `src/types/vocabulary.ts`, add after `WidgetSpellParams`:

```typescript
/**
 * Parameters for widget self-rated reveal deep link.
 * Used when user taps "Reveal" on a self-rated card on the widget.
 */
export interface WidgetRevealParams {
  /** ID of the card to reveal */
  cardId: string;
}

/**
 * Parameters for widget self-rated rating deep link.
 * Used when user taps Again/Good on a revealed self-rated card on the widget.
 */
export interface WidgetRateParams {
  /** ID of the card being rated */
  cardId: string;
  /** FSRS rating: 1 = Again, 3 = Good */
  rating: '1' | '3';
}
```

- [ ] **Step 2: Extend DeepLinkParams and add parsers**

In `src/utils/deepLinkHandler.ts`:

1. Import new types:
```typescript
import { ChallengeParams, WidgetAnswerParams, WidgetSpellParams, WidgetRevealParams, WidgetRateParams } from '../types/vocabulary';
```

2. Extend the `DeepLinkParams` union:
```typescript
export type DeepLinkParams =
  | { type: 'challenge'; params: ChallengeParams }
  | { type: 'widget-answer'; params: WidgetAnswerParams }
  | { type: 'widget-spell'; params: WidgetSpellParams }
  | { type: 'widget-reveal'; params: WidgetRevealParams }
  | { type: 'widget-rate'; params: WidgetRateParams };
```

3. Add route handlers in `parseDeepLink`:
```typescript
} else if (parsed.hostname === 'widget-reveal') {
  return parseWidgetRevealLink(parsed);
} else if (parsed.hostname === 'widget-rate') {
  return parseWidgetRateLink(parsed);
}
```

4. Add parser functions:
```typescript
function parseWidgetRevealLink(parsed: ReturnType<typeof Linking.parse>): DeepLinkParams | null {
  const cardId = parsed.queryParams?.cardId as string;
  if (!cardId) {
    console.warn('[DeepLink] Missing cardId for widget-reveal');
    return null;
  }
  return { type: 'widget-reveal', params: { cardId } };
}

function parseWidgetRateLink(parsed: ReturnType<typeof Linking.parse>): DeepLinkParams | null {
  const cardId = parsed.queryParams?.cardId as string;
  const rating = parsed.queryParams?.rating as string;
  if (!cardId || !rating) {
    console.warn('[DeepLink] Missing params for widget-rate:', { cardId, rating });
    return null;
  }
  if (rating !== '1' && rating !== '3') {
    console.warn(`[DeepLink] Invalid rating: ${rating}, must be 1 or 3`);
    return null;
  }
  return { type: 'widget-rate', params: { cardId, rating } };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/vocabulary.ts src/utils/deepLinkHandler.ts
git commit -m "feat: deep link routes for widget-reveal and widget-rate"
```

---

## Task 10: Widget Service — Self-Rated Mode

**Files:**
- Modify: `src/services/widgetService.ts`
- Modify: `src/services/widgetService.web.ts`

- [ ] **Step 1: Extend WidgetCardData for self-rated mode**

In `src/services/widgetService.ts`, add self-rated fields to `WidgetCardData`:

```typescript
export interface WidgetCardData {
  cardId: string;
  sentence: string;
  germanHint: string;
  correctAnswer: string;
  answerType: 'mc4' | 'text' | 'selfRated';
  choices?: string[];
  imageUri?: string;
  cardsLeft: number;
  streakCount: number;
  spellInput?: string;
  spellChoices?: string[];
  // Self-rated fields
  frontText?: string;    // Front text for self-rated cards
  backText?: string;     // Back text (shown after reveal)
  isRevealed?: boolean;  // Whether the card has been flipped
}
```

- [ ] **Step 2: Update getWidgetCardData to handle imported decks**

Add imported deck scanning to `getWidgetCardData()`. After scanning builtin bundles, also scan imported bundles for due simple cards:

```typescript
import { isImportedBundle, getBundle as getBundleFn } from '../content/bundles';
import type { SimpleCard } from '../types/simpleCard';

// Inside getWidgetCardData(), after the existing builtin scan:

// Also scan imported decks
for (const bundleId of enabledIds) {
  if (!isImportedBundle(bundleId)) continue;
  let imported;
  try { imported = getBundleFn(bundleId); } catch { continue; }
  for (const card of imported.simpleCards) {
    const namespacedId = `${bundleId}:${card.id}`;
    const state = loadCardState(namespacedId);
    if (state !== null && isDue(state)) {
      // Return self-rated widget data
      return {
        cardId: namespacedId,
        sentence: '', // Not used for self-rated
        germanHint: '', // Not used for self-rated
        correctAnswer: '', // Not used for self-rated
        answerType: 'selfRated' as const,
        cardsLeft: 1, // Simplified — just show the card
        streakCount: getStreak(),
        frontText: card.front,
        backText: card.back,
        isRevealed: false,
      };
    }
  }
}
```

- [ ] **Step 3: Add processWidgetReveal and processWidgetRate functions**

```typescript
/**
 * Process a widget reveal action — marks the card as flipped.
 * The widget should re-render showing the back text + rating buttons.
 */
export function processWidgetReveal(cardId: string): WidgetCardData | null {
  const result = findCardById(cardId);
  if (!result) return null;
  const { card } = result;

  // Check if it's a SimpleCard (has front/back)
  if ('front' in card && 'back' in card) {
    const simpleCard = card as SimpleCard;
    return {
      cardId,
      sentence: '',
      germanHint: '',
      correctAnswer: '',
      answerType: 'selfRated',
      cardsLeft: 0,
      streakCount: getStreak(),
      frontText: simpleCard.front,
      backText: simpleCard.back,
      isRevealed: true,
    };
  }
  return null;
}

/**
 * Process a widget self-rating action.
 * Rating 1 = Again, Rating 3 = Good (simplified 2-button widget).
 */
export function processWidgetRate(
  cardId: string,
  rating: '1' | '3',
): { rated: boolean } {
  const loadedState = loadCardState(cardId);
  const cardState = loadedState ?? createNewCardState(cardId);
  const grade = rating === '1' ? 'again' : 'good';
  const updatedState = scheduleReview(cardState, grade);
  saveCardState(cardId, updatedState);
  updateStatsAfterSession(rating === '3' ? 1 : 0, 1, 'widget');
  updateWidgetData();
  return { rated: true };
}
```

- [ ] **Step 4: Update web stubs**

In `src/services/widgetService.web.ts`, add stubs:

```typescript
export function processWidgetReveal(_cardId: string): WidgetCardData | null {
  return null;
}

export function processWidgetRate(
  _cardId: string,
  _rating: '1' | '3',
): { rated: boolean } {
  return { rated: false };
}
```

Also update the `WidgetCardData` interface in the web stub to match the native version (add `frontText`, `backText`, `isRevealed` fields).

- [ ] **Step 5: Commit**

```bash
git add src/services/widgetService.ts src/services/widgetService.web.ts
git commit -m "feat: widget service supports self-rated reveal and rate for imported decks"
```

---

## Task 11: Widget Component — Self-Rated Display Mode

**Files:**
- Modify: `widgets/VocabularyWidget.tsx`

- [ ] **Step 1: Add self-rated widget rendering**

Add new props and rendering to `VocabularyWidgetComponent`:

1. Extend `VocabularyWidgetProps`:
```typescript
interface VocabularyWidgetProps {
  // ...existing props...
  frontText?: string;
  backText?: string;
  isRevealed?: boolean;
}
```

2. **IMPORTANT**: Move the self-rated rendering branch BEFORE the existing empty state check (`if (!cardId || !sentence)`), because self-rated cards have `sentence: ''` which would trigger the empty state. Add the self-rated check first:

```typescript
// Self-rated mode — must come BEFORE the empty state check
if (cardId && frontText) {
  // ... self-rated rendering (see below)
}
```

Then the existing `if (!cardId || !sentence)` empty state check handles the rest.

Add the self-rated rendering:

```typescript
// Self-rated mode — reveal + rate flow
if (frontText) {
  if (isRevealed) {
    // Revealed state: show back + Again/Good buttons
    return (
      <View style={styles.container}>
        <View style={styles.cardContent}>
          <Text style={isLockScreen ? styles.sentenceCompact : styles.frontSmall}>{frontText}</Text>
          <View style={styles.selfRatedDivider} />
          <Text style={isLockScreen ? styles.sentenceCompact : styles.sentence}>{backText}</Text>
        </View>
        <View style={styles.selfRatedButtons}>
          <Button
            url={`lingolock://widget-rate?cardId=${cardId}&rating=1`}
            style={styles.againButton}
            label="✗"
          />
          <Button
            url={`lingolock://widget-rate?cardId=${cardId}&rating=3`}
            style={styles.goodButton}
            label="✓"
          />
        </View>
      </View>
    );
  }

  // Front state: show front + reveal button
  return (
    <View style={styles.container}>
      <View style={styles.cardContent}>
        <Text style={isLockScreen ? styles.sentenceCompact : styles.sentence}>{frontText}</Text>
      </View>
      <Button
        url={`lingolock://widget-reveal?cardId=${cardId}`}
        style={styles.revealWidgetButton}
        label="Reveal"
      />
    </View>
  );
}
```

3. Add styles:
```typescript
// Self-rated mode styles
selfRatedDivider: {
  height: 1,
  backgroundColor: '#DDD',
  marginVertical: 4,
},
frontSmall: {
  fontSize: 14,
  color: '#666',
  marginBottom: 2,
},
selfRatedButtons: {
  display: 'flex',
  flexDirection: 'row' as const,
  gap: 8,
  justifyContent: 'center' as const,
},
againButton: {
  flex: 1,
  padding: 10,
  backgroundColor: '#EF5350',
  borderRadius: 8,
  display: 'flex',
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  color: '#FFF',
  fontSize: 18,
  fontWeight: '700' as const,
},
goodButton: {
  flex: 1,
  padding: 10,
  backgroundColor: '#66BB6A',
  borderRadius: 8,
  display: 'flex',
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  color: '#FFF',
  fontSize: 18,
  fontWeight: '700' as const,
},
revealWidgetButton: {
  padding: 10,
  backgroundColor: '#5B8EC4',
  borderRadius: 8,
  display: 'flex',
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  color: '#FFF',
  fontSize: 14,
  fontWeight: '600' as const,
},
```

- [ ] **Step 2: Update widget snapshot to include self-rated fields**

In `initializeVocabularyWidget()`, pass the new fields:

```typescript
export function initializeVocabularyWidget() {
  const cardData = getWidgetCardData();
  if (cardData) {
    vocabularyWidget.updateSnapshot({
      cardId: cardData.cardId,
      sentence: cardData.sentence,
      germanHint: cardData.germanHint,
      answerType: cardData.answerType,
      choices: cardData.choices,
      cardsLeft: cardData.cardsLeft,
      streakCount: cardData.streakCount,
      spellInput: cardData.spellInput,
      spellChoices: cardData.spellChoices,
      frontText: cardData.frontText,
      backText: cardData.backText,
      isRevealed: cardData.isRevealed,
    });
  } else {
    const { getStreak } = require('../src/services/statsService');
    vocabularyWidget.updateSnapshot({
      streakCount: getStreak(),
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add widgets/VocabularyWidget.tsx
git commit -m "feat: widget self-rated mode with front/reveal/back/rate flow"
```

---

## Task 12: Wire Deep Links — Handle Reveal + Rate in App Layout

**Files:**
- Modify: `app/_layout.tsx` (or wherever deep links are currently handled)

- [ ] **Step 1: Find and read the deep link handler integration**

Check where `parseDeepLink` is called and deep link events are handled:

```bash
grep -rn "parseDeepLink\|widget-answer\|widget-spell" app/ src/ --include="*.tsx" --include="*.ts" | head -20
```

- [ ] **Step 2: Add widget-reveal and widget-rate handlers**

In the deep link handler (likely `app/_layout.tsx`), add cases for the new routes:

```typescript
import { processWidgetReveal, processWidgetRate } from '../src/services/widgetService';

// In the deep link handler switch/if-chain:
case 'widget-reveal': {
  const revealData = processWidgetReveal(params.cardId);
  if (revealData) {
    // Update widget with revealed state
    vocabularyWidget.updateSnapshot({
      cardId: revealData.cardId,
      frontText: revealData.frontText,
      backText: revealData.backText,
      isRevealed: true,
    });
  }
  break;
}

case 'widget-rate': {
  processWidgetRate(params.cardId, params.rating);
  // Widget auto-refreshes via updateWidgetData() inside processWidgetRate
  break;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: handle widget-reveal and widget-rate deep links in app layout"
```

---

## Task 13: Load Imported Decks on App Start

**Files:**
- Modify: `app/_layout.tsx` (or app startup)
- Modify: `src/content/activeBundleProvider.tsx`

- [ ] **Step 1: Load imported deck cards into memory on app start**

The imported bundle cache needs to be populated when the app launches. The best place is in `ActiveBundleProvider` since it runs before any screen renders.

In `src/content/activeBundleProvider.tsx`, add an effect to load imported decks:

```typescript
import { getImportedDecks } from '../services/importedDeckStore';
import { loadImportedDeckCards } from '../services/importedDeckStore';
import { registerImportedBundle } from './bundles';

// Inside ActiveBundleProvider, add useEffect to load imported decks:
useEffect(() => {
  async function loadImported() {
    const metas = getImportedDecks();
    for (const meta of metas) {
      try {
        const cards = await loadImportedDeckCards(meta.id);
        registerImportedBundle(meta.id, {
          config: {
            id: meta.id,
            type: 'imported',
            nativeLanguage: '',
            targetLanguage: '',
            displayLabel: meta.name,
            greetings: { morning: '', afternoon: '', evening: '' },
            motivational: { perfect: '', great: '', good: '', encouragement: '' },
            spellCharacters: [],
            searchPlaceholder: '',
            cardCount: meta.cardCount,
            importedAt: meta.importedAt,
          },
          chapters: [],
          simpleCards: cards,
          cardImages: {},
          cardAudios: {},
        });
      } catch (error) {
        console.error(`[ActiveBundle] Failed to load imported deck ${meta.id}:`, error);
      }
    }
  }
  loadImported();
}, []);
```

- [ ] **Step 2: Commit**

```bash
git add src/content/activeBundleProvider.tsx
git commit -m "feat: load imported decks into memory on app start"
```

---

## Task 14: TypeScript + Existing Tests — Fix Any Breakage

**Files:**
- Various files that need type updates

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit 2>&1`
Fix any remaining type errors from the `Bundle` interface changes (adding `simpleCards`, changing `cardImages`/`cardAudios` value type).

Common fixes needed:
- Add `simpleCards: []` to any test mock bundles
- Add `type: 'builtin'` to test mock configs
- Add type narrowing in `processWidgetAnswer` and `processSpellAction` (widgetService.ts): these access `card.wordInContext` and `card.distractors` — add guard `if (!('wordInContext' in card)) return { isCorrect: false, correctAnswer: '' };` before ClozeCard-specific access
- Update any test that creates mock `SessionCard` objects to include the `| SimpleCard` card type

- [ ] **Step 2: Run existing tests**

Run: `npx jest --passWithNoTests 2>&1 | tail -20`
Fix any broken tests.

- [ ] **Step 3: Run all new tests**

Run: `npx jest src/services/apkgImporter.test.ts src/services/importedDeckStore.test.ts -v`
Expected: All tests PASS

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve type errors and test breakage from bundle interface changes"
```

---

## Task 15: Manual Integration Test Checklist

This task has no code — it's a verification checklist for manual testing on a device/simulator.

- [ ] **Step 1: Build and run the app**

```bash
npx expo run:ios
```

- [ ] **Step 2: Test import flow**
- Open BundlePicker from home screen
- Tap "Import your own deck"
- Select a .apkg file (download a small Anki deck for testing)
- Verify loading indicator shows progress
- Verify deck appears in BundlePicker after import

- [ ] **Step 3: Test self-rated review**
- Select the imported deck as active
- Start a challenge session
- Verify front text is displayed with "Reveal" button
- Tap Reveal — verify back text appears with 4 rating buttons
- Tap a rating — verify next card appears
- Complete session — verify completion screen shows

- [ ] **Step 4: Test deck deletion**
- Long-press imported deck in BundlePicker
- Confirm deletion
- Verify deck disappears from list
- Verify app falls back to default bundle

- [ ] **Step 5: Test widget (if available)**
- Add LingoLock widget to home screen
- Review some imported deck cards to create due cards
- Verify widget shows front text of imported card
- Tap Reveal on widget — verify flip to back + buttons
- Tap rating — verify next card loads

---

## Architecture Notes for Implementer

### Key gotchas

1. **MMKV is synchronous, FileSystem is async.** Deck metadata (registry) is in MMKV for fast sync reads. Card content is on filesystem (async). The `ActiveBundleProvider` loads cards at startup so they're in memory by the time the challenge screen renders.

2. **Card ID namespacing.** `SimpleCard.id` is just the note ID (e.g., `"42"`), same pattern as `ClozeCard.id` (e.g., `"gato-ch01-s03"`). Namespacing with `bundleId:` happens at the storage layer when saving/loading FSRS state. Never double-prefix.

3. **`SessionCard.card` type.** Typed as `ClozeCard | SimpleCard`. The challenge screen branches on `answerType` — ClozeCard-specific fields (`wordInContext`, `distractors`, `germanHint`) are only accessed in `mc4`/`text` branches. The `selfRated` branch casts to `SimpleCard`. Consumers of `getCardById()` must narrow with `'wordInContext' in card` before accessing ClozeCard fields.

4. **`cardImages`/`cardAudios` stay as `Record<string, number>`.** Imported decks don't use these maps. Their media URIs are on `SimpleCard.image`/`SimpleCard.audio` directly. This avoids cascading type changes.

5. **Anki field separator.** Anki uses `\x1f` (ASCII unit separator, not pipe `|`) to delimit fields within a note's `flds` column.

6. **expo-sqlite path.** `expo-sqlite` SDK 55 may not accept arbitrary filesystem paths in `openDatabaseAsync`. If it requires a managed directory, copy `collection.anki2` to `FileSystem.documentDirectory` first and open with the `{ directory }` option.

7. **Media mapping.** Anki's `media` file is a JSON map of numeric filenames to original filenames. The actual media files in the ZIP use numeric names (0, 1, 2...). Both the mapping and the files need to be processed.

8. **Widget empty state ordering.** The self-rated rendering branch (`if (cardId && frontText)`) must come BEFORE the existing empty state check (`if (!cardId || !sentence)`) in the widget component. Self-rated cards have `sentence: ''`, which would falsely trigger the empty state.

9. **Global new-word budget.** `loadNewWordsIntroducedToday()` is a global counter shared across all bundles. If a user exhausts their daily budget on a builtin bundle, imported deck sessions will show 0 new cards that day. This is intentional — the daily budget is a learning cap, not per-deck.
