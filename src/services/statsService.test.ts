/**
 * Tests for statsService
 * Streak tracking, success rate, chapter mastery, per-app stats, cards-due count
 *
 * Mocks: storage.ts (loadStats, saveStats, loadAllCardStates, loadCardState)
 *        fsrs.ts (isCardMastered, isDue)
 *        cardSelector.ts (getCurrentChapter)
 *        content bundle (getChapterCards)
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('./storage', () => ({
  loadStats: jest.fn(),
  saveStats: jest.fn(),
  loadAllCardStates: jest.fn(),
  loadCardState: jest.fn(),
}));

jest.mock('./fsrs', () => ({
  isCardMastered: jest.fn(),
  isDue: jest.fn(),
}));

jest.mock('./cardSelector', () => ({
  getCurrentChapter: jest.fn().mockReturnValue(1),
}));

jest.mock('../content/bundle', () => {
  const ch1Cards = [
    { id: 'w1', chapter: 1, lemma: 'w1', wordInContext: 'w1', germanHint: 'h1', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
    { id: 'w2', chapter: 1, lemma: 'w2', wordInContext: 'w2', germanHint: 'h2', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
    { id: 'w3', chapter: 1, lemma: 'w3', wordInContext: 'w3', germanHint: 'h3', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
    { id: 'w4', chapter: 1, lemma: 'w4', wordInContext: 'w4', germanHint: 'h4', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
    { id: 'w5', chapter: 1, lemma: 'w5', wordInContext: 'w5', germanHint: 'h5', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
  ];
  return {
    getChapterCards: (n: number) => (n === 1 ? ch1Cards : []),
    CHAPTERS: [{ chapterNumber: 1, cards: ch1Cards }],
    ALL_CARDS: ch1Cards,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  updateStatsAfterSession,
  getStreak,
  getSuccessRate,
  getChapterMastery,
  getCardsDueCount,
  getCurrentChapterNumber,
} from './statsService';
import { loadStats, saveStats, loadAllCardStates, loadCardState } from './storage';
import { isCardMastered, isDue } from './fsrs';

const mockLoadStats = loadStats as jest.MockedFunction<typeof loadStats>;
const mockSaveStats = saveStats as jest.MockedFunction<typeof saveStats>;
const mockLoadAllCardStates = loadAllCardStates as jest.MockedFunction<typeof loadAllCardStates>;
const mockLoadCardState = loadCardState as jest.MockedFunction<typeof loadCardState>;
const mockIsCardMastered = isCardMastered as jest.MockedFunction<typeof isCardMastered>;
const mockIsDue = isDue as jest.MockedFunction<typeof isDue>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefaultStats(): import('../types/vocabulary').PersistedStats {
  return {
    currentStreak: 0,
    lastSessionDate: null,
    totalCorrect: 0,
    totalAnswered: 0,
    perAppStats: {},
  };
}

function makeCardState(cardId: string) {
  return {
    cardId,
    due: new Date().toISOString(),
    stability: 2.0,
    difficulty: 5.0,
    elapsed_days: 1,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    state: 2, // Review
  };
}

/** Get today's ISO date string (YYYY-MM-DD) */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Get yesterday's ISO date string (YYYY-MM-DD) */
function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Get date N days ago ISO date string (YYYY-MM-DD) */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadStats.mockReturnValue(makeDefaultStats());
  mockLoadAllCardStates.mockReturnValue([]);
  mockLoadCardState.mockReturnValue(null);
  mockIsCardMastered.mockReturnValue(false);
  mockIsDue.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// updateStatsAfterSession tests
// ---------------------------------------------------------------------------

