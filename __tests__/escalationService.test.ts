import {
  getRequiredCardCount,
  shouldUseFlatRate,
  FLAT_RATE_CARDS,
  BASE_CARDS,
} from '../src/services/escalationService';

describe('escalationService', () => {
  describe('getRequiredCardCount', () => {
    it('returns 3 for first unlock (unlockCount=0)', () => {
      expect(getRequiredCardCount(0, false)).toBe(3);
    });

    it('returns 6 for second unlock', () => {
      expect(getRequiredCardCount(1, false)).toBe(6);
    });

    it('returns 12 for third unlock', () => {
      expect(getRequiredCardCount(2, false)).toBe(12);
    });

    it('returns 24 for fourth unlock', () => {
      expect(getRequiredCardCount(3, false)).toBe(24);
    });

    it('returns flat rate when due cards are cleared', () => {
      expect(getRequiredCardCount(0, true)).toBe(3);
      expect(getRequiredCardCount(5, true)).toBe(3);
      expect(getRequiredCardCount(10, true)).toBe(3);
    });

    it('caps escalation at 96 cards to prevent absurd requirements', () => {
      // 3 * 2^5 = 96, 3 * 2^6 = 192 -> capped at 96
      expect(getRequiredCardCount(5, false)).toBe(96);
      expect(getRequiredCardCount(6, false)).toBe(96);
      expect(getRequiredCardCount(10, false)).toBe(96);
    });
  });

  describe('shouldUseFlatRate', () => {
    it('returns false when there are due cards', () => {
      expect(shouldUseFlatRate(10)).toBe(false);
    });

    it('returns true when no due cards remain', () => {
      expect(shouldUseFlatRate(0)).toBe(true);
    });

    it('returns false for 1 remaining card', () => {
      expect(shouldUseFlatRate(1)).toBe(false);
    });
  });
});
