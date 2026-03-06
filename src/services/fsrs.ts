/**
 * FSRS spaced repetition scheduler for LingoLock
 * Wraps ts-fsrs library with app-specific logic:
 * - Answer type graduation based on stability (mc4 → text)
 * - 4-grade rating system (Again / Hard / Good / Easy)
 * - Progressive hint levels for text mode
 * - Card mastery definition for chapter unlock
 * - Serialization helpers for MMKV storage (ISO strings ↔ Date objects)
 *
 * IMPORTANT: The scheduler instance is created ONCE at module level.
 * Do NOT call fsrs() inside individual functions (expensive + loses FSRS params).
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';

import type { CardState } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// FSRS scheduler singleton — created once at module level
// ---------------------------------------------------------------------------

const params = generatorParameters({
  request_retention: 0.9,   // Target 90% recall probability
  maximum_interval: 365,     // Cap intervals at 1 year
  enable_fuzz: true,         // Add ±randomness to intervals (prevents batch bunching)
  enable_short_term: true,   // Intra-day learning steps (1min → 10min → 1day for new cards)
});

const scheduler = fsrs(params);

// ---------------------------------------------------------------------------
// Serialization helpers (internal — not exported)
// ---------------------------------------------------------------------------

/**
 * Convert a persisted CardState (ISO date strings) to a ts-fsrs Card (Date objects).
 * CRITICAL: ts-fsrs expects Date objects, not strings — this conversion is mandatory.
 */
function toFSRSCard(cardState: CardState): Card {
  return {
    due: new Date(cardState.due),
    stability: cardState.stability,
    difficulty: cardState.difficulty,
    elapsed_days: cardState.elapsed_days,
    scheduled_days: cardState.scheduled_days,
    learning_steps: cardState.learning_steps ?? 0,
    reps: cardState.reps,
    lapses: cardState.lapses,
    state: cardState.state as State,
    last_review: cardState.last_review ? new Date(cardState.last_review) : undefined,
  };
}

/**
 * Convert a ts-fsrs Card (Date objects) back to a CardState (ISO strings).
 * Preserves the cardId from the original CardState.
 */
