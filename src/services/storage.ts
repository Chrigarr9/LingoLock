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
  try {
    return JSON.parse(raw) as CardState;
  } catch (e) {
    console.error(`[Storage] Corrupted card state for "${cardId}", treating as new:`, e);
    return null;
  }
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
  lastStreakDate: null,
  totalCorrect: 0,
  totalAnswered: 0,
  perAppStats: {},
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
  try {
    return JSON.parse(raw) as PersistedStats;
  } catch (e) {
    console.error('[Storage] Corrupted stats data, returning defaults:', e);
    return { ...DEFAULT_STATS, perAppStats: {} };
  }
}

// ---------------------------------------------------------------------------
// Audio preferences
// ---------------------------------------------------------------------------

const AUDIO_MUTED_KEY = 'audio_muted';
const AUDIO_SPEED_KEY = 'audio_speed';

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

/**
 * Load the user's audio playback speed preference.
 * Returns 1.0 (normal speed) if never set.
 * Valid values: 0.75, 1.0, 1.25
 */
export function loadAudioSpeed(): number {
  return statsStorage.getNumber(AUDIO_SPEED_KEY) ?? 1.0;
}

/**
 * Persist the user's audio playback speed preference.
 */
export function saveAudioSpeed(speed: number): void {
  statsStorage.set(AUDIO_SPEED_KEY, speed);
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
const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled';
const NOTIFICATION_ACTIVE_HOURS_KEY = 'notification_active_hours';

/**
 * Load the notification interval in seconds.
 * Returns 900 (15 minutes) if never set.
 */
export function loadNotificationInterval(): number {
  return statsStorage.getNumber(NOTIFICATION_INTERVAL_KEY) ?? 900;
}

/**
 * Persist the notification interval in seconds.
 */
export function saveNotificationInterval(seconds: number): void {
  statsStorage.set(NOTIFICATION_INTERVAL_KEY, seconds);
}

/**
 * Load the notification active hours window.
 * Returns { startHour: 8, endHour: 20 } if never set.
 * Hours are 0-23 integers.
 */
export function loadNotificationActiveHours(): { startHour: number; endHour: number } {
  const raw = statsStorage.getString(NOTIFICATION_ACTIVE_HOURS_KEY);
  if (!raw) return { startHour: 8, endHour: 20 };
  try {
    const parsed = JSON.parse(raw);
    return {
      startHour: typeof parsed.startHour === 'number' ? parsed.startHour : 8,
      endHour: typeof parsed.endHour === 'number' ? parsed.endHour : 20,
    };
  } catch (e) {
    console.error('[Storage] Corrupted notification active hours, returning defaults:', e);
    return { startHour: 8, endHour: 20 };
  }
}

/**
 * Persist the notification active hours window.
 * Hours are 0-23 integers. startHour must be < endHour.
 */
export function saveNotificationActiveHours(startHour: number, endHour: number): void {
  statsStorage.set(NOTIFICATION_ACTIVE_HOURS_KEY, JSON.stringify({ startHour, endHour }));
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
// Automation preferences
// ---------------------------------------------------------------------------

const AUTOMATION_CARD_THRESHOLD_KEY = 'automation_card_threshold';

/**
 * Load the number of correct cards required before the "Continue to [App]"
 * button appears during automation-triggered sessions.
 * Returns 3 if never set.
 */
export function loadAutomationCardThreshold(): number {
  return statsStorage.getNumber(AUTOMATION_CARD_THRESHOLD_KEY) ?? 3;
}

/**
 * Persist the automation card threshold.
 * Clamped to [1, 10].
 */
export function saveAutomationCardThreshold(n: number): void {
  statsStorage.set(AUTOMATION_CARD_THRESHOLD_KEY, Math.max(1, Math.min(10, n)));
}

// ---------------------------------------------------------------------------
// Bundle state
// ---------------------------------------------------------------------------

const ACTIVE_BUNDLE_KEY = 'activeBundle';
const ENABLED_BUNDLES_KEY = 'enabledBundles';
const BUNDLE_MIGRATION_DONE_KEY = 'bundleMigrationDone';

export const DEFAULT_BUNDLE_ID = 'es-de-buenos-aires';

export function loadActiveBundle(): string {
  return statsStorage.getString(ACTIVE_BUNDLE_KEY) ?? DEFAULT_BUNDLE_ID;
}

export function saveActiveBundle(bundleId: string): void {
  statsStorage.set(ACTIVE_BUNDLE_KEY, bundleId);
  // Active bundle is always implicitly enabled
  const enabled = loadEnabledBundles();
  if (!enabled.includes(bundleId)) {
    saveEnabledBundles([...enabled, bundleId]);
  }
}

export function loadEnabledBundles(): string[] {
  const raw = statsStorage.getString(ENABLED_BUNDLES_KEY);
  if (!raw) return [DEFAULT_BUNDLE_ID];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Storage] Corrupted enabled bundles list, returning default:', e);
    return [DEFAULT_BUNDLE_ID];
  }
}

export function saveEnabledBundles(bundleIds: string[]): void {
  statsStorage.set(ENABLED_BUNDLES_KEY, JSON.stringify(bundleIds));
}

export function isBundleMigrationDone(): boolean {
  return statsStorage.getBoolean(BUNDLE_MIGRATION_DONE_KEY) ?? false;
}

export function setBundleMigrationDone(): void {
  statsStorage.set(BUNDLE_MIGRATION_DONE_KEY, true);
}

/**
 * One-time migration: prefix all existing card state keys with the default bundle ID.
 * Converts "gato-ch01-s03" → "es-de-buenos-aires:gato-ch01-s03".
 * Safe to call multiple times — no-ops after first successful run.
 */
export function migrateCardIdsToNamespaced(): void {
  if (isBundleMigrationDone()) return;

  const keys = cardStorage.getAllKeys();
  let migrated = 0;
  for (const key of keys) {
    if (key.includes(':')) continue;
    const value = cardStorage.getString(key);
    if (value) {
      const newKey = `${DEFAULT_BUNDLE_ID}:${key}`;
      cardStorage.set(newKey, value);
      cardStorage.remove(key);
      migrated++;
    }
  }

  setBundleMigrationDone();
  console.log(`[Migration] Migrated ${migrated} card states to namespaced IDs`);
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
