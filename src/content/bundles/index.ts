import type { BundleConfig, Bundle } from '../../types/bundle';
import type { ClozeCard, ChapterData } from '../../types/vocabulary';
import type { SimpleCard } from '../../types/simpleCard';
import type { ImportedDeckMeta } from '../../types/simpleCard';
import { loadEnabledBundles, DEFAULT_BUNDLE_ID } from '../../services/storage';
import { getImportedDecks } from '../../services/importedDeckStore';

import * as esDeBuenosAires from './es-de-buenos-aires';
import * as huDeBudapest from './hu-de-budapest';

// ---------------------------------------------------------------------------
// Card ID namespacing — applied once at the source so ALL downstream code
// (cardSelector, challenge, notifications, widget, stats) uses card.id directly.
// ---------------------------------------------------------------------------

/** Prefix card IDs with bundleId so storage keys are unique across bundles. */
function namespaceCards(bundleId: string, chapters: ChapterData[]): ChapterData[] {
  return chapters.map(ch => ({
    ...ch,
    cards: ch.cards.map(card => ({
      ...card,
      id: card.id.includes(':') ? card.id : `${bundleId}:${card.id}`,
    })),
  }));
}

/** Prefix SimpleCard IDs with bundleId. */
function namespaceSimpleCards(bundleId: string, cards: SimpleCard[]): SimpleCard[] {
  return cards.map(card => ({
    ...card,
    id: card.id.includes(':') ? card.id : `${bundleId}:${card.id}`,
  }));
}

const BUILTIN_BUNDLE_MAP: Record<string, Bundle> = {
  'es-de-buenos-aires': {
    config: { ...esDeBuenosAires.config, type: 'builtin' as const },
    chapters: esDeBuenosAires.CHAPTERS,
    simpleCards: [],
    cardImages: esDeBuenosAires.cardImages,
    cardAudios: esDeBuenosAires.cardAudios,
  },
  'hu-de-budapest': {
    config: { ...huDeBudapest.config, type: 'builtin' as const },
    chapters: huDeBudapest.CHAPTERS,
    simpleCards: [],
    cardImages: huDeBudapest.cardImages,
    cardAudios: huDeBudapest.cardAudios,
  },
};

/** In-memory cache of loaded imported deck bundles. */
const importedBundleCache: Record<string, Bundle> = {};

/** Register a loaded imported deck in the runtime cache. */
export function registerImportedBundle(deckId: string, bundle: Bundle): void {
  importedBundleCache[deckId] = bundle;
  delete namespacedBundleCache[deckId]; // Invalidate so getBundle() re-namespaces
}

/** Remove an imported deck from the runtime cache. */
export function unregisterImportedBundle(deckId: string): void {
  delete importedBundleCache[deckId];
  delete namespacedBundleCache[deckId];
}

/** Create a Bundle from imported deck metadata + cards. Single source of truth.
 *  Provides sensible defaults so imported decks behave like builtin decks
 *  without requiring isImported checks throughout the app. */
export function createImportedBundle(meta: ImportedDeckMeta, cards: SimpleCard[]): Bundle {
  return {
    config: {
      id: meta.id,
      type: 'imported',
      nativeLanguage: '',
      targetLanguage: '',
      displayLabel: meta.name,
      greetings: {
        morning: 'Good morning!',
        afternoon: 'Good afternoon!',
        evening: 'Good evening!',
      },
      motivational: {
        perfect: 'Perfect!',
        great: 'Great job!',
        good: 'Good work!',
        encouragement: 'Keep going!',
      },
      spellCharacters: [],
      searchPlaceholder: 'Search cards…',
      cardCount: meta.cardCount,
      importedAt: meta.importedAt,
    },
    chapters: [{ chapterNumber: 1, cards }],
    simpleCards: cards,
    cardImages: {},
    cardAudios: {},
  };
}

/** All available bundle configs (for picker UI) — builtin + imported. */
export function getAvailableBundles(): BundleConfig[] {
  const builtin = Object.values(BUILTIN_BUNDLE_MAP).map(b => b.config);
  const imported = getImportedDecks().map(meta => createImportedBundle(meta, []).config);
  return [...builtin, ...imported];
}

/** Check if a bundle ID is an imported deck. */
export function isImportedBundle(bundleId: string): boolean {
  return !BUILTIN_BUNDLE_MAP[bundleId];
}

/** In-memory cache of bundles with namespaced card IDs. */
const namespacedBundleCache: Record<string, Bundle> = {};

/** Get a full bundle by ID. Returns a copy with namespaced card IDs. */
export function getBundle(bundleId: string): Bundle {
  // Return from cache if already namespaced
  if (namespacedBundleCache[bundleId]) return namespacedBundleCache[bundleId];

  const raw = BUILTIN_BUNDLE_MAP[bundleId] ?? importedBundleCache[bundleId];
  if (!raw) {
    // Imported deck not loaded yet (async IndexedDB load in progress).
    // Fall back to default bundle to prevent crash on startup.
    console.warn(`[Bundles] Bundle "${bundleId}" not loaded yet, falling back to default`);
    return getBundle(DEFAULT_BUNDLE_ID);
  }

  const namespaced: Bundle = {
    ...raw,
    chapters: namespaceCards(bundleId, raw.chapters),
    simpleCards: namespaceSimpleCards(bundleId, raw.simpleCards),
  };

  namespacedBundleCache[bundleId] = namespaced;
  return namespaced;
}

/** Extract bundle ID from a namespaced card ID ("bundleId:cardId" → "bundleId") */
export function extractBundleId(namespacedCardId: string): string {
  const colonIndex = namespacedCardId.indexOf(':');
  if (colonIndex === -1) return DEFAULT_BUNDLE_ID;
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

/**
 * Find a card by namespaced ID across all bundles (builtin + imported).
 * Returns ClozeCard | SimpleCard — callers must narrow with card.kind
 * before accessing ClozeCard-specific fields.
 *
 * Cards in the bundle already have namespaced IDs (e.g. "es-de-buenos-aires:gato-ch01-s03"),
 * so we search by the full namespaced ID directly.
 */
export function getCardById(namespacedCardId: string): { card: ClozeCard | SimpleCard; bundle: Bundle } | null {
  const bundleId = extractBundleId(namespacedCardId);
  const bundle = getBundle(bundleId);
  // If getBundle fell back to default and that's not what we asked for, card won't be found
  if (bundle.config.id !== bundleId && bundleId !== DEFAULT_BUNDLE_ID) return null;

  // Search chapters — card.id is already namespaced
  for (const chapter of bundle.chapters) {
    const card = chapter.cards.find(c => c.id === namespacedCardId);
    if (card) return { card, bundle };
  }

  // Search imported simple cards
  const simpleCard = bundle.simpleCards.find(c => c.id === namespacedCardId);
  if (simpleCard) return { card: simpleCard, bundle };

  return null;
}

/** Get combined chapters from all enabled builtin bundles (with namespaced card IDs). */
export function getAllEnabledChapters(): ChapterData[] {
  const enabledIds = loadEnabledBundles();
  const chapters: ChapterData[] = [];
  for (const id of enabledIds) {
    if (!BUILTIN_BUNDLE_MAP[id]) continue;
    const bundle = getBundle(id); // Returns namespaced version
    chapters.push(...bundle.chapters);
  }
  return chapters;
}
