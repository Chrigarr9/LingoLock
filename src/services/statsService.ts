/**
 * Stats Service — streak, success rate, chapter mastery, per-app tracking
 *
 * Computes and persists all user-facing progress metrics:
 *   - Streak: consecutive days with ALL due cards completed (not just any session)
 *   - Success rate: global correct/answered percentage
 *   - Chapter mastery: percentage of chapter cards in FSRS Review state
 *   - Per-app stats: sessions and cards answered per source app
 *   - Cards due count: how many FSRS cards are ready for review
 *
 * Date handling: ISO date strings only (YYYY-MM-DD) — no date libraries needed.
 * All comparisons are pure string comparisons after slicing to date portion.
 */

import { loadStats, saveStats, loadCardState, loadNewWordsPerDay, loadNewWordsIntroducedToday, loadEnabledBundles } from './storage';
import { isCardMastered, isDue, getCardProgressLevel, PROGRESS_LEVELS } from './fsrs';
import { getTodayString, getYesterdayString } from '../utils/dateHelpers';
import type { ChapterData } from '../types/vocabulary';
import type { SimpleCard } from '../types/simpleCard';
import { getCurrentChapter } from './cardSelector';
import { getBundle, isImportedBundle } from '../content/bundles';

// ---------------------------------------------------------------------------
// updateStatsAfterSession
// ---------------------------------------------------------------------------

/**
 * Update persisted stats after completing a session.
 *
 * Tracks cards reviewed, session counts, and per-app stats.
 * Does NOT touch streak — streak is only advanced by checkAndAdvanceStreak()
 * when all due cards have been completed.
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
// checkAndAdvanceStreak
// ---------------------------------------------------------------------------

/**
 * Check if all due cards have been completed and advance the streak if so.
 *
 * Reads the total due card count across all enabled bundles (builtin + imported).
 * If due count === 0:
 *   - lastStreakDate == today  → already counted today, no change
 *   - lastStreakDate == yesterday → streak++ (consecutive day)
 *   - lastStreakDate is older OR null → streak = 1 (new streak)
 * If due count > 0: do nothing (streak unchanged).
 *
 * Call this after every card review (in-app, notification, widget).
 */
export function checkAndAdvanceStreak(): void {
  const totalDue = getTotalDueCount();
  if (totalDue > 0) return; // Still cards remaining — no streak advance

  const stats = loadStats();
  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();

  if (stats.lastStreakDate === todayStr) {
    // Already advanced streak today — nothing to do
    return;
  }

  if (stats.lastStreakDate === yesterdayStr) {
    stats.currentStreak += 1;
  } else {
    // Gap or first time — start fresh
    stats.currentStreak = 1;
  }
  stats.lastStreakDate = todayStr;

  saveStats(stats);
}

/**
 * Get total due card count across all enabled bundles (builtin + imported).
 * Used by checkAndAdvanceStreak to determine if all due work is done.
 *
 * Card IDs are pre-namespaced by getBundle() (e.g. "es-de-buenos-aires:gato-ch01-s03"),
 * so we just use card.id directly for storage lookups.
 */
function getTotalDueCount(): number {
  const enabledIds = loadEnabledBundles();
  let totalDue = 0;

  for (const bundleId of enabledIds) {
    const bundle = getBundle(bundleId);

    if (isImportedBundle(bundleId)) {
      // Imported decks: scan simpleCards
      for (const card of bundle.simpleCards) {
        const state = loadCardState(card.id);
        if (state !== null && isDue(state)) {
          totalDue++;
        }
      }
    } else {
      // Builtin decks: scan chapters
      for (const chapter of bundle.chapters) {
        for (const card of chapter.cards) {
          const state = loadCardState(card.id);
          if (state !== null && isDue(state)) {
            totalDue++;
          }
        }
      }
    }
  }

  return totalDue;
}

// ---------------------------------------------------------------------------
// getStreak
// ---------------------------------------------------------------------------

/**
 * Returns the current streak count.
 *
 * A streak is only valid if the last streak date was today or yesterday.
 * If it was more than a day ago, the streak has broken — return 0.
 * (checkAndAdvanceStreak will reset and restart the streak when all due cards are done.)
 */