function fromFSRSCard(cardId: string, card: Card): CardState {
  return {
    cardId,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    last_review: card.last_review ? card.last_review.toISOString() : undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an initial CardState for a brand-new card that has never been reviewed.
 * Uses ts-fsrs createEmptyCard() to generate FSRS defaults.
 */
export function createNewCardState(cardId: string): CardState {
  const emptyCard = createEmptyCard();
  return fromFSRSCard(cardId, emptyCard);
}

/** Grade strings accepted by scheduleReview */
export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

/**
 * Schedule the next review for a card after answering.
 *
 * Grades:
 *   'again' — wrong answer, reset to short interval
 *   'hard'  — correct but used hint, shorter next interval
 *   'good'  — correct, normal progression
 *   'easy'  — user already knows this, large stability boost
 */
export function scheduleReview(cardState: CardState, grade: ReviewGrade): CardState {
  const card = toFSRSCard(cardState);
  const ratingMap: Record<ReviewGrade, Grade> = {
    again: Rating.Again,
    hard: Rating.Hard,
    good: Rating.Good,
    easy: Rating.Easy,
  };
  const { card: updatedCard } = scheduler.next(card, new Date(), ratingMap[grade]);
  return fromFSRSCard(cardState.cardId, updatedCard);
}

/**
 * Determine the answer input type based on FSRS stability.
 *
 * Thresholds:
 *   stability < 2.0  → 'mc4'  (new/fragile: 4 choices, vocabulary introduction)
 *   stability >= 2.0 → 'text' (recall: free text with optional hint)
 *
 * New cards (null state) default to 'mc4'.
 */
export function getAnswerType(cardState: CardState | null): 'mc4' | 'text' {
  if (cardState === null) return 'mc4';
  if (cardState.stability < 2.0) return 'mc4';
  return 'text';
}

/** Hint level for text mode — controls how many letters are revealed */
export type HintLevel = 'full' | 'medium' | 'minimal';

/**
 * Determine hint generosity based on stability (text mode only).
 *
 *   stability 2.0–5.0  → 'full'    (first letter + last letter + word length)
 *   stability 5.0–10.0 → 'medium'  (first letter + word length)
 *   stability >= 10.0   → 'minimal' (first letter only)
 */
export function getHintLevel(cardState: CardState): HintLevel {
  if (cardState.stability < 5.0) return 'full';
  if (cardState.stability < 10.0) return 'medium';
  return 'minimal';
}

/**
 * Generate hint text for a word based on hint level.
 *
 * Examples for "pregunta":
 *   full:    "P _ _ _ _ _ _ A"
 *   medium:  "P _ _ _ _ _ _ _"
 *   minimal: "P"
 */
export function generateHintText(word: string, level: HintLevel): string {
  if (word.length === 0) return '';
  const first = word[0].toUpperCase();
  if (word.length === 1) return first;
  if (level === 'minimal') return first;
  const last = word[word.length - 1].toUpperCase();
  const middleCount = Math.max(0, word.length - 2);
  const blanks = Array(middleCount).fill('_').join(' ');
  if (level === 'full') {
    return middleCount > 0 ? `${first} ${blanks} ${last}` : `${first} ${last}`;
  }
  // medium: first + length (all remaining as blanks)
  const allBlanks = Array(word.length - 1).fill('_').join(' ');
  return `${first} ${allBlanks}`;
}

/**
 * Check if a card has completed its initial learning cycle (entered Review state).
 * Used for chapter progression gating — a chapter unlocks when 80% of cards are learned.
 * This is a lower bar than isCardMastered: one successful pass through learning steps.
 */
export function isCardLearned(cardState: CardState): boolean {
  return cardState.state === (State.Review as number);
}

/**
 * Check if a card is truly mastered: high long-term stability (≥21 days).
 * Stability ≥21 means the card has survived multiple review cycles and the
 * forgetting curve has genuinely flattened. Used for stats and progress display.
 */
export function isCardMastered(cardState: CardState): boolean {
  return cardState.stability >= 21;
}

/** Progress label type — 6 levels aligned with FSRS State enum */
export type ProgressLabel = 'New' | 'Learning' | 'Reviewing' | 'Familiar' | 'Mastered' | 'Relearning';

/**
 * Human-readable label for a card's current learning progress.
 * Aligned with ts-fsrs State enum (New=0, Learning=1, Review=2, Relearning=3)
 * with stability sub-divisions for the Review state.
 *
 *   New        — never seen (null)
 *   Learning   — in initial learning steps (State.Learning)
 *   Reviewing  — entered review, stability < 10
 *   Familiar   — solid review, stability 10–21
 *   Mastered   — long-term memory, stability >= 21
 *   Relearning — lapsed, re-entering learning (State.Relearning)
 */
export function getProgressLabel(cardState: CardState | null): ProgressLabel {
  if (cardState === null) return 'New';
  if (cardState.state === (State.Relearning as number)) return 'Relearning';
  if (cardState.state === (State.Learning as number)) return 'Learning';
  if (cardState.stability >= 21) return 'Mastered';
  if (cardState.stability >= 10) return 'Familiar';
  return 'Reviewing';
}

/**
 * Check if a card is due for review (its next review date is now or in the past).
 */
export function isDue(cardState: CardState): boolean {
  return new Date(cardState.due) <= new Date();
}

// ---------------------------------------------------------------------------
// Granular progress levels (for chapter progress bars)
// ---------------------------------------------------------------------------

/** Number of learning phases a card progresses through. */
export const PROGRESS_LEVELS = 5;

/**
 * Returns a card's learning progress level (0-5) based on FSRS stability.
 *
 *   0 = never seen (null state)
 *   1 = fragile / learning / relearning (stability < 2.0)
 *   2 = early recall, just entered text mode (stability 2.0–5.0)
 *   3 = building recall (stability 5.0–10)
 *   4 = familiar (stability 10–21)
 *   5 = mastered (stability >= 21)
 *
 * Wrong answers reduce stability via FSRS, naturally dropping the level.
 */
export function getCardProgressLevel(cardState: CardState | null): number {
  if (cardState === null) return 0;
  const { stability } = cardState;
  if (stability < 2.0) return 1;
  if (stability < 5.0) return 2;
  if (stability < 10) return 3;
  if (stability < 21) return 4;
  return 5;
}
