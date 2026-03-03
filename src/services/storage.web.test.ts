/**
 * Tests for storage.web.ts — localStorage-backed storage adapter
 * Verifies that the web storage adapter mirrors the native MMKV API exactly.
 *
 * Test environment: jsdom (localStorage available via jest-environment-jsdom)
 * or node with manual localStorage mock.
 */

// ---------------------------------------------------------------------------
// localStorage mock (node test environment doesn't have localStorage)
// ---------------------------------------------------------------------------

const localStorageMock: Record<string, string> = {};

const localStorageImpl = {
  getItem: jest.fn((key: string) => localStorageMock[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    localStorageMock[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete localStorageMock[key];
  }),
  get length() {
    return Object.keys(localStorageMock).length;
  },
  key: jest.fn((index: number) => Object.keys(localStorageMock)[index] ?? null),
  clear: jest.fn(() => {
    Object.keys(localStorageMock).forEach(k => delete localStorageMock[k]);
  }),
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageImpl,
  writable: true,
});

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------

import {
  saveCardState,
  loadCardState,
  loadAllCardStates,
  deleteCardState,
  saveStats,
  loadStats,
  saveAudioMuted,
  loadAudioMuted,
  clearAllData,
} from './storage.web';

import type { CardState, PersistedStats } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCardState(cardId: string): CardState {
  return {
    cardId,
    state: 0,
    stability: 1.0,
    difficulty: 5.0,
    due: '2026-03-03T00:00:00.000Z',
    reps: 0,
    lapses: 0,
    elapsed_days: 0,
    scheduled_days: 0,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear the mock storage before each test
  Object.keys(localStorageMock).forEach(k => delete localStorageMock[k]);
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Card state CRUD
// ---------------------------------------------------------------------------

describe('saveCardState / loadCardState', () => {
  it('stores card state at key ll.card.{cardId}', () => {
    const state = makeCardState('test-card');
    saveCardState('test-card', state);
    expect(localStorageImpl.setItem).toHaveBeenCalledWith(
      'll.card.test-card',
      JSON.stringify(state),
    );
  });

  it('loadCardState returns the stored CardState object', () => {
    const state = makeCardState('test-card');
    saveCardState('test-card', state);
    const loaded = loadCardState('test-card');
    expect(loaded).toEqual(state);
  });

  it('loadCardState returns null for unknown keys', () => {
    const result = loadCardState('nonexistent-card');
    expect(result).toBeNull();
  });

  it('overwrites existing card state on save', () => {
    const state1 = makeCardState('card-1');
    const state2 = { ...makeCardState('card-1'), reps: 5, stability: 3.5 };
    saveCardState('card-1', state1);
    saveCardState('card-1', state2);
    const loaded = loadCardState('card-1');
    expect(loaded).toEqual(state2);
  });
});

describe('loadAllCardStates', () => {
  it('returns empty array when no cards stored', () => {
    const result = loadAllCardStates();
    expect(result).toEqual([]);
  });

  it('returns all stored card states', () => {
    const state1 = makeCardState('card-1');
    const state2 = makeCardState('card-2');
    saveCardState('card-1', state1);
    saveCardState('card-2', state2);
    const result = loadAllCardStates();
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([state1, state2]));
  });

  it('excludes non-card keys (ll.stats, ll.audio_muted)', () => {
    const state = makeCardState('card-1');
    saveCardState('card-1', state);
    // Manually add non-card keys
    localStorageMock['ll.stats'] = '{}';
    localStorageMock['ll.audio_muted'] = 'false';
    localStorageMock['unrelated-key'] = 'value';
    const result = loadAllCardStates();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(state);
  });
});

describe('deleteCardState', () => {
  it('removes the card key from localStorage', () => {
    const state = makeCardState('test-card');
    saveCardState('test-card', state);
    deleteCardState('test-card');
    expect(localStorageImpl.removeItem).toHaveBeenCalledWith('ll.card.test-card');
    expect(loadCardState('test-card')).toBeNull();
  });

  it('does not throw when deleting nonexistent key', () => {
    expect(() => deleteCardState('nonexistent')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Stats persistence
// ---------------------------------------------------------------------------

describe('saveStats / loadStats', () => {
  const defaultStats: PersistedStats = {
    currentStreak: 0,
    lastSessionDate: null,
    totalCorrect: 0,
    totalAnswered: 0,
    perAppStats: {},
    abortsToday: 0,
    lastAbortDate: null,
    totalAborts: 0,
  };

  it('stores stats at key ll.stats', () => {
    saveStats(defaultStats);
    expect(localStorageImpl.setItem).toHaveBeenCalledWith(
      'll.stats',
      JSON.stringify(defaultStats),
    );
  });

  it('loadStats returns stored stats', () => {
    const stats: PersistedStats = {
      ...defaultStats,
      currentStreak: 5,
      totalCorrect: 42,
      totalAnswered: 50,
    };
    saveStats(stats);
    const loaded = loadStats();
    expect(loaded).toEqual(stats);
  });

  it('loadStats returns DEFAULT_STATS when nothing stored', () => {
    const result = loadStats();
    expect(result).toEqual(defaultStats);
  });

  it('loadStats returns fresh perAppStats object (not shared reference)', () => {
    const result1 = loadStats();
    const result2 = loadStats();
    result1.perAppStats['Instagram'] = { sessions: 1, cards: 2 };
    expect(result2.perAppStats).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Audio preferences
// ---------------------------------------------------------------------------

describe('saveAudioMuted / loadAudioMuted', () => {
  it('saveAudioMuted(true) stores "true" at ll.audio_muted', () => {
    saveAudioMuted(true);
    expect(localStorageImpl.setItem).toHaveBeenCalledWith('ll.audio_muted', 'true');
  });

  it('saveAudioMuted(false) stores "false" at ll.audio_muted', () => {
    saveAudioMuted(false);
    expect(localStorageImpl.setItem).toHaveBeenCalledWith('ll.audio_muted', 'false');
  });

  it('loadAudioMuted returns true when stored as "true"', () => {
    saveAudioMuted(true);
    expect(loadAudioMuted()).toBe(true);
  });

  it('loadAudioMuted returns false when stored as "false"', () => {
    saveAudioMuted(false);
    expect(loadAudioMuted()).toBe(false);
  });

  it('loadAudioMuted defaults to false when not set', () => {
    expect(loadAudioMuted()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearAllData
// ---------------------------------------------------------------------------

describe('clearAllData', () => {
  it('removes all keys prefixed with "ll."', () => {
    saveCardState('card-1', makeCardState('card-1'));
    saveCardState('card-2', makeCardState('card-2'));
    saveStats({
      currentStreak: 3,
      lastSessionDate: '2026-03-01',
      totalCorrect: 10,
      totalAnswered: 15,
      perAppStats: {},
      abortsToday: 0,
      lastAbortDate: null,
      totalAborts: 0,
    });
    saveAudioMuted(true);

    clearAllData();

    expect(loadCardState('card-1')).toBeNull();
    expect(loadCardState('card-2')).toBeNull();
    expect(loadAudioMuted()).toBe(false);
    expect(loadStats()).toEqual({
      currentStreak: 0,
      lastSessionDate: null,
      totalCorrect: 0,
      totalAnswered: 0,
      perAppStats: {},
      abortsToday: 0,
      lastAbortDate: null,
      totalAborts: 0,
    });
  });

  it('preserves non-ll. keys in localStorage', () => {
    localStorageMock['other-app-key'] = 'should-remain';
    saveCardState('card-1', makeCardState('card-1'));

    clearAllData();

    expect(localStorageMock['other-app-key']).toBe('should-remain');
  });
});
