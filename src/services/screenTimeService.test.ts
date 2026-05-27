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

import { startUnlockTimerIfArmed } from './screenTimeService';

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
});
