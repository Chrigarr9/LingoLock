# Bundle Configuration System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all language-pair-specific content into a `BundleConfig` so the app can support multiple language bundles, starting with Spanish-German.

**Architecture:** Each bundle lives in `src/content/bundles/<bundleId>/` with a typed config + card data. A React context (`ActiveBundleProvider`) distributes the active bundle via state (re-renders on bundle switch). Services accept chapters as parameters instead of importing the global `CHAPTERS`. MMKV card state keys are namespaced with bundle ID to prevent collisions. Card IDs inside `chapters.ts` remain un-prefixed; the bundle registry strips/adds prefixes at the boundary. A backward-compat shim at `src/content/bundle.ts` keeps existing imports working during incremental migration.

**Tech Stack:** React Native/Expo 55, TypeScript, MMKV (react-native-mmkv v4), React Context

**Spec:** `docs/superpowers/specs/2026-03-18-bundle-config-design.md`

**Spec deviation (intentional):** The spec says card IDs should be namespaced at build time in `chapters.ts`. This plan keeps card IDs un-prefixed in `chapters.ts` (same as today) and namespaces only the MMKV storage keys. The bundle registry handles prefix stripping at lookup. This avoids regenerating all content and keeps `chapters.ts` bundle-agnostic. The spec should be updated to match.

---

## Task 1: BundleConfig Type

**Files:**
- Create: `src/types/bundle.ts`

- [ ] **Step 1: Create the BundleConfig interface**

```typescript
// src/types/bundle.ts
export interface BundleConfig {
  id: string;
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
}

export interface Bundle {
  config: BundleConfig;
  chapters: import('./vocabulary').ChapterData[];
  cardImages: Record<string, number>;
  cardAudios: Record<string, number>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add src/types/bundle.ts
git commit -m "feat: add BundleConfig type definition"
```

---

## Task 2: Create es-de-buenos-aires Bundle Config

**Files:**
- Create: `src/content/bundles/es-de-buenos-aires/config.ts`

- [ ] **Step 1: Create the Spanish-German config file**

```typescript
// src/content/bundles/es-de-buenos-aires/config.ts
import type { BundleConfig } from '../../../types/bundle';

export const config: BundleConfig = {
  id: 'es-de-buenos-aires',
  nativeLanguage: 'Deutsch',
  targetLanguage: 'Español',
  displayLabel: 'Deutsch → Español',
  greetings: {
    morning: 'Buenos días',
    afternoon: 'Buenas tardes',
    evening: 'Buenas noches',
  },
  motivational: {
    perfect: '¡Perfecto! Every answer correct.',
    great: '¡Muy bien! Great session.',
    good: '¡Bien! Keep practising.',
    encouragement: 'Every mistake is a lesson. ¡Ánimo!',
  },
  spellCharacters: 'abcdefghijklmnñopqrstuvwxyzáéíóú'.split(''),
  searchPlaceholder: 'Search Spanish or German...',
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add src/content/bundles/es-de-buenos-aires/config.ts
git commit -m "feat: add Spanish-German bundle config"
```

---

## Task 3: Move Bundle Content into Bundle Directory

**Files:**
- Move: `src/content/bundle.ts` → `src/content/bundles/es-de-buenos-aires/chapters.ts`
- Create: `src/content/bundles/es-de-buenos-aires/index.ts`
- Create: `src/content/bundle.ts` (backward-compat shim)

The key strategy: move the real content, then create a shim at the old path that re-exports everything. This means all existing imports keep working while we migrate files one by one.

- [ ] **Step 1: Move bundle.ts to the new location**

```bash
mv src/content/bundle.ts src/content/bundles/es-de-buenos-aires/chapters.ts
```

Update relative paths in `chapters.ts` using find-and-replace:
- `'../types/vocabulary'` → `'../../../types/vocabulary'`
- `'../../assets/images/cards/` → `'../../../../assets/images/cards/`
- `'../../assets/audio/cards/` → `'../../../../assets/audio/cards/`

- [ ] **Step 2: Create the bundle index**

```typescript
// src/content/bundles/es-de-buenos-aires/index.ts
export { config } from './config';
export {
  CHAPTERS,
  ALL_CARDS,
  cardImages,
  cardAudios,
  getCardById,
  getChapterCards,
  getTotalCards,
} from './chapters';
```

- [ ] **Step 3: Create backward-compat shim at the old path**

```typescript
// src/content/bundle.ts
// Backward-compat shim — re-exports from the default bundle.
// TODO: Remove once all consumers import from bundles/ directly.
export {
  CHAPTERS,
  ALL_CARDS,
  cardImages,
  cardAudios,
  getCardById,
  getChapterCards,
  getTotalCards,
} from './bundles/es-de-buenos-aires';
```

- [ ] **Step 4: Verify TypeScript compiles and tests pass**

Run: `npx tsc --noEmit && npx jest`
Expected: Clean compile, all 105 tests pass. Every existing import resolves through the shim.

- [ ] **Step 5: Commit**

```bash
git add src/content/bundle.ts src/content/bundles/es-de-buenos-aires/
git commit -m "refactor: move bundle content to bundles/es-de-buenos-aires/"
```

---

## Task 4: Storage Helpers for Bundle State

