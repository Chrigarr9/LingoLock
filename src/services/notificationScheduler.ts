/**
 * Notification Scheduler — core scheduling logic for vocabulary reminders
 *
 * Schedules vocabulary notifications at configurable intervals, picks due repetition
 * cards, formats notification content (cloze sentence + MC choices), and manages
 * pause/resume and swipe-away streak tracking.
 *
 * Notification flow:
 *   1. Screen unlock detection triggers scheduleNextNotification()
 *   2. Pick next due repetition card (cards with FSRS state where isDue() is true)
 *   3. Format notification: cloze sentence, MC choices in body, mcMapping in data
 *   4. Schedule with trigger: { seconds: notificationInterval, repeats: false }
 *   5. User answers -> response handler updates FSRS -> calls scheduleNextNotification() again
 *
 * Guards:
 *   - isPaused: true when user is in practice session (no notifications during active practice)
 *   - isSwipedAwayToday: true after swipe-away, resets next day
 *   - No cards due: getDueReviewCardCount() === 0 (all caught up)
 */

import * as Notifications from 'expo-notifications';
import { loadCardState, loadAllCardStates } from './storage';
import {
  loadNotificationInterval,
  saveNotificationInterval,
  loadNotificationSwipeAwayDate,
  saveNotificationSwipeAwayDate,
} from './storage';
import { isDue, getAnswerType } from './fsrs';
import { CHAPTERS } from '../content/bundle';
import type { NotificationData } from './notificationService';
import type { ClozeCard } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Paused when user is in practice session */
let isPaused = false;

/** True after swipe-away, resets next day */
let isSwipedAwayToday = false;

/** Notification interval in seconds (default 300 = 5 min) */
let notificationInterval = 300;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's date as YYYY-MM-DD string */
function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fisher-Yates shuffle for MC choices */
function shuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Build MC choices for a card */
function buildChoices(card: ClozeCard, answerType: 'mc2' | 'mc4'): string[] {
  const distractorCount = answerType === 'mc2' ? 1 : 3;
  const distractors = card.distractors.slice(0, distractorCount);
  const choices = [card.wordInContext, ...distractors];
  return shuffle(choices);
}

/** Build mcMapping from choices (maps action IDs to actual choice words) */
function buildMcMapping(choices: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const actionIds = ['answer-a', 'answer-b', 'answer-c', 'answer-d'];
  choices.forEach((choice, index) => {
    if (index < actionIds.length) {
      mapping[actionIds[index]] = choice;
    }
  });
  return mapping;
}

/** Format MC choices for notification body (e.g., "A) word1  B) word2  C) word3  D) word4") */
function formatChoicesForBody(choices: string[]): string {
  const labels = ['A', 'B', 'C', 'D'];
  return choices.map((choice, i) => `${labels[i]}) ${choice}`).join('  ');
}

