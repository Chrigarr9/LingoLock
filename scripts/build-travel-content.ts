/**
 * Bundle a travel quick-deck for the app.
 *
 * Reads spanish-content-pipeline/output/<deck-id>/travel_cards.json
 * and generates src/content/bundles/<deck-id>/chapters.ts
 * with SimpleCard data grouped by category.
 *
 * Images are shared across all travel decks and live in:
 *   assets/images/cards/travel-base/<sentence-id>.<ext>
 *
 * Audio is deck-specific and lives in:
 *   assets/audio/cards/<deck-id>/<sentence-id>.<ext>
 *
 * Usage:
 *   npx tsx scripts/build-travel-content.ts hu-de-quick
 */

import * as fs from 'fs';
import * as path from 'path';

// @ts-ignore
import * as yaml from 'js-yaml';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DECK_ID = process.argv[2];

if (!DECK_ID) {
  console.error('Usage: npx tsx scripts/build-travel-content.ts <deck-id>');
  process.exit(1);
}

const PIPELINE_DIR = path.join(PROJECT_ROOT, 'spanish-content-pipeline', 'output', DECK_ID);
const CARDS_FILE = path.join(PIPELINE_DIR, 'travel_cards.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'src', 'content', 'bundles', DECK_ID);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'chapters.ts');
const CONFIG_FILE = path.join(OUTPUT_DIR, 'config.ts');

// Shared image directory — lives in output/travel-base/images/, same for all decks
const IMAGES_SRC_DIR = path.join(PROJECT_ROOT, 'spanish-content-pipeline', 'output', 'travel-base', 'images');
const IMAGES_DEST_DIR = path.join(PROJECT_ROOT, 'assets', 'images', 'cards', 'travel-base');

// Deck-specific audio directory
const AUDIO_SRC_DIR = path.join(PIPELINE_DIR, 'audio');
const AUDIO_DEST_DIR = path.join(PROJECT_ROOT, 'assets', 'audio', 'cards', DECK_ID);

console.log(`Build-travel-content: bundling ${DECK_ID}...`);

if (!fs.existsSync(CARDS_FILE)) {
  console.error(`Error: ${CARDS_FILE} not found. Run build_travel_deck.py first.`);
  process.exit(1);
}

// ── Load pipeline config ──────────────────────────────────────────────────

interface TravelConfig {
  deck: { name: string; id: string; type: string };
  languages: { target: string; target_code: string; native: string; native_code: string };
  destination?: { country: string; city: string };
}

let pipelineConfig: TravelConfig | null = null;
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

// ── Load travel cards ─────────────────────────────────────────────────────

interface TravelCard {
  id: string;
  category: string;
  en: string;
  native: string;  // Front: what the learner already knows (e.g. German)
  target: string;  // Back: what they're learning (e.g. Hungarian)
  image?: string;  // Sentence ID key — images live in travel-base shared dir
  audio?: string;  // Sentence ID key — audio lives in per-deck dir
}

const cards: TravelCard[] = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf-8'));
console.log(`  Loaded ${cards.length} travel cards`);

// ── Copy images (shared travel-base dir) ─────────────────────────────────

const imageKeys = new Map<string, string>(); // id → extension

if (fs.existsSync(IMAGES_SRC_DIR)) {
  fs.mkdirSync(IMAGES_DEST_DIR, { recursive: true });
  for (const file of fs.readdirSync(IMAGES_SRC_DIR)) {
    const ext = path.extname(file);
    const id = path.basename(file, ext);
    const src = path.join(IMAGES_SRC_DIR, file);
    const dest = path.join(IMAGES_DEST_DIR, file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
    imageKeys.set(id, ext);
  }
  console.log(`  ${imageKeys.size} images in travel-base`);
} else {
  console.log('  No images directory found — skipping image bundling');
}

// ── Copy audio (deck-specific dir) ───────────────────────────────────────

const audioKeys = new Map<string, string>(); // id → extension

if (fs.existsSync(AUDIO_SRC_DIR)) {
  fs.mkdirSync(AUDIO_DEST_DIR, { recursive: true });
  for (const file of fs.readdirSync(AUDIO_SRC_DIR)) {
    const ext = path.extname(file);
    const id = path.basename(file, ext);
    const src = path.join(AUDIO_SRC_DIR, file);
    const dest = path.join(AUDIO_DEST_DIR, file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
    audioKeys.set(id, ext);
  }
  console.log(`  ${audioKeys.size} audio files for ${DECK_ID}`);
} else {
  console.log('  No audio directory found — skipping audio bundling');
}

// ── Group cards by category (= "chapters") ───────────────────────────────

const CATEGORY_ORDER = [
  'greetings',
  'communication',
  'ordering',
  'navigation',
  'accommodation',
  'shopping',
  'emergencies',
  'social',
];

const byCategory = new Map<string, TravelCard[]>();
for (const card of cards) {
  if (!byCategory.has(card.category)) byCategory.set(card.category, []);
  byCategory.get(card.category)!.push(card);
}

// Sort categories in defined order (unknown categories go to the end)
const sortedCategories = [...byCategory.keys()].sort((a, b) => {
  const ai = CATEGORY_ORDER.indexOf(a);
  const bi = CATEGORY_ORDER.indexOf(b);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
});

// ── Build chapters.ts output ──────────────────────────────────────────────

const chapterLines: string[] = [];
let totalCards = 0;
let chapterNum = 1;

for (const category of sortedCategories) {
  const categoryCards = byCategory.get(category)!;
  const cardLines: string[] = [];

  for (const card of categoryCards) {
    const imageExt = imageKeys.get(card.id);
    const hasImage = imageExt !== undefined;
    const hasAudio = audioKeys.has(card.id);

    const optionalFields: string[] = [];
    if (hasImage) optionalFields.push(`      image: ${JSON.stringify(card.id)},`);
    if (hasAudio) optionalFields.push(`      audio: ${JSON.stringify(card.id)},`);

    cardLines.push(
      `    {\n` +
      `      kind: "simple",\n` +
      `      id: ${JSON.stringify(card.id)},\n` +
      `      front: ${JSON.stringify(card.native)},\n` +
      `      back: ${JSON.stringify(card.target)},\n` +
      `      deckId: ${JSON.stringify(DECK_ID)},\n` +
      (optionalFields.length ? optionalFields.join('\n') + '\n' : '') +
      `    }`,
    );
  }

  chapterLines.push(
    `  {\n` +
    `    chapterNumber: ${chapterNum},\n` +
    `    cards: [\n${cardLines.join(',\n')},\n    ],\n` +
    `  }`,
  );

  console.log(`  Chapter ${chapterNum} (${category}): ${categoryCards.length} cards`);
  totalCards += categoryCards.length;
  chapterNum++;
}

// ── Image + audio require() maps ─────────────────────────────────────────

let imageMapBlock: string;
if (imageKeys.size > 0) {
  const entries = [...imageKeys.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, ext]) => `  '${id}': require('../../../../assets/images/cards/travel-base/${id}${ext}'),`)
    .join('\n');
  imageMapBlock =
    `/** Shared travel phrase images — same across all travel decks */\n` +
    `export const cardImages: Record<string, number> = {\n${entries}\n};`;
} else {
  imageMapBlock = `export const cardImages: Record<string, number> = {};`;
}

let audioMapBlock: string;
if (audioKeys.size > 0) {
  const entries = [...audioKeys.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, ext]) => `  '${id}': require('../../../../assets/audio/cards/${DECK_ID}/${id}${ext}'),`)
    .join('\n');
  audioMapBlock =
    `/** Audio files for ${DECK_ID} */\n` +
    `export const cardAudios: Record<string, number> = {\n${entries}\n};`;
} else {
  audioMapBlock = `export const cardAudios: Record<string, number> = {};`;
}