describe('updateStatsAfterSession', () => {
  test('first session sets streak to 1 and lastSessionDate to today', () => {
    mockLoadStats.mockReturnValue(makeDefaultStats());

    updateStatsAfterSession(3, 5, 'Instagram');

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.currentStreak).toBe(1);
    expect(saved.lastSessionDate).toBe(today());
    expect(saved.totalCorrect).toBe(3);
    expect(saved.totalAnswered).toBe(5);
  });

  test('second session same day keeps streak at 1', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 1,
      lastSessionDate: today(),
      totalCorrect: 3,
      totalAnswered: 5,
    });

    updateStatsAfterSession(2, 5, 'TikTok');

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.currentStreak).toBe(1);
    expect(saved.lastSessionDate).toBe(today());
    expect(saved.totalCorrect).toBe(5);
    expect(saved.totalAnswered).toBe(10);
  });

  test('session next day increments streak to 2', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 1,
      lastSessionDate: yesterday(),
      totalCorrect: 3,
      totalAnswered: 5,
    });

    updateStatsAfterSession(4, 5, 'YouTube');

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.currentStreak).toBe(2);
    expect(saved.lastSessionDate).toBe(today());
  });

  test('session after 2-day gap resets streak to 1', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 5,
      lastSessionDate: daysAgo(2),
    });

    updateStatsAfterSession(3, 5, 'Instagram');

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.currentStreak).toBe(1);
  });

  test('tracks perAppStats: sessions and cards per source app', () => {
    mockLoadStats.mockReturnValue(makeDefaultStats());

    updateStatsAfterSession(3, 5, 'Instagram');

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.perAppStats['Instagram']).toEqual({ sessions: 1, cards: 5 });
  });

  test('perAppStats increments on second session for same app', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      perAppStats: {
        'Instagram': { sessions: 1, cards: 5 },
      },
    });

    updateStatsAfterSession(4, 5, 'Instagram');

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.perAppStats['Instagram']).toEqual({ sessions: 2, cards: 10 });
  });
});

// ---------------------------------------------------------------------------
// getStreak tests
// ---------------------------------------------------------------------------

describe('getStreak', () => {
  test('returns stored streak when lastSessionDate is today', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 5,
      lastSessionDate: today(),
    });

    expect(getStreak()).toBe(5);
  });

  test('returns stored streak when lastSessionDate is yesterday', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 3,
      lastSessionDate: yesterday(),
    });

    expect(getStreak()).toBe(3);
  });

  test('returns 0 when lastSessionDate is older than yesterday', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 7,
      lastSessionDate: daysAgo(3),
    });

    expect(getStreak()).toBe(0);
  });

  test('returns 0 when no sessions yet', () => {
    mockLoadStats.mockReturnValue(makeDefaultStats());

    expect(getStreak()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSuccessRate tests
// ---------------------------------------------------------------------------

describe('getSuccessRate', () => {
  test('3 correct out of 5 returns 60', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      totalCorrect: 3,
      totalAnswered: 5,
    });

    expect(getSuccessRate()).toBe(60);
  });

  test('0 answered returns 0', () => {
    mockLoadStats.mockReturnValue(makeDefaultStats());

    expect(getSuccessRate()).toBe(0);
  });

  test('rounds to nearest integer', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      totalCorrect: 1,
      totalAnswered: 3,
    });

    // 1/3 * 100 = 33.33 → 33
    expect(getSuccessRate()).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// getChapterMastery tests
// ---------------------------------------------------------------------------

describe('getChapterMastery', () => {
  test('4 of 5 cards mastered returns 80', () => {
    // ch1 has 5 cards (w1..w5 from mock)
    const cardIds = ['w1', 'w2', 'w3', 'w4', 'w5'];
    mockLoadCardState.mockImplementation((id) => makeCardState(id));
    mockIsCardMastered.mockImplementation((state) => cardIds.slice(0, 4).includes(state.cardId));

    expect(getChapterMastery(1)).toBe(80);
  });

  test('0 cards mastered returns 0', () => {
    mockLoadCardState.mockReturnValue(null);
    mockIsCardMastered.mockReturnValue(false);

    expect(getChapterMastery(1)).toBe(0);
  });

  test('all 5 cards mastered returns 100', () => {
    mockLoadCardState.mockImplementation((id) => makeCardState(id));
    mockIsCardMastered.mockReturnValue(true);

    expect(getChapterMastery(1)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// getCardsDueCount tests
// ---------------------------------------------------------------------------

describe('getCardsDueCount', () => {
  test('returns count of cards where isDue is true', () => {
    mockLoadAllCardStates.mockReturnValue([
      makeCardState('w1'),
      makeCardState('w2'),
      makeCardState('w3'),
    ]);
    mockIsDue.mockImplementation((state) => ['w1', 'w3'].includes(state.cardId));

    expect(getCardsDueCount()).toBe(2);
  });

  test('returns 0 when no cards are due', () => {
    mockLoadAllCardStates.mockReturnValue([makeCardState('w1')]);
    mockIsDue.mockReturnValue(false);

    expect(getCardsDueCount()).toBe(0);
  });

  test('returns 0 when no card states exist', () => {
    mockLoadAllCardStates.mockReturnValue([]);

    expect(getCardsDueCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getCurrentChapterNumber tests
// ---------------------------------------------------------------------------

describe('getCurrentChapterNumber', () => {
  test('delegates to cardSelector.getCurrentChapter', () => {
    // Mock returns 1 by default (set up in jest.mock at top)
    expect(getCurrentChapterNumber()).toBe(1);
  });
});
