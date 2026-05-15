/**
 * Escalation logic for Screen Time app blocking.
 *
 * Two modes:
 *   - Default ("free day when due cleared"): unlocks escalate exponentially
 *     until the FSRS due queue hits 0, at which point shields come off for
 *     the rest of the day. The caller should never invoke this function once
 *     dueCleared is true in default mode — but if it does, returns 0 as a
 *     safe sentinel.
 *   - Keep-blocking (opt-in setting): same exponential ramp while due > 0,
 *     then flat 3 cards per unlock after the queue clears. Re-enables the
 *     pre-build-9 latch as a deliberate user choice.
 *
 * Exponential ramp:
 *   Unlock 1: 3, Unlock 2: 6, 3: 12, 4: 24, 5: 48, 6+: 96 (cap).
 * Counter resets at midnight.
 */

export const BASE_CARDS = 3;
export const FLAT_RATE_CARDS = 3;

const MAX_ESCALATION = 96;

export interface RequirementOptions {
  /** True once any session today brought the FSRS due queue to 0. */
  dueCleared: boolean;
  /** User setting: keep requiring practice even after due is cleared. */
  keepBlocking: boolean;
}

/**
 * Calculate the number of cards required for the current unlock.
 *
 * @param unlockCount - Number of unlocks completed today (0-indexed)
 * @param options - Day-state context. Omit for the pre-clear exponential ramp.
 */
export function getRequiredCardCount(
  unlockCount: number,
  options: RequirementOptions = { dueCleared: false, keepBlocking: false },
): number {
  if (options.dueCleared) {
    return options.keepBlocking ? FLAT_RATE_CARDS : 0;
  }
  return Math.min(BASE_CARDS * Math.pow(2, unlockCount), MAX_ESCALATION);
}
