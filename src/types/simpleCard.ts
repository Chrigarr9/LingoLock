/**
 * A simple front/back flashcard imported from an external source (e.g., Anki .apkg).
 * Unlike ClozeCard, SimpleCard has no cloze deletion, distractors, or sentence context.
 * Always reviewed in self-rated mode (user reveals back, then rates recall).
 */
export interface SimpleCard {
  kind: 'simple';
  /** Unique ID: note ID (e.g., "42"), namespaced at runtime by getBundle()
   *  to "bundleId:42" so storage keys are unique across decks. */
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