**Files:**
- Modify: `src/services/storage.ts`

This task comes before the bundle registry (Task 5) so the registry can import `loadEnabledBundles` without compile issues.

- [ ] **Step 1: Add bundle storage functions**

Add at the end of `storage.ts`, before `clearAllData()`:

```typescript
// ---------------------------------------------------------------------------
// Bundle state
// ---------------------------------------------------------------------------

const ACTIVE_BUNDLE_KEY = 'activeBundle';
const ENABLED_BUNDLES_KEY = 'enabledBundles';
const BUNDLE_MIGRATION_DONE_KEY = 'bundleMigrationDone';

export const DEFAULT_BUNDLE_ID = 'es-de-buenos-aires';

export function loadActiveBundle(): string {
  return statsStorage.getString(ACTIVE_BUNDLE_KEY) ?? DEFAULT_BUNDLE_ID;
}

export function saveActiveBundle(bundleId: string): void {
  statsStorage.set(ACTIVE_BUNDLE_KEY, bundleId);
  // Active bundle is always implicitly enabled
  const enabled = loadEnabledBundles();
  if (!enabled.includes(bundleId)) {
    saveEnabledBundles([...enabled, bundleId]);
  }
}

export function loadEnabledBundles(): string[] {
  const raw = statsStorage.getString(ENABLED_BUNDLES_KEY);
  if (!raw) return [DEFAULT_BUNDLE_ID];
  try {
    return JSON.parse(raw);
  } catch {
    return [DEFAULT_BUNDLE_ID];
  }
}

export function saveEnabledBundles(bundleIds: string[]): void {
  statsStorage.set(ENABLED_BUNDLES_KEY, JSON.stringify(bundleIds));
}

export function isBundleMigrationDone(): boolean {
  return statsStorage.getBoolean(BUNDLE_MIGRATION_DONE_KEY) ?? false;
}

export function setBundleMigrationDone(): void {
  statsStorage.set(BUNDLE_MIGRATION_DONE_KEY, true);
}

/**
 * One-time migration: prefix all existing card state keys with the default bundle ID.
 * Converts "gato-ch01-s03" → "es-de-buenos-aires:gato-ch01-s03".
 * Safe to call multiple times — no-ops after first successful run.
 */
export function migrateCardIdsToNamespaced(): void {
  if (isBundleMigrationDone()) return;

  const keys = cardStorage.getAllKeys();
  let migrated = 0;
  for (const key of keys) {
    // Skip keys that already have a bundle prefix (contain ':')
    if (key.includes(':')) continue;
    const value = cardStorage.getString(key);
    if (value) {
      const newKey = `${DEFAULT_BUNDLE_ID}:${key}`;
      cardStorage.set(newKey, value);
      cardStorage.remove(key);
      migrated++;
    }
  }

  setBundleMigrationDone();
  console.log(`[Migration] Migrated ${migrated} card states to namespaced IDs`);
}
```

- [ ] **Step 2: Write migration test**

Create or add to `src/services/storage.web.test.ts` (or a new `storage.test.ts`):

```typescript
describe('migrateCardIdsToNamespaced', () => {
  beforeEach(() => {
    cardStorage.clearAll();
    statsStorage.clearAll();
  });

  it('prefixes un-namespaced card state keys', () => {
    cardStorage.set('gato-ch01-s03', JSON.stringify({ cardId: 'gato-ch01-s03', stability: 5 }));
    cardStorage.set('perro-ch02-s01', JSON.stringify({ cardId: 'perro-ch02-s01', stability: 3 }));

    migrateCardIdsToNamespaced();

    expect(cardStorage.getString('gato-ch01-s03')).toBeUndefined();
    expect(cardStorage.getString('es-de-buenos-aires:gato-ch01-s03')).toBeDefined();
    expect(cardStorage.getString('es-de-buenos-aires:perro-ch02-s01')).toBeDefined();
  });

  it('skips keys that already have a prefix', () => {
    cardStorage.set('es-de-buenos-aires:gato-ch01-s03', '{"stability":5}');
    migrateCardIdsToNamespaced();
    expect(cardStorage.getString('es-de-buenos-aires:gato-ch01-s03')).toBe('{"stability":5}');
  });

  it('does not run twice', () => {
    cardStorage.set('gato-ch01-s03', '{"stability":5}');
    migrateCardIdsToNamespaced();
    // Add a new un-prefixed key after migration
    cardStorage.set('nuevo-ch01-s01', '{"stability":1}');
    migrateCardIdsToNamespaced(); // should no-op
    // The new key should remain un-prefixed (migration already ran)
    expect(cardStorage.getString('nuevo-ch01-s01')).toBe('{"stability":1}');
  });
});
```

- [ ] **Step 3: Verify TypeScript compiles and tests pass**

Run: `npx tsc --noEmit && npx jest`
Expected: Clean compile, all tests pass including migration tests

- [ ] **Step 4: Commit**

```bash
git add src/services/storage.ts src/services/storage.web.test.ts
git commit -m "feat: add bundle state storage helpers and card ID migration"
```

---

## Task 5: Bundle Registry

**Files:**
- Create: `src/content/bundles/index.ts`

This module provides cross-bundle helpers used by widgets, notifications, and the bundle picker.

