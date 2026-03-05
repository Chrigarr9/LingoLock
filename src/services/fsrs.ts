/**
 * FSRS spaced repetition scheduler for LingoLock
 * Wraps ts-fsrs library with app-specific logic:
 * - Answer type graduation based on stability (mc2 → mc4 → text)
 * - Card mastery definition for chapter unlock
 * - Serialization helpers for MMKV storage (ISO strings ↔ Date objects)
 *
 * IMPORTANT: The scheduler instance is created ONCE at module level.
 * Do NOT call fsrs() inside individual functions (expensive + loses FSRS params).
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import type { Card } from 'ts-fsrs';

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

/**
 * Schedule the next review for a card after answering.
 *
 * Converts the stored CardState to a ts-fsrs Card, runs the FSRS algorithm
 * with Rating.Good (correct) or Rating.Again (incorrect), then converts the
 * result back to CardState for MMKV persistence.
 *
 * NOTE: Only Rating.Good and Rating.Again are used. Rating.Easy and Rating.Hard
 * are intentionally excluded (per design decision: binary correct/incorrect UX).
 */
export function scheduleReview(cardState: CardState, correct: boolean): CardState {
  const card = toFSRSCard(cardState);
  const grade = correct ? Rating.Good : Rating.Again;
  const { card: updatedCard } = scheduler.next(card, new Date(), grade);
  return fromFSRSCard(cardState.cardId, updatedCard);
}

/**
 * Determine the answer input type based on FSRS stability.
 *
 * Stability reflects how well a card is known — higher stability = longer
 * safe interval = card is more familiar = harder answer type is appropriate.
 *
 * Thresholds:
 *   stability < 1.5  → 'mc2'  (new/fragile: 50% baseline, binary choice)
 *   stability < 4.0  → 'mc4'  (building: 25% baseline, four choices)
 *   stability >= 4.0 → 'text' (mastery: pure recall, no hints)
 *
 * New cards (null state) default to 'mc2' for gradual onboarding.
 */
export function getAnswerType(cardState: CardState | null): 'mc2' | 'mc4' | 'text' {
  if (cardState === null) return 'mc2';
  const { stability } = cardState;
  if (stability < 1.5) return 'mc2';
  if (stability < 4.0) return 'mc4';
  return 'text';
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

/**
 * Human-readable label for a card's current learning progress.
 *   New        — never seen
 *   Seen       — answered once, still fragile
 *   Recognized — building recall, showing as MC4
 *   Remembered — solid recall, showing as free text
 *   Mastered   — long-term memory, stability ≥21 days
 */
export function getProgressLabel(
  cardState: CardState | null,
): 'New' | 'Seen' | 'Recognized' | 'Remembered' | 'Mastered' {
  if (cardState === null) return 'New';
  const { stability } = cardState;
  if (stability < 1.5) return 'Seen';
  if (stability < 4.0) return 'Recognized';
  if (stability < 21) return 'Remembered';
  return 'Mastered';
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
 * Each level roughly corresponds to one successful review:
 *   0 = never seen (null state)
 *   1 = seen but fragile / after lapse (stability < 1.5)
 *   2 = first correct, MC4 difficulty (stability 1.5–4.0)
 *   3 = solid recall, text input level (stability 4.0–10)
 *   4 = strong recall (stability 10–21)
 *   5 = long-term mastery (stability >= 21)
 *
 * Wrong answers reduce stability via FSRS, naturally dropping the level.
 */
export function getCardProgressLevel(cardState: CardState | null): number {
  if (cardState === null) return 0;
  const { stability } = cardState;
  if (stability < 1.5) return 1;
  if (stability < 4.0) return 2;
  if (stability < 10) return 3;
  if (stability < 21) return 4;
  return 5;
}
