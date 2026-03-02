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
  enable_short_term: false,  // No intra-day learning steps; wrong answers re-queued in session
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
    learning_steps: 0,  // Not persisted in CardState; ts-fsrs recomputes from state
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
 * Check if a card has reached mastery (survived at least one full review cycle).
 *
 * Definition: card.state === State.Review
 * Cards in New/Learning/Relearning states are not yet mastered.
 * Used to compute chapter mastery percentage for unlock gates.
 */
export function isCardMastered(cardState: CardState): boolean {
  return cardState.state === (State.Review as number);
}

/**
 * Check if a card is due for review (its next review date is now or in the past).
 */
export function isDue(cardState: CardState): boolean {
  return new Date(cardState.due) <= new Date();
}