// ── Write chapters.ts ─────────────────────────────────────────────────────

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const chaptersOutput = `// AUTO-GENERATED by scripts/build-travel-content.ts — DO NOT EDIT
// Generated: ${new Date().toISOString()}
// Bundle: ${DECK_ID}
import type { ChapterData } from '../../../types/vocabulary';
import type { SimpleCard } from '../../../types/simpleCard';

${imageMapBlock}

${audioMapBlock}

export const CHAPTERS: ChapterData[] = [
${chapterLines.join(',\n')},
];

/** Flat array of all cards */
export const ALL_CARDS = CHAPTERS.flatMap(ch => ch.cards) as SimpleCard[];

/** Look up card by ID */
export function getCardById(id: string): SimpleCard | undefined {
  return ALL_CARDS.find(c => c.id === id);
}

/** Get cards for a specific chapter */
export function getChapterCards(chapterNumber: number): SimpleCard[] {
  return (CHAPTERS.find(ch => ch.chapterNumber === chapterNumber)?.cards ?? []) as SimpleCard[];
}

/** Total card count */
export function getTotalCards(): number {
  return ALL_CARDS.length;
}
`;

fs.writeFileSync(OUTPUT_FILE, chaptersOutput);
console.log(`\nWrote ${OUTPUT_FILE}`);