- [ ] **Step 1: Create bundles/index.ts**

```typescript
// src/content/bundles/index.ts
import type { BundleConfig, Bundle } from '../../types/bundle';
import type { ClozeCard, ChapterData } from '../../types/vocabulary';
import { loadEnabledBundles, DEFAULT_BUNDLE_ID } from '../../services/storage';

// Import all available bundles
import * as esDeBuenosAires from './es-de-buenos-aires';

const BUNDLE_MAP: Record<string, Bundle> = {
  'es-de-buenos-aires': {
    config: esDeBuenosAires.config,
    chapters: esDeBuenosAires.CHAPTERS,
    cardImages: esDeBuenosAires.cardImages,
    cardAudios: esDeBuenosAires.cardAudios,
  },
};

/** All available bundle configs (for picker UI) */
export const AVAILABLE_BUNDLES: BundleConfig[] = Object.values(BUNDLE_MAP).map(b => b.config);

/** Get a full bundle by ID. Throws if not found. */
export function getBundle(bundleId: string): Bundle {
  const bundle = BUNDLE_MAP[bundleId];
  if (!bundle) throw new Error(`Bundle not found: ${bundleId}`);
  return bundle;
}

/** Extract bundle ID from a namespaced card ID ("bundleId:cardId" → "bundleId") */
export function extractBundleId(namespacedCardId: string): string {
  const colonIndex = namespacedCardId.indexOf(':');
  if (colonIndex === -1) return DEFAULT_BUNDLE_ID; // legacy un-namespaced
  return namespacedCardId.substring(0, colonIndex);
}

/** Extract the original card ID from a namespaced card ID */
export function extractOriginalCardId(namespacedCardId: string): string {
  const colonIndex = namespacedCardId.indexOf(':');
  if (colonIndex === -1) return namespacedCardId;
  return namespacedCardId.substring(colonIndex + 1);
}

/** Get the bundle that owns a card (by namespaced card ID) */
export function getBundleForCard(namespacedCardId: string): Bundle {
  return getBundle(extractBundleId(namespacedCardId));
}

/** Find a card by namespaced ID across all bundles */
export function getCardById(namespacedCardId: string): { card: ClozeCard; bundle: Bundle } | null {
  const bundleId = extractBundleId(namespacedCardId);
  const bundle = BUNDLE_MAP[bundleId];
  if (!bundle) return null;
  const originalId = extractOriginalCardId(namespacedCardId);
  for (const chapter of bundle.chapters) {
    const card = chapter.cards.find(c => c.id === originalId);
    if (card) return { card, bundle };
  }
  return null;
}

/**
 * Get combined chapters from all enabled bundles.
 * Used by widgets, notifications, and streak calculation.
 */
export function getAllEnabledChapters(): ChapterData[] {
  const enabledIds = loadEnabledBundles();
  const chapters: ChapterData[] = [];
  for (const id of enabledIds) {
    const bundle = BUNDLE_MAP[id];
    if (bundle) chapters.push(...bundle.chapters);
  }
  return chapters;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add src/content/bundles/index.ts
git commit -m "feat: add bundle registry with cross-bundle helpers"
```

---

## Task 6: ActiveBundleProvider (React Context)

**Files:**
- Create: `src/content/activeBundleProvider.tsx`
- Modify: `app/_layout.tsx`

The provider uses React state for `bundleId` so it re-renders when the user switches bundles. It also runs the card ID migration synchronously at module init (before any component renders).

- [ ] **Step 1: Create the provider**

```typescript
// src/content/activeBundleProvider.tsx
import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { BundleConfig } from '../types/bundle';
import type { ChapterData } from '../types/vocabulary';
import { getBundle } from './bundles';
import { loadActiveBundle, saveActiveBundle, migrateCardIdsToNamespaced } from '../services/storage';

// Run migration at module load (synchronous, before any component renders)
migrateCardIdsToNamespaced();

interface ActiveBundleContextValue {
  config: BundleConfig;
  chapters: ChapterData[];
  cardImages: Record<string, number>;
  cardAudios: Record<string, number>;
  /** Switch the active bundle (triggers re-render) */
  switchBundle: (bundleId: string) => void;
}

const ActiveBundleContext = createContext<ActiveBundleContextValue | null>(null);

export function ActiveBundleProvider({ children }: { children: React.ReactNode }) {
  const [bundleId, setBundleId] = useState(() => loadActiveBundle());

  const switchBundle = useCallback((newBundleId: string) => {
    saveActiveBundle(newBundleId);
    setBundleId(newBundleId);
  }, []);

  const value = useMemo(() => {
    const bundle = getBundle(bundleId);
    return {
      config: bundle.config,
      chapters: bundle.chapters,
      cardImages: bundle.cardImages,
      cardAudios: bundle.cardAudios,
      switchBundle,
    };
  }, [bundleId, switchBundle]);

  return (
    <ActiveBundleContext.Provider value={value}>
      {children}
    </ActiveBundleContext.Provider>
  );
}

export function useActiveBundle(): ActiveBundleContextValue {
  const ctx = useContext(ActiveBundleContext);
  if (!ctx) throw new Error('useActiveBundle must be used within ActiveBundleProvider');
  return ctx;
}
```

