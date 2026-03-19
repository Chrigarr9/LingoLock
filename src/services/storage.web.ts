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
// SSR safety — localStorage doesn't exist during server-side rendering
// ---------------------------------------------------------------------------

/** Check SSR lazily each call — localStorage may not exist during server rendering
 *  but gets defined later in test environments. */
function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/** SSR-safe localStorage wrapper. Returns defaults during SSR. */
const store = {
  getItem: (key: string): string | null => hasLocalStorage() ? localStorage.getItem(key) : null,
  setItem: (key: string, value: string): void => { if (hasLocalStorage()) localStorage.setItem(key, value); },
  removeItem: (key: string): void => { if (hasLocalStorage()) localStorage.removeItem(key); },
  key: (index: number): string | null => hasLocalStorage() ? localStorage.key(index) : null,
  get length(): number { return hasLocalStorage() ? localStorage.length : 0; },
};

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const CARD_PREFIX = 'll.card.';
const STATS_KEY = 'll.stats';
const AUDIO_MUTED_KEY = 'll.audio_muted';
const AUDIO_SPEED_KEY = 'll.audio_speed';
const LL_PREFIX = 'll.';

// ---------------------------------------------------------------------------
// Default stats (must match storage.ts DEFAULT_STATS exactly)
// ---------------------------------------------------------------------------

const DEFAULT_STATS: PersistedStats = {
  currentStreak: 0,
  lastStreakDate: null,
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
  store.setItem(`${CARD_PREFIX}${cardId}`, JSON.stringify(state));
}

/**
 * Load a card's FSRS state from localStorage.
 * Returns null if the card has never been reviewed.
 */
