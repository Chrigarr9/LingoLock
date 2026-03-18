/**
 * Tests for importedDeckStore service
 * Registry CRUD (MMKV) + filesystem loader
 *
 * Mocks: storage.ts (statsStorage), expo-file-system (File, Directory, Paths)
 */

// ---------------------------------------------------------------------------
// Mock state — shared between expo-file-system mock and tests
// ---------------------------------------------------------------------------

/** In-memory filesystem: uri → content string */
const mockFS = new Map<string, string>();
/** Track which directories "exist" */
const mockDirs = new Set<string>();
/** Track deleted directories for assertions */
const deletedDirs: string[] = [];

// ---------------------------------------------------------------------------
// Mock expo-file-system
// ---------------------------------------------------------------------------

const MOCK_DOC_DIR = 'file:///mock/documents';

jest.mock('expo-file-system', () => {
  const MockPaths = {
    document: { uri: MOCK_DOC_DIR },
    join: (...parts: Array<string | { uri: string }>) =>
      parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/'),
  };

  class MockFile {
    uri: string;
    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = MockPaths.join(...uris);
    }
    get exists() {
      return mockFS.has(this.uri);
    }
    async text() {
      const content = mockFS.get(this.uri);
      if (content === undefined) throw new Error(`ENOENT: ${this.uri}`);
      return content;
    }
  }

  class MockDirectory {
    uri: string;
    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = MockPaths.join(...uris);
    }
    get exists() {
      return mockDirs.has(this.uri);
    }
    delete() {
      mockDirs.delete(this.uri);
      deletedDirs.push(this.uri);
      // Also remove any files under this directory
      for (const key of mockFS.keys()) {
        if (key.startsWith(this.uri + '/')) {
          mockFS.delete(key);
        }
      }
    }
    create() {
      mockDirs.add(this.uri);
    }
  }

  return {
    Paths: MockPaths,
    File: MockFile,
    Directory: MockDirectory,
  };
});

// ---------------------------------------------------------------------------
// Mock storage (uses the real MMKV mock from __mocks__)
// ---------------------------------------------------------------------------

// We don't mock storage entirely — we let it use the real createMMKV mock
// which is an in-memory Map. This tests the actual MMKV interaction.

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  getImportedDecks,
  saveImportedDeck,
  removeImportedDeck,
  getImportedDecksBaseDir,
  getImportedDeckDir,
  loadImportedDeckCards,
} from './importedDeckStore';
import { statsStorage } from './storage';
import type { ImportedDeckMeta, SimpleCard } from '../types/simpleCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMeta(overrides: Partial<ImportedDeckMeta> = {}): ImportedDeckMeta {
  return {
    id: 'test-deck-abc123',
    name: 'Test Deck',
    cardCount: 42,
    importedAt: '2026-03-18T12:00:00.000Z',
    sizeBytes: 1024,
    ...overrides,
  };
}

function makeCard(overrides: Partial<SimpleCard> = {}): SimpleCard {
  return {
    id: '1',
    front: 'hello',
    back: 'hola',
    deckId: 'test-deck-abc123',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  statsStorage.clearAll();
  mockFS.clear();
  mockDirs.clear();
  deletedDirs.length = 0;
});

// ---------------------------------------------------------------------------
// Tests: Path helpers
// ---------------------------------------------------------------------------

describe('getImportedDecksBaseDir', () => {
  it('returns the base directory path under document directory', () => {
    const baseDir = getImportedDecksBaseDir();
    expect(baseDir).toBe(`${MOCK_DOC_DIR}/imported-decks`);
  });
});

describe('getImportedDeckDir', () => {
  it('returns the deck-specific directory path', () => {
    const deckDir = getImportedDeckDir('my-deck-xyz');
    expect(deckDir).toBe(`${MOCK_DOC_DIR}/imported-decks/my-deck-xyz`);
  });
});

// ---------------------------------------------------------------------------
// Tests: Registry CRUD
// ---------------------------------------------------------------------------

describe('getImportedDecks', () => {
  it('returns empty array when no decks are registered', () => {
    expect(getImportedDecks()).toEqual([]);
  });

  it('returns empty array when stored JSON is invalid', () => {
    statsStorage.set('importedDecks', 'not-valid-json{{{');
    expect(getImportedDecks()).toEqual([]);
  });

  it('returns parsed decks from MMKV', () => {
    const meta = makeMeta();
    statsStorage.set('importedDecks', JSON.stringify([meta]));
    expect(getImportedDecks()).toEqual([meta]);
  });
});

