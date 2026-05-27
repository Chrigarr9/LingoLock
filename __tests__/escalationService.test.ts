import {
  getRequiredCardCount,
  shouldPersistScreenTimeSessionProgress,
  BASE_CARDS,
  FLAT_RATE_CARDS,
} from '../src/services/escalationService';

describe('escalationService', () => {
  describe('getRequiredCardCount — exponential ramp (due not cleared)', () => {
    it('returns 3 for first unlock (unlockCount=0)', () => {
      expect(getRequiredCardCount(0)).toBe(BASE_CARDS);
    });

    it('returns 6 for second unlock', () => {
      expect(getRequiredCardCount(1)).toBe(6);
    });

    it('returns 12 for third unlock', () => {
      expect(getRequiredCardCount(2)).toBe(12);
    });

    it('returns 24 for fourth unlock', () => {
      expect(getRequiredCardCount(3)).toBe(24);
    });

    it('caps escalation at 96 cards to prevent absurd requirements', () => {
      // 3 * 2^5 = 96, 3 * 2^6 = 192 -> capped at 96
      expect(getRequiredCardCount(5)).toBe(96);
      expect(getRequiredCardCount(6)).toBe(96);
      expect(getRequiredCardCount(10)).toBe(96);
    });

    it('ramps exponentially regardless of unlock count when due is not cleared', () => {
      const opts = { dueCleared: false, keepBlocking: false };
      expect(getRequiredCardCount(0, opts)).toBe(3);
      expect(getRequiredCardCount(2, opts)).toBe(12);
      expect(getRequiredCardCount(5, opts)).toBe(96);
    });
  });

  describe('getRequiredCardCount — due cleared', () => {
    it('returns 0 when post-clear prompting is off', () => {
      const opts = { dueCleared: true, keepBlocking: false };
      expect(getRequiredCardCount(0, opts)).toBe(0);
      expect(getRequiredCardCount(3, opts)).toBe(0);
      expect(getRequiredCardCount(10, opts)).toBe(0);
    });

    it('returns flat 3 cards when post-clear prompting is on', () => {
      const opts = { dueCleared: true, keepBlocking: true };
      expect(getRequiredCardCount(0, opts)).toBe(FLAT_RATE_CARDS);
      expect(getRequiredCardCount(2, opts)).toBe(FLAT_RATE_CARDS);
      expect(getRequiredCardCount(10, opts)).toBe(FLAT_RATE_CARDS);
    });

    it('still ramps exponentially when due is not yet cleared even with setting on', () => {
      const opts = { dueCleared: false, keepBlocking: true };
      expect(getRequiredCardCount(1, opts)).toBe(6);
      expect(getRequiredCardCount(3, opts)).toBe(24);
    });
  });

  describe('shouldPersistScreenTimeSessionProgress', () => {
    it('does not persist progress after the unlock requirement has been completed', () => {
      expect(shouldPersistScreenTimeSessionProgress({
        isScreenTime: true,
        screenTimeUnlocked: true,
      })).toBe(false);
    });

    it('persists progress for an unfinished screen-time unlock', () => {
      expect(shouldPersistScreenTimeSessionProgress({
        isScreenTime: true,
        screenTimeUnlocked: false,
      })).toBe(true);
    });

    it('does not persist progress for regular practice', () => {
      expect(shouldPersistScreenTimeSessionProgress({
        isScreenTime: false,
        screenTimeUnlocked: false,
      })).toBe(false);
    });
  });
});
