/**
 * .apkg Importer
 *
 * Parses Anki .apkg files (which are ZIP archives containing a SQLite DB
 * and optional media files) into SimpleCard[] + deck metadata.
 *
 * Pure utility functions (stripHtml, generateDeckId, parseAnkiNotes) are
 * exported separately for unit testing. The main importApkg() pipeline
 * requires real filesystem and SQLite access.
 */
import { Directory, File, Paths } from 'expo-file-system';
// expo-sqlite and react-native-zip-archive are imported dynamically in
// importApkg() to avoid bundling native modules on web (crashes Metro).

import type { SimpleCard, ImportedDeckMeta } from '../types/simpleCard';
import {
  saveImportedDeck,
  getImportedDeckDir,
  getImportedDecksBaseDir,
} from './importedDeckStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnkiNoteRow {
  id: number;
  flds: string;
  mid: number;
}

export type ProgressCallback = (stage: string, pct: number) => void;

// ---------------------------------------------------------------------------
// Pure utility functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags, convert `<br>` variants to newline, decode common HTML
 * entities, and trim whitespace.
 */
export function stripHtml(html: string): string {
  let text = html;

  // Convert <br>, <br/>, <br /> to newline (case-insensitive)
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  return text.trim();
}

/**
 * Generate a deck ID from a display name: slugify + append 4-char random hex.
 * Lowercase, replace non-alphanumeric runs with single hyphen, cap at 50 chars.
 */
export function generateDeckId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  const hex = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  return `${slug}-${hex}`;
}

/**
 * Parse raw Anki note rows into SimpleCard[].
 *
 * - Fields are separated by `\x1f` (ASCII 31, unit separator).
 * - First field = front, second = back.
 * - `[sound:filename]` patterns in either field → card.audio = filename.
 * - `<img src="filename">` patterns in either field → card.image = filename.
 * - Notes with fewer than 2 fields are skipped.
 */
export function parseAnkiNotes(rows: AnkiNoteRow[], deckId: string): SimpleCard[] {
  const cards: SimpleCard[] = [];

  for (const row of rows) {
    const fields = row.flds.split('\x1f');
    if (fields.length < 2) continue;

    const rawFront = fields[0];
    const rawBack = fields[1];

    // Extract [sound:filename] from either field before stripping HTML
    let audio: string | undefined;
    const soundMatch = (rawFront + rawBack).match(/\[sound:([^\]]+)\]/);
    if (soundMatch) {
      audio = soundMatch[1];
    }

    // Extract <img src="filename"> from either field before stripping HTML
    let image: string | undefined;
    const imgMatch = (rawFront + rawBack).match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (imgMatch) {
      image = imgMatch[1];
    }

    // Strip HTML + sound/image markup from the text
    const front = stripHtml(rawFront.replace(/\[sound:[^\]]+\]/g, ''));
    const back = stripHtml(rawBack.replace(/\[sound:[^\]]+\]/g, ''));

    if (!front && !back) continue;

    const card: SimpleCard = {
      id: String(row.id),
      front,
      back,
      deckId,
    };
    if (audio) card.audio = audio;
    if (image) card.image = image;

    cards.push(card);
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Async import pipeline
// ---------------------------------------------------------------------------

/**
 * Full .apkg import pipeline:
 * 1. Copy .apkg to cache dir
 * 2. Unzip
 * 3. Open SQLite DB (collection.anki2 or collection.anki21)
 * 4. Read deck name from `col` table
 * 5. Query `notes` table
 * 6. Parse into SimpleCard[]
 * 7. Copy media files, update audio/image refs
 * 8. Save deck.json + register in importedDeckStore
 * 9. Clean up temp files
 *
 * @param sourceUri - content:// or file:// URI of the picked .apkg
 * @param onProgress - optional progress callback
 * @returns The ImportedDeckMeta for the newly imported deck
 */
