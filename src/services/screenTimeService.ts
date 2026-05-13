/**
 * Screen Time Service — orchestrates app blocking via Apple's Screen Time API.
 *
 * Block model: USER-PICKS-BLOCKED-APPS. The user explicitly selects which apps
 * should be shielded via the Family Activity Picker; we apply shields to that
 * exact set. We do NOT use Apple's `.all(except:)` policy — it silently misses
 * apps not enumerated under a known category (e.g. third-party apps that load
 * lazily), which the user observed firsthand with YouTube/Reddit/Strava/Garmin.
 *
 * Unlock cycle: tap shield → routed to /challenge → complete cards →
 * resetBlocks() lifts shields for 10 min → intervalDidEnd re-applies the
 * blocklist via blockSelection(BLOCKLIST_ID). The blocklist's selection ID is
 * mirrored to the library's selection store via setFamilyActivitySelectionId
 * so the monitor callback can reference it by ID.
 *
 * Shield handoff: the library's openUrl uses a freshly-constructed
 * NSExtensionContext() that silently no-ops on iOS — so the shield's deep link
 * never actually reaches the host app. We patch ShieldActionExtension.swift to
 * write a `lingolock.pendingShieldAction` marker into App Group UserDefaults
 * before openUrl is called. The host reads + clears that marker on launch and
 * on AppState→active and routes to /challenge regardless of whether iOS
 * delivered the URL. See consumePendingShieldAction below.
 */

import { Platform } from 'react-native';

const BLOCKLIST_ID = 'blocked-apps';        // FamilyActivitySelection ID stored by library
const MONITOR_NAME = 'unlock-timer';
const UNLOCK_MINUTES = 10;
const SHIELD_ACTION_MARKER_KEY = 'lingolock.pendingShieldAction';
const SHIELD_ACTION_TTL_MS = 60_000;

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
 * Configure the shield appearance and primary button action.
 *
 * The subtitle uses `{applicationOrDomainDisplayName}` — that's the placeholder
 * key the library's ShieldConfigurationExtension exposes (NOT `applicationName`,
 * which only exists in the ShieldAction extension's placeholder dict). Build #4
 * used the wrong key and rendered the literal string "{applicationName}".
 */
export function configureShield(): void {
  const { updateShield } = require('react-native-device-activity');

  updateShield(
    {
      title: 'Practice to unlock',
      titleColor: LIGHT_TEXT,
      subtitle: 'Complete a few vocabulary cards to keep using {applicationOrDomainDisplayName}',
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
        // before substituting the application name. NOTE: the openUrl call in
        // the library is broken (uses a fresh NSExtensionContext), so this URL
        // probably won't be delivered — the pending-shield-action marker (also
        // written by the patch) is the reliable signal we read on foreground.
        url: 'lingolock://challenge?source=screentime&app=%7BapplicationName%7D',
      },
    },
  );
}

/**
 * Apply shields to the given FamilyActivitySelection JSON (the picker's output).
 *
 * Two-step:
 *   1. Mirror the selection into the library's FamilyActivitySelection store
 *      under BLOCKLIST_ID so the unlock-window's intervalDidEnd callback can
 *      re-block it later via `{ type: 'blockSelection', familyActivitySelectionId }`.
 *      The library's `executeGenericAction` only accepts a selection ID for
 *      blockSelection — not an inline selection.
 *   2. Apply shields immediately via blockSelection(selection) — this writes
 *      to ManagedSettingsStore.shield.applications, which reliably shields
 *      exactly the picked tokens. No `.all(except:)` weirdness.
 *
 * Pass null/empty to lift all shields.
 */
export function applyBlocklist(blocklistJson: string | null): void {
  const {
    blockSelection,
    resetBlocks,
    setFamilyActivitySelectionId,
  } = require('react-native-device-activity');

  if (!blocklistJson) {
    resetBlocks('apply-blocklist-empty');
    return;
  }

  // The library accepts the FamilyActivitySelection as either a JSON string or
  // a parsed object via familyActivitySelection field. We pass the JSON
  // directly — the bridge handles both forms via parseActivitySelectionInput.
  setFamilyActivitySelectionId({
    id: BLOCKLIST_ID,
    familyActivitySelection: blocklistJson,
  });
  blockSelection(
    { familyActivitySelection: blocklistJson },
    'apply-blocklist',
  );
}

/**
 * Lift shields temporarily and start a 10-minute unlock timer.
 * When the timer expires, the DeviceActivityMonitor re-applies the blocklist
 * via the BLOCKLIST_ID stored selection.
 */
