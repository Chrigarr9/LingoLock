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

const SELECTION_ID = 'blocked-apps';        // legacy blocklist (still used by getSelectionId for migrations)
const WHITELIST_ID = 'allowed-apps';        // new whitelist for block-all-except mode
const MONITOR_NAME = 'unlock-timer';
const UNLOCK_MINUTES = 10;

// Brand colors matching LingoLock theme (brand blue #5B8EC4)
const BRAND_BLUE = { red: 91, green: 142, blue: 196 };  // #5B8EC4
const DEEP_NAVY = { red: 15, green: 25, blue: 41 };     // #0F1929 (dark mode bg)
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
      title: 'Practice to unlock',
      titleColor: LIGHT_TEXT,
      subtitle: 'Complete a few vocabulary cards to keep using {applicationName}',
      subtitleColor: { ...LIGHT_TEXT, alpha: 0.85 },
      backgroundColor: DEEP_NAVY,
      primaryButtonLabel: 'Open LingoLock',
      primaryButtonLabelColor: LIGHT_TEXT,
      primaryButtonBackgroundColor: BRAND_BLUE,
      iconSystemName: 'graduationcap.fill',
      iconTint: LIGHT_TEXT,
    },
    {
      primary: {
        behavior: 'close',
        type: 'openUrl',
        // URL-encode the placeholder so iOS will route the URL even if the Swift
        // patch isn't applied yet (raw `{` is RFC-unsafe and can fail on some
        // iOS versions). The patched ShieldAction decodes %7B/%7D back to {/}
        // before substituting the application name.
        url: 'lingolock://challenge?source=screentime&app=%7BapplicationName%7D',
      },
    },
  );
}

/**
 * Block all selected apps by applying shields.
 * Uses the persisted selection stored under SELECTION_ID.
 * @deprecated Use enableBlockAll() — block-all + whitelist is the new model.
 */
export function blockApps(): void {
  const { blockSelection } = require('react-native-device-activity');
  blockSelection({ activitySelectionId: SELECTION_ID });
}

/**
 * Enable "block all apps" mode. Every third-party app on the device is shielded
 * unless it's in the whitelist (managed via setWhitelist). The host app itself
 * (LingoLock) is automatically exempted by iOS — Apple guarantees a FamilyControls
 * host can't be shielded by its own configuration. System apps (Phone, Settings,
 * Find My) are also always accessible for safety reasons.
 */
export function enableBlockAll(): void {
  const { enableBlockAllMode } = require('react-native-device-activity');
  enableBlockAllMode('user-enable');
}

/**
 * Replace the entire whitelist with the given FamilyActivitySelection JSON,
 * then re-evaluate shields. Pass null to clear the whitelist (everything blocked).
 */
export function setWhitelist(familyActivitySelectionJson: string | null): void {
  const {
    clearWhitelistAndUpdateBlock,
    addSelectionToWhitelistAndUpdateBlock,
  } = require('react-native-device-activity');
  clearWhitelistAndUpdateBlock('user-update-whitelist');
  if (familyActivitySelectionJson) {
    addSelectionToWhitelistAndUpdateBlock(
      { familyActivitySelection: familyActivitySelectionJson },
      'user-update-whitelist',
    );
  }
}

/**
 * Hard reset — removes all shields and clears any saved whitelist.
 * Use as the user-visible "Clear all blocked apps" escape hatch.
 */
export function clearAllBlocks(): void {
  const {
    resetBlocks,
    clearWhitelistAndUpdateBlock,
    disableBlockAllMode,
  } = require('react-native-device-activity');
  clearWhitelistAndUpdateBlock('user-clear');
  disableBlockAllMode('user-clear');
  resetBlocks('user-clear');
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

  // Configure re-blocking action for when the timer expires.
  // Uses block-all mode — the whitelist persists across unlock cycles in
  // ManagedSettingsStore, so re-enabling block-all restores the same exceptions.
  configureActions({
    activityName: MONITOR_NAME,
    callbackName: 'intervalDidEnd',
    actions: [
      { type: 'enableBlockAllMode' },
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
