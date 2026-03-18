/**
 * Tests for apkgImporter pure utility functions
 *
 * Only tests stripHtml, generateDeckId, and parseAnkiNotes — the synchronous
 * functions that don't need filesystem or SQLite access.
 *
 * Mocks: expo-file-system, react-native-zip-archive, expo-sqlite,
 *        importedDeckStore (all needed to avoid native module errors on import)
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

jest.mock('expo-file-system', () => ({}));
jest.mock('react-native-zip-archive', () => ({ unzip: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('./importedDeckStore', () => ({
  saveImportedDeck: jest.fn(),
  getImportedDeckDir: jest.fn(),
  getImportedDecksBaseDir: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { stripHtml, generateDeckId, parseAnkiNotes, AnkiNoteRow } from './apkgImporter';

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes simple HTML tags', () => {
    expect(stripHtml('<b>hello</b>')).toBe('hello');
    expect(stripHtml('<div class="x">text</div>')).toBe('text');
  });

  it('converts <br> variants to newline', () => {
    expect(stripHtml('line1<br>line2')).toBe('line1\nline2');
    expect(stripHtml('line1<br/>line2')).toBe('line1\nline2');
    expect(stripHtml('line1<br />line2')).toBe('line1\nline2');
    expect(stripHtml('line1<BR>line2')).toBe('line1\nline2');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('&amp; &lt; &gt; &quot; &#39;')).toBe('& < > " \'');
  });

  it('decodes &nbsp; to space', () => {
    expect(stripHtml('hello&nbsp;world')).toBe('hello world');
  });

  it('trims whitespace', () => {
    expect(stripHtml('  <p> hello </p>  ')).toBe('hello');
  });

  it('handles empty and plain strings', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml('plain text')).toBe('plain text');
  });

  it('handles nested tags', () => {
    expect(stripHtml('<div><b>bold</b> and <i>italic</i></div>')).toBe('bold and italic');
  });
});

// ---------------------------------------------------------------------------
// generateDeckId
// ---------------------------------------------------------------------------

describe('generateDeckId', () => {
  it('slugifies the name to lowercase', () => {
    const id = generateDeckId('My Deck');
    expect(id).toMatch(/^my-deck-[0-9a-f]{4}$/);
  });

  it('replaces non-alphanumeric characters with hyphens', () => {
    const id = generateDeckId('Español: A1 (beginner)');
    // Should collapse all non-alnum runs into single hyphens
    expect(id).toMatch(/^espa-ol-a1-beginner-[0-9a-f]{4}$/);
  });

  it('trims leading and trailing hyphens from slug', () => {
    const id = generateDeckId('---hello---');
    expect(id).toMatch(/^hello-[0-9a-f]{4}$/);
  });

  it('caps slug at 50 characters (before hex suffix)', () => {
    const longName = 'a'.repeat(100);
    const id = generateDeckId(longName);
    // slug (50) + '-' (1) + hex (4) = 55
    expect(id.length).toBeLessThanOrEqual(55);
    const slug = id.slice(0, -5); // remove "-XXXX"
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it('appends a 4-char hex suffix', () => {
    const id = generateDeckId('test');
    const hex = id.slice(-4);
    expect(hex).toMatch(/^[0-9a-f]{4}$/);
  });

  it('generates different IDs for the same name (randomness)', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateDeckId('same')));
    // With 16^4 = 65536 possibilities, 20 calls should almost certainly be unique
    expect(ids.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// parseAnkiNotes
// ---------------------------------------------------------------------------

describe('parseAnkiNotes', () => {
  const UNIT_SEP = '\x1f';

  const makeRow = (id: number, front: string, back: string, extra?: string): AnkiNoteRow => ({
    id,
    flds: extra ? `${front}${UNIT_SEP}${back}${UNIT_SEP}${extra}` : `${front}${UNIT_SEP}${back}`,
    mid: 1000,
  });

  it('parses basic front/back fields', () => {
    const rows = [makeRow(1, 'hola', 'hello')];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      id: '1',
      front: 'hola',
      back: 'hello',
      deckId: 'deck-1',
    });
  });

  it('strips HTML from fields', () => {
    const rows = [makeRow(2, '<b>gato</b>', '<i>cat</i>')];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards[0].front).toBe('gato');
    expect(cards[0].back).toBe('cat');
  });

  it('extracts [sound:filename] into card.audio', () => {
    const rows = [makeRow(3, 'perro[sound:perro.mp3]', 'dog')];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards[0].audio).toBe('perro.mp3');
    expect(cards[0].front).toBe('perro');
  });

  it('extracts sound from back field too', () => {
    const rows = [makeRow(4, 'casa', 'house[sound:house.mp3]')];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards[0].audio).toBe('house.mp3');
  });

  it('extracts <img src="filename"> into card.image', () => {
    const rows = [makeRow(5, '<img src="cat.jpg">gato', 'cat')];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards[0].image).toBe('cat.jpg');
    expect(cards[0].front).toBe('gato');
  });

  it('handles img with single quotes', () => {
    const rows = [makeRow(6, "gato<img src='cat.png'>", 'cat')];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards[0].image).toBe('cat.png');
  });

  it('skips notes with fewer than 2 fields', () => {
    const rows: AnkiNoteRow[] = [
      { id: 7, flds: 'only-one-field', mid: 1000 },
    ];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards).toHaveLength(0);
  });

  it('uses note id as card id (not prefixed with deckId)', () => {
    const rows = [makeRow(42, 'a', 'b')];
    const cards = parseAnkiNotes(rows, 'my-deck-abcd');

    expect(cards[0].id).toBe('42');
    expect(cards[0].deckId).toBe('my-deck-abcd');
  });

  it('handles extra fields beyond front/back (ignores them)', () => {
    const rows = [makeRow(8, 'uno', 'one', 'extra-field')];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('uno');
    expect(cards[0].back).toBe('one');
  });

  it('handles both sound and image in same note', () => {
    const rows: AnkiNoteRow[] = [
      {
        id: 9,
        flds: `<img src="pic.jpg">word[sound:audio.mp3]${UNIT_SEP}translation`,
        mid: 1000,
      },
    ];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards[0].audio).toBe('audio.mp3');
    expect(cards[0].image).toBe('pic.jpg');
    expect(cards[0].front).toBe('word');
  });

  it('parses multiple rows', () => {
    const rows = [
      makeRow(10, 'hola', 'hello'),
      makeRow(11, 'adiós', 'goodbye'),
      makeRow(12, 'gracias', 'thanks'),
    ];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.front)).toEqual(['hola', 'adiós', 'gracias']);
  });

  it('handles entities in fields', () => {
    const rows = [makeRow(13, 'A &amp; B', 'C &lt; D')];
    const cards = parseAnkiNotes(rows, 'deck-1');

    expect(cards[0].front).toBe('A & B');
    expect(cards[0].back).toBe('C < D');
  });
});
