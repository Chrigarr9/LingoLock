/**
 * Card Selector Service — session building and wrong-answer re-insertion
 *
 * Core session composition logic:
 *   1. Due review cards get priority (FSRS says they're ready to review)
 *   2. Remaining slots filled with new words from current chapter
 *   3. Always guarantees at least 1 new word per session (learning progression)
 *   4. If current chapter exhausted, overflow to next chapter
 *
 * Wrong-answer re-insertion: cards answered incorrectly are requeued ~4 cards
 * ahead so the user sees them again soon without stopping the session flow.
 */

import { isDue, getAnswerType, getHintLevel, isCardLearned } from './fsrs';
import { loadCardState, loadAllCardStates, loadNewWordsIntroducedToday } from './storage';
import { CHAPTERS, getChapterCards } from '../content/bundle';
import type { SessionCard, ClozeCard } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle (in-place, returns same array)
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// MC choice generation
// ---------------------------------------------------------------------------

/**
 * Build MC4 choices for a card: correct word + 3 distractors, shuffled.
 */
function buildChoices(card: ClozeCard): string[] {
  const distractors = card.distractors.slice(0, 3);
  const choices = [card.wordInContext, ...distractors];
  return shuffle(choices);
}

// ---------------------------------------------------------------------------
// Chapter sentence progress
// ---------------------------------------------------------------------------

/**
 * Derive the highest sentence index seen per chapter from existing card states.
 *
 * Card IDs are encoded as "{lemma}-ch{N}-s{M}". A CardState exists only after
 * a card has been answered at least once, so the max sentenceIndex across all
 * seen cards in a chapter tells us how far into that chapter the user has
 * progressed.
 *
 * Returns a Map<chapterNumber, maxSentenceIndex>.
 */
function getMaxSeenSentenceByChapter(): Map<number, number> {
  const states = loadAllCardStates();
  const maxByChapter = new Map<number, number>();
  for (const state of states) {
    const match = state.cardId.match(/-ch(\d+)-s(\d+)/);
    if (!match) continue;
    const ch = parseInt(match[1], 10);
    const si = parseInt(match[2], 10);
    maxByChapter.set(ch, Math.max(maxByChapter.get(ch) ?? -1, si));
  }
  return maxByChapter;
}

// ---------------------------------------------------------------------------
// Sentence variant picker
// ---------------------------------------------------------------------------

/**
 * Pick a random unlocked sentence variant for review variety.
 *
 * Unlock rules:
 *  - variant.chapter < currentChapter  → always unlocked (chapter completed)
 *  - variant.chapter === currentChapter → unlocked if sentenceIndex ≤ max seen in that chapter
 *  - variant.chapter > currentChapter  → always locked (not yet reached)
 *
 * Returns the card unchanged if fewer than 2 variants are unlocked.
 */
/**
 * Build an audio/image key from a chapter number and sentence index.
 * e.g. chapter=1, sentenceIndex=5 → "ch01_s05"
 */
function mediaKey(chapter: number, sentenceIndex: number): string {
  return `ch${String(chapter).padStart(2, '0')}_s${String(sentenceIndex).padStart(2, '0')}`;
}

function pickVariant(
  card: ClozeCard,
  currentChapter: number,
  seenByChapter: Map<number, number>,
): ClozeCard {
  if (!card.sentenceVariants || card.sentenceVariants.length < 2) return card;
  const unlocked = card.sentenceVariants.filter((v) => {
    if (v.chapter < currentChapter) return true;
    if (v.chapter === currentChapter) {
      return v.sentenceIndex <= (seenByChapter.get(currentChapter) ?? -1);
    }
    return false;
  });
  if (unlocked.length < 2) return card;
  const pick = unlocked[Math.floor(Math.random() * unlocked.length)];
  // Update audio/image to match the variant's sentence so the right
  // media plays — prevents audio/image mismatch when a variant is shown.
  const key = mediaKey(pick.chapter, pick.sentenceIndex);
  return {
    ...card,
    sentence: pick.sentence,
    sentenceTranslation: pick.sentenceTranslation,
    audio: card.audio ? key : undefined,
    image: card.image ? key : undefined,
  };
}

// ---------------------------------------------------------------------------
// Session card factory
// ---------------------------------------------------------------------------

function toSessionCard(
  card: ClozeCard,
  currentChapter: number,
  seenByChapter: Map<number, number>,
): SessionCard {
  const cardState = loadCardState(card.id); // null = new card
  const answerType = getAnswerType(cardState);
  const isFirstEncounter = cardState === null;
  const activeCard = pickVariant(card, currentChapter, seenByChapter);

  if (answerType === 'text') {
    return {
      card: activeCard,
      answerType,
      isFirstEncounter,
      hintLevel: getHintLevel(cardState!),
    };
  }

  return {
    card: activeCard,
    answerType,
    choices: buildChoices(activeCard),
    isFirstEncounter,
  };
}

// ---------------------------------------------------------------------------
// getCurrentChapter
// ---------------------------------------------------------------------------

/**
 * Returns the chapter number the user is currently working on.
 *
 * Scan CHAPTERS in order. The "current chapter" is the first chapter whose
 * learned cards are below 80%. If all chapters are >= 80%, return the last chapter
 * (review mode — you've learned everything!).
 *
 * Learned = (learned cards / total chapter cards) * 100, where a card is
 * learned if isCardLearned(loadCardState(card.id)) is true (i.e. card has
 * entered the Review state after completing its initial learning steps).
 */
