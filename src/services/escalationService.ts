/**
 * Escalation logic for Screen Time app blocking.
 *
 * Card requirements escalate exponentially per unlock cycle per day:
 *   Unlock 1: 3 cards, Unlock 2: 6, Unlock 3: 12, Unlock 4: 24, ...
 * Once all FSRS due cards are cleared for the day, switches to flat 3 cards.
 * All counters reset at midnight.
 */

/** Base number of cards for the first unlock */
export const BASE_CARDS = 3;

/** Flat rate after all due cards are cleared */
export const FLAT_RATE_CARDS = 3;

/** Maximum escalation cap (prevents absurd requirements) */
const MAX_ESCALATION = 96;

/**
 * Calculate the number of cards required for the current unlock.
 *
 * @param unlockCount - Number of unlocks completed today (0-indexed)
 * @param dueCardsCleared - Whether all FSRS due cards have been cleared today
 * @returns Number of cards the user must complete
 */
export function getRequiredCardCount(
  unlockCount: number,
  dueCardsCleared: boolean,
): number {
  if (dueCardsCleared) return FLAT_RATE_CARDS;
  return Math.min(BASE_CARDS * Math.pow(2, unlockCount), MAX_ESCALATION);
}

/**
 * Check if the user has cleared all due cards (triggers flat-rate mode).
 *
 * @param totalDueCount - Current total FSRS due card count across all bundles
 * @returns true if flat rate should be used
 */
export function shouldUseFlatRate(totalDueCount: number): boolean {
  return totalDueCount === 0;
}
