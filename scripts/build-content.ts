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
  // Build a regex that matches the word, allowing for surrounding punctuation.
  // We use unicode flag (u) and case-insensitive (i).
  const escaped = wordInContext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'iu');

  if (!re.test(sentence)) {
    return null;
  }

  // Replace FIRST occurrence only
  return sentence.replace(re, '_____');
}

// ---------------------------------------------------------------------------
// Card ID generation
// ---------------------------------------------------------------------------

function makeCardId(lemma: string, chapter: number, sentenceIndex: number): string {
  const chStr = String(chapter).padStart(2, '0');
  const sStr = String(sentenceIndex).padStart(2, '0');
  return `${lemma}-ch${chStr}-s${sStr}`;
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

// Load vocabulary.json for distractor pool + cefr_level lookup
let vocabPool: VocabEntry[] = [];
if (fs.existsSync(VOCAB_FILE)) {
  const raw = fs.readFileSync(VOCAB_FILE, 'utf-8');
  vocabPool = JSON.parse(raw) as VocabEntry[];
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

const allChapters: { chapterNumber: number; cards: ClozeCardData[] }[] = [];
let totalCards = 0;
let totalSkipped = 0;

for (const filename of chapterFiles) {
  const filePath = path.join(WORDS_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const chapterData = JSON.parse(raw) as PipelineChapter;

  const chapterNum = chapterData.chapter;
  const sentenceMap = new Map<number, PipelineSentence>();
  for (const s of chapterData.sentences) {
    sentenceMap.set(s.sentence_index, s);
  }

  const cards: ClozeCardData[] = [];
  // Track (lemma, sentenceIndex) pairs to deduplicate same word in same sentence
  const seenPairs = new Set<string>();

  for (const word of chapterData.words) {
    const lemma = word.lemma.toLowerCase().trim();

    // Find the first sentence in this chapter that contains the word's surface form
    let matchedSentence: PipelineSentence | null = null;
    for (const s of chapterData.sentences) {
      if (s.source.toLowerCase().includes(word.source.toLowerCase())) {
        matchedSentence = s;
        break;
      }
    }

    if (!matchedSentence) {
      console.warn(`  SKIP: No sentence found for word "${word.source}" (lemma: ${lemma}) in chapter ${chapterNum}`);
      totalSkipped++;
      continue;
    }

    const pairKey = `${lemma}:${matchedSentence.sentence_index}`;
    if (seenPairs.has(pairKey)) {
      // Duplicate: same lemma in same sentence — skip
      continue;
    }
    seenPairs.add(pairKey);

    // Build cloze sentence
    const cloze = makeCloze(matchedSentence.source, word.source);
    if (!cloze) {
      console.warn(`  SKIP: Could not create cloze for "${word.source}" in sentence: "${matchedSentence.source}"`);
      totalSkipped++;
      continue;
    }

    // Look up CEFR level from vocabulary.json
    const vocabEntry = vocabByLemma.get(lemma);
    const cefrLevel = vocabEntry?.cefr_level ?? null;

    // Generate card ID
    const cardId = makeCardId(lemma, chapterNum, matchedSentence.sentence_index);

    // Generate distractors
    const distractors = generateDistractors(lemma, word.pos, cefrLevel, vocabPool);

    cards.push({
      id: cardId,
      lemma,
      wordInContext: word.source,
      germanHint: word.target,
      sentence: cloze,
      sentenceTranslation: matchedSentence.target,
      pos: word.pos,
      contextNote: word.context_note,
      chapter: chapterNum,
      cefrLevel,
      distractors,
    });
  }

  allChapters.push({ chapterNumber: chapterNum, cards });
  totalCards += cards.length;
  console.log(`  Chapter ${chapterNum}: ${cards.length} cards generated`);
}

console.log(`  Total: ${totalCards} cards, ${totalSkipped} skipped`);

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

const output = `// AUTO-GENERATED by scripts/build-content.ts — DO NOT EDIT
// Generated: ${generatedAt}
// Source: spanish-content-pipeline/output/es-de-buenos-aires/
import type { ClozeCard, ChapterData } from '../types/vocabulary';

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
