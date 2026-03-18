/**
 * Tests for widgetService — processWidgetReveal and processWidgetRate
 *
 * Mocks: storage, fsrs, statsService, bundles, answerValidation
 */

jest.mock('./storage', () => ({
  loadCardState: jest.fn(),
  saveCardState: jest.fn(),
  loadAllCardStates: jest.fn().mockReturnValue([]),
  loadEnabledBundles: jest.fn().mockReturnValue([]),
  statsStorage: { getString: jest.fn(), set: jest.fn(), getNumber: jest.fn(), remove: jest.fn() },
}));

jest.mock('./fsrs', () => ({
  isDue: jest.fn(),
  getAnswerType: jest.fn(),
  scheduleReview: jest.fn().mockReturnValue({ cardId: 'test', due: '2026-01-01' }),
  createNewCardState: jest.fn().mockReturnValue({ cardId: 'test', due: '2026-01-01' }),
}));

jest.mock('./statsService', () => ({
  getStreak: jest.fn().mockReturnValue(5),
  updateStatsAfterSession: jest.fn(),
}));

jest.mock('../content/bundles', () => ({
  getBundle: jest.fn(),
  getCardById: jest.fn(),
  isImportedBundle: jest.fn(),
  loadEnabledBundles: jest.fn().mockReturnValue([]),
}));

jest.mock('../utils/answerValidation', () => ({
  validateAnswer: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { processWidgetReveal, processWidgetRate } from './widgetService';
import { loadCardState, saveCardState } from './storage';
import { scheduleReview, createNewCardState } from './fsrs';
import { getStreak, updateStatsAfterSession } from './statsService';
import { getCardById } from '../content/bundles';

const mockGetCardById = getCardById as jest.MockedFunction<typeof getCardById>;
const mockLoadCardState = loadCardState as jest.MockedFunction<typeof loadCardState>;
const mockSaveCardState = saveCardState as jest.MockedFunction<typeof saveCardState>;
const mockScheduleReview = scheduleReview as jest.MockedFunction<typeof scheduleReview>;
const mockCreateNewCardState = createNewCardState as jest.MockedFunction<typeof createNewCardState>;
const mockUpdateStatsAfterSession = updateStatsAfterSession as jest.MockedFunction<typeof updateStatsAfterSession>;

beforeEach(() => {
  jest.clearAllMocks();
  mockScheduleReview.mockReturnValue({
    cardId: 'test',
    due: '2026-01-01',
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    state: 1,
  });
  mockCreateNewCardState.mockReturnValue({
    cardId: 'test',
    due: '2026-01-01',
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
  });
});

// ---------------------------------------------------------------------------
// processWidgetReveal
// ---------------------------------------------------------------------------

describe('processWidgetReveal', () => {
  test('returns WidgetCardData with isRevealed=true when card found and is SimpleCard', () => {
    mockGetCardById.mockReturnValue({
      card: { id: '42', front: 'Hola', back: 'Hello', deckId: 'spanish-basics' },
      bundle: {} as any,
    });

    const result = processWidgetReveal('imported-deck:42');

    expect(result).not.toBeNull();
    expect(result!.isRevealed).toBe(true);
    expect(result!.frontText).toBe('Hola');
    expect(result!.backText).toBe('Hello');
    expect(result!.answerType).toBe('selfRated');
    expect(result!.cardId).toBe('imported-deck:42');
    expect(result!.streakCount).toBe(5);
  });

  test('returns null when card not found', () => {
    mockGetCardById.mockReturnValue(null);

    const result = processWidgetReveal('nonexistent:99');

    expect(result).toBeNull();
  });

  test('returns null when card is ClozeCard (no front property)', () => {
    mockGetCardById.mockReturnValue({
      card: {
        id: 'gato-ch01-s03',
        lemma: 'gato',
        wordInContext: 'gato',
        germanHint: 'Katze',
        sentence: 'El _____ duerme.',
        sentenceTranslation: 'Die Katze schlaeft.',
        pos: 'noun',
        contextNote: 'singular',
        chapter: 1,
        cefrLevel: 'A1',
        distractors: ['perro', 'casa', 'libro'],
      },
      bundle: {} as any,
    });

    const result = processWidgetReveal('es-de:gato-ch01-s03');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// processWidgetRate
// ---------------------------------------------------------------------------

describe('processWidgetRate', () => {
  test('calls scheduleReview with again when rating=1', () => {
    const existingState = {
      cardId: 'imported:42',
      due: '2026-01-01',
      stability: 1,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 1,
      reps: 1,
      lapses: 0,
      state: 1,
    };
    mockLoadCardState.mockReturnValue(existingState);

    const result = processWidgetRate('imported:42', '1');

    expect(result).toEqual({ rated: true });
    expect(mockScheduleReview).toHaveBeenCalledWith(existingState, 'again');
  });

  test('calls scheduleReview with good when rating=3', () => {
    const existingState = {
      cardId: 'imported:42',
      due: '2026-01-01',
      stability: 1,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 1,
      reps: 1,
      lapses: 0,
      state: 1,
    };
    mockLoadCardState.mockReturnValue(existingState);

    const result = processWidgetRate('imported:42', '3');

    expect(result).toEqual({ rated: true });
    expect(mockScheduleReview).toHaveBeenCalledWith(existingState, 'good');
  });

  test('saves updated card state', () => {
    const existingState = {
      cardId: 'imported:42',
      due: '2026-01-01',
      stability: 1,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 1,
      reps: 1,
      lapses: 0,
      state: 1,
    };
    mockLoadCardState.mockReturnValue(existingState);

    const updatedState = {
      cardId: 'imported:42',
      due: '2026-01-02',
      stability: 2,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      reps: 2,
      lapses: 0,
      state: 2,
    };
    mockScheduleReview.mockReturnValue(updatedState);

    processWidgetRate('imported:42', '3');

    expect(mockSaveCardState).toHaveBeenCalledWith('imported:42', updatedState);
  });

  test('updates stats with correct=1 for rating=3', () => {
    mockLoadCardState.mockReturnValue({
      cardId: 'imported:42',
      due: '2026-01-01',
      stability: 1,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 1,
      reps: 1,
      lapses: 0,
      state: 1,
    });

    processWidgetRate('imported:42', '3');

    expect(mockUpdateStatsAfterSession).toHaveBeenCalledWith(1, 1, 'widget');
  });

  test('updates stats with correct=0 for rating=1', () => {
    mockLoadCardState.mockReturnValue({
      cardId: 'imported:42',
      due: '2026-01-01',
      stability: 1,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 1,
      reps: 1,
      lapses: 0,
      state: 1,
    });

    processWidgetRate('imported:42', '1');

    expect(mockUpdateStatsAfterSession).toHaveBeenCalledWith(0, 1, 'widget');
  });

  test('creates new card state if none exists', () => {
    mockLoadCardState.mockReturnValue(null);

    const newState = {
      cardId: 'imported:42',
      due: '2026-01-01',
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
    };
    mockCreateNewCardState.mockReturnValue(newState);

    processWidgetRate('imported:42', '3');

    expect(mockCreateNewCardState).toHaveBeenCalledWith('imported:42');
    expect(mockScheduleReview).toHaveBeenCalledWith(newState, 'good');
  });
});
