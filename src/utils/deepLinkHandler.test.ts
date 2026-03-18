/**
 * Tests for deepLinkHandler — URL parsing for widget-reveal and widget-rate routes
 */

jest.mock('expo-linking', () => ({
  parse: jest.fn(),
}));

import * as Linking from 'expo-linking';
import { parseDeepLink } from '../utils/deepLinkHandler';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// widget-reveal
// ---------------------------------------------------------------------------

describe('parseDeepLink — widget-reveal', () => {
  test('valid URL with cardId returns correct params', () => {
    (Linking.parse as jest.Mock).mockReturnValue({
      hostname: 'widget-reveal',
      queryParams: { cardId: 'test-deck:42' },
    });

    const result = parseDeepLink('lingolock://widget-reveal?cardId=test-deck:42');

    expect(result).toEqual({
      type: 'widget-reveal',
      params: { cardId: 'test-deck:42' },
    });
  });

  test('missing cardId returns null', () => {
    (Linking.parse as jest.Mock).mockReturnValue({
      hostname: 'widget-reveal',
      queryParams: {},
    });

    const result = parseDeepLink('lingolock://widget-reveal');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// widget-answer (existing route)
// ---------------------------------------------------------------------------

describe('parseDeepLink — widget-answer', () => {
  test('valid URL with cardId and choice returns correct params', () => {
    (Linking.parse as jest.Mock).mockReturnValue({
      hostname: 'widget-answer',
      queryParams: { cardId: 'gato-ch01-s03', choice: 'gato' },
    });

    const result = parseDeepLink('lingolock://widget-answer?cardId=gato-ch01-s03&choice=gato');

    expect(result).toEqual({
      type: 'widget-answer',
      params: { cardId: 'gato-ch01-s03', choice: 'gato' },
    });
  });
});

// ---------------------------------------------------------------------------
// widget-rate
// ---------------------------------------------------------------------------

describe('parseDeepLink — widget-rate', () => {
  test('valid URL with cardId and rating=1 returns correct params', () => {
    (Linking.parse as jest.Mock).mockReturnValue({
      hostname: 'widget-rate',
      queryParams: { cardId: 'test-deck:42', rating: '1' },
    });

    const result = parseDeepLink('lingolock://widget-rate?cardId=test-deck:42&rating=1');

    expect(result).toEqual({
      type: 'widget-rate',
      params: { cardId: 'test-deck:42', rating: '1' },
    });
  });

  test('valid URL with cardId and rating=3 returns correct params', () => {
    (Linking.parse as jest.Mock).mockReturnValue({
      hostname: 'widget-rate',
      queryParams: { cardId: 'test-deck:42', rating: '3' },
    });

    const result = parseDeepLink('lingolock://widget-rate?cardId=test-deck:42&rating=3');

    expect(result).toEqual({
      type: 'widget-rate',
      params: { cardId: 'test-deck:42', rating: '3' },
    });
  });

  test('invalid rating (e.g., "5") returns null', () => {
    (Linking.parse as jest.Mock).mockReturnValue({
      hostname: 'widget-rate',
      queryParams: { cardId: 'test-deck:42', rating: '5' },
    });

    const result = parseDeepLink('lingolock://widget-rate?cardId=test-deck:42&rating=5');

    expect(result).toBeNull();
  });

  test('missing cardId returns null', () => {
    (Linking.parse as jest.Mock).mockReturnValue({
      hostname: 'widget-rate',
      queryParams: { rating: '3' },
    });

    const result = parseDeepLink('lingolock://widget-rate?rating=3');

    expect(result).toBeNull();
  });

  test('missing rating returns null', () => {
    (Linking.parse as jest.Mock).mockReturnValue({
      hostname: 'widget-rate',
      queryParams: { cardId: 'test-deck:42' },
    });

    const result = parseDeepLink('lingolock://widget-rate?cardId=test-deck:42');

    expect(result).toBeNull();
  });
});