- [ ] **Step 2: Wrap app in ActiveBundleProvider**

In `app/_layout.tsx`, add the import:
```typescript
import { ActiveBundleProvider } from '../src/content/activeBundleProvider';
```

Wrap the content (find the variable `content` that renders the `<Stack>`) — wrap it with `<ActiveBundleProvider>`:

```typescript
const content = (
  <ActiveBundleProvider>
    <Stack screenOptions={themedHeaderOptions}>
      ...
    </Stack>
  </ActiveBundleProvider>
);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 4: Commit**

```bash
git add src/content/activeBundleProvider.tsx app/_layout.tsx
git commit -m "feat: add ActiveBundleProvider context with re-render on switch"
```

---

## Task 7: Update cardSelector.ts

**Files:**
- Modify: `src/services/cardSelector.ts`
- Modify: `src/services/cardSelector.test.ts`

The key change: `buildSession()`, `getCurrentChapter()`, `getDueCards()`, `getDueCardIds()` accept a `chapters` parameter instead of importing `CHAPTERS` directly.

- [ ] **Step 1: Update imports and function signatures**

Remove the `CHAPTERS` import:
```typescript
// Old:
import { CHAPTERS, getChapterCards } from '../content/bundle';
// New:
import type { ChapterData } from '../types/vocabulary';
```

Add a local helper:
```typescript
function getChapterCards(chapters: ChapterData[], chapterNumber: number): ClozeCard[] {
  return chapters.find(ch => ch.chapterNumber === chapterNumber)?.cards ?? [];
}
```

Update `getCurrentChapter` (line 169 — returns `number`, NOT `ChapterData`):
```typescript
// Old:
export function getCurrentChapter(): number
// New:
export function getCurrentChapter(chapters: ChapterData[]): number
```
Replace all `CHAPTERS` references inside with `chapters`.

Update `getDueCardIds` (line ~199, currently unused but should be updated for consistency):
```typescript
// Old:
export function getDueCardIds(): Set<string>
// New:
export function getDueCardIds(chapters: ChapterData[]): Set<string>
```

Update `getDueCards` (line ~216):
```typescript
// Old:
export function getDueCards(excludeIds: Set<string>): SessionCard[]
// New:
export function getDueCards(chapters: ChapterData[], excludeIds: Set<string>): SessionCard[]
```

Update `buildSession` (line ~254):
```typescript
// Old:
export function buildSession(dailyNewWordBudget: number, sourceApp?: string): SessionCard[]
// New:
export function buildSession(chapters: ChapterData[], dailyNewWordBudget: number, sourceApp?: string): SessionCard[]
```
Replace `CHAPTERS` inside with `chapters`. Update internal calls: `getCurrentChapter()` → `getCurrentChapter(chapters)`.

- [ ] **Step 2: Update ALL callers in challenge.tsx**

In `app/challenge.tsx`, there are **5 call sites** that need updating:

```typescript
import { useActiveBundle } from '../src/content/activeBundleProvider';

// Inside the component:
const { chapters } = useActiveBundle();
```

Update all `buildSession` calls (4 sites):
- Line 93: `buildSession(chapters, loadNewWordsPerDay(), params.source)`
- Line 95: `buildSession(chapters, parseInt(params.count || '3', 10), params.source)`
- Line 100: `buildSession(chapters, Infinity, params.source)`
- Line 186: `buildSession(chapters, Infinity, params.source)` (inside `advanceToNext`)
- Line 303: `buildSession(chapters, Infinity, params.source)` (inside `startExtraSession`)

Update `getCurrentChapter`:
- Line 108: `getCurrentChapter(chapters)`

Update `getDueCards`:
- Line 160: `getDueCards(chapters, queueIds)` (inside `advanceToNext` → `setQueue` callback)

**IMPORTANT:** `advanceToNext` is wrapped in `useCallback` — add `chapters` to its dependency array:

```typescript
const advanceToNext = useCallback(() => {
  // ... uses buildSession(chapters, ...) and getDueCards(chapters, ...)
}, [chapters, /* ...existing deps */]);
```

`startExtraSession` is currently a plain arrow function (not `useCallback`). Since `chapters` comes from the hook at the component level, the closure captures it correctly — just update the `buildSession` call inside it.

- [ ] **Step 3: Update tests in cardSelector.test.ts**

Tests that call `buildSession()`, `getCurrentChapter()`, etc. need to pass a mock chapters array as the first argument. Import `CHAPTERS` from the bundle shim to use as test data:

```typescript
import { CHAPTERS } from '../content/bundle';

// Update calls like:
// buildSession(20) → buildSession(CHAPTERS, 20)
// getCurrentChapter() → getCurrentChapter(CHAPTERS)
```

- [ ] **Step 4: Verify TypeScript compiles and tests pass**

Run: `npx tsc --noEmit && npx jest`
Expected: Clean compile, all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/services/cardSelector.ts app/challenge.tsx src/services/cardSelector.test.ts
git commit -m "refactor: cardSelector accepts chapters parameter"
```

---

## Task 8: Update statsService.ts

**Files:**
- Modify: `src/services/statsService.ts`
- Modify: `src/services/statsService.test.ts`

- [ ] **Step 1: Update function signatures**