// ── Write config.ts ───────────────────────────────────────────────────────

const LANG_PRESETS: Record<string, {
  nativeName: string; targetName: string;
  greetings: { morning: string; afternoon: string; evening: string };
  motivational: { perfect: string; great: string; good: string; encouragement: string };
  spellChars: string;
}> = {
  hu: {
    nativeName: 'Deutsch', targetName: 'Magyar',
    greetings: { morning: 'Jó reggelt', afternoon: 'Jó napot', evening: 'Jó estét' },
    motivational: { perfect: 'Tökéletes!', great: 'Nagyon jó!', good: 'Jó munka!', encouragement: 'Csak így tovább!' },
    spellChars: 'abcdefghijklmnopqrstuvwxyzáéíóöőúüű',
  },
  fr: {
    nativeName: 'Deutsch', targetName: 'Français',
    greetings: { morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir' },
    motivational: { perfect: 'Parfait!', great: 'Très bien!', good: 'Bien!', encouragement: 'Continuez comme ça!' },
    spellChars: 'abcdefghijklmnopqrstuvwxyzàâçéèêëîïôùûüÿ',
  },
  it: {
    nativeName: 'Deutsch', targetName: 'Italiano',
    greetings: { morning: 'Buongiorno', afternoon: 'Buon pomeriggio', evening: 'Buonasera' },
    motivational: { perfect: 'Perfetto!', great: 'Molto bene!', good: 'Bene!', encouragement: 'Vai avanti così!' },
    spellChars: 'abcdefghijklmnopqrstuvwxyzàèéìíîòóùú',
  },
  pt: {
    nativeName: 'Deutsch', targetName: 'Português',
    greetings: { morning: 'Bom dia', afternoon: 'Boa tarde', evening: 'Boa noite' },
    motivational: { perfect: 'Perfeito!', great: 'Muito bem!', good: 'Bem!', encouragement: 'Continue assim!' },
    spellChars: 'abcdefghijklmnopqrstuvwxyzãáàâçéêíóõôú',
  },
};

const langCode = pipelineConfig.languages.target_code;
const preset = LANG_PRESETS[langCode] ?? {
  nativeName: 'Deutsch',
  targetName: pipelineConfig.languages.target,
  greetings: { morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend' },
  motivational: { perfect: 'Perfekt!', great: 'Sehr gut!', good: 'Gut!', encouragement: 'Weiter so!' },
  spellChars: 'abcdefghijklmnopqrstuvwxyz',
};

const configOutput = `// AUTO-GENERATED by scripts/build-travel-content.ts — DO NOT EDIT
import type { BundleConfig } from '../../../types/bundle';

export const config: BundleConfig = {
  id: '${DECK_ID}',
  type: 'builtin',
  nativeLanguage: '${preset.nativeName}',
  targetLanguage: '${preset.targetName}',
  displayLabel: '${preset.nativeName} → ${preset.targetName}',
  greetings: {
    morning: '${preset.greetings.morning}',
    afternoon: '${preset.greetings.afternoon}',
    evening: '${preset.greetings.evening}',
  },
  motivational: {
    perfect: '${preset.motivational.perfect}',
    great: '${preset.motivational.great}',
    good: '${preset.motivational.good}',
    encouragement: '${preset.motivational.encouragement}',
  },
  spellCharacters: '${preset.spellChars}'.split(''),
  searchPlaceholder: 'Search ${preset.targetName} or ${preset.nativeName}...',
};
`;

fs.writeFileSync(CONFIG_FILE, configOutput);
console.log(`Wrote ${CONFIG_FILE}`);
console.log(`Done. ${totalCards} cards across ${sortedCategories.length} categories.`);
