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

import { isDue, getAnswerType, isCardMastered } from './fsrs';
import { loadCardState } from './storage';
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
 * Build MC choices for a card: correct word + N distractors, shuffled.
 *   - MC2: correct + 1 distractor (2 choices total)
 *   - MC4: correct + 3 distractors (4 choices total)
 */
function buildChoices(card: ClozeCard, answerType: 'mc2' | 'mc4'): string[] {
  const distractorCount = answerType === 'mc2' ? 1 : 3;
  // Take the first N distractors available (pipeline guarantees at least 3)
  const distractors = card.distractors.slice(0, distractorCount);
  const choices = [card.wordInContext, ...distractors];
  return shuffle(choices);
}

// ---------------------------------------------------------------------------
// Session card factory
// ---------------------------------------------------------------------------

function toSessionCard(card: ClozeCard): SessionCard {
  const cardState = loadCardState(card.id); // null = new card
  const answerType = getAnswerType(cardState);

  if (answerType === 'text') {
    return { card, answerType };
  }

  return {
    card,
    answerType,
    choices: buildChoices(card, answerType),
  };
}

// ---------------------------------------------------------------------------
// getCurrentChapter
// ---------------------------------------------------------------------------

/**
 * Returns the chapter number the user is currently working on.
 *
 * Scan CHAPTERS in order. The "current chapter" is the first chapter whose
 * mastery is below 80%. If all chapters are >= 80%, return the last chapter
 * (review mode — you've mastered everything!).
 *
 * Mastery = (mastered cards / total chapter cards) * 100, where a card is
 * mastered if isCardMastered(loadCardState(card.id)) is true.
 */
export function getCurrentChapter(): number {
  for (const chapter of CHAPTERS) {
    const cards = chapter.cards;
    const totalCards = cards.length;
    if (totalCards === 0) continue;

    const masteredCount = cards.reduce((count, card) => {
      const state = loadCardState(card.id);
      if (state === null) return count;
      return isCardMastered(state) ? count + 1 : count;
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
// buildSession
// ---------------------------------------------------------------------------

/**
 * Build a session queue of exactly `cardCount` cards.
 *
 * Priority:
 *   1. Due reviews (FSRS cards where isDue() === true)
 *   2. New words (cards with no CardState in storage)
 *   3. "At least 1 new word" guarantee: even if enough due reviews exist,
 *      replace the last due review slot with a new word
 *
 * Source ordering:
 *   - Reviews: from all loaded card states
 *   - New words: from current chapter first, overflow to next chapters
 *
 * If total available cards < cardCount, returns as many as available.
 */
export function buildSession(cardCount: number, _sourceApp?: string): SessionCard[] {
  const currentChapterNumber = getCurrentChapter();

  // --- Collect due review cards -----------------------------------------
  // We only have states for cards that have been reviewed at least once.
  // Scan all chapters to find due cards (must check each card by ID).
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

  // --- Build queue with due-first priority --------------------------------
  // We need `cardCount` cards, with at least 1 new word.

  // How many due reviews do we take?
  // At most cardCount - 1 (reserve 1 slot for new word guarantee)
  const maxDue = Math.max(0, cardCount - 1);
  const selectedDue = dueCards.slice(0, maxDue);

  // Fill remaining slots with new words
  const remainingSlots = cardCount - selectedDue.length;
  const selectedNew = newCards.slice(0, remainingSlots);

  // Combine: due reviews first, then new words
  const selected = [...selectedDue, ...selectedNew];

  // If we have fewer cards than requested, return what we have
  // (handles case where not enough content exists yet)

  return selected.map((card) => toSessionCard(card));
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
