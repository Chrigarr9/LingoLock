/**
 * .apkg Importer — Native platform implementation
 *
 * Uses expo-file-system, expo-sqlite, and react-native-zip-archive.
 * Pure parsing functions live in apkgParser.ts (shared with web).
 */
import { Directory, File, Paths } from 'expo-file-system';

import type { ImportedDeckMeta } from '../types/simpleCard';
import { saveImportedDeck } from './importedDeckStore';
import { generateDeckId, parseAnkiNotes } from './apkgParser';
import type { AnkiNoteRow } from './apkgParser';

// Re-export shared parser functions for consumers that import from apkgImporter
export { stripHtml, generateDeckId, parseAnkiNotes } from './apkgParser';
export type { AnkiNoteRow } from './apkgParser';
export type ProgressCallback = (stage: string, pct: number) => void;

/**
 * Full .apkg import pipeline (native):
 * 1. Copy .apkg to cache → 2. Unzip → 3. Open SQLite DB
 * 4. Read deck name → 5. Query notes → 6. Parse cards
 * 7. Copy media → 8. Save deck.json → 9. Cleanup
 */
export async function importApkg(
  sourceUri: string,
  onProgress?: ProgressCallback,
): Promise<ImportedDeckMeta> {
  const cacheDirName = `apkg-import-${Date.now()}`;
  const cacheDir = new Directory(Paths.cache, cacheDirName);

  try {
    onProgress?.('Copying file…', 0);
    cacheDir.create();
    const apkgFile = new File(cacheDir, 'deck.apkg');
    const sourceFile = new File(sourceUri);
    sourceFile.copy(apkgFile);

    onProgress?.('Extracting archive…', 10);
    const unzipDir = new Directory(cacheDir, 'unzipped');
    unzipDir.create();
    const { unzip } = await import('react-native-zip-archive');
    await unzip(apkgFile.uri, unzipDir.uri);

    onProgress?.('Reading database…', 20);
    const anki21 = new File(unzipDir, 'collection.anki21');
    const anki2 = new File(unzipDir, 'collection.anki2');
    const dbFile = anki21.exists ? anki21 : anki2;

    // expo-sqlite's openDatabaseAsync expects (filename, options, directory) —
    // NOT a full file:// URI. Strip the scheme to get a POSIX directory path.
    const dbDir = unzipDir.uri.replace(/^file:\/\//, '');

    const { openDatabaseAsync } = await import('expo-sqlite');
    const db = await openDatabaseAsync(dbFile.name, {}, dbDir);

    onProgress?.('Reading deck info…', 30);
    let deckName = 'Imported Deck';
    try {
      const colRow = await db.getFirstAsync<{ decks: string }>(
        'SELECT decks FROM col LIMIT 1',
      );
      if (colRow?.decks) {
        const decksObj = JSON.parse(colRow.decks) as Record<string, { name: string }>;
        const entries = Object.values(decksObj);
        const nonDefault = entries.find((d) => d.name !== 'Default');
        deckName = nonDefault?.name ?? entries[0]?.name ?? deckName;
      }
    } catch (e) {
      console.warn('[ApkgImporter] Could not read deck name from col table, using default:', e);
    }

    const deckId = generateDeckId(deckName);

    onProgress?.('Parsing cards…', 40);
    const noteRows = await db.getAllAsync<AnkiNoteRow>('SELECT id, flds, mid FROM notes');
    await db.closeAsync();

    onProgress?.('Processing cards…', 50);
    const cards = parseAnkiNotes(noteRows, deckId);

    onProgress?.('Copying media…', 60);
    const deckMediaDir = new Directory(Paths.document, 'imported-decks', deckId, 'media');
    deckMediaDir.create();

    let mediaMap: Record<string, string> = {};
    const mediaJsonFile = new File(unzipDir, 'media');
    if (mediaJsonFile.exists) {
      try {
        const raw = await mediaJsonFile.text();
        mediaMap = JSON.parse(raw) as Record<string, string>;
      } catch (e) {
        console.warn('[ApkgImporter] Failed to parse media mapping, continuing without media:', e);
        onProgress?.('Warning: media mapping unreadable', 65);
      }
    }

    const mediaNameSet = new Set(Object.values(mediaMap));
    for (const [numericName, realName] of Object.entries(mediaMap)) {
      const src = new File(unzipDir, numericName);
      if (src.exists) {
        src.copy(new File(deckMediaDir, realName));
      }
    }

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
    onProgress?.('Done', 100);
    return meta;
  } catch (error) {
    try { cacheDir.delete(); } catch { /* ignore */ }
    throw error;
  }
}
