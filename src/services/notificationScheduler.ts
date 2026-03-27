/**
 * Notification Scheduler — queued scheduling for vocabulary reminders
 *
 * Pre-schedules up to 64 notifications (iOS limit) when the app goes to
 * background. Cards are assigned to time slots based on their FSRS due date:
 * currently-due cards fill the earliest slots, future-due cards are placed at
 * the first slot on or after their due date.
 *
 * Notification flow:
 *   1. App goes to background → scheduleNotificationBatch()
 *   2. Scan all reviewed cards, sort by FSRS due date
 *   3. Generate up to 64 slots at interval multiples, filtered to active hours
 *   4. Assign one card per slot (earliest-due first)
 *   5. Each fires at its scheduled time; handleNotification suppresses stale ones
 *   6. User answers one → dismissDeliveredVocabNotifications() cleans up older ones
 *   7. App returns to foreground → cancelAllNotifications()
 */

import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { loadCardState, loadNotificationInterval, saveNotificationInterval, loadNotificationActiveHours } from './storage';
import { getAnswerType } from './fsrs';
import { getAllEnabledChapters } from '../content/bundles';
import { buildMcChoices } from '../utils/cardChoices';
import type { NotificationData } from './notificationService';
import type { ClozeCard } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** iOS allows up to 64 locally scheduled notifications */
const MAX_BATCH_SIZE = 64;

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

interface UpcomingCard {
  card: ClozeCard;
  dueAt: number; // ms since epoch
}

/**
 * Get all reviewed ClozeCards across enabled bundles, with their FSRS due
 * timestamps. Includes both currently-due and future-due cards so we can
 * pre-schedule notifications for cards that will become due later.
 * Sorted by due date ascending (earliest due first).
 */
function getUpcomingReviewCards(): UpcomingCard[] {
  const cards: UpcomingCard[] = [];
  for (const chapter of getAllEnabledChapters()) {
    for (const card of chapter.cards) {
      if (card.kind !== 'cloze') continue;
      const state = loadCardState(card.id);
      if (state !== null) {
        cards.push({ card, dueAt: new Date(state.due).getTime() });
      }
    }
  }
  cards.sort((a, b) => a.dueAt - b.dueAt);
  return cards;
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
 * Schedule up to 64 vocabulary notifications at interval multiples.
 *
 * Generates time slots (now + interval×1, now + interval×2, …) within the
 * active hours window, then assigns cards sorted by FSRS due date: each card
 * lands on the first slot at or after its due time. This means currently-due
 * cards fill the earliest slots, and cards becoming due in the future fire at
 * the right time without relying on background task wakeups.
 *
 * @param force  Skip the "app is active" guard. Used after widget/notification
 *               answers to re-schedule with the updated due queue.
 */
export async function scheduleNotificationBatch(force = false): Promise<void> {
  console.log('[NotificationScheduler] scheduleNotificationBatch called, AppState:', AppState.currentState, 'force:', force);
  if (!force && AppState.currentState === 'active') {
    console.log('[NotificationScheduler] App is active — not scheduling');
    return;
  }

  const upcomingCards = getUpcomingReviewCards();
  console.log('[NotificationScheduler] Reviewed cards found:', upcomingCards.length);

  if (upcomingCards.length === 0) {
    console.log('[NotificationScheduler] No reviewed cards — not scheduling');
    return;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();

  const { startHour, endHour } = loadNotificationActiveHours();
  const now = Date.now();
  const secondsUntilOpen = getSecondsUntilWindowOpen(startHour, endHour);
  const baseOffset = secondsUntilOpen ?? 0;

  // Generate time slots at interval multiples, filtered to active hours
  const slots: number[] = []; // ms timestamps
  for (let i = 0; i < MAX_BATCH_SIZE; i++) {
    const triggerSeconds = baseOffset + notificationInterval * (i + 1);
    const fireTime = now + triggerSeconds * 1000;
    if (!isWithinActiveHours(new Date(fireTime), startHour, endHour)) break;
    slots.push(fireTime);
  }

  if (slots.length === 0) {
    console.log('[NotificationScheduler] No slots within active hours');
    return;
  }

  console.log('[NotificationScheduler] Scheduling', {
    reviewedCards: upcomingCards.length,
    availableSlots: slots.length,
    interval: notificationInterval,
    activeHours: `${startHour}:00–${endHour}:00`,
    withinWindow: secondsUntilOpen === null,
    windowEnd: new Date(slots[slots.length - 1]).toLocaleTimeString(),
  });

  // Assign cards to slots: cards are sorted by dueAt ascending.
  // Walk both arrays forward — each card gets the first slot where slotTime >= dueAt.
  let cardIdx = 0;
  let scheduled = 0;

  for (let slotIdx = 0; slotIdx < slots.length && cardIdx < upcomingCards.length; slotIdx++) {
    const slotTime = slots[slotIdx];

    // Current card isn't due yet at this slot — skip slot, try the next one
    if (upcomingCards[cardIdx].dueAt > slotTime) {
      continue;
    }

    const { card } = upcomingCards[cardIdx];
    const { content } = buildNotificationContent(card);
    const triggerSeconds = Math.max(1, Math.round((slotTime - now) / 1000));

    await Notifications.scheduleNotificationAsync({
      identifier: `${VOCAB_ID_PREFIX}${slotIdx}`,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: triggerSeconds,
        repeats: false,
      },
    });

    cardIdx++;
    scheduled++;
  }

  const beyond = upcomingCards.length - cardIdx;
  console.log('[NotificationScheduler] Batch scheduled:', scheduled, 'notifications' +
    (beyond > 0 ? ` (${beyond} cards due beyond window)` : ''));
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