describe('saveImportedDeck', () => {
  it('adds a deck to an empty registry', () => {
    const meta = makeMeta();
    saveImportedDeck(meta);
    expect(getImportedDecks()).toEqual([meta]);
  });

  it('appends a second deck without removing the first', () => {
    const meta1 = makeMeta({ id: 'deck-1', name: 'Deck 1' });
    const meta2 = makeMeta({ id: 'deck-2', name: 'Deck 2' });
    saveImportedDeck(meta1);
    saveImportedDeck(meta2);
    const decks = getImportedDecks();
    expect(decks).toHaveLength(2);
    expect(decks.map((d) => d.id)).toEqual(['deck-1', 'deck-2']);
  });

  it('replaces an existing deck with the same id', () => {
    const meta = makeMeta({ id: 'deck-1', name: 'Original' });
    saveImportedDeck(meta);
    const updated = makeMeta({ id: 'deck-1', name: 'Updated', cardCount: 100 });
    saveImportedDeck(updated);
    const decks = getImportedDecks();
    expect(decks).toHaveLength(1);
    expect(decks[0].name).toBe('Updated');
    expect(decks[0].cardCount).toBe(100);
  });
});

describe('removeImportedDeck', () => {
  it('removes a deck from the registry', () => {
    saveImportedDeck(makeMeta({ id: 'deck-1' }));
    saveImportedDeck(makeMeta({ id: 'deck-2' }));
    removeImportedDeck('deck-1');
    const decks = getImportedDecks();
    expect(decks).toHaveLength(1);
    expect(decks[0].id).toBe('deck-2');
  });

  it('deletes the filesystem directory when it exists', () => {
    const deckDir = getImportedDeckDir('deck-1');
    mockDirs.add(deckDir);
    saveImportedDeck(makeMeta({ id: 'deck-1' }));
    removeImportedDeck('deck-1');
    expect(deletedDirs).toContain(deckDir);
    expect(mockDirs.has(deckDir)).toBe(false);
  });

  it('does not throw when the directory does not exist on disk', () => {
    saveImportedDeck(makeMeta({ id: 'deck-1' }));
    expect(() => removeImportedDeck('deck-1')).not.toThrow();
  });

  it('handles removing a deck that is not in the registry', () => {
    expect(() => removeImportedDeck('nonexistent')).not.toThrow();
    expect(getImportedDecks()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: Filesystem loader
// ---------------------------------------------------------------------------

describe('loadImportedDeckCards', () => {
  it('reads and parses deck.json from the deck directory', async () => {
    const cards: SimpleCard[] = [
      makeCard({ id: '1', front: 'hello', back: 'hola' }),
      makeCard({ id: '2', front: 'goodbye', back: 'adios' }),
    ];
    const deckJsonPath = `${MOCK_DOC_DIR}/imported-decks/test-deck-abc123/deck.json`;
    mockFS.set(deckJsonPath, JSON.stringify(cards));

    const result = await loadImportedDeckCards('test-deck-abc123');
    expect(result).toEqual(cards);
    expect(result).toHaveLength(2);
  });

  it('throws when deck.json does not exist', async () => {
    await expect(loadImportedDeckCards('nonexistent')).rejects.toThrow(
      /Deck file not found/,
    );
  });

  it('throws when deck.json contains invalid JSON', async () => {
    const deckJsonPath = `${MOCK_DOC_DIR}/imported-decks/bad-deck/deck.json`;
    mockFS.set(deckJsonPath, '{invalid json!!!');

    await expect(loadImportedDeckCards('bad-deck')).rejects.toThrow();
  });

  it('returns cards with optional image and audio fields', async () => {
    const cards: SimpleCard[] = [
      makeCard({
        id: '1',
        front: 'cat',
        back: 'gato',
        image: 'file:///images/cat.jpg',
        audio: 'file:///audio/cat.mp3',
      }),
    ];
    const deckJsonPath = `${MOCK_DOC_DIR}/imported-decks/media-deck/deck.json`;
    mockFS.set(deckJsonPath, JSON.stringify(cards));

    const result = await loadImportedDeckCards('media-deck');
    expect(result[0].image).toBe('file:///images/cat.jpg');
    expect(result[0].audio).toBe('file:///audio/cat.mp3');
  });
});
