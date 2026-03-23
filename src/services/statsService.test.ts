/**
 * Tests for statsService
 * Streak tracking (completion-based), success rate, chapter mastery, per-app stats, cards-due count
 *
 * Mocks: storage.ts (loadStats, saveStats, loadCardState, loadEnabledBundles)
 *        fsrs.ts (isCardMastered, isDue)
 *        cardSelector.ts (getCurrentChapter)
 *        content/bundles (getBundle, isImportedBundle)
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
  loadNewWordsPerDay: jest.fn().mockReturnValue(0),
  loadNewWordsIntroducedToday: jest.fn().mockReturnValue(0),
  loadEnabledBundles: jest.fn().mockReturnValue(['es-de-buenos-aires']),
}));

jest.mock('./fsrs', () => ({
  isCardMastered: jest.fn(),
  isDue: jest.fn(),
}));

jest.mock('./cardSelector', () => ({
  getCurrentChapter: jest.fn().mockReturnValue(1),
}));

jest.mock('../content/bundles', () => {
  const ch1Cards = [
    { kind: 'cloze' as const, id: 'w1', chapter: 1, lemma: 'w1', wordInContext: 'w1', germanHint: 'h1', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
    { kind: 'cloze' as const, id: 'w2', chapter: 1, lemma: 'w2', wordInContext: 'w2', germanHint: 'h2', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
    { kind: 'cloze' as const, id: 'w3', chapter: 1, lemma: 'w3', wordInContext: 'w3', germanHint: 'h3', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
    { kind: 'cloze' as const, id: 'w4', chapter: 1, lemma: 'w4', wordInContext: 'w4', germanHint: 'h4', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
    { kind: 'cloze' as const, id: 'w5', chapter: 1, lemma: 'w5', wordInContext: 'w5', germanHint: 'h5', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
  ];
  return {
    getChapterCards: (n: number) => (n === 1 ? ch1Cards : []),
    CHAPTERS: [{ chapterNumber: 1, cards: ch1Cards }],
    ALL_CARDS: ch1Cards,
    getBundle: jest.fn().mockReturnValue({
      chapters: [{ chapterNumber: 1, cards: ch1Cards }],
      simpleCards: [],
    }),
    isImportedBundle: jest.fn().mockReturnValue(false),
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
  checkAndAdvanceStreak,
} from './statsService';
import { loadStats, saveStats, loadCardState, loadEnabledBundles } from './storage';
import { isCardMastered, isDue } from './fsrs';
import { getBundle, isImportedBundle } from '../content/bundles';
import type { ChapterData } from '../types/vocabulary';

// CHAPTERS is defined in the jest.mock factory above — extract it from the mock.
// The real bundles/index.ts doesn't export CHAPTERS (it's in the per-bundle module),
// so we pull it from the mocked getBundle() return value.
const CHAPTERS: ChapterData[] = (getBundle as jest.Mock)('es-de-buenos-aires').chapters;

const mockLoadStats = loadStats as jest.MockedFunction<typeof loadStats>;
const mockSaveStats = saveStats as jest.MockedFunction<typeof saveStats>;
const mockLoadCardState = loadCardState as jest.MockedFunction<typeof loadCardState>;
const mockIsCardMastered = isCardMastered as jest.MockedFunction<typeof isCardMastered>;
const mockIsDue = isDue as jest.MockedFunction<typeof isDue>;
const mockLoadEnabledBundles = loadEnabledBundles as jest.MockedFunction<typeof loadEnabledBundles>;
const mockGetBundle = getBundle as jest.MockedFunction<typeof getBundle>;
const mockIsImportedBundle = isImportedBundle as jest.MockedFunction<typeof isImportedBundle>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefaultStats(): import('../types/vocabulary').PersistedStats {
  return {
    currentStreak: 0,
    lastStreakDate: null,
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

const ch1Cards = [
  { kind: 'cloze' as const, id: 'w1', chapter: 1, lemma: 'w1', wordInContext: 'w1', germanHint: 'h1', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
  { kind: 'cloze' as const, id: 'w2', chapter: 1, lemma: 'w2', wordInContext: 'w2', germanHint: 'h2', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
  { kind: 'cloze' as const, id: 'w3', chapter: 1, lemma: 'w3', wordInContext: 'w3', germanHint: 'h3', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
  { kind: 'cloze' as const, id: 'w4', chapter: 1, lemma: 'w4', wordInContext: 'w4', germanHint: 'h4', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
  { kind: 'cloze' as const, id: 'w5', chapter: 1, lemma: 'w5', wordInContext: 'w5', germanHint: 'h5', sentence: '_', sentenceTranslation: '_', pos: 'noun', contextNote: '', cefrLevel: 'A1', distractors: [] },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadStats.mockReturnValue(makeDefaultStats());
  mockLoadCardState.mockReturnValue(null);
  mockIsCardMastered.mockReturnValue(false);
  mockIsDue.mockReturnValue(false);
  mockLoadEnabledBundles.mockReturnValue(['es-de-buenos-aires']);
  mockGetBundle.mockReturnValue({
    config: {} as any,
    chapters: [{ chapterNumber: 1, cards: ch1Cards }],
    simpleCards: [],
    cardImages: {},
    cardAudios: {},
  });
  mockIsImportedBundle.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// updateStatsAfterSession tests
// ---------------------------------------------------------------------------

describe('updateStatsAfterSession', () => {
  test('tracks totals but does NOT touch streak', () => {
    mockLoadStats.mockReturnValue(makeDefaultStats());

    updateStatsAfterSession(3, 5, 'Instagram');

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.currentStreak).toBe(0); // Streak unchanged
    expect(saved.lastStreakDate).toBeNull(); // Streak date unchanged
    expect(saved.totalCorrect).toBe(3);
    expect(saved.totalAnswered).toBe(5);
  });

  test('accumulates totals on second session', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      totalCorrect: 3,
      totalAnswered: 5,
    });

    updateStatsAfterSession(2, 5, 'TikTok');

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.totalCorrect).toBe(5);
    expect(saved.totalAnswered).toBe(10);
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
// checkAndAdvanceStreak tests
// ---------------------------------------------------------------------------

describe('checkAndAdvanceStreak', () => {
  test('advances streak to 1 when due count is 0 and no previous streak', () => {
    // No cards due (mockIsDue returns false by default, mockLoadCardState returns null)
    mockLoadStats.mockReturnValue(makeDefaultStats());

    checkAndAdvanceStreak();

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.currentStreak).toBe(1);
    expect(saved.lastStreakDate).toBe(today());
  });

  test('increments streak when due count is 0 and lastStreakDate is yesterday', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 3,
      lastStreakDate: yesterday(),
    });

    checkAndAdvanceStreak();

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.currentStreak).toBe(4);
    expect(saved.lastStreakDate).toBe(today());
  });

  test('does not change streak when due count is 0 and already counted today', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 5,
      lastStreakDate: today(),
    });

    checkAndAdvanceStreak();

    // saveStats should NOT be called — nothing changed
    expect(mockSaveStats).not.toHaveBeenCalled();
  });

  test('does not advance streak when cards are still due', () => {
    // Make w1 due
    mockLoadCardState.mockImplementation((id) => {
      if (id === 'w1') return makeCardState('w1');
      return null;
    });
    mockIsDue.mockReturnValue(true);
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 3,
      lastStreakDate: yesterday(),
    });

    checkAndAdvanceStreak();

    // saveStats should NOT be called — due cards remain
    expect(mockSaveStats).not.toHaveBeenCalled();
  });

  test('resets streak to 1 when lastStreakDate is older than yesterday and due count becomes 0', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 10,
      lastStreakDate: daysAgo(3),
    });

    checkAndAdvanceStreak();

    const saved = (mockSaveStats.mock.calls[0] as [import('../types/vocabulary').PersistedStats])[0];
    expect(saved.currentStreak).toBe(1);
    expect(saved.lastStreakDate).toBe(today());
  });

  test('scans imported decks for due cards too', () => {
    // Card IDs are pre-namespaced by getBundle() — mock must match
    const simpleCards = [
      { kind: 'simple' as const, id: 'imported-1:c1', front: 'F', back: 'B', deckId: 'imported-1' },
    ];
    mockLoadEnabledBundles.mockReturnValue(['es-de-buenos-aires', 'imported-1']);
    mockIsImportedBundle.mockImplementation((id) => id === 'imported-1');
    mockGetBundle.mockImplementation((id) => {
      if (id === 'imported-1') {
        return {
          config: {} as any,
          chapters: [{ chapterNumber: 1, cards: simpleCards }],
          simpleCards,
          cardImages: {},
          cardAudios: {},
        };
      }
      return {
        config: {} as any,
        chapters: [{ chapterNumber: 1, cards: ch1Cards }],
        simpleCards: [],
        cardImages: {},
        cardAudios: {},
      };
    });

    // Imported card is due — card.id is already namespaced
    mockLoadCardState.mockImplementation((id) => {
      if (id === 'imported-1:c1') return makeCardState('imported-1:c1');
      return null;
    });
    mockIsDue.mockReturnValue(true);

    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 2,
      lastStreakDate: yesterday(),
    });

    checkAndAdvanceStreak();

    // saveStats should NOT be called — imported card is still due
    expect(mockSaveStats).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getStreak tests
// ---------------------------------------------------------------------------

describe('getStreak', () => {
  test('returns stored streak when lastStreakDate is today', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 5,
      lastStreakDate: today(),
    });

    expect(getStreak()).toBe(5);
  });

  test('returns stored streak when lastStreakDate is yesterday', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 3,
      lastStreakDate: yesterday(),
    });

    expect(getStreak()).toBe(3);
  });

  test('returns 0 when lastStreakDate is older than yesterday', () => {
    mockLoadStats.mockReturnValue({
      ...makeDefaultStats(),
      currentStreak: 7,
      lastStreakDate: daysAgo(3),
    });

    expect(getStreak()).toBe(0);
  });

  test('returns 0 when no streak date set', () => {
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

    expect(getChapterMastery(CHAPTERS, 1)).toBe(80);
  });

  test('0 cards mastered returns 0', () => {
    mockLoadCardState.mockReturnValue(null);
    mockIsCardMastered.mockReturnValue(false);

    expect(getChapterMastery(CHAPTERS, 1)).toBe(0);
  });

  test('all 5 cards mastered returns 100', () => {
    mockLoadCardState.mockImplementation((id) => makeCardState(id));
    mockIsCardMastered.mockReturnValue(true);

    expect(getChapterMastery(CHAPTERS, 1)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// getCardsDueCount tests
// ---------------------------------------------------------------------------

describe('getCardsDueCount', () => {
  // CHAPTERS mock has cards: w1, w2, w3, w4, w5 (chapter 1)
  // Budget mock defaults: loadNewWordsPerDay=0, loadNewWordsIntroducedToday=0 → no new cards

  test('returns count of CHAPTERS cards where isDue is true', () => {
    // w1, w2, w3 have states; w1 and w3 are due
    mockLoadCardState.mockImplementation((id) => {
      if (['w1', 'w2', 'w3'].includes(id)) return makeCardState(id);
      return null;
    });
    mockIsDue.mockImplementation((state) => ['w1', 'w3'].includes(state.cardId));

    expect(getCardsDueCount(CHAPTERS)).toBe(2);
  });

  test('returns 0 when no cards are due', () => {
    mockLoadCardState.mockImplementation((id) => (id === 'w1' ? makeCardState('w1') : null));
    mockIsDue.mockReturnValue(false);

    expect(getCardsDueCount(CHAPTERS)).toBe(0);
  });

  test('returns 0 when no card states exist', () => {
    mockLoadCardState.mockReturnValue(null);

    expect(getCardsDueCount(CHAPTERS)).toBe(0);
  });

  test('does not count orphaned states not in CHAPTERS', () => {
    // loadCardState only ever returns states for cards in CHAPTERS bundle;
    // orphaned IDs from old builds are simply absent → loadCardState returns null
    mockLoadCardState.mockImplementation((id) => {
      // Only w1 is due; old-orphan is NOT in CHAPTERS so loadCardState never called with it
      if (id === 'w1') return makeCardState('w1');
      return null;
    });
    mockIsDue.mockImplementation((state) => state.cardId === 'w1');

    expect(getCardsDueCount(CHAPTERS)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getCurrentChapterNumber tests
// ---------------------------------------------------------------------------

describe('getCurrentChapterNumber', () => {
  test('delegates to cardSelector.getCurrentChapter', () => {
    // Mock returns 1 by default (set up in jest.mock at top)
    expect(getCurrentChapterNumber(CHAPTERS)).toBe(1);
  });
});

