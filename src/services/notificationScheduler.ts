/**
 * Notification Scheduler — batch scheduling logic for vocabulary reminders
 *
 * Schedules a batch of vocabulary notifications when the app goes to background.
 * Each notification contains a different due card, staggered at interval multiples.
 *
 * Notification flow:
 *   1. App goes to background → scheduleNotificationBatch()
 *   2. Pick up to MAX_BATCH_SIZE due repetition cards
 *   3. For each card i: schedule notification at (i+1) × interval seconds
 *   4. User answers inline (app stays background) → FSRS updated, rest of batch untouched
 *   5. App returns to foreground → cancelAllNotifications()
 *   6. Background fetch fires → cancel all, reschedule fresh batch
 */

import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { loadCardState, loadNotificationInterval, saveNotificationInterval, loadNotificationActiveHours } from './storage';
import { isDue, getAnswerType } from './fsrs';
import { getAllEnabledChapters } from '../content/bundles';
import { buildMcChoices } from '../utils/cardChoices';
import type { NotificationData } from './notificationService';
import type { ClozeCard } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of notifications in a single batch */
const MAX_BATCH_SIZE = 8;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Notification interval in seconds (default 900 = 15 min) */
let notificationInterval = 900;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Get all due ClozeCard repetition cards across all enabled builtin bundles.
 *  Imported deck SimpleCards are excluded — notifications require cloze sentences. */
function getDueReviewCards(): ClozeCard[] {
  const dueCards: ClozeCard[] = [];
  for (const chapter of getAllEnabledChapters()) {
    for (const card of chapter.cards) {
      if (card.kind !== 'cloze') continue; // Skip SimpleCards
      const state = loadCardState(card.id);
      // Only repetition cards (have state) where FSRS says due
      if (state !== null && isDue(state)) {
        dueCards.push(card);
      }
    }
  }
  return dueCards;
}

/**
 * Build notification content for a single card.
 * Returns the content object and trigger-independent data.
 */
function buildNotificationContent(card: ClozeCard): {
  content: Notifications.NotificationContentInput;
  categoryIdentifier: string;
} {
  const cardState = loadCardState(card.id);
  const answerType = getAnswerType(cardState);

  let body = card.sentence; // Cloze sentence
  let categoryIdentifier = 'vocabulary-text';
  let choices: string[] | undefined;
  let mcMapping: Record<string, string> | undefined;

  if (answerType === 'mc4') {
    categoryIdentifier = 'vocabulary-mc';
    choices = buildMcChoices(card);
    mcMapping = buildMcMapping(choices);
    body += '\n\n' + formatChoicesForBody(choices);
  }

  const data: NotificationData = {
    cardId: card.id,
    correctAnswer: card.wordInContext,
    choices,
    answerType,
    mcMapping,
  };

  return {
    content: {
      title: '',
      body,
      data: data as unknown as Record<string, unknown>,
      categoryIdentifier,
    },
    categoryIdentifier,
  };
}

// ---------------------------------------------------------------------------
// Active hours helpers
// ---------------------------------------------------------------------------

/**
 * Calculate seconds until the active window opens.
 * Returns null if we are currently within the active window.
 */
function getSecondsUntilWindowOpen(startHour: number, endHour: number): number | null {
  const now = new Date();
  const currentHour = now.getHours();

  // If within window, return null (already open)
  if (currentHour >= startHour && currentHour < endHour) return null;

  // Calculate seconds until startHour
  let hoursUntil = startHour - currentHour;
  if (hoursUntil <= 0) hoursUntil += 24; // next day
  return hoursUntil * 3600 - now.getMinutes() * 60 - now.getSeconds();
}

/**
 * Check whether a given fire date falls within the active hours window.
 */
function isWithinActiveHours(fireDate: Date, startHour: number, endHour: number): boolean {
  const hour = fireDate.getHours();
  return hour >= startHour && hour < endHour;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Schedule a batch of vocabulary notifications, one per due card, staggered
 * at interval multiples (1×interval, 2×interval, ...).
 *
 * Respects the user's configured active hours window — notifications will
 * only fire within that window. If currently outside the window, the batch
 * is offset to start when the next window opens.
 *
 * Guards:
 *   - Returns early if app is currently in foreground (active)
 *   - Returns early if no due cards
 *
 * Cancels all existing notifications before scheduling the new batch.
 */
export async function scheduleNotificationBatch(): Promise<void> {
  // Guard: don't schedule while app is in foreground
  if (AppState.currentState === 'active') {
    console.log('[NotificationScheduler] App is active — not scheduling');
    return;
  }

  // Get due cards
  const dueCards = getDueReviewCards();

  // Guard: no cards due
  if (dueCards.length === 0) {
    console.log('[NotificationScheduler] No due cards — not scheduling');
    return;
  }

  // Cancel existing notifications first
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Pick up to MAX_BATCH_SIZE cards
  const batchSize = Math.min(dueCards.length, MAX_BATCH_SIZE);

  // Load active hours
  const { startHour, endHour } = loadNotificationActiveHours();
  const secondsUntilOpen = getSecondsUntilWindowOpen(startHour, endHour);

  console.log('[NotificationScheduler] Scheduling batch', {
    dueCount: dueCards.length,
    batchSize,
    interval: notificationInterval,
    activeHours: `${startHour}:00–${endHour}:00`,
    withinWindow: secondsUntilOpen === null,
  });

  let scheduled = 0;

  if (secondsUntilOpen !== null) {
    // Case B: Currently outside active hours — offset batch to next window open
    for (let i = 0; i < batchSize; i++) {
      const card = dueCards[i];
      const { content } = buildNotificationContent(card);
      const triggerSeconds = secondsUntilOpen + notificationInterval * (i + 1);

      // Verify the fire time still lands within the window
      const fireDate = new Date(Date.now() + triggerSeconds * 1000);
      if (!isWithinActiveHours(fireDate, startHour, endHour)) break;

      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: triggerSeconds,
          repeats: false,
        },
      });
      scheduled++;
    }
  } else {
    // Case A: Currently within active hours — schedule only those within window
    for (let i = 0; i < batchSize; i++) {
      const triggerSeconds = notificationInterval * (i + 1);
      const fireDate = new Date(Date.now() + triggerSeconds * 1000);

      if (!isWithinActiveHours(fireDate, startHour, endHour)) break;

      const card = dueCards[i];
      const { content } = buildNotificationContent(card);

      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: triggerSeconds,
          repeats: false,
        },
      });
      scheduled++;
    }
  }

  console.log('[NotificationScheduler] Batch scheduled:', scheduled, 'notifications');
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
  console.log('[NotificationScheduler] Cancelling all notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Set notification interval and reschedule batch.
 *
 * @param seconds - Interval in seconds (minimum 1 second)
 */
export async function setNotificationInterval(seconds: number): Promise<void> {
  console.log('[NotificationScheduler] Setting interval to', seconds, 'seconds');
  notificationInterval = Math.max(1, seconds);
  saveNotificationInterval(notificationInterval);

  // Reschedule batch with new interval
  await scheduleNotificationBatch();
}

/**
 * Initialize the scheduler: load persisted settings.
 * Called from setupNotifications().
 */
export function initScheduler(): void {
  console.log('[NotificationScheduler] Initializing scheduler');

  // Load persisted interval
  notificationInterval = loadNotificationInterval();

  console.log('[NotificationScheduler] Initialized', {
    interval: notificationInterval,
  });
}