Remove the imports:
```typescript
// Old:
import { getChapterCards, CHAPTERS } from '../content/bundle';
import { getCurrentChapter } from './cardSelector';
// New:
import type { ChapterData } from '../types/vocabulary';
import { getCurrentChapter } from './cardSelector';
```

Update `getChapterMastery` (line ~139):
```typescript
// Old:
export function getChapterMastery(chapterNumber: number): number
// New:
export function getChapterMastery(chapters: ChapterData[], chapterNumber: number): number
```
Replace internal `getChapterCards(chapterNumber)` with:
```typescript
const cards = chapters.find(ch => ch.chapterNumber === chapterNumber)?.cards ?? [];
```

Update `getCardsDueCount` (line ~161):
```typescript
// Old:
export function getCardsDueCount(): number
// New:
export function getCardsDueCount(chapters: ChapterData[]): number
```
Replace internal `CHAPTERS` with `chapters`. Update internal `getCurrentChapter()` → `getCurrentChapter(chapters)`.

Update `getCurrentChapterNumber` (line ~273):
```typescript
// Old:
export function getCurrentChapterNumber(): number {
  return getCurrentChapter();
}
// New:
export function getCurrentChapterNumber(chapters: ChapterData[]): number {
  return getCurrentChapter(chapters);
}
```

- [ ] **Step 2: Update callers**

In `app/index.tsx`:
```typescript
import { useActiveBundle } from '../src/content/activeBundleProvider';
const { chapters } = useActiveBundle();
// Update calls:
getCardsDueCount(chapters)
getChapterMastery(chapters, chapterNumber)
getCurrentChapterNumber(chapters)
```

In `app/stats.tsx`:
```typescript
import { useActiveBundle } from '../src/content/activeBundleProvider';
const { chapters } = useActiveBundle();
// Replace getTotalCards() import and usage with:
const totalCards = chapters.flatMap(ch => ch.cards).length;
// Update getChapterMastery calls:
getChapterMastery(chapters, ch.chapterNumber)
```

In `app/vocabulary.tsx` (will get `useActiveBundle()` in Task 11, but the `getChapterMastery` call needs the `chapters` parameter too):
```typescript
// Update mastery map computation:
getChapterMastery(chapters, ch.chapterNumber)
```

Remove `getTotalCards` and `CHAPTERS` imports from `index.tsx` and `stats.tsx`.

- [ ] **Step 3: Update tests in statsService.test.ts**

Tests need to pass a chapters array as the first argument. Import `CHAPTERS` from the bundle shim:

```typescript
import { CHAPTERS } from '../content/bundle';
// getChapterMastery(1) → getChapterMastery(CHAPTERS, 1)
// getCardsDueCount() → getCardsDueCount(CHAPTERS)
```

- [ ] **Step 4: Verify TypeScript compiles and tests pass**

Run: `npx tsc --noEmit && npx jest`
Expected: Clean compile, all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/services/statsService.ts src/services/statsService.test.ts app/index.tsx app/stats.tsx
git commit -m "refactor: statsService accepts chapters parameter"
```

---

## Task 9: Update Home Screen (index.tsx)

**Files:**
- Modify: `app/index.tsx`

- [ ] **Step 1: Replace hardcoded language content**

Remove `getSpanishGreeting()` function (lines 12-17).

Remove `getTotalCards` import from `content/bundle` (already done in Task 8 if callers updated).

The `useActiveBundle()` import was already added in Task 8. Inside the component:

```typescript
const { config } = useActiveBundle();

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return config.greetings.morning;
  if (hour < 20) return config.greetings.afternoon;
  return config.greetings.evening;
}
```

Replace the "SPANISH" badge text (line 96) with `config.displayLabel`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add app/index.tsx
git commit -m "refactor: home screen uses bundle config for greetings and label"
```

---

## Task 10: Update challenge.tsx Motivational Messages

**Files:**
- Modify: `app/challenge.tsx`

- [ ] **Step 1: Replace hardcoded motivational messages**

Remove the `getMotivationalMessage()` function (lines 35-40). This was a top-level function — move it inside the component so it can access `config` via the hook.

The `useActiveBundle()` import was already added in Task 7. Inside the component:

```typescript
const { config } = useActiveBundle();

function getMotivationalMessage(accuracy: number): string {
  if (accuracy === 100) return config.motivational.perfect;
  if (accuracy >= 80) return config.motivational.great;
  if (accuracy >= 60) return config.motivational.good;
  return config.motivational.encouragement;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add app/challenge.tsx
git commit -m "refactor: challenge screen uses bundle config for motivational messages"
```

---

## Task 11: Update vocabulary.tsx and vocabulary/[id].tsx

**Files:**
- Modify: `app/vocabulary.tsx`
- Modify: `app/vocabulary/[id].tsx`

- [ ] **Step 1: Update vocabulary.tsx**

Replace:
```typescript
import { CHAPTERS } from '../src/content/bundle';
```
With:
```typescript
import { useActiveBundle } from '../src/content/activeBundleProvider';
```

Inside the component:
```typescript
const { config, chapters: CHAPTERS } = useActiveBundle();
```

Replace the search placeholder (line 143):
```typescript
placeholder={config.searchPlaceholder}
```

