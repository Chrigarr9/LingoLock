/**
 * Screen Time Service — orchestrates app blocking via Apple's Screen Time API.
 *
 * Uses react-native-device-activity to:
 * - Configure shield appearance and button actions
 * - Block/unblock selected apps via ManagedSettingsStore
 * - Schedule 10-minute unlock timers via DeviceActivityMonitor
 *
 * All extension behavior is data-driven from JS — no custom Swift needed.
 * The library writes configs to shared UserDefaults; its bundled Swift
 * extensions read and execute them.
 */

import { Platform } from 'react-native';

const SELECTION_ID = 'blocked-apps';
const MONITOR_NAME = 'unlock-timer';
const UNLOCK_MINUTES = 10;

// Brand colors matching LingoLock theme
const BRAND_ORANGE = { red: 255, green: 160, blue: 86 }; // #FFA056
const DARK_BG = { red: 28, green: 46, blue: 74 };         // #1C2E4A
const LIGHT_TEXT = { red: 255, green: 255, blue: 255 };

/**
 * Check if Screen Time API is available on this device.
 * Returns false on Android, web, and simulators without Screen Time support.
 */
export function isScreenTimeAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    const { isAvailable } = require('react-native-device-activity');
    return isAvailable();
  } catch (error) {
    console.error('[ScreenTime] Failed to load native module:', error);
    return false;
  }
}

/**
 * Get the current Screen Time authorization status.
 * Returns 0 (notDetermined), 1 (denied), or 2 (approved).
 */
export function getScreenTimeAuthStatus(): number {
  const { getAuthorizationStatus } = require('react-native-device-activity');
  return getAuthorizationStatus();
}

/**
 * Request Screen Time authorization for individual (self) use.
 * Shows the system consent dialog.
 */
export async function requestScreenTimeAuth(): Promise<void> {
  const { requestAuthorization } = require('react-native-device-activity');
  await requestAuthorization('individual');
}

/**
 * Configure the shield appearance and button action.
 * Called once during setup and whenever the shield needs updating.
 *
 * The shield button uses "openApp" to launch LingoLock directly.
 * Fallback: if openApp doesn't work reliably, switch to sendNotification.
 */
export function configureShield(): void {
  const { updateShield } = require('react-native-device-activity');

  updateShield(
    {
      title: 'Time to practice!',
      titleColor: LIGHT_TEXT,
      subtitle: 'Complete vocabulary cards in LingoLock to unlock your apps',
      subtitleColor: { ...LIGHT_TEXT, alpha: 0.8 },
      backgroundColor: DARK_BG,
      primaryButtonLabel: 'Open LingoLock',
      primaryButtonLabelColor: DARK_BG,
      primaryButtonBackgroundColor: BRAND_ORANGE,
      iconSystemName: 'book.fill',
      iconTint: BRAND_ORANGE,
    },
    {
      primary: {
        behavior: 'close',
        actions: [{ type: 'openApp' }],
      },
    },
  );
}

/**
 * Block all selected apps by applying shields.
 * Uses the persisted selection stored under SELECTION_ID.
 */
export function blockApps(): void {
  const { blockSelection } = require('react-native-device-activity');
  blockSelection({ activitySelectionId: SELECTION_ID });
}

/**
 * Unblock all apps by removing shields and stopping any active monitor.
 */
export function unblockApps(): void {
  const { resetBlocks, stopMonitoring } = require('react-native-device-activity');
  resetBlocks();
  stopMonitoring([MONITOR_NAME]);
}

/**
 * Lift shields temporarily and start a 10-minute unlock timer.
 * When the timer expires, the DeviceActivityMonitor re-applies shields.
 */
export function startUnlockWindow(): void {
  const {
    resetBlocks,
    startMonitoring,
    configureActions,
    stopMonitoring,
  } = require('react-native-device-activity');

  // Stop any existing unlock timer
  stopMonitoring([MONITOR_NAME]);

  // Configure re-blocking action for when the timer expires
  configureActions({
    activityName: MONITOR_NAME,
    callbackName: 'intervalDidEnd',
    actions: [
      {
        type: 'blockSelection',
        familyActivitySelectionId: SELECTION_ID,
      },
    ],
  });

  // Lift shields
  resetBlocks();

  // DeviceActivityMonitor takes wall-clock time-of-day components, not
  // absolute dates. If our 10-minute window would cross midnight, clamp
  // intervalEnd to 23:59:59 today rather than wrap into tomorrow — iOS's
  // straddle-midnight semantics for `repeats: false` are ambiguous across
  // versions. Users who unlock right before midnight get a shorter window;
  // a future improvement could chain a second monitor for after midnight.
  const now = new Date();
  const intendedEnd = new Date(now.getTime() + UNLOCK_MINUTES * 60 * 1000);
  const crossesMidnight = intendedEnd.getDate() !== now.getDate();
  const end = crossesMidnight
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    : intendedEnd;

  startMonitoring(
    MONITOR_NAME,
    {
      intervalStart: {
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
      },
      intervalEnd: {
        hour: end.getHours(),
        minute: end.getMinutes(),
        second: end.getSeconds(),
      },
      repeats: false,
    },
    [], // no events — we only use intervalDidEnd
  );
}

/**
 * Check if any shield/block is currently active.
 */
export function isBlocking(): boolean {
  const { isShieldActive } = require('react-native-device-activity');
  return isShieldActive();
}

/**
 * Get the selection ID used for persisted app selection.
 * Used by DeviceActivitySelectionViewPersisted component.
 */
export function getSelectionId(): string {
  return SELECTION_ID;
}

/**
 * Check if the user has selected any apps to block.
 */
export function hasAppSelection(): boolean {
  const { getFamilyActivitySelectionId } = require('react-native-device-activity');
  return getFamilyActivitySelectionId(SELECTION_ID) !== undefined;
}

/**
 * Fully disable Screen Time blocking.
 * Removes all shields, stops monitors, and clears the managed settings store.
 */
export function disableBlocking(): void {
  const {
    resetBlocks,
    stopMonitoring,
    clearAllManagedSettingsStoreSettings,
  } = require('react-native-device-activity');

  stopMonitoring();
  resetBlocks();
  clearAllManagedSettingsStoreSettings();
}
