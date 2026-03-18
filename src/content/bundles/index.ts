import type { BundleConfig, Bundle } from '../../types/bundle';
import type { ClozeCard, ChapterData } from '../../types/vocabulary';
import { loadEnabledBundles, DEFAULT_BUNDLE_ID } from '../../services/storage';

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
