/**
 * Imported Deck Store — Web platform implementation using IndexedDB
 *
 * Uses IndexedDB for imported deck cards and media (no size limits).
 * The deck registry (ImportedDeckMeta[]) stays in localStorage for sync access.
 *
 * IndexedDB structure:
 *   Database: 'lingolock-imported'
 *   Object stores:
 *     'cards'  — key: deckId, value: SimpleCard[]
 *     'media'  — key: '{deckId}/{filename}', value: Blob
 */

import type { ImportedDeckMeta, SimpleCard } from '../types/simpleCard';

const DB_NAME = 'lingolock-imported';
const DB_VERSION = 1;
const CARDS_STORE = 'cards';
const MEDIA_STORE = 'media';
const IMPORTED_DECKS_KEY = 'll.importedDecks';

const isSSR = typeof window === 'undefined' || typeof indexedDB === 'undefined';

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CARDS_STORE)) {
        db.createObjectStore(CARDS_STORE);
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete all keys in a store that start with a given prefix. */
function idbDeleteByPrefix(db: IDBDatabase, store: string, prefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    const request = objectStore.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Path helpers (compatibility with native API)
// ---------------------------------------------------------------------------

export function getImportedDecksBaseDir(): string {
  return '';
}

export function getImportedDeckDir(deckId: string): string {
  return deckId;
}

// ---------------------------------------------------------------------------
// Registry (localStorage — small, sync access needed by bundle system)
// ---------------------------------------------------------------------------

// One-time cleanup: remove legacy ll.imported.* and ll.media.* keys from localStorage
// (leftover from pre-IndexedDB imports that used localStorage for card/media data)
if (!isSSR) {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith('ll.imported.') || k.startsWith('ll.media.'))) {
      keysToRemove.push(k);
    }
  }
  if (keysToRemove.length > 0) {
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.log(`[ImportedDeckStore] Cleaned ${keysToRemove.length} legacy localStorage keys`);
  }
}

export function getImportedDecks(): ImportedDeckMeta[] {
  if (isSSR) return [];
  const raw = localStorage.getItem(IMPORTED_DECKS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ImportedDeckMeta[];
  } catch (e) {
    console.error('[ImportedDeckStore] Corrupted deck registry, returning empty list:', e);
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

  // Clean up IndexedDB (async, fire-and-forget)
  openDB().then(async (db) => {
    await idbDelete(db, CARDS_STORE, deckId);
    await idbDeleteByPrefix(db, MEDIA_STORE, `${deckId}/`);
    db.close();
  }).catch((err) => {
    console.error(`[ImportedDeckStore] Failed to clean up IndexedDB for deck ${deckId}:`, err);
  });
}

// ---------------------------------------------------------------------------
// Card storage (IndexedDB — large, async)
// ---------------------------------------------------------------------------

/** Save cards for an imported deck to IndexedDB. */
export async function saveImportedDeckCards(deckId: string, cards: SimpleCard[]): Promise<void> {
  if (isSSR) return;
  const db = await openDB();
  await idbPut(db, CARDS_STORE, deckId, cards);
  db.close();
}

/** Load cards for an imported deck from IndexedDB. */
export async function loadImportedDeckCards(deckId: string): Promise<SimpleCard[]> {
  if (isSSR) return [];
  const db = await openDB();
  const cards = await idbGet<SimpleCard[]>(db, CARDS_STORE, deckId);
  db.close();
  return cards ?? [];
}

// ---------------------------------------------------------------------------
// Media storage (IndexedDB — large binary blobs)
// ---------------------------------------------------------------------------

/** Save a media file (Blob) for an imported deck. */
export async function saveMediaBlob(deckId: string, filename: string, blob: Blob): Promise<void> {
  if (isSSR) return;
  const db = await openDB();
  await idbPut(db, MEDIA_STORE, `${deckId}/${filename}`, blob);
  db.close();
}

/** Load a media file as a blob: URL. Returns undefined if not found. */
export async function getMediaBlobUrl(deckId: string, filename: string): Promise<string | undefined> {
  if (isSSR) return undefined;
  const db = await openDB();
  const blob = await idbGet<Blob>(db, MEDIA_STORE, `${deckId}/${filename}`);
  db.close();
  if (!blob) return undefined;
  return URL.createObjectURL(blob);
}
