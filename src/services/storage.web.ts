/**
 * Web platform storage adapter for LingoLock
 *
 * Drop-in replacement for storage.ts using localStorage instead of MMKV.
 * Metro bundler automatically resolves `.web.ts` over `.ts` for web builds,
 * so all service-layer code (statsService, fsrs, cardSelector) works
 * unchanged on web without any modifications.
 *
 * Key prefix convention:
 *   ll.card.{cardId}  — FSRS card states
 *   ll.stats          — user stats and progress
 *   ll.audio_muted    — audio mute preference
 *
 * All values are JSON-serialised strings (matching MMKV behaviour).
 * The API is fully synchronous, mirroring MMKV's sync read/write model.
 *
 * NOTE: Do NOT import react-native-mmkv here — this file must have zero
 * native dependencies so it runs in the browser.
 */

import type { CardState, PersistedStats } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const CARD_PREFIX = 'll.card.';
const STATS_KEY = 'll.stats';
const AUDIO_MUTED_KEY = 'll.audio_muted';
const LL_PREFIX = 'll.';

// ---------------------------------------------------------------------------
// Default stats (must match storage.ts DEFAULT_STATS exactly)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Card state CRUD
// ---------------------------------------------------------------------------

/**
 * Persist a card's FSRS state to localStorage.
 * Serializes the CardState object to JSON string.
 */
export function saveCardState(cardId: string, state: CardState): void {
  localStorage.setItem(`${CARD_PREFIX}${cardId}`, JSON.stringify(state));
}

/**
 * Load a card's FSRS state from localStorage.
 * Returns null if the card has never been reviewed.
 */
export function loadCardState(cardId: string): CardState | null {
  const raw = localStorage.getItem(`${CARD_PREFIX}${cardId}`);
  if (!raw) return null;
  return JSON.parse(raw) as CardState;
}

/**
 * Load all card states from localStorage.
 * Iterates all localStorage keys, filters by ll.card.* prefix, parses each.
 * Used by stats computation and card selector logic.
 */
export function loadAllCardStates(): CardState[] {
  const states: CardState[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(CARD_PREFIX)) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        states.push(JSON.parse(raw) as CardState);
      }
    }
  }
  return states;
}

/**
 * Delete a card's FSRS state from localStorage.
 * Typically used when a card is removed or reset.
 */
export function deleteCardState(cardId: string): void {
  localStorage.removeItem(`${CARD_PREFIX}${cardId}`);
}

// ---------------------------------------------------------------------------
// Stats persistence
// ---------------------------------------------------------------------------

/**
 * Persist user stats to localStorage.
 */
export function saveStats(stats: PersistedStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

/**
 * Load user stats from localStorage.
 * Returns sensible defaults (spread copy) if no stats have been saved yet.
 */
export function loadStats(): PersistedStats {
  const raw = localStorage.getItem(STATS_KEY);
  if (!raw) return { ...DEFAULT_STATS, perAppStats: {} };
  return JSON.parse(raw) as PersistedStats;
}

// ---------------------------------------------------------------------------
// Audio preferences
// ---------------------------------------------------------------------------

/**
 * Load the user's audio mute preference.
 * Returns false (unmuted) if never set.
 */
export function loadAudioMuted(): boolean {
  const raw = localStorage.getItem(AUDIO_MUTED_KEY);
  if (raw === null) return false;
  return raw === 'true';
}

/**
 * Persist the user's audio mute preference.
 */
export function saveAudioMuted(muted: boolean): void {
  localStorage.setItem(AUDIO_MUTED_KEY, String(muted));
}

// ---------------------------------------------------------------------------
// New-words-per-day preferences and daily tracking
// ---------------------------------------------------------------------------

const NEW_WORDS_PER_DAY_KEY = 'll.new_words_per_day';
const NEW_WORDS_TODAY_KEY = 'll.new_words_today';
const NEW_WORDS_TODAY_DATE_KEY = 'll.new_words_today_date';

/**
 * Load the configured daily new-word limit.
 * Returns 20 if never set.
 */
export function loadNewWordsPerDay(): number {
  const raw = localStorage.getItem(NEW_WORDS_PER_DAY_KEY);
  if (raw === null) return 20;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 20 : parsed;
}

/**
 * Persist the daily new-word limit.
 * Clamped to [1, 50].
 */
export function saveNewWordsPerDay(n: number): void {
  localStorage.setItem(NEW_WORDS_PER_DAY_KEY, String(Math.max(1, Math.min(50, n))));
}

/**
 * Load how many new words have been introduced today.
 * Returns 0 if on a new calendar day or never set.
 */
export function loadNewWordsIntroducedToday(): number {
  const today = new Date().toISOString().slice(0, 10);
  const storedDate = localStorage.getItem(NEW_WORDS_TODAY_DATE_KEY);
  if (storedDate !== today) return 0;
  const raw = localStorage.getItem(NEW_WORDS_TODAY_KEY);
  if (raw === null) return 0;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Record that `count` new words were introduced today.
 * Adds to today's running total and sets the date stamp.
 * Call this from challenge.tsx at session completion — NOT inside buildSession.
 */
export function recordNewWordsIntroduced(count: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const current = loadNewWordsIntroducedToday();
  localStorage.setItem(NEW_WORDS_TODAY_DATE_KEY, today);
  localStorage.setItem(NEW_WORDS_TODAY_KEY, String(current + count));
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

const NOTIFICATION_INTERVAL_KEY = 'll.notification_interval';
const NOTIFICATION_SWIPE_AWAY_DATE_KEY = 'll.notification_swipe_away_date';
const NOTIFICATIONS_ENABLED_KEY = 'll.notifications_enabled';

/**
 * Load the notification interval in seconds.
 * Returns 300 (5 minutes) if never set.
 */
export function loadNotificationInterval(): number {
  const raw = localStorage.getItem(NOTIFICATION_INTERVAL_KEY);
  if (raw === null) return 300;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 300 : parsed;
}

/**
 * Persist the notification interval in seconds.
 */
export function saveNotificationInterval(seconds: number): void {
  localStorage.setItem(NOTIFICATION_INTERVAL_KEY, String(seconds));
}

/**
 * Load the date when user last swiped away a notification.
 * Returns null if never set or not today.
 */
export function loadNotificationSwipeAwayDate(): string | null {
  return localStorage.getItem(NOTIFICATION_SWIPE_AWAY_DATE_KEY) ?? null;
}

/**
 * Persist the swipe-away date (YYYY-MM-DD format).
 */
export function saveNotificationSwipeAwayDate(date: string): void {
  localStorage.setItem(NOTIFICATION_SWIPE_AWAY_DATE_KEY, date);
}

/**
 * Load whether notifications are enabled.
 * Returns true (enabled) if never set.
 */
export function loadNotificationsEnabled(): boolean {
  const raw = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  if (raw === null) return true;
  return raw === 'true';
}

/**
 * Persist notification enabled state.
 */
export function saveNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
}

// ---------------------------------------------------------------------------
// Debug / testing utilities
// ---------------------------------------------------------------------------

/**
 * Clear all LingoLock keys from localStorage.
 * For debugging and testing only — do NOT call in production flows.
 *
 * Collects keys first (snapshot) to avoid mutation-during-iteration issues.
 */
export function clearAllData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(LL_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