export async function importApkg(
  sourceUri: string,
  onProgress?: ProgressCallback,
): Promise<ImportedDeckMeta> {
  const cacheDirName = `apkg-import-${Date.now()}`;
  const cacheDir = new Directory(Paths.cache, cacheDirName);

  try {
    // -----------------------------------------------------------------------
    // 1. Copy .apkg to cache
    // -----------------------------------------------------------------------
    onProgress?.('Copying file…', 0);
    cacheDir.create();
    const apkgFile = new File(cacheDir, 'deck.apkg');
    // Copy source file to our cache directory
    const sourceFile = new File(sourceUri);
    sourceFile.copy(apkgFile);

    // -----------------------------------------------------------------------
    // 2. Unzip
    // -----------------------------------------------------------------------
    onProgress?.('Extracting archive…', 10);
    const unzipDir = new Directory(cacheDir, 'unzipped');
    unzipDir.create();
    const { unzip } = await import('react-native-zip-archive');
    await unzip(apkgFile.uri, unzipDir.uri);

    // -----------------------------------------------------------------------
    // 3. Open SQLite DB
    // -----------------------------------------------------------------------
    onProgress?.('Reading database…', 20);

    // Anki uses collection.anki2 (schema 1) or collection.anki21 (schema 2).
    // NOTE: expo-sqlite's openDatabaseAsync in SDK 55 is designed for
    // app-scoped databases. Opening an arbitrary file path may require
    // special handling. We try the full path directly.
    const anki21 = new File(unzipDir, 'collection.anki21');
    const anki2 = new File(unzipDir, 'collection.anki2');
    const dbPath = anki21.exists ? anki21.uri : anki2.uri;

    // Dynamic import to avoid bundling WASM on web
    const { openDatabaseAsync } = await import('expo-sqlite');
    const db = await openDatabaseAsync(dbPath);

    // -----------------------------------------------------------------------
    // 4. Get deck name from `col` table
    // -----------------------------------------------------------------------
    onProgress?.('Reading deck info…', 30);
    let deckName = 'Imported Deck';
    try {
      const colRow = await db.getFirstAsync<{ decks: string }>(
        'SELECT decks FROM col LIMIT 1',
      );
      if (colRow?.decks) {
        const decksObj = JSON.parse(colRow.decks) as Record<
          string,
          { name: string }
        >;
        const entries = Object.values(decksObj);
        const nonDefault = entries.find((d) => d.name !== 'Default');
        deckName = nonDefault?.name ?? entries[0]?.name ?? deckName;
      }
    } catch {
      // col table may not exist in all schema versions — use fallback name
    }

    const deckId = generateDeckId(deckName);

    // -----------------------------------------------------------------------
    // 5. Query notes
    // -----------------------------------------------------------------------
    onProgress?.('Parsing cards…', 40);
    const noteRows = await db.getAllAsync<AnkiNoteRow>(
      'SELECT id, flds, mid FROM notes',
    );

    await db.closeAsync();

    // -----------------------------------------------------------------------
    // 6. Parse into SimpleCard[]
    // -----------------------------------------------------------------------
    onProgress?.('Processing cards…', 50);
    const cards = parseAnkiNotes(noteRows, deckId);

    // -----------------------------------------------------------------------
    // 7. Copy media files
    // -----------------------------------------------------------------------
    onProgress?.('Copying media…', 60);
    const deckMediaDir = new Directory(Paths.document, 'imported-decks', deckId, 'media');
    deckMediaDir.create();

    // Anki stores a JSON mapping file: { "0": "audio.mp3", "1": "image.jpg", … }
    let mediaMap: Record<string, string> = {};
    const mediaJsonFile = new File(unzipDir, 'media');
    if (mediaJsonFile.exists) {
      try {
        const raw = await mediaJsonFile.text();
        mediaMap = JSON.parse(raw) as Record<string, string>;
      } catch {
        // media file may be corrupt or missing — proceed without media
      }
    }

    // Copy each numbered media file → named file in deck media dir
    const mediaNameSet = new Set(Object.values(mediaMap));
    for (const [numericName, realName] of Object.entries(mediaMap)) {
      const src = new File(unzipDir, numericName);
      if (src.exists) {
        const dst = new File(deckMediaDir, realName);
        src.copy(dst);
      }
    }

    // Update card audio/image refs to file:// URIs
    for (const card of cards) {
      if (card.audio && mediaNameSet.has(card.audio)) {
        card.audio = new File(deckMediaDir, card.audio).uri;
      } else {
        delete card.audio;
      }
      if (card.image && mediaNameSet.has(card.image)) {
        card.image = new File(deckMediaDir, card.image).uri;
      } else {
        delete card.image;
      }
    }

    // -----------------------------------------------------------------------
    // 8. Save deck.json and register
    // -----------------------------------------------------------------------
    onProgress?.('Saving deck…', 90);
    const deckJsonFile = new File(Paths.document, 'imported-decks', deckId, 'deck.json');
    deckJsonFile.create();
    await deckJsonFile.write(JSON.stringify(cards));

    const meta: ImportedDeckMeta = {
      id: deckId,
      name: deckName,
      cardCount: cards.length,
      importedAt: new Date().toISOString(),
      sizeBytes: deckJsonFile.size ?? 0,
    };

    saveImportedDeck(meta);

    // -----------------------------------------------------------------------
    // 9. Clean up temp files
    // -----------------------------------------------------------------------
    onProgress?.('Cleaning up…', 95);
    cacheDir.delete();

    onProgress?.('Done', 100);
    return meta;
  } catch (error) {
    // Best-effort cleanup on failure
    try { cacheDir.delete(); } catch { /* ignore */ }
    throw error;
  }
}
