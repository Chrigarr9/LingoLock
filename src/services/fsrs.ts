/**
 * FSRS spaced repetition scheduler for LingoLock
 * Wraps ts-fsrs library with app-specific logic:
 * - Answer type graduation based on stability (mc4 → scramble → text)
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
  enable_short_term: true,   // Intra-day learning step (10min before graduating to Review)
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
 * Determine the answer input type based purely on FSRS stability.
 *
 * Progression: mc4 → scramble → text
 *   - New cards (null state) or stability < 1.0 → mc4 (recognition)
 *   - stability 1.0–1.99 → scramble (letter rearrangement, guided recall)
 *   - stability >= 2.0 → text (free recall)
 *
 * After the first Good answer stability jumps to ~2.3, landing on the scramble/text
 * range. After the first successful scramble review, stability reaches text mode.
 * Lapses drop stability — below 1.0 falls all the way back to mc4.
 *
 * State is intentionally NOT checked: a lapse puts the card into Relearning
 * but one Good answer returns it to Review with low stability (~1.5). Using
 * stability alone ensures the user rebuilds recall through scramble before
 * returning to free text.
 */
export function getAnswerType(cardState: CardState | null): 'mc4' | 'scramble' | 'text' {
  if (cardState === null) return 'mc4';
  if (cardState.stability >= 2.0) return 'text';
  if (cardState.stability >= 1.0) return 'scramble';
  return 'mc4';
}

/**
 * Demote an answer type by one level (used when the user requests a hint).
 *   text → scramble, scramble → mc4, mc4 → mc4 (no further demotion)
 */
export function demoteAnswerType(answerType: 'mc4' | 'scramble' | 'text'): 'mc4' | 'scramble' | 'text' {
  if (answerType === 'text') return 'scramble';
  return 'mc4';
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
 *   0 = never seen (null state)                          → mc4
 *   1 = fragile / learning / relearning (stability < 1.0) → mc4
 *   2 = early recall (stability 1.0–1.99)                 → scramble
 *   3 = building recall (stability 2.0–10)                → text (full hints)
 *   4 = familiar (stability 10–21)
 *   5 = mastered (stability >= 21)
 *
 * Wrong answers reduce stability via FSRS, naturally dropping the level.
 */
export function getCardProgressLevel(cardState: CardState | null): number {
  if (cardState === null) return 0;
  const { stability } = cardState;
  if (stability < 1.0) return 1;
  if (stability < 2.0) return 2;
  if (stability < 10) return 3;
  if (stability < 21) return 4;
  return 5;
}
