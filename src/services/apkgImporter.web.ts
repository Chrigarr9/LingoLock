/**
 * .apkg Importer — Web platform stub
 *
 * The .apkg import pipeline requires native modules (expo-sqlite, react-native-zip-archive)
 * that don't work on web. This stub prevents Metro from bundling the WASM dependencies.
 */

import type { SimpleCard, ImportedDeckMeta } from '../types/simpleCard';

export interface AnkiNoteRow {
  id: number;
  flds: string;
  mid: number;
}

export type ProgressCallback = (stage: string, pct: number) => void;

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

export function parseAnkiNotes(_rows: AnkiNoteRow[], _deckId: string): SimpleCard[] {
  return [];
}

export async function importApkg(
  _sourceUri: string,
  _onProgress?: ProgressCallback,
): Promise<ImportedDeckMeta> {
  throw new Error('.apkg import is not supported on web');
}
