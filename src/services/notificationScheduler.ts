/**
 * Notification Scheduler — queued scheduling for vocabulary reminders
 *
 * Schedules a queue of vocabulary notifications when the app goes to background,
 * each with a unique ID but the same threadIdentifier for grouping.
 * When the user answers any notification, all previously delivered ones are dismissed.
 *
 * Notification flow:
 *   1. App goes to background → scheduleNotificationBatch()
 *   2. Schedule up to MAX_BATCH_SIZE notifications at interval multiples
 *   3. Each fires at its scheduled time
 *   4. User answers one → dismissDeliveredVocabNotifications() cleans up older ones
 *   5. App returns to foreground → cancelAllNotifications()
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

/** Prefix for vocab notification identifiers */
const VOCAB_ID_PREFIX = 'lingolock-vocab-';

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

/** Format MC choices for notification body */
function formatChoicesForBody(choices: string[]): string {
  const labels = ['A', 'B', 'C', 'D'];
  return choices.map((choice, i) => `${labels[i]}) ${choice}`).join('  ');
}

/** Get all due ClozeCard repetition cards across all enabled builtin bundles. */
function getDueReviewCards(): ClozeCard[] {
  const dueCards: ClozeCard[] = [];
  for (const chapter of getAllEnabledChapters()) {
    for (const card of chapter.cards) {
      if (card.kind !== 'cloze') continue;
      const state = loadCardState(card.id);
      if (state !== null && isDue(state)) {
        dueCards.push(card);
      }
    }
  }
  return dueCards;
}

/**
 * Build notification content for a single card.
 */
function buildNotificationContent(card: ClozeCard): {
  content: Notifications.NotificationContentInput;
  categoryIdentifier: string;
} {
  const cardState = loadCardState(card.id);
  const answerType = getAnswerType(cardState);

  let body = `${card.sentence} [${card.germanHint}]`;
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

function getSecondsUntilWindowOpen(startHour: number, endHour: number): number | null {
  const now = new Date();
  const currentHour = now.getHours();
  if (currentHour >= startHour && currentHour < endHour) return null;
  let hoursUntil = startHour - currentHour;
  if (hoursUntil <= 0) hoursUntil += 24;
  return hoursUntil * 3600 - now.getMinutes() * 60 - now.getSeconds();
}

function isWithinActiveHours(fireDate: Date, startHour: number, endHour: number): boolean {
  const hour = fireDate.getHours();
  return hour >= startHour && hour < endHour;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Schedule a batch of vocabulary notifications, one per due card, staggered
 * at interval multiples. Each gets a unique ID so they all fire independently.
 *
 * @param force  Skip the "app is active" guard. Used after widget answers to
 *               re-schedule with the updated due queue while backgrounded.
 */
export async function scheduleNotificationBatch(force = false): Promise<void> {
  console.log('[NotificationScheduler] scheduleNotificationBatch called, AppState:', AppState.currentState, 'force:', force);
  if (!force && AppState.currentState === 'active') {
    console.log('[NotificationScheduler] App is active — not scheduling');
    return;
  }

  const dueCards = getDueReviewCards();
  console.log('[NotificationScheduler] Due cards found:', dueCards.length);

  if (dueCards.length === 0) {
    console.log('[NotificationScheduler] No due cards — not scheduling');
    return;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();

  const batchSize = Math.min(dueCards.length, MAX_BATCH_SIZE);
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
  const baseOffset = secondsUntilOpen ?? 0;

  for (let i = 0; i < batchSize; i++) {
    const triggerSeconds = baseOffset + notificationInterval * (i + 1);
    const fireDate = new Date(Date.now() + triggerSeconds * 1000);

    if (!isWithinActiveHours(fireDate, startHour, endHour)) break;

    const card = dueCards[i];
    const { content } = buildNotificationContent(card);

    await Notifications.scheduleNotificationAsync({
      identifier: `${VOCAB_ID_PREFIX}${i}`,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: triggerSeconds,
        repeats: false,
      },
    });
    scheduled++;
  }

  console.log('[NotificationScheduler] Batch scheduled:', scheduled, 'notifications');
}

/**
 * Dismiss all previously delivered vocab notifications.
 * Called after the user answers one, so older cards don't pile up.
 */
export async function dismissDeliveredVocabNotifications(): Promise<void> {
  try {
    const delivered = await Notifications.getPresentedNotificationsAsync();
    const vocabIds = delivered
      .filter(n => n.request.identifier.startsWith(VOCAB_ID_PREFIX))
      .map(n => n.request.identifier);
    await Promise.allSettled(vocabIds.map(id => Notifications.dismissNotificationAsync(id)));
  } catch (err) {
    console.error('[NotificationScheduler] Failed to dismiss delivered notifications:', err);
  }
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
  console.log('[NotificationScheduler] Cancelling all notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Re-sync the notification queue after a card was answered outside of
 * notifications (e.g. widget or in-app).
 *
 * The notification batch and widget draw from the same due-card pool.
 * When a card is answered on the widget, its FSRS state changes so it's
 * no longer due — but the pending notification for it is still scheduled.
 * This function cancels all pending notifications, dismisses any already
 * delivered ones, and re-schedules a fresh batch that reflects the new
 * due queue.
 */
export async function rescheduleAfterExternalAnswer(): Promise<void> {
  await dismissDeliveredVocabNotifications();
  await scheduleNotificationBatch(true);
}

/**
 * Set notification interval and reschedule.
 */
export async function setNotificationInterval(seconds: number): Promise<void> {
  console.log('[NotificationScheduler] Setting interval to', seconds, 'seconds');
  notificationInterval = Math.max(1, seconds);
  saveNotificationInterval(notificationInterval);
  await scheduleNotificationBatch();
}

/**
 * Initialize the scheduler: load persisted settings.
 */
export function initScheduler(): void {
  console.log('[NotificationScheduler] Initializing scheduler');
  notificationInterval = loadNotificationInterval();
  console.log('[NotificationScheduler] Initialized', { interval: notificationInterval });
}