export function getStreak(): number {
  const stats = loadStats();
  if (!stats.lastStreakDate) return 0;

  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();

  if (stats.lastStreakDate === todayStr || stats.lastStreakDate === yesterdayStr) {
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
 * Progress = mastered / total, where mastered = stability ≥ 21 days.
 * This is intentionally strict — cards must survive multiple review cycles
 * before counting as mastered.
 */
export function getChapterMastery(chapters: ChapterData[], chapterNumber: number): number {
  const cards = chapters.find(ch => ch.chapterNumber === chapterNumber)?.cards ?? [];
  if (cards.length === 0) return 0;

  const masteredCount = cards.reduce((sum, card) => {
    const state = loadCardState(card.id);
    return sum + (state !== null && isCardMastered(state) ? 1 : 0);
  }, 0);

  return Math.round((masteredCount / cards.length) * 100);
}

// ---------------------------------------------------------------------------
// getChapterProgress — granular progress based on FSRS stability levels
// ---------------------------------------------------------------------------

/**
 * Returns granular progress percentage for a chapter (0-100, integer).
 *
 * Each card has a progress level from 0 (new) to PROGRESS_LEVELS (mastered).
 * Progress = sum of all card levels / (total cards × PROGRESS_LEVELS) × 100.
 * This shows incremental progress — even a single review moves the bar.
 */
export function getChapterProgress(chapters: ChapterData[], chapterNumber: number): number {
  const cards = chapters.find(ch => ch.chapterNumber === chapterNumber)?.cards ?? [];
  if (cards.length === 0) return 0;

  const totalLevel = cards.reduce((sum, card) => {
    const state = loadCardState(card.id);
    return sum + getCardProgressLevel(state);
  }, 0);

  return Math.round((totalLevel / (cards.length * PROGRESS_LEVELS)) * 100);
}

// ---------------------------------------------------------------------------
// getCardsDueCount
// ---------------------------------------------------------------------------

/**
 * Returns the total number of cards available for the next session.
 * Includes both FSRS-due review cards AND new cards within the daily budget.
 * Mirrors buildSession's logic so the home screen count matches what a
 * session would actually produce.
 */
export function getCardsDueCount(chapters: ChapterData[]): number {
  // Due review cards — iterate chapters to exactly mirror buildSession's data source.
  // Using loadAllCardStates() would count orphaned states (old card IDs no longer in
  // the bundle), causing the home screen to show a non-zero count when buildSession
  // would actually return an empty session.
  let dueReviews = 0;
  for (const chapter of chapters) {
    for (const card of chapter.cards) {
      const state = loadCardState(card.id);
      if (state !== null && isDue(state)) {
        dueReviews++;
      }
    }
  }

  // New cards available (no stored state yet), from current chapter onward
  const currentChapterNumber = getCurrentChapter(chapters);
  const currentChapterIndex = chapters.findIndex(
    (ch) => ch.chapterNumber === currentChapterNumber,
  );
  let newCardsAvailable = 0;
  for (let i = Math.max(0, currentChapterIndex); i < chapters.length; i++) {
    for (const card of chapters[i].cards) {
      if (loadCardState(card.id) === null) {
        newCardsAvailable++;
      }
    }
  }

  // Apply daily new-word budget (same logic as buildSession)
  const remainingBudget = Math.max(0, loadNewWordsPerDay() - loadNewWordsIntroducedToday());
  const newCardsToIntroduce = Math.min(newCardsAvailable, remainingBudget);

  return dueReviews + newCardsToIntroduce;
}

/**
 * Returns due card count for an imported deck (SimpleCard[]).
 * Same logic as getCardsDueCount but for flat card arrays without chapters.
 *
 * Card IDs are pre-namespaced by getBundle() (e.g. "imported-1:card-42"),
 * so we just use card.id directly.
 */
export function getImportedCardsDueCount(cards: SimpleCard[], _bundleId: string): number {
  let dueReviews = 0;
  let newCardsAvailable = 0;
  for (const card of cards) {
    const state = loadCardState(card.id);
    if (state === null) {
      newCardsAvailable++;
    } else if (isDue(state)) {
      dueReviews++;
    }
  }
  const remainingBudget = Math.max(0, loadNewWordsPerDay() - loadNewWordsIntroducedToday());
  const newCardsToIntroduce = Math.min(newCardsAvailable, remainingBudget);
  return dueReviews + newCardsToIntroduce;
}

// ---------------------------------------------------------------------------
// getCurrentChapterNumber
// ---------------------------------------------------------------------------

/**
 * Returns the current chapter number the user is working on.
 * Delegates to cardSelector.getCurrentChapter() for single source of truth.
 */
export function getCurrentChapterNumber(chapters: ChapterData[]): number {
  return getCurrentChapter(chapters);
}
