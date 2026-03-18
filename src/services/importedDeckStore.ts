/**
 * Imported deck store — MMKV registry + filesystem loader for user-imported decks.
 *
 * The deck registry (ImportedDeckMeta[]) lives in statsStorage under the key 'importedDecks'.
 * The actual deck card data lives on disk at:
 *   ${Paths.document.uri}/imported-decks/${deckId}/deck.json
 */
import { Directory, File, Paths } from 'expo-file-system';

import { statsStorage } from './storage';
import type { ImportedDeckMeta, SimpleCard } from '../types/simpleCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMPORTED_DECKS_KEY = 'importedDecks';
const IMPORTED_DECKS_DIR_NAME = 'imported-decks';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the base directory path (URI string) for all imported decks.
 * e.g. "file:///data/user/0/com.lingolock/files/imported-decks"
 */
export function getImportedDecksBaseDir(): string {
  return new Directory(Paths.document, IMPORTED_DECKS_DIR_NAME).uri;
}

/**
 * Returns the directory path (URI string) for a specific imported deck.
 * e.g. "file:///data/user/0/com.lingolock/files/imported-decks/my-deck-abc123"
 */
export function getImportedDeckDir(deckId: string): string {
  return new Directory(Paths.document, IMPORTED_DECKS_DIR_NAME, deckId).uri;
}

// ---------------------------------------------------------------------------
// Registry CRUD (MMKV)
// ---------------------------------------------------------------------------

/**
 * Load all imported deck metadata from MMKV.
 * Returns an empty array if nothing has been imported yet.
 */
export function getImportedDecks(): ImportedDeckMeta[] {
  const raw = statsStorage.getString(IMPORTED_DECKS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ImportedDeckMeta[];
  } catch {
    return [];
  }
}

/**
 * Add (or update) a deck in the MMKV registry.
 * If a deck with the same id already exists, it is replaced.
 */
export function saveImportedDeck(meta: ImportedDeckMeta): void {
  const decks = getImportedDecks().filter((d) => d.id !== meta.id);
  decks.push(meta);
  statsStorage.set(IMPORTED_DECKS_KEY, JSON.stringify(decks));
}

/**
 * Remove a deck from the MMKV registry and delete its filesystem directory.
 * No-ops silently if the deck doesn't exist in the registry or on disk.
 */
export function removeImportedDeck(deckId: string): void {
  // Remove from MMKV registry
  const decks = getImportedDecks().filter((d) => d.id !== deckId);
  statsStorage.set(IMPORTED_DECKS_KEY, JSON.stringify(decks));

  // Delete filesystem directory
  const dir = new Directory(Paths.document, IMPORTED_DECKS_DIR_NAME, deckId);
  if (dir.exists) {
    dir.delete();
  }
}

// ---------------------------------------------------------------------------
// Filesystem loader
// ---------------------------------------------------------------------------

/**
 * Read and parse deck.json from an imported deck's directory.
 * Returns the array of SimpleCard objects.
 *
 * @throws if the file does not exist or contains invalid JSON.
 */
export async function loadImportedDeckCards(deckId: string): Promise<SimpleCard[]> {
  const file = new File(
    Paths.document,
    IMPORTED_DECKS_DIR_NAME,
    deckId,
    'deck.json',
  );

  if (!file.exists) {
    throw new Error(`Deck file not found: ${file.uri}`);
  }

  const content = await file.text();
  return JSON.parse(content) as SimpleCard[];
}
