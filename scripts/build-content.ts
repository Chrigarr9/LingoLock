/**
 * Build-time content transform: pipeline JSON → TypeScript content bundle
 *
 * Reads spanish-content-pipeline/output/es-de-buenos-aires/ chapter files
 * and generates src/content/bundle.ts with typed ClozeCard data.
 *
 * Usage: npx tsx scripts/build-content.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types mirroring pipeline JSON structure
// ---------------------------------------------------------------------------

interface PipelineSentence {
  chapter: number;
  sentence_index: number;
  source: string;
  target: string;
}

interface PipelineWord {
  source: string;      // Surface form in sentence (e.g., "habitación")
  target: string;      // Contextual German translation (e.g., "Zimmer")
  lemma: string;       // Base form (e.g., "habitación")
  pos: string;         // Part of speech
  context_note: string;
  sentence_index?: number;  // Which sentence this word occurrence is from
}

interface PipelineChapter {
  chapter: number;
  sentences: PipelineSentence[];
  words: PipelineWord[];
}

interface VocabEntry {
  id: string;
  source: string;
  target: string[];
  pos: string;
  frequency_rank: number | null;
  cefr_level: string | null;
}

interface SentenceVariantData {
  sentence: string;
  sentenceTranslation: string;
  chapter: number;
  sentenceIndex: number;
}

interface ClozeCardData {
  id: string;
  lemma: string;
  wordInContext: string;
  germanHint: string;
  sentence: string;
  sentenceTranslation: string;
  pos: string;
  contextNote: string;
  chapter: number;
  cefrLevel: string | null;
  distractors: string[];
  image?: string;
  audio?: string;
  sentenceVariants?: SentenceVariantData[];
}

// ---------------------------------------------------------------------------
// CEFR level utilities
// ---------------------------------------------------------------------------

const CEFR_RANKS: Record<string, number> = {
  A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6,
};

function cefrDistance(a: string | null, b: string | null): number {
  if (!a || !b) return 999;
  return Math.abs((CEFR_RANKS[a] ?? 3) - (CEFR_RANKS[b] ?? 3));
}

// ---------------------------------------------------------------------------
// Distractor generation
// ---------------------------------------------------------------------------

function generateDistractors(
  lemma: string,
  pos: string,
  cefrLevel: string | null,
  vocabPool: VocabEntry[],
  count = 3,
): string[] {
  // Exclude the correct word
  const pool = vocabPool.filter(
    (v) => v.source.toLowerCase() !== lemma.toLowerCase(),
  );

  // Prefer same POS
  const samePOS = pool.filter((v) => v.pos === pos);

  // Within same POS, prefer similar CEFR (±1 level)
  const closeCefr = samePOS.filter((v) => cefrDistance(cefrLevel, v.cefr_level) <= 1);

  // Build candidate list: close CEFR first, then remaining same POS, then any POS
  const candidates: VocabEntry[] = [
    ...closeCefr,
    ...samePOS.filter((v) => !closeCefr.includes(v)),
    ...pool.filter((v) => v.pos !== pos),
  ];

  // Pick `count` random without repetition
  const selected: string[] = [];
  const used = new Set<string>();

  for (const candidate of candidates) {
    if (selected.length >= count) break;
    const key = candidate.source.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      selected.push(candidate.source);
    }
  }

  // If still short, just return what we have
  return selected;
}

// ---------------------------------------------------------------------------
// Cloze sentence generation
// ---------------------------------------------------------------------------

/**
 * Replace the FIRST occurrence of wordInContext in the sentence source with
 * "_____", using a case-insensitive, unicode-aware search.
 *
 * Returns null if the word is not found in the sentence.
 */
function makeCloze(sentence: string, wordInContext: string): string | null {
  // Build a regex that matches the word at word boundaries only.
  // Uses Unicode \p{L} lookbehind/lookahead to prevent matching inside other words
  // (e.g., "es" must not match inside "está").
  const escaped = wordInContext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'iu');

  if (!re.test(sentence)) {
    return null;
  }

  // Replace FIRST occurrence only
  return sentence.replace(re, '_____');
}

