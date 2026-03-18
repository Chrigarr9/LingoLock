/**
 * Tests for mastery utility — deriveMastery and getMasteryColor
 */

jest.mock('../services/storage', () => ({
  loadCardState: jest.fn(),
}));

jest.mock('../services/fsrs', () => ({
  isCardMastered: jest.fn(),
}));

import { deriveMastery, getMasteryColor } from './mastery';
import { loadCardState } from '../services/storage';
import { isCardMastered } from '../services/fsrs';
import type { AppTheme } from '../theme';

const mockLoadCardState = loadCardState as jest.MockedFunction<typeof loadCardState>;
const mockIsCardMastered = isCardMastered as jest.MockedFunction<typeof isCardMastered>;

// Minimal mock theme — avoids importing react-native-paper in tests
const mockTheme = {
  custom: {
    success: '#34C759',
    brandBlue: '#5B8EC4',
  },
  colors: {
    onSurfaceVariant: '#4A6B8A',
  },
} as unknown as AppTheme;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deriveMastery', () => {
  test('returns New when card has no state', () => {
    mockLoadCardState.mockReturnValue(null);
    expect(deriveMastery('card-1')).toBe('New');
  });

  test('returns Mastered when card is mastered', () => {
    mockLoadCardState.mockReturnValue({
      cardId: 'card-1',
      due: new Date().toISOString(),
      stability: 25,
      difficulty: 5,
      elapsed_days: 10,
      scheduled_days: 30,
      reps: 5,
      lapses: 0,
      state: 2,
    });
    mockIsCardMastered.mockReturnValue(true);
    expect(deriveMastery('card-1')).toBe('Mastered');
  });

  test('returns Learning when card has state but is not mastered', () => {
    mockLoadCardState.mockReturnValue({
      cardId: 'card-1',
      due: new Date().toISOString(),
      stability: 3,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 2,
      reps: 2,
      lapses: 0,
      state: 1,
    });
    mockIsCardMastered.mockReturnValue(false);
    expect(deriveMastery('card-1')).toBe('Learning');
  });
});

describe('getMasteryColor', () => {
  test('returns success color for Mastered', () => {
    expect(getMasteryColor('Mastered', mockTheme)).toBe('#34C759');
  });

  test('returns brandBlue for Learning', () => {
    expect(getMasteryColor('Learning', mockTheme)).toBe('#5B8EC4');
  });

  test('returns onSurfaceVariant for New', () => {
    expect(getMasteryColor('New', mockTheme)).toBe('#4A6B8A');
  });
});