/** Get all due repetition cards across all chapters */
function getDueReviewCards(): ClozeCard[] {
  const dueCards: ClozeCard[] = [];
  for (const chapter of CHAPTERS) {
    for (const card of chapter.cards) {
      const state = loadCardState(card.id);
      // Only repetition cards (have state) where FSRS says due
      if (state !== null && isDue(state)) {
        dueCards.push(card);
      }
    }
  }
  return dueCards;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Schedule the next vocabulary notification.
 *
 * Guards:
 *   - Returns early if paused (user in practice session)
 *   - Returns early if swiped away today (streak broken, paused until next day)
 *   - Returns early if no due cards (all caught up)
 *
 * Picks first due repetition card, formats content, schedules notification.
 */
export async function scheduleNextNotification(): Promise<void> {
  console.log('[NotificationScheduler] scheduleNextNotification called', {
    isPaused,
    isSwipedAwayToday,
  });

  // Guard: paused during practice session
  if (isPaused) {
    console.log('[NotificationScheduler] Paused - not scheduling');
    return;
  }

  // Guard: swiped away today (streak broken)
  if (isSwipedAwayToday) {
    console.log('[NotificationScheduler] Swiped away today - not scheduling');
    return;
  }

  // Get due cards
  const dueCards = getDueReviewCards();

  // Guard: no cards due
  if (dueCards.length === 0) {
    console.log('[NotificationScheduler] No due cards - not scheduling');
    return;
  }

  // Pick first due card
  const card = dueCards[0];
  const cardState = loadCardState(card.id);
  const answerType = getAnswerType(cardState);

  console.log('[NotificationScheduler] Scheduling notification', {
    cardId: card.id,
    answerType,
    dueCount: dueCards.length,
    interval: notificationInterval,
  });

  // Cancel existing notifications first (prevent duplicates)
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Format notification content
  let body = card.sentence; // Cloze sentence (minimal per user decision)
  let categoryIdentifier = 'vocabulary-text';
  let choices: string[] | undefined;
  let mcMapping: Record<string, string> | undefined;

  if (answerType === 'mc2' || answerType === 'mc4') {
    // MC card: append choices to body, set MC category
    categoryIdentifier = 'vocabulary-mc';
    choices = buildChoices(card, answerType);
    mcMapping = buildMcMapping(choices);
    body += '\n\n' + formatChoicesForBody(choices);
  }

  // Build data payload
  const data: NotificationData = {
    cardId: card.id,
    correctAnswer: card.wordInContext,
    choices,
    answerType,
    deliveryTime: Date.now(),
    mcMapping,
  };

  // Schedule notification
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '', // Minimal per user decision
      body,
      data: data as unknown as Record<string, unknown>,
      categoryIdentifier,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: notificationInterval,
      repeats: false,
    },
  });

  console.log('[NotificationScheduler] Notification scheduled');
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
  console.log('[NotificationScheduler] Cancelling all notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Pause notifications (e.g., when user enters practice session).
 */
export async function pauseNotifications(): Promise<void> {
  console.log('[NotificationScheduler] Pausing notifications');
  isPaused = true;
  await cancelAllNotifications();
}

/**
 * Resume notifications (e.g., when user exits practice session).
 */
export async function resumeNotifications(): Promise<void> {
  console.log('[NotificationScheduler] Resuming notifications');
  isPaused = false;
  // Schedule next notification immediately
  await scheduleNextNotification();
}

/**
 * Handle swipe-away: break streak, pause until next day.
 */
export async function handleSwipeAway(): Promise<void> {
  console.log('[NotificationScheduler] Handling swipe-away');

  const today = getTodayString();
  isSwipedAwayToday = true;
  saveNotificationSwipeAwayDate(today);

  await cancelAllNotifications();

  // Break streak: this is handled by statsService when timeout expires
  // (see processNotificationAnswer in notificationService.ts)
}

/**
 * Set notification interval and reschedule if active.
 *
 * @param seconds - Interval in seconds (minimum 1 second)
 */
export async function setNotificationInterval(seconds: number): Promise<void> {
  console.log('[NotificationScheduler] Setting interval to', seconds, 'seconds');
  notificationInterval = Math.max(1, seconds);
  saveNotificationInterval(notificationInterval);

  // Reschedule if currently active (not paused, not swiped away)
  if (!isPaused && !isSwipedAwayToday) {
    await scheduleNextNotification();
  }
}

/**
 * Initialize the scheduler: load persisted settings, check swipe-away date.
 * Called from setupNotifications().
 */
export function initScheduler(): void {
  console.log('[NotificationScheduler] Initializing scheduler');

  // Load persisted interval
  notificationInterval = loadNotificationInterval();

  // Check swipe-away date
  const swipeAwayDate = loadNotificationSwipeAwayDate();
  const today = getTodayString();
  isSwipedAwayToday = swipeAwayDate === today;

  console.log('[NotificationScheduler] Initialized', {
    interval: notificationInterval,
    isSwipedAwayToday,
  });
}

/**
 * Check if notifications are currently paused.
 */
export function isNotificationPaused(): boolean {
  return isPaused;
}