export function loadCardState(cardId: string): CardState | null {
  const raw = store.getItem(`${CARD_PREFIX}${cardId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CardState;
  } catch (e) {
    console.error(`[Storage] Corrupted card state for "${cardId}", treating as new:`, e);
    return null;
  }
}

/**
 * Load all card states from localStorage.
 * Iterates all localStorage keys, filters by ll.card.* prefix, parses each.
 * Used by stats computation and card selector logic.
 */
export function loadAllCardStates(): CardState[] {
  // Snapshot keys first to avoid iteration issues if storage mutates
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null && key.startsWith(CARD_PREFIX)) {
      keys.push(key);
    }
  }
  const states: CardState[] = [];
  for (const key of keys) {
    const state = loadCardState(key.slice(CARD_PREFIX.length));
    if (state !== null) {
      states.push(state);
    }
  }
  return states;
}

/**
 * Delete a card's FSRS state from localStorage.
 * Typically used when a card is removed or reset.
 */
export function deleteCardState(cardId: string): void {
  store.removeItem(`${CARD_PREFIX}${cardId}`);
}

// ---------------------------------------------------------------------------
// Stats persistence
// ---------------------------------------------------------------------------

/**
 * Persist user stats to localStorage.
 */
export function saveStats(stats: PersistedStats): void {
  store.setItem(STATS_KEY, JSON.stringify(stats));
}

/**
 * Load user stats from localStorage.
 * Returns sensible defaults (spread copy) if no stats have been saved yet.
 */
export function loadStats(): PersistedStats {
  const raw = store.getItem(STATS_KEY);
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

/**
 * Load the user's audio mute preference.
 * Returns false (unmuted) if never set.
 */
export function loadAudioMuted(): boolean {
  const raw = store.getItem(AUDIO_MUTED_KEY);
  if (raw === null) return false;
  return raw === 'true';
}

/**
 * Persist the user's audio mute preference.
 */
export function saveAudioMuted(muted: boolean): void {
  store.setItem(AUDIO_MUTED_KEY, String(muted));
}

/**
 * Load the user's audio playback speed preference.
 * Returns 1.0 (normal speed) if never set.
 * Valid values: 0.75, 1.0, 1.25
 */
export function loadAudioSpeed(): number {
  const raw = store.getItem(AUDIO_SPEED_KEY);
  if (raw === null) return 1.0;
  const parsed = parseFloat(raw);
  return isNaN(parsed) ? 1.0 : parsed;
}

/**
 * Persist the user's audio playback speed preference.
 */
export function saveAudioSpeed(speed: number): void {
  store.setItem(AUDIO_SPEED_KEY, String(speed));
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
  const raw = store.getItem(NEW_WORDS_PER_DAY_KEY);
  if (raw === null) return 20;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 20 : parsed;
}

/**
 * Persist the daily new-word limit.
 * Clamped to [1, 50].
 */
export function saveNewWordsPerDay(n: number): void {
  store.setItem(NEW_WORDS_PER_DAY_KEY, String(Math.max(1, Math.min(50, n))));
}

/**
 * Load how many new words have been introduced today.
 * Returns 0 if on a new calendar day or never set.
 */
export function loadNewWordsIntroducedToday(): number {
  const today = new Date().toISOString().slice(0, 10);
  const storedDate = store.getItem(NEW_WORDS_TODAY_DATE_KEY);
  if (storedDate !== today) return 0;
  const raw = store.getItem(NEW_WORDS_TODAY_KEY);
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
  store.setItem(NEW_WORDS_TODAY_DATE_KEY, today);
  store.setItem(NEW_WORDS_TODAY_KEY, String(current + count));
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

const NOTIFICATION_INTERVAL_KEY = 'll.notification_interval';
const NOTIFICATIONS_ENABLED_KEY = 'll.notifications_enabled';
const NOTIFICATION_ACTIVE_HOURS_KEY = 'll.notification_active_hours';

/**
 * Load the notification interval in seconds.
 * Returns 900 (15 minutes) if never set.
 */
export function loadNotificationInterval(): number {
  const raw = store.getItem(NOTIFICATION_INTERVAL_KEY);
  if (raw === null) return 900;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 900 : parsed;
}

/**
 * Persist the notification interval in seconds.
 */
export function saveNotificationInterval(seconds: number): void {
  store.setItem(NOTIFICATION_INTERVAL_KEY, String(seconds));
}

/**
 * Load the notification active hours window.
 * Returns { startHour: 8, endHour: 20 } if never set.
 * Hours are 0-23 integers.
 */
export function loadNotificationActiveHours(): { startHour: number; endHour: number } {
  const raw = store.getItem(NOTIFICATION_ACTIVE_HOURS_KEY);
  if (raw === null) return { startHour: 8, endHour: 20 };
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
  store.setItem(NOTIFICATION_ACTIVE_HOURS_KEY, JSON.stringify({ startHour, endHour }));
}

/**
 * Load whether notifications are enabled.
 * Returns true (enabled) if never set.
 */
export function loadNotificationsEnabled(): boolean {
  const raw = store.getItem(NOTIFICATIONS_ENABLED_KEY);
  if (raw === null) return true;
  return raw === 'true';
}

/**
 * Persist notification enabled state.
 */
export function saveNotificationsEnabled(enabled: boolean): void {
  store.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
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
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null && key.startsWith(LL_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    store.removeItem(key);
  }
}

// ---------------------------------------------------------------------------
// Bundle state
// ---------------------------------------------------------------------------

const ACTIVE_BUNDLE_KEY = 'll.activeBundle';
const ENABLED_BUNDLES_KEY = 'll.enabledBundles';

export const DEFAULT_BUNDLE_ID = 'es-de-buenos-aires';

export function loadActiveBundle(): string {
  return store.getItem(ACTIVE_BUNDLE_KEY) ?? DEFAULT_BUNDLE_ID;
}

export function saveActiveBundle(bundleId: string): void {
  store.setItem(ACTIVE_BUNDLE_KEY, bundleId);
  const enabled = loadEnabledBundles();
  if (!enabled.includes(bundleId)) {
    saveEnabledBundles([...enabled, bundleId]);
  }
}

export function loadEnabledBundles(): string[] {
  const raw = store.getItem(ENABLED_BUNDLES_KEY);
  if (!raw) return [DEFAULT_BUNDLE_ID];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Storage] Corrupted enabled bundles list, returning default:', e);
    return [DEFAULT_BUNDLE_ID];
  }
}

export function saveEnabledBundles(bundleIds: string[]): void {
  store.setItem(ENABLED_BUNDLES_KEY, JSON.stringify(bundleIds));
}

export function isBundleMigrationDone(): boolean {
  return true; // No migration needed on web
}

export function setBundleMigrationDone(): void {
  // No-op on web
}

/**
 * No-op on web — migration is only needed for native MMKV → namespaced IDs.
 */
export function migrateCardIdsToNamespaced(): void {
  // No-op on web
}

// ---------------------------------------------------------------------------
// MMKV-compatible shims for code that imports cardStorage/statsStorage directly
// ---------------------------------------------------------------------------

/** localStorage-backed shim matching the MMKV API surface used in the app. */
function createWebStorage(prefix: string) {
  return {
    getString: (key: string) => store.getItem(`${prefix}${key}`) ?? undefined,
    set: (key: string, value: string | number | boolean) =>
      store.setItem(`${prefix}${key}`, String(value)),
    getBoolean: (key: string) => {
      const v = store.getItem(`${prefix}${key}`);
      if (v === null) return undefined;
      return v === 'true';
    },
    getNumber: (key: string) => {
      const v = store.getItem(`${prefix}${key}`);
      if (v === null) return undefined;
      const n = parseFloat(v);
      return isNaN(n) ? undefined : n;
    },
    remove: (key: string) => store.removeItem(`${prefix}${key}`),
    getAllKeys: () => {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k !== null && k.startsWith(prefix)) {
          keys.push(k.slice(prefix.length));
        }
      }
      return keys;
    },
    clearAll: () => {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k !== null && k.startsWith(prefix)) toRemove.push(k);
      }
      toRemove.forEach(k => store.removeItem(k));
    },
  };
}

export const cardStorage = createWebStorage('ll.card.');
export const statsStorage = createWebStorage('ll.stats.');
