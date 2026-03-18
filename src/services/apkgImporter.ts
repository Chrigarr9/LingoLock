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
import * as FileSystem from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
import { openDatabaseAsync } from 'expo-sqlite';

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
  const cacheDir = `${FileSystem.cacheDirectory}apkg-import-${Date.now()}`;
  const apkgPath = `${cacheDir}/deck.apkg`;
  const unzipDir = `${cacheDir}/unzipped`;

  try {
    // -----------------------------------------------------------------------
    // 1. Copy .apkg to cache
    // -----------------------------------------------------------------------
    onProgress?.('Copying file…', 0);
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    await FileSystem.copyAsync({ from: sourceUri, to: apkgPath });

    // -----------------------------------------------------------------------
    // 2. Unzip
    // -----------------------------------------------------------------------
    onProgress?.('Extracting archive…', 10);
    await unzip(apkgPath, unzipDir);

    // -----------------------------------------------------------------------
    // 3. Open SQLite DB
    // -----------------------------------------------------------------------
    onProgress?.('Reading database…', 20);

    // Anki uses collection.anki2 (schema 1) or collection.anki21 (schema 2).
    // NOTE: expo-sqlite's openDatabaseAsync in SDK 55 is designed for
    // app-scoped databases. Opening an arbitrary file path may require the
    // full absolute path and could behave differently across platforms.
    // We try the path directly; if this fails a future fix may need to copy
    // the DB into the app's SQLite directory first.
    let dbPath: string;
    const anki21 = `${unzipDir}/collection.anki21`;
    const anki2 = `${unzipDir}/collection.anki2`;
    const anki21Info = await FileSystem.getInfoAsync(anki21);
    if (anki21Info.exists) {
      dbPath = anki21;
    } else {
      dbPath = anki2;
    }

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
        // Pick the first non-default deck, or fall back to any deck name
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
    const deckDir = getImportedDeckDir(deckId);
    const mediaDir = `${deckDir}/media`;
    await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true });

    // Anki stores a JSON mapping file: { "0": "audio.mp3", "1": "image.jpg", … }
    let mediaMap: Record<string, string> = {};
    const mediaJsonPath = `${unzipDir}/media`;
    const mediaJsonInfo = await FileSystem.getInfoAsync(mediaJsonPath);
    if (mediaJsonInfo.exists) {
      try {
        const raw = await FileSystem.readAsStringAsync(mediaJsonPath);
        mediaMap = JSON.parse(raw) as Record<string, string>;
      } catch {
        // media file may be corrupt or missing — proceed without media
      }
    }

    // Copy each numbered media file → named file in deck media dir
    const mediaNameSet = new Set(Object.values(mediaMap));
    for (const [numericName, realName] of Object.entries(mediaMap)) {
      const src = `${unzipDir}/${numericName}`;
      const dst = `${mediaDir}/${realName}`;
      const srcInfo = await FileSystem.getInfoAsync(src);
      if (srcInfo.exists) {
        await FileSystem.copyAsync({ from: src, to: dst });
      }
    }

    // Update card audio/image refs to file:// URIs
    for (const card of cards) {
      if (card.audio && mediaNameSet.has(card.audio)) {
        card.audio = `${mediaDir}/${card.audio}`;
      } else {
        delete card.audio;
      }
      if (card.image && mediaNameSet.has(card.image)) {
        card.image = `${mediaDir}/${card.image}`;
      } else {
        delete card.image;
      }
    }

    // -----------------------------------------------------------------------
    // 8. Save deck.json and register
    // -----------------------------------------------------------------------
    onProgress?.('Saving deck…', 90);
    const deckJsonPath = `${deckDir}/deck.json`;
    await FileSystem.writeAsStringAsync(deckJsonPath, JSON.stringify(cards));

    // Estimate size: cards JSON + media files
    const deckJsonInfo = await FileSystem.getInfoAsync(deckJsonPath);
    const sizeBytes = (deckJsonInfo.exists && 'size' in deckJsonInfo)
      ? (deckJsonInfo.size ?? 0)
      : 0;

    const meta: ImportedDeckMeta = {
      id: deckId,
      name: deckName,
      cardCount: cards.length,
      importedAt: new Date().toISOString(),
      sizeBytes,
    };

    saveImportedDeck(meta);

    // -----------------------------------------------------------------------
    // 9. Clean up temp files
    // -----------------------------------------------------------------------
    onProgress?.('Cleaning up…', 95);
    await FileSystem.deleteAsync(cacheDir, { idempotent: true });

    onProgress?.('Done', 100);
    return meta;
  } catch (error) {
    // Best-effort cleanup on failure
    try {
      await FileSystem.deleteAsync(cacheDir, { idempotent: true });
    } catch {
      // ignore cleanup errors
    }
    throw error;
  }
}
