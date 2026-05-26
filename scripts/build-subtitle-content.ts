/**
 * Bundle a subtitle flashcard deck for the app.
 *
 * Reads spanish-content-pipeline/output/<deck-id>/word_cards.json
 * and generates src/content/bundles/<deck-id>/chapters.ts
 * with proper ClozeCard-shaped data grouped by episode (= chapter).
 *
 * Images live in:  assets/images/cards/<deck-id>/<lemma_slug>.<ext>
 * Audio lives in:  assets/audio/cards/<deck-id>/<sentence_file_key>.<ext>
 *
 * Usage:
 *   npx tsx scripts/build-subtitle-content.ts himym-s01-es
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

// @ts-ignore
import * as yaml from 'js-yaml';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DECK_ID = process.argv[2];

if (!DECK_ID) {
  console.error('Usage: npx tsx scripts/build-subtitle-content.ts <deck-id>');
  process.exit(1);
}

const PIPELINE_DIR = path.join(PROJECT_ROOT, 'spanish-content-pipeline', 'output', DECK_ID);
const CARDS_FILE = path.join(PIPELINE_DIR, 'word_cards.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'src', 'content', 'bundles', DECK_ID);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'chapters.ts');
const CONFIG_FILE = path.join(OUTPUT_DIR, 'config.ts');
const INDEX_FILE = path.join(OUTPUT_DIR, 'index.ts');

const IMAGES_SRC_DIR = path.join(PIPELINE_DIR, 'images');
const IMAGES_DEST_DIR = path.join(PROJECT_ROOT, 'assets', 'images', 'cards', DECK_ID);

const AUDIO_SRC_DIR = path.join(PIPELINE_DIR, 'audio');
const AUDIO_DEST_DIR = path.join(PROJECT_ROOT, 'assets', 'audio', 'cards', DECK_ID);
const IMAGE_MAX_DIMENSION = 384;

function bundleImageAsset(src: string, dest: string, ext: string): void {
  if (ext.toLowerCase() !== '.webp') {
    fs.copyFileSync(src, dest);
    return;
  }

  const result = spawnSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    src,
    '-vf',
    `scale='min(${IMAGE_MAX_DIMENSION},iw)':'min(${IMAGE_MAX_DIMENSION},ih)':force_original_aspect_ratio=decrease`,
    '-c:v',
    'libwebp',
    '-quality',
    '80',
    dest,
  ], { encoding: 'utf-8' });

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed while bundling ${src}: ${result.stderr.trim()}`);
  }
}

console.log(`Build-subtitle-content: bundling ${DECK_ID}...`);

if (!fs.existsSync(CARDS_FILE)) {
  console.error(`Error: ${CARDS_FILE} not found. Run run_subtitle.py first.`);
  process.exit(1);
}

// ── Load pipeline config ──────────────────────────────────────────────────

interface SubtitleConfig {
  deck: { name: string; id: string; type: string };
  languages: { target: string; target_code: string; native: string; native_code: string };
  show: { title: string; season: number };
}

let pipelineConfig: SubtitleConfig | null = null;
const configsDir = path.join(PROJECT_ROOT, 'spanish-content-pipeline', 'configs');
for (const f of fs.readdirSync(configsDir)) {
  if (!f.endsWith('.yaml')) continue;
  const raw = yaml.load(fs.readFileSync(path.join(configsDir, f), 'utf-8')) as any;
  if (raw?.deck?.id === DECK_ID) {
    pipelineConfig = raw;
    console.log(`  Loaded config from configs/${f}`);
    break;
  }
}

if (!pipelineConfig) {
  console.error(`Error: no config found for deck ID "${DECK_ID}"`);
  process.exit(1);
}

// ── Load word cards ───────────────────────────────────────────────────────

interface WordCard {
  id: string;
  lemma: string;
  word_in_context: string;
  sentence: string;
  sentence_translation: string;
  german_hint: string;
  german_hint_general?: string;
  english_gloss: string;
  pos: string;
  context_note: string;
  cefr_level: string | null;
  distractors: string[];
  episode: number;
  sentence_file_key: string;  // ch{ep:02d}_s{i:02d} — used to locate audio files
  image?: string;             // lemma_slug if image exists
  audio?: string;             // sentence_file_key if audio exists
}

const cards: WordCard[] = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf-8'));
console.log(`  Loaded ${cards.length} word cards`);

// ── Copy images (keyed by lemma slug) ─────────────────────────────────────

// lemma_slug → extension
const imageKeys = new Map<string, string>();
const requiredImageKeys = new Set(cards.map(c => c.image).filter(Boolean) as string[]);

if (fs.existsSync(IMAGES_SRC_DIR)) {
  fs.mkdirSync(IMAGES_DEST_DIR, { recursive: true });
  for (const file of fs.readdirSync(IMAGES_SRC_DIR)) {
    const ext = path.extname(file);
    const stem = path.basename(file, ext);
    if (!requiredImageKeys.has(stem)) continue;
    const src = path.join(IMAGES_SRC_DIR, file);
    const dest = path.join(IMAGES_DEST_DIR, file);
    bundleImageAsset(src, dest, ext);
    imageKeys.set(stem, ext);
  }
  console.log(`  ${imageKeys.size} images copied to assets`);
} else {
  console.log('  No images directory found — skipping image bundling');
}

// ── Copy audio (keyed by sentence_file_key) ───────────────────────────────

// sentence_file_key → extension
const audioKeys = new Map<string, string>();
const requiredAudioKeys = new Set(cards.map(c => c.audio).filter(Boolean) as string[]);

if (fs.existsSync(AUDIO_SRC_DIR)) {
  fs.mkdirSync(AUDIO_DEST_DIR, { recursive: true });
  for (const file of fs.readdirSync(AUDIO_SRC_DIR)) {
    const ext = path.extname(file);
    const stem = path.basename(file, ext);
    if (!requiredAudioKeys.has(stem)) continue;
    const src = path.join(AUDIO_SRC_DIR, file);
    const dest = path.join(AUDIO_DEST_DIR, file);
    fs.copyFileSync(src, dest);
    audioKeys.set(stem, ext);
  }
  console.log(`  ${audioKeys.size} audio files copied to assets`);
} else {
  console.log('  No audio directory found — skipping audio bundling');
}

// ── Group cards by episode ────────────────────────────────────────────────

const byEpisode = new Map<number, WordCard[]>();
for (const card of cards) {
  if (!byEpisode.has(card.episode)) byEpisode.set(card.episode, []);
  byEpisode.get(card.episode)!.push(card);
}

const sortedEpisodes = [...byEpisode.keys()].sort((a, b) => a - b);

// ── Resolve episode titles from config ────────────────────────────────────

const episodeTitles = new Map<number, string>();
for (const ep of ((pipelineConfig as any)?.episodes ?? [])) {
  episodeTitles.set(ep.episode, ep.title);
}

// ── Build chapters.ts ─────────────────────────────────────────────────────

const chapterLines: string[] = [];
let totalCards = 0;

for (const epNum of sortedEpisodes) {
  const epCards = byEpisode.get(epNum)!;
  const epTitle = episodeTitles.get(epNum) ?? `Episode ${epNum}`;
  const cardLines: string[] = [];

  for (const card of epCards) {
    // Derive lemma slug from image field (or from card id prefix)
    const lemmaSlug = card.image ?? card.id.split('-ch')[0];
    const audioFileKey = card.audio;

    const imageExt = card.image ? imageKeys.get(lemmaSlug) : undefined;
    const hasImage = imageExt !== undefined;
    const hasAudio = audioFileKey ? audioKeys.has(audioFileKey) : false;

    const optionalFields: string[] = [];
    if (card.german_hint_general) optionalFields.push(`      germanHintGeneral: ${JSON.stringify(card.german_hint_general)},`);
    if (hasImage) optionalFields.push(`      image: ${JSON.stringify(card.id)},`);
    if (hasAudio) optionalFields.push(`      audio: ${JSON.stringify(card.id)},`);

    const distractorsStr = JSON.stringify(card.distractors);

    cardLines.push(
      `    {\n` +
      `      kind: "cloze" as const,\n` +
      `      id: ${JSON.stringify(card.id)},\n` +
      `      lemma: ${JSON.stringify(card.lemma)},\n` +
      `      wordInContext: ${JSON.stringify(card.word_in_context)},\n` +
      `      germanHint: ${JSON.stringify(card.german_hint)},\n` +
      `      sentence: ${JSON.stringify(card.sentence)},\n` +
      `      sentenceTranslation: ${JSON.stringify(card.sentence_translation)},\n` +
      `      pos: ${JSON.stringify(card.pos)},\n` +
      `      contextNote: ${JSON.stringify(card.context_note)},\n` +
      `      chapter: ${epNum},\n` +
      `      cefrLevel: ${card.cefr_level ? JSON.stringify(card.cefr_level) : 'null'},\n` +
      `      distractors: ${distractorsStr},\n` +
      (optionalFields.length ? optionalFields.join('\n') + '\n' : '') +
      `    }`,
    );
  }

  chapterLines.push(
    `  {\n` +
    `    chapterNumber: ${epNum},\n` +
    `    cards: [\n${cardLines.join(',\n')},\n    ],\n` +
    `  }`,
  );

  console.log(`  Episode ${epNum} (${epTitle}): ${epCards.length} cards`);
  totalCards += epCards.length;
}

// ── Image + audio require() maps ──────────────────────────────────────────
// cardImages: card.id → require(assets/.../lemma_slug.webp)
// cardAudios: card.id → require(assets/.../sentence_file_key.m4a)

let imageMapBlock: string;
const imageCardEntries = cards
  .filter(c => c.image && imageKeys.has(c.image))
  .sort((a, b) => a.id.localeCompare(b.id));

if (imageCardEntries.length > 0) {
  const entries = imageCardEntries
    .map(c => {
      const ext = imageKeys.get(c.image!)!;
      return `  '${c.id}': require('../../../../assets/images/cards/${DECK_ID}/${c.image}${ext}'),`;
    })
    .join('\n');
  imageMapBlock =
    `/** Images for ${DECK_ID} */\n` +
    `export const cardImages: Record<string, number> = {\n${entries}\n};`;
} else {
  imageMapBlock = `export const cardImages: Record<string, number> = {};`;
}

let audioMapBlock: string;
const audioCardEntries = cards
  .filter(c => c.audio && audioKeys.has(c.audio))
  .sort((a, b) => a.id.localeCompare(b.id));

if (audioCardEntries.length > 0) {
  const entries = audioCardEntries
    .map(c => {
      const ext = audioKeys.get(c.audio!)!;
      return `  '${c.id}': require('../../../../assets/audio/cards/${DECK_ID}/${c.audio}${ext}'),`;
    })
    .join('\n');
  audioMapBlock =
    `/** Audio files for ${DECK_ID} */\n` +
    `export const cardAudios: Record<string, number> = {\n${entries}\n};`;
} else {
  audioMapBlock = `export const cardAudios: Record<string, number> = {};`;
}

// ── Write chapters.ts ─────────────────────────────────────────────────────

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const chaptersOutput = `// AUTO-GENERATED by scripts/build-subtitle-content.ts — DO NOT EDIT
// Generated: ${new Date().toISOString()}
// Bundle: ${DECK_ID}
import type { ChapterData } from '../../../types/vocabulary';
import type { ClozeCard } from '../../../types/vocabulary';

