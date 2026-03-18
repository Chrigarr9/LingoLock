import type { BundleConfig, Bundle } from '../../types/bundle';
import type { ClozeCard, ChapterData } from '../../types/vocabulary';
import type { SimpleCard } from '../../types/simpleCard';
import { loadEnabledBundles, DEFAULT_BUNDLE_ID } from '../../services/storage';
import { getImportedDecks } from '../../services/importedDeckStore';

import * as esDeBuenosAires from './es-de-buenos-aires';

const BUILTIN_BUNDLE_MAP: Record<string, Bundle> = {
  'es-de-buenos-aires': {
    config: { ...esDeBuenosAires.config, type: 'builtin' as const },
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

// Backwards-compat export for code that reads AVAILABLE_BUNDLES directly
export const AVAILABLE_BUNDLES: BundleConfig[] = Object.values(BUILTIN_BUNDLE_MAP).map(b => b.config);

/** Check if a bundle ID is an imported deck. */
export function isImportedBundle(bundleId: string): boolean {
  return !BUILTIN_BUNDLE_MAP[bundleId];
}

/** Get a full bundle by ID. Checks builtin first, then imported cache. */
export function getBundle(bundleId: string): Bundle {
  const builtin = BUILTIN_BUNDLE_MAP[bundleId];
  if (builtin) return builtin;
  const imported = importedBundleCache[bundleId];
  if (imported) return imported;
  // Imported deck not loaded yet (async IndexedDB load in progress).
  // Fall back to default bundle to prevent crash on startup.
  console.warn(`[Bundles] Bundle "${bundleId}" not loaded yet, falling back to default`);
  return BUILTIN_BUNDLE_MAP[DEFAULT_BUNDLE_ID];
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
 * Returns ClozeCard | SimpleCard — callers must narrow with 'wordInContext' in card
 * before accessing ClozeCard-specific fields.
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
