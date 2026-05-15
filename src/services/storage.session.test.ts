/**
 * Tests for the screen-time session-resume helpers added in build #9.
 * Focus is the date-keyed staleness — saving on day N and reading on day N+1
 * must return a zero session, not the stale value.
 */

import {
  loadScreenTimeSession,
  saveScreenTimeSession,
  clearScreenTimeSession,
  incrementUnlockCount,
} from './storage';

describe('screen-time session resume', () => {
  afterEach(() => {
    clearScreenTimeSession();
  });

  it('round-trips progress and app name within the same day', () => {
    saveScreenTimeSession(2, 'Reddit');
    expect(loadScreenTimeSession()).toEqual({ progress: 2, app: 'Reddit' });
  });

  it('returns empty session when nothing was saved', () => {
    clearScreenTimeSession();
    expect(loadScreenTimeSession()).toEqual({ progress: 0, app: null });
  });

  it('returns empty session when saved entry is from a previous day', () => {
    saveScreenTimeSession(5, 'Instagram');
    // Simulate clock advancing past midnight.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(tomorrow.toISOString());
    expect(loadScreenTimeSession()).toEqual({ progress: 0, app: null });
  });

  it('clearScreenTimeSession wipes both progress and app', () => {
    saveScreenTimeSession(3, 'YouTube');
    clearScreenTimeSession();
    expect(loadScreenTimeSession()).toEqual({ progress: 0, app: null });
  });

  it('incrementUnlockCount also clears the in-progress session', () => {
    saveScreenTimeSession(4, 'Reddit');
    incrementUnlockCount();
    expect(loadScreenTimeSession()).toEqual({ progress: 0, app: null });
  });

  it('saveScreenTimeSession with null app clears just the app field', () => {
    saveScreenTimeSession(1, 'Reddit');
    saveScreenTimeSession(2, null);
    expect(loadScreenTimeSession()).toEqual({ progress: 2, app: null });
  });
});
