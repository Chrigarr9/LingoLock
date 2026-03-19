/**
 * .apkg Importer — Web platform implementation
 *
 * Uses JSZip (pure JS) for ZIP extraction and sql.js (SQLite WASM) for
 * database parsing. Cards and media stored in IndexedDB (no size limits).
 * Pure parsing functions live in apkgParser.ts (shared with native).
 */
import JSZip from 'jszip';
// @ts-ignore — sql.js has no type declarations
import initSqlJs from 'sql.js';

import type { ImportedDeckMeta } from '../types/simpleCard';
import { saveImportedDeck, saveImportedDeckCards, saveMediaBlob, getMediaBlobUrl } from './importedDeckStore';
import { generateDeckId, parseAnkiNotes } from './apkgParser';
import type { AnkiNoteRow } from './apkgParser';

// Re-export shared parser functions for consumers that import from apkgImporter
export { stripHtml, generateDeckId, parseAnkiNotes } from './apkgParser';
export type { AnkiNoteRow } from './apkgParser';
export type ProgressCallback = (stage: string, pct: number) => void;

/**
 * Full .apkg import pipeline (web):
 * 1. Fetch file as ArrayBuffer → 2. Unzip with JSZip
 * 3. Parse SQLite with sql.js (WASM from CDN) → 4. Extract cards
 * 5. Store media as Blobs in IndexedDB → 6. Store cards in IndexedDB
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

  onProgress?.('Loading SQLite engine…', 15);
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

  const cardsWithImage = cards.filter(c => c.image);
  const cardsWithAudio = cards.filter(c => c.audio);
  console.log(`[Import] Parsed ${cards.length} cards: ${cardsWithImage.length} with image, ${cardsWithAudio.length} with audio`);

  // Parse media mapping and store media as Blobs in IndexedDB
  onProgress?.('Processing media…', 50);
  let mediaMap: Record<string, string> = {};
  const mediaFile = zip.file('media');
  if (mediaFile) {
    try { mediaMap = JSON.parse(await mediaFile.async('text')); } catch { /* skip */ }
  }

  const mediaNames = new Set(Object.values(mediaMap));
  let mediaProcessed = 0;
  const mediaTotal = Object.keys(mediaMap).length;
  const audioFiles = [...mediaNames].filter(n => /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(n));
  console.log(`[Import] Media: ${mediaTotal} files (${audioFiles.length} audio)`);

  for (const [numericName, realName] of Object.entries(mediaMap)) {
    const entry = zip.file(numericName);
    if (entry) {
      try {
        const data = await entry.async('arraybuffer');
        const ext = realName.split('.').pop()?.toLowerCase() ?? '';
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
          gif: 'image/gif', webp: 'image/webp',
          mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
        };
        const mime = mimeMap[ext] ?? 'application/octet-stream';
        const blob = new Blob([data], { type: mime });
        await saveMediaBlob(deckId, realName, blob);
      } catch { /* skip individual media files */ }
    }
    mediaProcessed++;
    if (mediaTotal > 0) {
      const pct = 50 + Math.round((mediaProcessed / mediaTotal) * 35);
      onProgress?.(`Processing media… ${mediaProcessed}/${mediaTotal}`, pct);
    }
  }

  // Resolve media references on cards to IndexedDB markers
  let matchedImages = 0, matchedAudio = 0, unmatchedImages = 0, unmatchedAudio = 0;
  for (const card of cards) {
    if (card.audio) {
      if (mediaNames.has(card.audio)) {
        card.audio = `idb://${deckId}/${card.audio}`;
        matchedAudio++;
      } else {
        unmatchedAudio++;
        delete card.audio;
      }
    }
    if (card.image) {
      if (mediaNames.has(card.image)) {
        card.image = `idb://${deckId}/${card.image}`;
        matchedImages++;
      } else {
        unmatchedImages++;
        delete card.image;
      }
    }
  }
  console.log(`[Import] Final: ${matchedImages} images, ${matchedAudio} audio`);

  // Save cards to IndexedDB
  onProgress?.('Saving deck…', 90);
  await saveImportedDeckCards(deckId, cards);

  const sizeBytes = JSON.stringify(cards).length;

  const meta: ImportedDeckMeta = {
    id: deckId, name: deckName, cardCount: cards.length,
    importedAt: new Date().toISOString(), sizeBytes,
  };

  saveImportedDeck(meta);
  onProgress?.('Done', 100);
  return meta;
}
