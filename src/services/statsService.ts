/**
 * Stats Service — streak, success rate, chapter mastery, per-app tracking
 *
 * Computes and persists all user-facing progress metrics:
 *   - Streak: consecutive days with sessions (resets on gaps)
 *   - Success rate: global correct/answered percentage
 *   - Chapter mastery: percentage of chapter cards in FSRS Review state
 *   - Per-app stats: sessions and cards answered per source app
 *   - Cards due count: how many FSRS cards are ready for review
 *
 * Date handling: ISO date strings only (YYYY-MM-DD) — no date libraries needed.
 * All comparisons are pure string comparisons after slicing to date portion.
 */

import { loadStats, saveStats, loadAllCardStates, loadCardState } from './storage';
import { isCardMastered, isDue } from './fsrs';
import { getChapterCards } from '../content/bundle';
import { getCurrentChapter } from './cardSelector';

// ---------------------------------------------------------------------------
// Date helpers (no external library needed)
// ---------------------------------------------------------------------------

/** Returns today's date as YYYY-MM-DD string */
function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns yesterday's date as YYYY-MM-DD string */
function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// updateStatsAfterSession
// ---------------------------------------------------------------------------

/**
 * Update persisted stats after completing a session.
 *
 * Streak logic:
 *   - lastSessionDate == today  → streak unchanged (already counted today)
 *   - lastSessionDate == yesterday → streak++  (consecutive day)
 *   - lastSessionDate is older OR null → streak = 1 (new streak starts)
 *
 * @param correctCount  Number of cards answered correctly
 * @param totalCount    Total number of cards in the session
 * @param sourceApp     App name that triggered the session (e.g., "Instagram")
 */
export function updateStatsAfterSession(
  correctCount: number,
  totalCount: number,
  sourceApp: string,
): void {
  const stats = loadStats();
  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();

  // --- Streak update -------------------------------------------------------
  if (stats.lastSessionDate === todayStr) {
    // Already did a session today — streak stays the same
  } else if (stats.lastSessionDate === yesterdayStr) {
    // Consecutive day — increment
    stats.currentStreak += 1;
  } else {
    // Gap (or first session ever) — start fresh
    stats.currentStreak = 1;
  }
  stats.lastSessionDate = todayStr;

  // --- Totals update -------------------------------------------------------
  stats.totalCorrect += correctCount;
  stats.totalAnswered += totalCount;

  // --- Per-app stats update ------------------------------------------------
  if (!stats.perAppStats[sourceApp]) {
    stats.perAppStats[sourceApp] = { sessions: 0, cards: 0 };
  }
  stats.perAppStats[sourceApp].sessions += 1;
  stats.perAppStats[sourceApp].cards += totalCount;

  // --- Persist -------------------------------------------------------------
  saveStats(stats);
}

// ---------------------------------------------------------------------------
// getStreak
// ---------------------------------------------------------------------------

/**
 * Returns the current streak count.
 *
 * A streak is only valid if the last session was today or yesterday.
 * If the last session was more than a day ago, the streak has broken — return 0.
 * (updateStatsAfterSession will reset and restart the streak on next session.)
 */
export function getStreak(): number {
  const stats = loadStats();
  if (!stats.lastSessionDate) return 0;

  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();

  if (stats.lastSessionDate === todayStr || stats.lastSessionDate === yesterdayStr) {
    return stats.currentStreak;
  }

  // Streak has gone stale (missed days)
  return 0;
}

// ---------------------------------------------------------------------------
// getSuccessRate
// ---------------------------------------------------------------------------

/**
 * Returns the global success rate as an integer percentage (0-100).
 * Returns 0 if no answers have been recorded yet.
 */
export function getSuccessRate(): number {
  const stats = loadStats();
  if (stats.totalAnswered === 0) return 0;
  return Math.round((stats.totalCorrect / stats.totalAnswered) * 100);
}

// ---------------------------------------------------------------------------
// getChapterMastery
// ---------------------------------------------------------------------------

/**
 * Returns mastery percentage for a chapter (0-100, integer).
 *
 * Mastery = (cards in State.Review / total chapter cards) * 100
 * Uses isCardMastered to check each card's FSRS state.
 * Cards with no stored state are counted as not mastered.
 */
export function getChapterMastery(chapterNumber: number): number {
  const cards = getChapterCards(chapterNumber);
  if (cards.length === 0) return 0;

  const masteredCount = cards.reduce((count, card) => {
    const state = loadCardState(card.id);
    if (state === null) return count;
    return isCardMastered(state) ? count + 1 : count;
  }, 0);

  return Math.round((masteredCount / cards.length) * 100);
}

// ---------------------------------------------------------------------------
// getCardsDueCount
// ---------------------------------------------------------------------------

/**
 * Returns the total number of cards that are currently due for review.
 * Loads all stored card states and filters by isDue().
 */
export function getCardsDueCount(): number {
  const states = loadAllCardStates();
  return states.filter((state) => isDue(state)).length;
}

// ---------------------------------------------------------------------------
// getCurrentChapterNumber
// ---------------------------------------------------------------------------

/**
 * Returns the current chapter number the user is working on.
 * Delegates to cardSelector.getCurrentChapter() for single source of truth.
 */
export function getCurrentChapterNumber(): number {
  return getCurrentChapter();
}