- [ ] **Step 2: Update vocabulary/[id].tsx**

Replace:
```typescript
import { getCardById, cardImages } from '../../src/content/bundle';
```
With:
```typescript
import { useActiveBundle } from '../../src/content/activeBundleProvider';
```

Inside the component:
```typescript
const { cardImages, chapters } = useActiveBundle();
```

For card lookup, since this screen receives a card ID from vocabulary.tsx navigation (which uses un-namespaced IDs from the active bundle's chapters), do a simple search within the active bundle:

```typescript
const card = useMemo(() => {
  for (const ch of chapters) {
    const found = ch.cards.find(c => c.id === params.id);
    if (found) return found;
  }
  return undefined;
}, [chapters, params.id]);
```

This avoids the namespacing issue entirely — the vocabulary list passes un-namespaced card IDs (as they exist in `chapters.ts`), and we search within the active bundle's chapters directly.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 4: Commit**

```bash
git add app/vocabulary.tsx app/vocabulary/[id].tsx
git commit -m "refactor: vocabulary screens use bundle config"
```

---

## Task 12: Update ClozeCard Component

**Files:**
- Modify: `src/components/ClozeCard.tsx`

- [ ] **Step 1: Use context for asset maps**

Replace:
```typescript
import { cardImages, cardAudios } from '../content/bundle';
```
With:
```typescript
import { useActiveBundle } from '../content/activeBundleProvider';
```

Inside the component:
```typescript
const { cardImages, cardAudios } = useActiveBundle();
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add src/components/ClozeCard.tsx
git commit -m "refactor: ClozeCard uses bundle context for assets"
```

---

## Task 13: Update widgetService.ts for Cross-Bundle Support

**Files:**
- Modify: `src/services/widgetService.ts`

- [ ] **Step 1: Replace CHAPTERS import and SPANISH_CHARS**

Replace:
```typescript
import { CHAPTERS } from '../content/bundle';
```
With:
```typescript
import { getAllEnabledChapters, getCardById as findCardById, getBundleForCard } from '../content/bundles';
import { DEFAULT_BUNDLE_ID } from './storage';
```

Remove the hardcoded `SPANISH_CHARS` constant.

Update `buildSpellChoices` to accept a characters array parameter:
```typescript
export function buildSpellChoices(
  correctAnswer: string,
  currentPosition: number,
  count: number = 4,
  characters: string[] = 'abcdefghijklmnñopqrstuvwxyzáéíóú'.split(''),
): string[] {
  // ... same logic but use `characters` instead of `SPANISH_CHARS`
}
```

Update `getWidgetCardData()`:
- Replace `CHAPTERS` with a bundle-aware scan. Since `getAllEnabledChapters()` returns chapters without bundle context, iterate enabled bundles directly to track which bundle each card belongs to:

```typescript
import { getBundle } from '../content/bundles';
import { loadEnabledBundles } from './storage';

// In getWidgetCardData():
const enabledIds = loadEnabledBundles();
const dueCards: Array<{ card: ClozeCard; bundleId: string }> = [];
for (const bundleId of enabledIds) {
  const bundle = getBundle(bundleId);
  for (const chapter of bundle.chapters) {
    for (const card of chapter.cards) {
      const namespacedId = `${bundleId}:${card.id}`;
      const state = loadCardState(namespacedId);
      if (state !== null && isDue(state)) {
        dueCards.push({ card, bundleId });
      }
    }
  }
}
```

- When building spell choices, use the tracked `bundleId`:
```typescript
if (answerType === 'text') {
  const bundle = getBundle(dueCard.bundleId);
  widgetData.spellChoices = buildSpellChoices(
    card.wordInContext, spellInput.length, 4,
    bundle.config.spellCharacters,
  );
}
```

Update `processWidgetAnswer()` and `processSpellAction()`:
- Replace the `CHAPTERS` iteration loop with `findCardById(cardId)`:
```typescript
const result = findCardById(cardId);
const card = result?.card ?? null;
```

**Note on deep link card IDs:** Widget deep links currently carry un-namespaced card IDs. The bundle registry's `extractBundleId()` falls back to `DEFAULT_BUNDLE_ID` for un-namespaced IDs. This works for the single-bundle case. When adding a second bundle, update the widget to include `bundleId` in deep link URLs so the correct bundle is resolved.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add src/services/widgetService.ts
git commit -m "refactor: widgetService uses bundle registry for cross-bundle support"
```

---

## Task 14: Update Notification Services

**Files:**
- Modify: `src/services/notificationService.ts`
- Modify: `src/services/notificationScheduler.ts`

- [ ] **Step 1: Update notificationScheduler.ts**

Replace:
```typescript
import { CHAPTERS } from '../content/bundle';
```
With:
```typescript
import { getAllEnabledChapters } from '../content/bundles';
```

In `getDueReviewCards()`, replace `CHAPTERS` with `getAllEnabledChapters()`.

- [ ] **Step 2: Update notificationService.ts**

Replace:
```typescript
import { CHAPTERS } from '../content/bundle';
```
With:
```typescript
import { getCardById } from '../content/bundles';
```

Replace the card lookup loop (lines 164-170):
```typescript
// Old:
for (const chapter of CHAPTERS) {
  const found = chapter.cards.find((c) => c.id === data.cardId);
  if (found) { card = found; break; }
}
// New:
const result = getCardById(data.cardId);
const card = result?.card ?? null;
```

**Note:** `data.cardId` from notification data may be un-namespaced (legacy) or namespaced. The bundle registry's `extractBundleId()` handles both cases — un-namespaced IDs fall back to `DEFAULT_BUNDLE_ID`. This works for the single-bundle case. When adding a second bundle, ensure notification scheduling stores namespaced card IDs.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 4: Commit**

```bash
git add src/services/notificationService.ts src/services/notificationScheduler.ts
git commit -m "refactor: notification services use bundle registry"
```

---

## Task 15: Remove Backward-Compat Shim

**Files:**
- Modify or delete: `src/content/bundle.ts`

- [ ] **Step 1: Check for remaining imports**

Run: `grep -r "from.*content/bundle['\"]" src/ app/ widgets/ --include="*.ts" --include="*.tsx" | grep -v "content/bundles" | grep -v "node_modules"`

If any files still import from `content/bundle`, update them first. Test files may still import `CHAPTERS` for test data — those are fine to keep using the shim.

- [ ] **Step 2: Clean up the shim**

If only test files remain, keep the shim but add a clear comment:

```typescript
// src/content/bundle.ts
// Backward-compat re-exports for test files.
// Production code should use useActiveBundle() or import from bundles/.
export {
  CHAPTERS,
  ALL_CARDS,
  cardImages,
  cardAudios,
  getCardById,
  getChapterCards,
  getTotalCards,
} from './bundles/es-de-buenos-aires';
```

- [ ] **Step 3: Verify TypeScript compiles and all tests pass**

Run: `npx tsc --noEmit && npx jest`
Expected: Clean compile, all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/content/bundle.ts
git commit -m "refactor: clean up backward-compat bundle shim"
```

---

## Task 16: Bundle Picker UI — Bottom Sheet Component

**Files:**
- Create: `src/components/BundlePicker.tsx`

- [ ] **Step 1: Create the BundlePicker component**

```typescript
// src/components/BundlePicker.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AVAILABLE_BUNDLES, getBundle } from '../content/bundles';
import { loadActiveBundle } from '../services/storage';
import { getCardsDueCount } from '../services/statsService';

interface BundlePickerProps {
  visible: boolean;
  onClose: () => void;
  onBundleChanged: (bundleId: string) => void;
}

export function BundlePicker({ visible, onClose, onBundleChanged }: BundlePickerProps) {
  const theme = useTheme();
  const activeBundleId = loadActiveBundle();

  const handleSelect = (bundleId: string) => {
    onBundleChanged(bundleId);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Language Pair</Text>

          {AVAILABLE_BUNDLES.map((bundle) => {
            const isActive = bundle.id === activeBundleId;
            const dueCount = getCardsDueCount(getBundle(bundle.id).chapters);
            return (
              <TouchableOpacity
                key={bundle.id}
                style={[styles.row, isActive && { backgroundColor: theme.colors.primaryContainer }]}
                onPress={() => handleSelect(bundle.id)}
              >
                <View>
                  <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                    {bundle.displayLabel}
                  </Text>
                  {isActive && (
                    <Text style={[styles.active, { color: theme.colors.primary }]}>Active</Text>
                  )}
                </View>
                <Text style={[styles.due, { color: theme.colors.onSurfaceVariant }]}>
                  {dueCount} due
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Placeholder for future downloads */}
          <View style={[styles.row, styles.disabledRow]}>
            <Text style={{ color: '#999' }}>
              + Download more (coming soon)
            </Text>
          </View>
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
    justifyContent: 'space-between',
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
  active: {
    fontSize: 12,
    marginTop: 2,
  },
  due: {
    fontSize: 14,
  },
  disabledRow: {
    opacity: 0.4,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add src/components/BundlePicker.tsx
git commit -m "feat: add BundlePicker bottom sheet component"
```

---

## Task 17: Wire Bundle Picker into Home Screen

**Files:**
- Modify: `app/index.tsx`

- [ ] **Step 1: Add BundlePicker to home screen**

```typescript
import { useState } from 'react';
import { BundlePicker } from '../src/components/BundlePicker';
```

Inside the component (which already has `const { config, ..., switchBundle } = useActiveBundle()`):

```typescript
const [pickerVisible, setPickerVisible] = useState(false);
```

Replace the static "SPANISH" badge with a tappable label:
```tsx
<TouchableOpacity onPress={() => setPickerVisible(true)}>
  <Text style={styles.languageBadge}>{config.displayLabel}</Text>
</TouchableOpacity>
```

Add the picker modal in the JSX:
```tsx
<BundlePicker
  visible={pickerVisible}
  onClose={() => setPickerVisible(false)}
  onBundleChanged={(bundleId) => {
    switchBundle(bundleId);  // triggers context re-render
    setPickerVisible(false);
  }}
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add app/index.tsx
git commit -m "feat: tappable language label with bundle picker on home screen"
```

---

## Task 18: Language Pairs Section in Settings

**Files:**
- Modify: `app/settings.tsx`

- [ ] **Step 1: Add Language Pairs section**

```typescript
import { AVAILABLE_BUNDLES, getBundle } from '../src/content/bundles';
import { useActiveBundle } from '../src/content/activeBundleProvider';
import {
  loadActiveBundle,
  loadEnabledBundles, saveEnabledBundles,
} from '../src/services/storage';
import { getCardsDueCount } from '../src/services/statsService';
```

Inside the component:
```typescript
const { switchBundle } = useActiveBundle();
const [activeBundleId, setActiveBundleId] = useState(() => loadActiveBundle());
const [enabledBundles, setEnabledBundles] = useState(() => loadEnabledBundles());

const toggleEnabled = (bundleId: string) => {
  if (bundleId === activeBundleId) return; // Can't disable active
  const newEnabled = enabledBundles.includes(bundleId)
    ? enabledBundles.filter(id => id !== bundleId)
    : [...enabledBundles, bundleId];
  saveEnabledBundles(newEnabled);
  setEnabledBundles(newEnabled);
};

const setActive = (bundleId: string) => {
  switchBundle(bundleId);
  setActiveBundleId(bundleId);
};
```

Render a "Language Pairs" section with rows for each bundle:
- Tapping the row calls `setActive(bundleId)`
- A `Switch` toggles enabled/disabled via `toggleEnabled(bundleId)`
- Active bundle's switch is always on and disabled
- A disabled "Download more (coming soon)" row at the bottom

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add app/settings.tsx
git commit -m "feat: add Language Pairs section to settings with enable/disable toggles"
```

---

## Task 19: Update build-content.ts

**Files:**
- Modify: `scripts/build-content.ts`

- [ ] **Step 1: Update output paths**

Change output constants:
```typescript
// Old:
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src', 'content', 'bundle.ts');
// New:
const BUNDLE_ID = 'es-de-buenos-aires';
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'src', 'content', 'bundles', BUNDLE_ID);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'chapters.ts');
```

Add `fs.mkdirSync(OUTPUT_DIR, { recursive: true });` before writing.

Update `require()` paths in the generated template strings:
- `../../assets/images/cards/` → `../../../../assets/images/cards/`
- `../../assets/audio/cards/` → `../../../../assets/audio/cards/`

Update the type import in the generated file header:
- `../types/vocabulary` → `../../../types/vocabulary`

Update the header comment:
```typescript
// Bundle: ${BUNDLE_ID}
// Source: spanish-content-pipeline/output/${BUNDLE_ID}/
```

Card IDs remain un-prefixed in the generated output (same as today).

- [ ] **Step 2: Add config.ts auto-generation**

After generating `chapters.ts`, also generate `config.ts` from pipeline config values. Read the pipeline YAML (currently hardcoded, future: passed as CLI arg):

```typescript
// Auto-generate config.ts alongside chapters.ts
const configContent = `// AUTO-GENERATED by scripts/build-content.ts — DO NOT EDIT
import type { BundleConfig } from '../../../types/bundle';

export const config: BundleConfig = {
  id: '${BUNDLE_ID}',
  nativeLanguage: 'Deutsch',
  targetLanguage: 'Español',
  displayLabel: 'Deutsch → Español',
  greetings: {
    morning: 'Buenos días',
    afternoon: 'Buenas tardes',
    evening: 'Buenas noches',
  },
  motivational: {
    perfect: '¡Perfecto! Every answer correct.',
    great: '¡Muy bien! Great session.',
    good: '¡Bien! Keep practising.',
    encouragement: 'Every mistake is a lesson. ¡Ánimo!',
  },
  spellCharacters: 'abcdefghijklmnñopqrstuvwxyzáéíóú'.split(''),
  searchPlaceholder: 'Search Spanish or German...',
};
`;

