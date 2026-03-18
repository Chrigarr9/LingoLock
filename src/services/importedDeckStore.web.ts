/**
 * Imported Deck Store — Web platform implementation
 *
 * On web, imported decks are stored in localStorage (no filesystem).
 * Cards are stored as JSON in localStorage under ll.imported.{deckId}.
 * The registry is stored under ll.importedDecks.
 *
 * All localStorage access is SSR-safe (returns defaults during server rendering).
 */

import type { ImportedDeckMeta, SimpleCard } from '../types/simpleCard';

const IMPORTED_DECKS_KEY = 'll.importedDecks';
const IMPORTED_DECK_PREFIX = 'll.imported.';

const isSSR = typeof window === 'undefined' || typeof localStorage === 'undefined';

export function getImportedDecksBaseDir(): string {
  return '';
}

export function getImportedDeckDir(deckId: string): string {
  return deckId;
}

export function getImportedDecks(): ImportedDeckMeta[] {
  if (isSSR) return [];
  const raw = localStorage.getItem(IMPORTED_DECKS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ImportedDeckMeta[];
  } catch {
    return [];
  }
}

export function saveImportedDeck(meta: ImportedDeckMeta): void {
  if (isSSR) return;
  const decks = getImportedDecks().filter(d => d.id !== meta.id);
  decks.push(meta);
  localStorage.setItem(IMPORTED_DECKS_KEY, JSON.stringify(decks));
}

export function removeImportedDeck(deckId: string): void {
  if (isSSR) return;
  const decks = getImportedDecks().filter(d => d.id !== deckId);
  localStorage.setItem(IMPORTED_DECKS_KEY, JSON.stringify(decks));
  localStorage.removeItem(`${IMPORTED_DECK_PREFIX}${deckId}`);
}

export async function loadImportedDeckCards(deckId: string): Promise<SimpleCard[]> {
  if (isSSR) return [];
  const raw = localStorage.getItem(`${IMPORTED_DECK_PREFIX}${deckId}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SimpleCard[];
  } catch {
    return [];
  }
}