${imageMapBlock}

${audioMapBlock}

export const CHAPTERS: ChapterData[] = [
${chapterLines.join(',\n')},
];

/** Flat array of all cards */
export const ALL_CARDS = CHAPTERS.flatMap(ch => ch.cards) as ClozeCard[];

/** Look up card by ID */
export function getCardById(id: string): ClozeCard | undefined {
  return ALL_CARDS.find(c => c.id === id);
}

/** Get cards for a specific chapter (episode number) */
export function getChapterCards(chapterNumber: number): ClozeCard[] {
  return (CHAPTERS.find(ch => ch.chapterNumber === chapterNumber)?.cards ?? []) as ClozeCard[];
}

/** Total card count */
export function getTotalCards(): number {
  return ALL_CARDS.length;
}
`;

fs.writeFileSync(OUTPUT_FILE, chaptersOutput);
console.log(`\nWrote ${OUTPUT_FILE}`);

// ── Write config.ts ───────────────────────────────────────────────────────

const configOutput = `// AUTO-GENERATED by scripts/build-subtitle-content.ts — DO NOT EDIT
import type { BundleConfig } from '../../../types/bundle';

export const config: BundleConfig = {
  id: '${DECK_ID}',
  type: 'builtin',
  nativeLanguage: 'Deutsch',
  targetLanguage: 'Español',
  displayLabel: 'Deutsch → Español',
  greetings: {
    morning: 'Buenos días',
    afternoon: 'Buenas tardes',
    evening: 'Buenas noches',
  },
  motivational: {
    perfect: '¡Perfecto!',
    great: '¡Muy bien!',
    good: '¡Bien hecho!',
    encouragement: '¡Sigue así!',
  },
  spellCharacters: 'abcdefghijklmnopqrstuvwxyzáéíóúüñ¿¡'.split(''),
  searchPlaceholder: 'Suche auf Spanisch oder Deutsch...',
};
`;

fs.writeFileSync(CONFIG_FILE, configOutput);
console.log(`Wrote ${CONFIG_FILE}`);

// ── Write index.ts ────────────────────────────────────────────────────────

const indexOutput = `export { config } from './config';
export {
  CHAPTERS,
  ALL_CARDS,
  cardImages,
  cardAudios,
  getCardById,
  getChapterCards,
  getTotalCards,
} from './chapters';
`;

fs.writeFileSync(INDEX_FILE, indexOutput);
console.log(`Wrote ${INDEX_FILE}`);
console.log(`Done. ${totalCards} cards across ${sortedEpisodes.length} episodes.`);
