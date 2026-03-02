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
