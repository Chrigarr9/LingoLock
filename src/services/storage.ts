/**
 * MMKV storage service for LingoLock
 * Two separate storage instances: card FSRS states and stats/progress
 *
 * MMKV v4 uses createMMKV() factory (NOT new MMKV() constructor).
 * All reads are synchronous — no async loading delays on challenge screen start.
 */
import { createMMKV } from 'react-native-mmkv';

import type { CardState, PersistedStats } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// Singleton storage instances
// ---------------------------------------------------------------------------

/** Storage for FSRS card states — keyed by cardId */
export const cardStorage = createMMKV({ id: 'lingolock.cards' });

/** Storage for user stats and progress */
export const statsStorage = createMMKV({ id: 'lingolock.stats' });

// ---------------------------------------------------------------------------
// Card state CRUD
// ---------------------------------------------------------------------------

/**
 * Persist a card's FSRS state to MMKV.
 * Serializes the CardState object to JSON string.
 */
export function saveCardState(cardId: string, state: CardState): void {
  cardStorage.set(cardId, JSON.stringify(state));
}

/**
 * Load a card's FSRS state from MMKV.
 * Returns null if the card has never been reviewed.
 *
 * NOTE: Date fields (due, last_review) are ISO strings — they remain as
 * strings in CardState. The FSRS service reconstructs Date objects when
 * calling ts-fsrs.
 */
export function loadCardState(cardId: string): CardState | null {
  const raw = cardStorage.getString(cardId);
  if (!raw) return null;
  return JSON.parse(raw) as CardState;
}

/**
 * Load all card states from MMKV.
 * Used by stats computation and card selector logic.
 */
export function loadAllCardStates(): CardState[] {
  const keys = cardStorage.getAllKeys();
  const states: CardState[] = [];
  for (const key of keys) {
    const state = loadCardState(key);
    if (state !== null) {
      states.push(state);
    }
  }
  return states;
}

/**
 * Delete a card's FSRS state from MMKV.
 * Typically used when a card is removed or reset.
 */
export function deleteCardState(cardId: string): void {
  cardStorage.remove(cardId);
}

// ---------------------------------------------------------------------------
// Stats persistence
// ---------------------------------------------------------------------------

const STATS_KEY = 'stats';

const DEFAULT_STATS: PersistedStats = {
  currentStreak: 0,
  lastSessionDate: null,
  totalCorrect: 0,
  totalAnswered: 0,
  perAppStats: {},
  abortsToday: 0,
  lastAbortDate: null,
  totalAborts: 0,
};

/**
 * Persist user stats to MMKV.
 */
export function saveStats(stats: PersistedStats): void {
  statsStorage.set(STATS_KEY, JSON.stringify(stats));
}

/**
 * Load user stats from MMKV.
 * Returns sensible defaults if no stats have been saved yet.
 */
export function loadStats(): PersistedStats {
  const raw = statsStorage.getString(STATS_KEY);
  if (!raw) return { ...DEFAULT_STATS, perAppStats: {} };
  return JSON.parse(raw) as PersistedStats;
}

// ---------------------------------------------------------------------------
// Audio preferences
// ---------------------------------------------------------------------------

const AUDIO_MUTED_KEY = 'audio_muted';

/**
 * Load the user's audio mute preference.
 * Returns false (unmuted) if never set.
 */
export function loadAudioMuted(): boolean {
  return statsStorage.getBoolean(AUDIO_MUTED_KEY) ?? false;
}

/**
 * Persist the user's audio mute preference.
 */
export function saveAudioMuted(muted: boolean): void {
  statsStorage.set(AUDIO_MUTED_KEY, muted);
}

// ---------------------------------------------------------------------------
// New-words-per-day preferences and daily tracking
// ---------------------------------------------------------------------------

const NEW_WORDS_PER_DAY_KEY = 'new_words_per_day';
const NEW_WORDS_TODAY_KEY = 'new_words_today';
const NEW_WORDS_TODAY_DATE_KEY = 'new_words_today_date';

/**
 * Load the configured daily new-word limit.
 * Returns 20 if never set.
 */
export function loadNewWordsPerDay(): number {
  return statsStorage.getNumber(NEW_WORDS_PER_DAY_KEY) ?? 20;
}

/**
 * Persist the daily new-word limit.
 * Clamped to [1, 50].
 */
export function saveNewWordsPerDay(n: number): void {
  statsStorage.set(NEW_WORDS_PER_DAY_KEY, Math.max(1, Math.min(50, n)));
}

/**
 * Load how many new words have been introduced today.
 * Returns 0 if on a new calendar day or never set.
 */
export function loadNewWordsIntroducedToday(): number {
  const today = new Date().toISOString().slice(0, 10);
  const storedDate = statsStorage.getString(NEW_WORDS_TODAY_DATE_KEY);
  if (storedDate !== today) return 0;
  return statsStorage.getNumber(NEW_WORDS_TODAY_KEY) ?? 0;
}

/**
 * Record that `count` new words were introduced today.
 * Adds to today's running total and sets the date stamp.
 * Call this from challenge.tsx at session completion — NOT inside buildSession.
 */
export function recordNewWordsIntroduced(count: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const current = loadNewWordsIntroducedToday();
  statsStorage.set(NEW_WORDS_TODAY_DATE_KEY, today);
  statsStorage.set(NEW_WORDS_TODAY_KEY, current + count);
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

const NOTIFICATION_INTERVAL_KEY = 'notification_interval';
const NOTIFICATION_SWIPE_AWAY_DATE_KEY = 'notification_swipe_away_date';
const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled';

/**
 * Load the notification interval in seconds.
 * Returns 300 (5 minutes) if never set.
 */
export function loadNotificationInterval(): number {
  return statsStorage.getNumber(NOTIFICATION_INTERVAL_KEY) ?? 300;
}

/**
 * Persist the notification interval in seconds.
 */
export function saveNotificationInterval(seconds: number): void {
  statsStorage.set(NOTIFICATION_INTERVAL_KEY, seconds);
}

/**
 * Load the date when user last swiped away a notification.
 * Returns null if never set or not today.
 */
export function loadNotificationSwipeAwayDate(): string | null {
  return statsStorage.getString(NOTIFICATION_SWIPE_AWAY_DATE_KEY) ?? null;
}

/**
 * Persist the swipe-away date (YYYY-MM-DD format).
 */
export function saveNotificationSwipeAwayDate(date: string): void {
  statsStorage.set(NOTIFICATION_SWIPE_AWAY_DATE_KEY, date);
}

/**
 * Load whether notifications are enabled.
 * Returns true (enabled) if never set.
 */
export function loadNotificationsEnabled(): boolean {
  return statsStorage.getBoolean(NOTIFICATIONS_ENABLED_KEY) ?? true;
}

/**
 * Persist notification enabled state.
 */
export function saveNotificationsEnabled(enabled: boolean): void {
  statsStorage.set(NOTIFICATIONS_ENABLED_KEY, enabled);
}

// ---------------------------------------------------------------------------
// Debug / testing utilities
// ---------------------------------------------------------------------------

/**
 * Clear both storages.
 * For debugging and testing only — do NOT call in production flows.
 */
export function clearAllData(): void {
  cardStorage.clearAll();
  statsStorage.clearAll();
}
