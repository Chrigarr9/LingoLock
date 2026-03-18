/**
 * .apkg Parser — Pure utility functions for parsing Anki data.
 *
 * No native dependencies — safe for both native and web platforms.
 * Used by apkgImporter.ts (native) and apkgImporter.web.ts (web).
 */
import type { SimpleCard } from '../types/simpleCard';

export interface AnkiNoteRow {
  id: number;
  flds: string;
  mid: number;
}

/**
 * Strip HTML tags, convert `<br>` variants to newline, decode common HTML
 * entities, and trim whitespace.
 */
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