export function startUnlockWindow(): void {
  const {
    resetBlocks,
    startMonitoring,
    configureActions,
    stopMonitoring,
  } = require('react-native-device-activity');

  stopMonitoring([MONITOR_NAME]);

  // Re-block action for when the timer expires. References the stored
  // selection by ID (set in applyBlocklist).
  configureActions({
    activityName: MONITOR_NAME,
    callbackName: 'intervalDidEnd',
    actions: [
      { type: 'blockSelection', familyActivitySelectionId: BLOCKLIST_ID },
    ],
  });

  // Lift shields. resetBlocks clears currentBlocklist and re-evaluates the
  // shield — with block-all mode gone, this leaves shields empty until
  // intervalDidEnd fires. The user's persisted selection (BLOCKLIST_ID) is
  // separate from currentBlocklist, so it survives.
  resetBlocks('unlock-window');

  // DeviceActivityMonitor takes wall-clock time-of-day components, not
  // absolute dates. If our 10-minute window would cross midnight, clamp
  // intervalEnd to 23:59:59 today rather than wrap into tomorrow — iOS's
  // straddle-midnight semantics for `repeats: false` are ambiguous across
  // versions. Users who unlock right before midnight get a shorter window.
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
    [],
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
 * Fully disable Screen Time blocking. Master toggle OFF.
 *
 * Order matters:
 *   1. stopMonitoring — kill the unlock-timer callback so it can't re-arm
 *      shields in the background after we lift them.
 *   2. disableBlockAllMode — defensively clear the IS_BLOCKING_ALL flag in
 *      shared UserDefaults. Legacy from the block-all era; for upgrade users
 *      this is what undoes their previous setup.
 *   3. resetBlocks — drop currentBlocklist + re-evaluate shield (empty).
 *   4. clearAllManagedSettingsStoreSettings — nuke the store directly.
 *
 * The user's blocklist (loadBlocklistJson) is preserved in MMKV so the picker
 * remembers their choices when they re-enable.
 */
export function disableBlocking(): void {
  const {
    resetBlocks,
    stopMonitoring,
    clearAllManagedSettingsStoreSettings,
    disableBlockAllMode,
  } = require('react-native-device-activity');

  stopMonitoring();
  disableBlockAllMode('user-toggle-off');
  resetBlocks('user-toggle-off');
  clearAllManagedSettingsStoreSettings();
}

/**
 * One-time migration from the build-#3/#4 block-all model to the explicit
 * blocklist model. Idempotent — safe to call on every launch.
 *
 * Detection: legacy installs have `isBlockingAll=true` in shared UserDefaults
 * (set by the library's enableBlockAllMode). New installs never set this flag.
 *
 * Returns true if migration ran — caller should clear MMKV state and surface
 * a message so the user knows to re-enable from Settings.
 */
export function migrateFromBlockAll(): boolean {
  if (!isScreenTimeAvailable()) return false;
  try {
    const { userDefaultsGet } = require('react-native-device-activity');
    const wasBlockingAll = userDefaultsGet('isBlockingAll') === true;
    if (!wasBlockingAll) return false;

    disableBlocking();
    return true;
  } catch (error) {
    console.warn('[ScreenTime] Block-all migration check failed:', error);
    return false;
  }
}

/**
 * Read + clear the pending shield-action marker written by the patched
 * ShieldActionExtension. Returns null if no marker, expired (>60s old), or
 * unreadable. The host reads this on cold launch and AppState→active to route
 * the user to /challenge — the library's openUrl is broken on iOS so this
 * marker is the only reliable signal that the shield was tapped.
 */
export interface PendingShieldAction {
  url: string;
  app: string;
  ts: number;
}

export function consumePendingShieldAction(): PendingShieldAction | null {
  if (!isScreenTimeAvailable()) return null;
  try {
    const { userDefaultsGet, userDefaultsRemove } = require('react-native-device-activity');
    const raw = userDefaultsGet(SHIELD_ACTION_MARKER_KEY);
    if (!raw || typeof raw !== 'object') return null;

    // Clear regardless of freshness so a stale marker can't keep firing.
    userDefaultsRemove(SHIELD_ACTION_MARKER_KEY);

    const ts = typeof raw.ts === 'number' ? raw.ts : 0;
    if (!ts || Date.now() - ts > SHIELD_ACTION_TTL_MS) return null;

    return {
      url: typeof raw.url === 'string' ? raw.url : '',
      app: typeof raw.app === 'string' ? raw.app : '',
      ts,
    };
  } catch (error) {
    console.warn('[ScreenTime] Failed to consume shield action marker:', error);
    return null;
  }
}
