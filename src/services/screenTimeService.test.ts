jest.mock('./storage', () => ({
  loadBlocklistJson: jest.fn(() => 'selection-token'),
  loadScreenTimeEnabled: jest.fn(() => true),
  loadUnlockWindowEnd: jest.fn(() => 0),
  clearUnlockWindowEnd: jest.fn(),
  loadUnlockTimerArmed: jest.fn(() => true),
  saveUnlockTimerArmed: jest.fn(),
  clearUnlockTimerArmed: jest.fn(),
  loadDueCardsCleared: jest.fn(() => false),
  loadKeepBlockingAfterDueCleared: jest.fn(() => false),
}));

jest.mock('./debugLog', () => ({
  logDebug: jest.fn(),
}));

jest.mock('./enabledDeckSession', () => ({
  areEnabledDecksClear: jest.fn(() => false),
}));

const configureActions = jest.fn();
const startMonitoring = jest.fn();
const stopMonitoring = jest.fn();
const isShieldActive = jest.fn(() => false);
const isAvailable = jest.fn(() => true);

jest.mock('react-native-device-activity', () => ({
  configureActions,
  startMonitoring,
  stopMonitoring,
  isShieldActive,
  isAvailable,
}), { virtual: true });

import { shouldRequireScreenTimeGate, startUnlockTimerIfArmed } from './screenTimeService';
import { loadDueCardsCleared, loadKeepBlockingAfterDueCleared } from './storage';
import { areEnabledDecksClear } from './enabledDeckSession';

const mockLoadDueCardsCleared = loadDueCardsCleared as jest.MockedFunction<typeof loadDueCardsCleared>;
const mockLoadKeepBlockingAfterDueCleared = loadKeepBlockingAfterDueCleared as jest.MockedFunction<typeof loadKeepBlockingAfterDueCleared>;
const mockAreEnabledDecksClear = areEnabledDecksClear as jest.MockedFunction<typeof areEnabledDecksClear>;

describe('screenTimeService unlock timer', () => {
  beforeEach(() => {
    configureActions.mockClear();
    startMonitoring.mockClear();
    stopMonitoring.mockClear();
  });

  it('reblocks only from the 10-minute usage threshold, not interval end', () => {
    startUnlockTimerIfArmed('test');

    expect(configureActions).toHaveBeenCalledTimes(1);
    expect(configureActions).toHaveBeenCalledWith(expect.objectContaining({
      callbackName: 'eventDidReachThreshold',
      eventName: 'unlock_usage_limit_reached',
    }));
    expect(configureActions).not.toHaveBeenCalledWith(expect.objectContaining({
      callbackName: 'intervalDidEnd',
    }));
    expect(startMonitoring).toHaveBeenCalledWith(
      'unlock-usage-monitor',
      expect.any(Object),
      [expect.objectContaining({
        threshold: { minute: 10 },
        includesPastActivity: false,
      })],
    );
  });

  it('requires the gate when the latch is false and enabled decks still have work', () => {
    mockLoadDueCardsCleared.mockReturnValue(false);
    mockLoadKeepBlockingAfterDueCleared.mockReturnValue(false);
    mockAreEnabledDecksClear.mockReturnValue(false);

    expect(shouldRequireScreenTimeGate()).toBe(true);
  });

  it('does not require the gate when enabled decks are clear and continued blocking is off', () => {
    mockLoadDueCardsCleared.mockReturnValue(false);
    mockLoadKeepBlockingAfterDueCleared.mockReturnValue(false);
    mockAreEnabledDecksClear.mockReturnValue(true);

    expect(shouldRequireScreenTimeGate()).toBe(false);
  });

  it('requires the gate after clear when continued blocking is on', () => {
    mockLoadDueCardsCleared.mockReturnValue(true);
    mockLoadKeepBlockingAfterDueCleared.mockReturnValue(true);
    mockAreEnabledDecksClear.mockReturnValue(true);

    expect(shouldRequireScreenTimeGate()).toBe(true);
  });
});
