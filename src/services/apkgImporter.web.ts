/**
 * .apkg Importer — Web platform implementation
 *
 * Uses JSZip (pure JS) for ZIP extraction and sql.js (SQLite WASM) for
 * database parsing. Media stored as base64 data URIs in localStorage.
 * Pure parsing functions live in apkgParser.ts (shared with native).
 */
import JSZip from 'jszip';
// @ts-ignore — sql.js has no type declarations
import initSqlJs from 'sql.js';

import type { ImportedDeckMeta } from '../types/simpleCard';
import { saveImportedDeck } from './importedDeckStore';
import { generateDeckId, parseAnkiNotes } from './apkgParser';
import type { AnkiNoteRow } from './apkgParser';

// Re-export shared parser functions for consumers that import from apkgImporter
export { stripHtml, generateDeckId, parseAnkiNotes } from './apkgParser';
export type { AnkiNoteRow } from './apkgParser';
export type ProgressCallback = (stage: string, pct: number) => void;

// ---------------------------------------------------------------------------
// Web-specific constants
// ---------------------------------------------------------------------------

const IMPORTED_DECK_PREFIX = 'll.imported.';

// ---------------------------------------------------------------------------
// Web import pipeline
// ---------------------------------------------------------------------------

/**
 * Full .apkg import pipeline (web):
 * 1. Fetch file as ArrayBuffer → 2. Unzip with JSZip
 * 3. Parse SQLite with sql.js (WASM from CDN) → 4. Extract cards + media
 * 5. Store in localStorage
 */
export async function importApkg(
  sourceUri: string,
  onProgress?: ProgressCallback,
): Promise<ImportedDeckMeta> {
  onProgress?.('Reading file…', 0);
  const response = await fetch(sourceUri);
  const arrayBuffer = await response.arrayBuffer();

  onProgress?.('Extracting archive…', 10);
  const zip = await JSZip.loadAsync(arrayBuffer);

  onProgress?.('Reading database…', 20);
  const dbFile = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!dbFile) throw new Error('Invalid .apkg file: no Anki database found');

  const dbBuffer = await dbFile.async('arraybuffer');
  const SQL = await initSqlJs({
    locateFile: () => 'https://sql.js.org/dist/sql-wasm.wasm',
  });
  const db = new SQL.Database(new Uint8Array(dbBuffer));

  onProgress?.('Reading deck info…', 30);
  let deckName = 'Imported Deck';
  try {
    const colResult = db.exec('SELECT decks FROM col LIMIT 1');
    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const decksJson = colResult[0].values[0][0] as string;
      const decksObj = JSON.parse(decksJson) as Record<string, { name: string }>;
      const entries = Object.values(decksObj);
      const nonDefault = entries.find((d: { name: string }) => d.name !== 'Default');
      deckName = nonDefault?.name ?? entries[0]?.name ?? deckName;
    }
  } catch { /* fallback */ }

  const deckId = generateDeckId(deckName);

  onProgress?.('Parsing cards…', 40);
  const notesResult = db.exec('SELECT id, flds, mid FROM notes');
  db.close();

  if (notesResult.length === 0 || notesResult[0].values.length === 0) {
    throw new Error('This deck appears to be empty');
  }

  const noteRows: AnkiNoteRow[] = notesResult[0].values.map((row: any[]) => ({
    id: row[0] as number, flds: row[1] as string, mid: row[2] as number,
  }));

  const cards = parseAnkiNotes(noteRows, deckId);
  if (cards.length === 0) throw new Error('No valid cards found in deck');

  // Media: skip on web — localStorage has a ~5MB limit and base64-encoded
  // audio/images easily exceed it. Cards are text-only on web.
  onProgress?.('Processing cards…', 60);
  for (const card of cards) {
    delete card.audio;
    delete card.image;
  }

  onProgress?.('Saving deck…', 90);
  localStorage.setItem(`${IMPORTED_DECK_PREFIX}${deckId}`, JSON.stringify(cards));

  const cardsJson = JSON.stringify(cards);
  const sizeBytes = cardsJson.length;

  const meta: ImportedDeckMeta = {
    id: deckId, name: deckName, cardCount: cards.length,
    importedAt: new Date().toISOString(), sizeBytes,
  };

  saveImportedDeck(meta);
  onProgress?.('Done', 100);
  return meta;
}
