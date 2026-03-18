/**
 * .apkg Importer — Web platform implementation
 *
 * Uses JSZip (pure JS) for ZIP extraction and sql.js (SQLite compiled to WASM)
 * for database parsing. Media files are stored as base64 data URIs in localStorage.
 * The sql.js WASM binary loads on-demand from CDN only when import is triggered.
 */
import JSZip from 'jszip';
// @ts-ignore — sql.js has no type declarations
import initSqlJs from 'sql.js';

import type { SimpleCard, ImportedDeckMeta } from '../types/simpleCard';
import { saveImportedDeck } from './importedDeckStore';

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
// Pure utility functions (same as native — duplicated to avoid import issues)
// ---------------------------------------------------------------------------

export function stripHtml(html: string): string {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return text.trim();
}

export function generateDeckId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const hex = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  return `${slug}-${hex}`;
}

export function parseAnkiNotes(rows: AnkiNoteRow[], deckId: string): SimpleCard[] {
  const cards: SimpleCard[] = [];

  for (const row of rows) {
    const fields = row.flds.split('\x1f');
    if (fields.length < 2) continue;

    const rawFront = fields[0];
    const rawBack = fields[1];

    let audio: string | undefined;
    const soundMatch = (rawFront + rawBack).match(/\[sound:([^\]]+)\]/);
    if (soundMatch) audio = soundMatch[1];

    let image: string | undefined;
    const imgMatch = (rawFront + rawBack).match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (imgMatch) image = imgMatch[1];

    const front = stripHtml(rawFront.replace(/\[sound:[^\]]+\]/g, ''));
    const back = stripHtml(rawBack.replace(/\[sound:[^\]]+\]/g, ''));

    if (!front && !back) continue;

    const card: SimpleCard = { id: String(row.id), front, back, deckId };
    if (audio) card.audio = audio;
    if (image) card.image = image;

    cards.push(card);
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Web import pipeline
// ---------------------------------------------------------------------------

const IMPORTED_DECK_PREFIX = 'll.imported.';
const IMPORTED_MEDIA_PREFIX = 'll.media.';

/**
 * Convert an ArrayBuffer to a base64 data URI.
 */
function arrayBufferToDataUri(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Guess MIME type from filename extension.
 */
function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
    m4a: 'audio/mp4', mp4: 'video/mp4',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

/**
 * Full .apkg import pipeline for web:
 * 1. Read file as ArrayBuffer via fetch
 * 2. Unzip with JSZip
 * 3. Parse SQLite DB with sql.js (WASM loaded from CDN on first use)
 * 4. Extract cards + media
 * 5. Store cards in localStorage, media as data URIs
 */
export async function importApkg(
  sourceUri: string,
  onProgress?: ProgressCallback,
): Promise<ImportedDeckMeta> {
  onProgress?.('Reading file…', 0);

  // Fetch the file (sourceUri is a blob: or data: URL from DocumentPicker on web)
  const response = await fetch(sourceUri);
  const arrayBuffer = await response.arrayBuffer();

  // Unzip
  onProgress?.('Extracting archive…', 10);
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Find and parse SQLite DB
  onProgress?.('Reading database…', 20);
  const dbFile = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!dbFile) {
    throw new Error('Invalid .apkg file: no Anki database found');
  }

  const dbBuffer = await dbFile.async('arraybuffer');

  // Load sql.js WASM from CDN (cached by browser after first load)
  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
  });

  const db = new SQL.Database(new Uint8Array(dbBuffer));

  // Get deck name
  onProgress?.('Reading deck info…', 30);
  let deckName = 'Imported Deck';
  try {
    const colResult = db.exec('SELECT decks FROM col LIMIT 1');
    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const decksJson = colResult[0].values[0][0] as string;
      const decksObj = JSON.parse(decksJson) as Record<string, { name: string }>;
      const entries = Object.values(decksObj);
      const nonDefault = entries.find(d => d.name !== 'Default');
      deckName = nonDefault?.name ?? entries[0]?.name ?? deckName;
    }
  } catch {
    // Fallback to default name
  }

  const deckId = generateDeckId(deckName);

  // Query notes
  onProgress?.('Parsing cards…', 40);
  const notesResult = db.exec('SELECT id, flds, mid FROM notes');
  db.close();

  if (notesResult.length === 0 || notesResult[0].values.length === 0) {
    throw new Error('This deck appears to be empty');
  }

  const noteRows: AnkiNoteRow[] = notesResult[0].values.map((row: any[]) => ({
    id: row[0] as number,
    flds: row[1] as string,
    mid: row[2] as number,
  }));

  const cards = parseAnkiNotes(noteRows, deckId);
  if (cards.length === 0) {
    throw new Error('No valid cards found in deck');
  }

  // Parse media mapping
  onProgress?.('Processing media…', 60);
  let mediaMap: Record<string, string> = {};
  const mediaFile = zip.file('media');
  if (mediaFile) {
    try {
      const mediaJson = await mediaFile.async('text');
      mediaMap = JSON.parse(mediaJson);
    } catch {
      // No media mapping
    }
  }

  // Store media as base64 data URIs in localStorage
  const mediaUris: Record<string, string> = {};

  for (const [numericName, realName] of Object.entries(mediaMap)) {
    const mediaFileEntry = zip.file(numericName);
    if (mediaFileEntry) {
      try {
        const buffer = await mediaFileEntry.async('arraybuffer');
        const mime = guessMimeType(realName);
        const dataUri = arrayBufferToDataUri(buffer, mime);
        localStorage.setItem(`${IMPORTED_MEDIA_PREFIX}${deckId}.${realName}`, dataUri);
        mediaUris[realName] = dataUri;
      } catch {
        // Skip failed media files
      }
    }
  }

  // Update card media references to data URIs
  for (const card of cards) {
    if (card.audio && mediaUris[card.audio]) {
      card.audio = mediaUris[card.audio];
    } else {
      delete card.audio;
    }
    if (card.image && mediaUris[card.image]) {
      card.image = mediaUris[card.image];
    } else {
      delete card.image;
    }
  }

  // Save cards to localStorage
  onProgress?.('Saving deck…', 90);
  localStorage.setItem(`${IMPORTED_DECK_PREFIX}${deckId}`, JSON.stringify(cards));

  // Calculate approximate size
  const cardsJson = JSON.stringify(cards);
  const sizeBytes = cardsJson.length + Object.values(mediaUris).reduce((sum, uri) => sum + uri.length, 0);

  const meta: ImportedDeckMeta = {
    id: deckId,
    name: deckName,
    cardCount: cards.length,
    importedAt: new Date().toISOString(),
    sizeBytes,
  };

  saveImportedDeck(meta);

  onProgress?.('Done', 100);
  return meta;
}