fs.writeFileSync(path.join(OUTPUT_DIR, 'config.ts'), configContent);
```

For now, the language-specific values are hardcoded in the template. Future enhancement: read them from the pipeline YAML config (`configs/spanish_buenos_aires.yaml` has `target_language`, `native_language`, etc.).

- [ ] **Step 3: Run the build script to verify**

Run: `npx tsx scripts/build-content.ts`
Expected: Generates `src/content/bundles/es-de-buenos-aires/chapters.ts` and `config.ts` with correct paths

- [ ] **Step 4: Verify TypeScript compiles and tests pass**

Run: `npx tsc --noEmit && npx jest`
Expected: Clean compile, all tests pass

- [ ] **Step 5: Commit**

```bash
git add scripts/build-content.ts src/content/bundles/es-de-buenos-aires/
git commit -m "refactor: build-content.ts outputs to bundle directory with auto-generated config"
```

---

## Task 20: Final Verification

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 2: Full test suite**

Run: `npx jest`
Expected: All tests pass

- [ ] **Step 3: Grep for remaining hardcoded Spanish content**

Run: `grep -rn "Buenos\|SPANISH\|¡Perfecto\|¡Muy bien\|¡Bien\|¡Ánimo\|SPANISH_CHARS\|Spanish or German" src/ app/ widgets/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v bundles/es-de`

Expected: No hits outside of the bundle config file (and possibly the backward-compat shim comments).

- [ ] **Step 4: Commit any remaining cleanup**

```bash
git add -A
git commit -m "feat: bundle configuration system complete"
```