// ---------------------------------------------------------------------------
// Card ID generation
// ---------------------------------------------------------------------------

function makeCardId(lemma: string, form: string, chapter: number, sentenceIndex: number): string {
  const chStr = String(chapter).padStart(2, '0');
  const sStr = String(sentenceIndex).padStart(2, '0');
  // Include form in ID when it differs from lemma (e.g., ser.es, ser.son)
  const key = form !== lemma ? `${lemma}.${form}` : lemma;
  return `${key}-ch${chStr}-s${sStr}`;
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PIPELINE_DIR = path.join(PROJECT_ROOT, 'spanish-content-pipeline', 'output', 'es-de-buenos-aires');
const WORDS_DIR = path.join(PIPELINE_DIR, 'words');
const VOCAB_FILE = path.join(PIPELINE_DIR, 'vocabulary.json');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src', 'content', 'bundle.ts');

console.log('Build-content: reading pipeline output...');

// ---------------------------------------------------------------------------
// Load image manifest (if available from pipeline Pass 5)
// ---------------------------------------------------------------------------

const IMAGE_MANIFEST_FILE = path.join(PIPELINE_DIR, 'image_manifest.json');
const IMAGES_DEST_DIR = path.join(PROJECT_ROOT, 'assets', 'images', 'cards');

interface ImageManifestEntry {
  file: string | null;
  status: string;
}

interface ImageManifest {
  reference: string;
  model_character: string;
  model_scene: string;
  images: Record<string, ImageManifestEntry>;
}

let imageManifest: ImageManifest | null = null;
const imageKeys = new Map<string, string>();

if (fs.existsSync(IMAGE_MANIFEST_FILE)) {
  imageManifest = JSON.parse(fs.readFileSync(IMAGE_MANIFEST_FILE, 'utf-8'));

  // Copy successful images to assets directory
  fs.mkdirSync(IMAGES_DEST_DIR, { recursive: true });
  for (const [key, entry] of Object.entries(imageManifest!.images)) {
    if (entry.status === 'success' && entry.file) {
      const src = path.join(PIPELINE_DIR, entry.file);
      const ext = path.extname(entry.file) || '.webp';
      const dest = path.join(IMAGES_DEST_DIR, `${key}${ext}`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        imageKeys.set(key, ext);
      }
    }
  }
  console.log(`  Loaded image manifest: ${imageKeys.size} images copied to ${IMAGES_DEST_DIR}`);
} else {
  console.log('  No image manifest found — skipping image bundling');
}

// ---------------------------------------------------------------------------
// Load audio manifest (if available from pipeline Pass 4)
// ---------------------------------------------------------------------------

const AUDIO_MANIFEST_FILE = path.join(PIPELINE_DIR, 'audio_manifest.json');
const AUDIO_DEST_DIR = path.join(PROJECT_ROOT, 'assets', 'audio', 'cards');

interface AudioManifestEntry { file: string | null; status: string; }
interface AudioManifest { audio: Record<string, AudioManifestEntry>; }

const audioKeys = new Set<string>();

if (fs.existsSync(AUDIO_MANIFEST_FILE)) {
  const audioManifest: AudioManifest = JSON.parse(fs.readFileSync(AUDIO_MANIFEST_FILE, 'utf-8'));
  fs.mkdirSync(AUDIO_DEST_DIR, { recursive: true });
  for (const [key, entry] of Object.entries(audioManifest.audio)) {
    if (entry.status === 'success' && entry.file) {
      const src = path.join(PIPELINE_DIR, entry.file);
      const ext = path.extname(entry.file) || '.wav';
      const dest = path.join(AUDIO_DEST_DIR, `${key}${ext}`);
      if (fs.existsSync(src)) { fs.copyFileSync(src, dest); audioKeys.add(key); }
    }
  }
  console.log(`  Loaded audio manifest: ${audioKeys.size} audio files copied to ${AUDIO_DEST_DIR}`);
} else {
  console.log('  No audio manifest found — skipping audio bundling');
}

// Load vocabulary.json for distractor pool + cefr_level lookup
let vocabPool: VocabEntry[] = [];
if (fs.existsSync(VOCAB_FILE)) {
  const raw = fs.readFileSync(VOCAB_FILE, 'utf-8');
  const parsed = JSON.parse(raw);
  // vocabulary.json can be a flat array or an object with chapters[].words[]
  if (Array.isArray(parsed)) {
    vocabPool = parsed as VocabEntry[];
  } else if (parsed.chapters) {
    vocabPool = (parsed.chapters as Array<{ words: VocabEntry[] }>).flatMap(
      (ch) => ch.words ?? [],
    );
  }
  console.log(`  Loaded ${vocabPool.length} vocabulary entries`);
} else {
  console.warn('  WARNING: vocabulary.json not found — distractors will be limited');
}

// Build vocabulary lookup by lemma (lowercase)
const vocabByLemma = new Map<string, VocabEntry>();
for (const entry of vocabPool) {
  vocabByLemma.set(entry.source.toLowerCase(), entry);
}

// Discover chapter files
const chapterFiles = fs
  .readdirSync(WORDS_DIR)
  .filter((f) => /^chapter_\d+\.json$/.test(f))
  .sort(); // lexicographic sort gives correct order for chapter_01, chapter_02, ...

console.log(`  Found ${chapterFiles.length} chapter file(s): ${chapterFiles.join(', ')}`);

// ---------------------------------------------------------------------------
// Pass 1: Load all chapters and build a global map of surface form → occurrences.
// Each unique surface form (e.g., "es", "son", "era") becomes its own card,
// so FSRS tracks each conjugation/declension independently.
// ---------------------------------------------------------------------------

interface WordOccurrence {
  word: PipelineWord;
  chapter: number;
  sentence: PipelineSentence;
  cloze: string;
}

interface LoadedChapter {
  chapterNum: number;
  chapterData: PipelineChapter;
}

/** Composite key for grouping: same lemma + same surface form */
function formKey(lemma: string, source: string): string {
  return `${lemma.toLowerCase().trim()}\0${source.toLowerCase().trim()}`;
}

const loadedChapters: LoadedChapter[] = [];
// formKey → all (chapter, sentence, cloze) occurrences across the full story
const globalOccurrences = new Map<string, WordOccurrence[]>();

for (const filename of chapterFiles) {
  const filePath = path.join(WORDS_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const chapterData = JSON.parse(raw) as PipelineChapter;
  const chapterNum = chapterData.chapter;

  const sentenceMap = new Map<number, PipelineSentence>();
  for (const s of chapterData.sentences) {
    sentenceMap.set(s.sentence_index, s);
  }

  loadedChapters.push({ chapterNum, chapterData });

  // Dedup within this chapter: same surface form + same sentence → keep first
  const seenInChapter = new Map<string, Set<number>>();

  for (const word of chapterData.words) {
    const key = formKey(word.lemma, word.source);

    // Find the sentence for this word occurrence
    let matched: PipelineSentence | null = null;
    if (word.sentence_index != null && word.sentence_index >= 0) {
      matched = sentenceMap.get(word.sentence_index) ?? null;
    }
    if (!matched) {
      // Fallback: substring search (for old cached files without sentence_index)
      for (const s of chapterData.sentences) {
        const seen = seenInChapter.get(key);
        if (s.source.toLowerCase().includes(word.source.toLowerCase()) && (!seen || !seen.has(s.sentence_index))) {
          matched = s;
          break;
        }
      }
    }
    if (!matched) continue;

    if (!seenInChapter.has(key)) seenInChapter.set(key, new Set());
    if (seenInChapter.get(key)!.has(matched.sentence_index)) continue;
    seenInChapter.get(key)!.add(matched.sentence_index);

    const cloze = makeCloze(matched.source, word.source);
    if (!cloze) continue;

    if (!globalOccurrences.has(key)) globalOccurrences.set(key, []);
    globalOccurrences.get(key)!.push({ word, chapter: chapterNum, sentence: matched, cloze });
  }
}

// ---------------------------------------------------------------------------
// Pass 2: Generate one card per unique surface form, assigned to first-seen chapter.
// "es" (ser) and "son" (ser) become separate cards, each with their own sentences.
// Later occurrences of the SAME form become sentenceVariants (progressively unlocked).
// ---------------------------------------------------------------------------

const allChapters: { chapterNumber: number; cards: ClozeCardData[] }[] = [];
let totalCards = 0;
let totalSkipped = 0;
let totalVariants = 0;
const globalSeenForms = new Set<string>();

for (const { chapterNum, chapterData } of loadedChapters) {
  const cards: ClozeCardData[] = [];

  // Iterate words in story order to preserve introduction sequence
  for (const word of chapterData.words) {
    const lemma = word.lemma.toLowerCase().trim();
    const form = word.source.toLowerCase().trim();
    const key = formKey(word.lemma, word.source);
    if (globalSeenForms.has(key)) continue;
    globalSeenForms.add(key);

    const allOccurrences = globalOccurrences.get(key) ?? [];
    if (allOccurrences.length === 0) {
      totalSkipped++;
      continue;
    }

    const first = allOccurrences[0];

    // Build variants from all occurrences of this SAME form across the story
    const variants: SentenceVariantData[] = allOccurrences.map((occ) => ({
      sentence: occ.cloze,
      sentenceTranslation: occ.sentence.target,
      chapter: occ.chapter,
      sentenceIndex: occ.sentence.sentence_index,
    }));

    // Look up CEFR level from vocabulary.json (by lemma)
    const vocabEntry = vocabByLemma.get(lemma);
    const cefrLevel = vocabEntry?.cefr_level ?? null;

    // Card ID includes form when it differs from lemma (e.g., ser.es-ch01-s00)
    const cardId = makeCardId(lemma, form, chapterNum, first.sentence.sentence_index);

    // Generate distractors (by lemma for broader pool)
    const distractors = generateDistractors(lemma, first.word.pos, cefrLevel, vocabPool);

    // Image/audio from primary sentence
    const imgKey = `ch${String(chapterNum).padStart(2, '0')}_s${String(first.sentence.sentence_index).padStart(2, '0')}`;
    const image = imageKeys.has(imgKey) ? imgKey : undefined;
    const audio = audioKeys.has(imgKey) ? imgKey : undefined;

    cards.push({
      id: cardId,
      lemma,
      wordInContext: first.word.source,
      germanHint: first.word.target,
      sentence: first.cloze,
      sentenceTranslation: first.sentence.target,
      pos: first.word.pos,
      contextNote: first.word.context_note,
      chapter: chapterNum,
      cefrLevel,
      distractors,
      image,
      audio,
      // Include sentenceVariants when there are 2+ sentences with this same form
      ...(variants.length > 1 ? { sentenceVariants: variants } : {}),
    });
    if (variants.length > 1) totalVariants += variants.length;
  }

  allChapters.push({ chapterNumber: chapterNum, cards });
  totalCards += cards.length;
  console.log(`  Chapter ${chapterNum}: ${cards.length} cards (${cards.filter(c => c.sentenceVariants).length} with variants)`);
}

console.log(`  Total: ${totalCards} cards, ${totalSkipped} skipped, ${totalVariants} sentence variants`);

// ---------------------------------------------------------------------------
// Emit bundle.ts
// ---------------------------------------------------------------------------

const generatedAt = new Date().toISOString();

const chapterLines: string[] = [];
for (const ch of allChapters) {
  const cardLines: string[] = [];
  for (const card of ch.cards) {
    const distStr = JSON.stringify(card.distractors);
    const optionalFields: string[] = [];
    if (card.image !== undefined) optionalFields.push(`    image: ${JSON.stringify(card.image)},`);
    if (card.audio !== undefined) optionalFields.push(`    audio: ${JSON.stringify(card.audio)},`);
    if (card.sentenceVariants) optionalFields.push(`    sentenceVariants: ${JSON.stringify(card.sentenceVariants)},`);

    cardLines.push(
      `    {\n` +
      `      id: ${JSON.stringify(card.id)},\n` +
      `      lemma: ${JSON.stringify(card.lemma)},\n` +
      `      wordInContext: ${JSON.stringify(card.wordInContext)},\n` +
      `      germanHint: ${JSON.stringify(card.germanHint)},\n` +
      `      sentence: ${JSON.stringify(card.sentence)},\n` +
      `      sentenceTranslation: ${JSON.stringify(card.sentenceTranslation)},\n` +
      `      pos: ${JSON.stringify(card.pos)},\n` +
      `      contextNote: ${JSON.stringify(card.contextNote)},\n` +
      `      chapter: ${card.chapter},\n` +
      `      cefrLevel: ${JSON.stringify(card.cefrLevel)},\n` +
      `      distractors: ${distStr},\n` +
      (optionalFields.length ? optionalFields.join('\n') + '\n' : '') +
      `    }`,
    );
  }
  chapterLines.push(
    `  {\n` +
    `    chapterNumber: ${ch.chapterNumber},\n` +
    `    cards: [\n${cardLines.join(',\n')},\n    ],\n` +
    `  }`,
  );
}

// Generate cardImages map (static require() calls for Metro bundler)
let imageMapBlock: string;
if (imageKeys.size > 0) {
  const entries = [...imageKeys.entries()].sort(([a], [b]) => a.localeCompare(b)).map(
    ([key, ext]) => `  '${key}': require('../../assets/images/cards/${key}${ext}'),`
  ).join('\n');
  imageMapBlock = `/** Image assets keyed by sentence ID — use cardImages[card.image] as Image source */
export const cardImages: Record<string, number> = {
${entries}
};`;
} else {
  imageMapBlock = `export const cardImages: Record<string, number> = {};`;
}

// Generate cardAudios map
let audioMapBlock: string;
if (audioKeys.size > 0) {
  const entries = [...audioKeys].sort().map(
    key => `  '${key}': require('../../assets/audio/cards/${key}.wav'),`
  ).join('\n');
  audioMapBlock = `/** Audio assets keyed by sentence ID — use cardAudios[card.audio] for playback */\nexport const cardAudios: Record<string, number> = {\n${entries}\n};`;
} else {
  audioMapBlock = `export const cardAudios: Record<string, number> = {};`;
}

const output = `// AUTO-GENERATED by scripts/build-content.ts — DO NOT EDIT
// Generated: ${generatedAt}
// Source: spanish-content-pipeline/output/es-de-buenos-aires/
import type { ClozeCard, ChapterData } from '../types/vocabulary';

${imageMapBlock}

${audioMapBlock}

export const CHAPTERS: ChapterData[] = [
${chapterLines.join(',\n')},
];

/** Flat array of all cards across chapters */
export const ALL_CARDS: ClozeCard[] = CHAPTERS.flatMap(ch => ch.cards);

/** Look up card by ID */
export function getCardById(id: string): ClozeCard | undefined {
  return ALL_CARDS.find(c => c.id === id);
}

/** Get cards for a specific chapter */
export function getChapterCards(chapterNumber: number): ClozeCard[] {
  return CHAPTERS.find(ch => ch.chapterNumber === chapterNumber)?.cards ?? [];
}

/** Total card count */
export function getTotalCards(): number {
  return ALL_CARDS.length;
}
`;

fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
console.log(`\nWrote ${OUTPUT_FILE}`);
console.log(`Done. ${totalCards} cards across ${allChapters.length} chapters.`);