export function getCurrentChapter(): number {
  for (const chapter of CHAPTERS) {
    const cards = chapter.cards;
    const totalCards = cards.length;
    if (totalCards === 0) continue;

    const masteredCount = cards.reduce((count, card) => {
      const state = loadCardState(card.id);
      if (state === null) return count;
      return isCardLearned(state) ? count + 1 : count;
    }, 0);

    const masteryPct = (masteredCount / totalCards) * 100;
    if (masteryPct < 80) {
      return chapter.chapterNumber;
    }
  }

  // All chapters mastered — return last chapter (review mode)
  return CHAPTERS[CHAPTERS.length - 1].chapterNumber;
}

// ---------------------------------------------------------------------------
// getDueCards — lightweight check for cards that are currently due
// ---------------------------------------------------------------------------

/**
 * Returns card IDs of all cards that are currently due for review.
 * Used by the challenge screen to detect newly-due cards mid-session.
 */
export function getDueCardIds(): Set<string> {
  const ids = new Set<string>();
  for (const chapter of CHAPTERS) {
    for (const card of chapter.cards) {
      const state = loadCardState(card.id);
      if (state !== null && isDue(state)) {
        ids.add(card.id);
      }
    }
  }
  return ids;
}

/**
 * Returns SessionCards for cards that are due but not already in the queue.
 * Used to hot-append newly-due cards during an active session.
 */
export function getDueCards(excludeIds: Set<string>): SessionCard[] {
  const currentChapterNumber = getCurrentChapter();
  const seenByChapter = getMaxSeenSentenceByChapter();
  const result: SessionCard[] = [];
  for (const chapter of CHAPTERS) {
    for (const card of chapter.cards) {
      if (excludeIds.has(card.id)) continue;
      const state = loadCardState(card.id);
      if (state !== null && isDue(state)) {
        result.push(toSessionCard(card, currentChapterNumber, seenByChapter));
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// buildSession
// ---------------------------------------------------------------------------

/**
 * Build a session queue for the current learning session.
 *
 * @param dailyNewWordBudget - Maximum new words the user wants to learn per day.
 *   Due reviews are unlimited — all due cards are included regardless of this cap.
 *   New words are limited to: Math.max(0, dailyNewWordBudget - wordsIntroducedToday).
 *
 * Session composition:
 *   1. ALL due review cards (no fixed limit — continuous sessions review everything due)
 *   2. New words up to remaining daily budget (current chapter first, then next chapters)
 *   3. Due reviews are shuffled for variety; new words follow after reviews
 *
 * NOTE: buildSession is pure/idempotent — it does NOT call recordNewWordsIntroduced.
 * The caller (challenge.tsx) must record introduced words at session completion.
 *
 * If dailyNewWordBudget is 0, returns reviews only (no new words).
 * If total available cards < session size, returns as many as available.
 */
export function buildSession(dailyNewWordBudget: number, _sourceApp?: string): SessionCard[] {
  const currentChapterNumber = getCurrentChapter();
  const seenByChapter = getMaxSeenSentenceByChapter();

  // --- Collect ALL due review cards -------------------------------------
  // No fixed limit — continuous sessions review everything that is due.
  const dueCards: ClozeCard[] = [];
  for (const chapter of CHAPTERS) {
    for (const card of chapter.cards) {
      const state = loadCardState(card.id);
      if (state !== null && isDue(state)) {
        dueCards.push(card);
      }
    }
  }

  // --- Collect new words (no CardState) -----------------------------------
  // Source: current chapter first, then subsequent chapters in order.
  const newCards: ClozeCard[] = [];
  const currentChapterIndex = CHAPTERS.findIndex(
    (ch) => ch.chapterNumber === currentChapterNumber,
  );

  // Gather new cards from current chapter and subsequent chapters
  for (let i = currentChapterIndex; i < CHAPTERS.length; i++) {
    for (const card of CHAPTERS[i].cards) {
      const state = loadCardState(card.id);
      if (state === null) {
        newCards.push(card);
      }
    }
  }

  // --- Apply daily new-word budget ----------------------------------------
  // Calculate how many new words can still be introduced today.
  const remainingBudget = Math.max(0, dailyNewWordBudget - loadNewWordsIntroducedToday());
  const selectedNew = newCards.slice(0, remainingBudget);

  // Combine: shuffled due reviews first, then new words
  const selected = [...shuffle(dueCards), ...selectedNew];

  return selected.map((card) => toSessionCard(card, currentChapterNumber, seenByChapter));
}

// ---------------------------------------------------------------------------
// handleWrongAnswer
// ---------------------------------------------------------------------------

/**
 * Re-insert a wrong-answer card into the queue ~4 positions ahead.
 *
 * Insertion position: min(currentIndex + 4, queue.length)
 *   - This places the card 4 spots ahead, or appends if near end
 *   - Does NOT increase the "original" card count for progress dots
 *     (the re-inserted card is a bonus attempt)
 *
 * Returns a new array (immutable — original queue is not modified).
 */
export function handleWrongAnswer(
  queue: SessionCard[],
  currentIndex: number,
  wrongCard: SessionCard,
): SessionCard[] {
  const insertAt = Math.min(currentIndex + 4, queue.length);
  const newQueue = [...queue];
  newQueue.splice(insertAt, 0, wrongCard);
  return newQueue;
}
