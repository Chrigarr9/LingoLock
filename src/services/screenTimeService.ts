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
import { logDebug } from './debugLog';
import {
  loadBlocklistJson,
  loadScreenTimeEnabled,
  loadUnlockWindowEnd,
  saveUnlockWindowEnd,
  clearUnlockWindowEnd,
  loadDueCardsCleared,
  loadKeepBlockingAfterDueCleared,
} from './storage';

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
 * The primary action is `sendNotification`, not `openUrl`. Apple's openUrl
 * from a shield-action extension uses a freshly-constructed NSExtensionContext
 * inside the library, which silently no-ops on iOS (the user reported this:
 * tap "Open LingoLock", land on home instead of /challenge). Notifications
 * are the reliable cross-process bridge: tapping one always opens the host
 * app, and iOS sets up the navigation context cleanly.
 *
 * Flow on shield tap:
 *   1. Shield extension fires the notification immediately (trigger: nil)
 *   2. Shield extension ALSO writes the pending-shield-action marker via
 *      the local Swift patch (App Group UserDefaults)
 *   3. Shield closes (behavior: 'close')
 *   4. User taps the notification → iOS opens LingoLock
 *   5. AppState.active fires → marker is consumed → router.replace /challenge
 *
 * The notification is just a nudge — the marker carries the app name. If
 * the user dismisses the notification and opens LingoLock manually, the
 * marker still routes correctly (60s TTL).
 *
 * Subtitle uses `{applicationOrDomainDisplayName}` — the key the library's
 * ShieldConfigurationExtension exposes (NOT `applicationName`, which is
 * only in the Action extension's placeholder dict).
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
      primaryButtonLabel: 'Practice now',
      primaryButtonLabelColor: LIGHT_TEXT,
      primaryButtonBackgroundColor: BRAND_BLUE,
      iconSystemName: 'graduationcap.fill',
      iconTint: LIGHT_TEXT,
    },
    {
      primary: {
        // 'defer' keeps the shield up after the button is tapped — user sees
        // the notification arrive and decides whether to tap it. 'close'
        // dismisses both the shield AND the blocked app, dropping the user
        // on the home screen, which they explicitly didn't want. With defer
        // the user can: tap notification → /challenge, OR swipe up to
        // dismiss the shield manually and stay on the iOS home / app switcher.
        behavior: 'defer',
        type: 'sendNotification',
        payload: {
          title: 'Practice to unlock {applicationOrDomainDisplayName}',
          body: 'Tap to complete a few cards — unlocks the app for 10 minutes.',
          sound: 'default',
          // timeSensitive lets the notification interrupt during Focus modes
          // — the user explicitly opted into blocking, so interruption is
          // expected and desired.
          interruptionLevel: 'timeSensitive',
          categoryIdentifier: 'lingolock-shield-practice',
          // userInfo placeholders are NOT substituted by the library, so
          // don't put dynamic data here. The Swift patch writes the app
          // name into the App Group marker; AppState.active reads it.
          userInfo: { kind: 'shield-practice' },
        },
      },
    },
  );
}

/**
 * Apply shields to the given FamilyActivitySelection JSON (the picker's output).
 *
 * Three-step:
 *   1. resetBlocks — clear `currentBlocklist` so old picks don't accumulate
 *      when the user changes their selection.
 *   2. setFamilyActivitySelectionId — mirror the JSON into the library's
 *      stored selections under BLOCKLIST_ID so intervalDidEnd's re-block via
 *      `{ type: 'blockSelection', familyActivitySelectionId }` works.
 *   3. blockSelection({ activitySelectionId: BLOCKLIST_ID }) — apply shields.
 *      The library's `parseActivitySelectionInput` scans for specific keys
 *      (`currentBlocklist`, `currentWhitelist`, `activitySelectionId`,
 *      `activitySelectionToken`) and silently returns an empty selection if
 *      none match. Build #5 passed `{ familyActivitySelection: json }` —
 *      not a recognized key — so the parse returned empty and nothing shielded.
 *
 * Pass null/empty to lift all shields.
 */
export function applyBlocklist(blocklistJson: string | null): void {
  const {
    blockSelection,
    resetBlocks,
    setFamilyActivitySelectionId,
    isShieldActive,
  } = require('react-native-device-activity');

  resetBlocks('apply-blocklist-clear');

  if (!blocklistJson) {
    logDebug('ScreenTime.applyBlocklist', 'empty → resetBlocks only');
    return;
  }

  setFamilyActivitySelectionId({
    id: BLOCKLIST_ID,
    familyActivitySelection: blocklistJson,
  });
  blockSelection(
    { activitySelectionId: BLOCKLIST_ID },
    'apply-blocklist',
  );

  // Log the actual outcome so future bugs of "toggle on but isBlocking=false"
  // are obvious. parseActivitySelectionInput failing silently was build #5's
  // root cause; this surface check would have caught it on first device test.
  // Also log per-token counts so we can see if e.g. the user picked only
  // categories (which previously shielded as opaque category tokens — see
  // includeEntireCategory in the picker).
  const shielded = isShieldActive();
  let counts: unknown = null;
  try {
    const { activitySelectionMetadata } = require('react-native-device-activity');
    counts = activitySelectionMetadata({ activitySelectionToken: blocklistJson }) ?? null;
  } catch {
    // metadata helper failed — non-fatal, still log the shield state
  }
  logDebug('ScreenTime.applyBlocklist', 'applied', {
    blocklistLen: blocklistJson.length,
    isShieldActive: shielded,
    counts,
  });
}

/**
 * Foreground-time safety net: re-apply shields if the unlock window has
 * expired (or never existed) and the toggle is ON but nothing is currently
 * shielded. Apple's DeviceActivityMonitor.intervalDidEnd is best-effort —
 * under memory pressure or scheduling edge cases it can be delayed or
 * skipped, leaving the user permanently unlocked. This is the JS-side
 * guarantee that "10 minutes after unlock, things lock again on next launch
 * or foreground" even if the native callback never fires.
 *
 * Returns true if shields were re-applied.
 */
export function maybeRestoreShields(): boolean {
  if (!isScreenTimeAvailable()) return false;
  if (!loadScreenTimeEnabled()) return false;
  if (isBlocking()) return false;

  // Free-day check: in default mode, once the user has cleared the FSRS due
  // queue today, shields stay off until midnight. The keep-blocking setting
  // opts out — those users want continued (flat-rate) friction.
  if (loadDueCardsCleared() && !loadKeepBlockingAfterDueCleared()) {
    logDebug('ScreenTime.maybeRestore', 'free day — due cleared, shields stay off');
    return false;
  }

  const unlockEnd = loadUnlockWindowEnd();
  const now = Date.now();
  if (unlockEnd > 0 && unlockEnd > now) {
    logDebug('ScreenTime.maybeRestore', 'in unlock window', {
      msLeft: unlockEnd - now,
    });
    return false;
  }

  const blocklistJson = loadBlocklistJson();
  if (!blocklistJson) return false;

  logDebug('ScreenTime.maybeRestore', 'reblocking (window expired or none)', {
    unlockEnd,
    pastWindowMs: unlockEnd > 0 ? now - unlockEnd : null,
  });
  applyBlocklist(blocklistJson);

  // Only clear the unlock-window timestamp if the re-apply actually took.
  // If applyBlocklist silently failed (e.g. stored selection ID lookup
  // returned nil after some migration edge case), keep the stale timestamp
  // so the next foreground retries. Without this guard, a failed re-apply
  // = permanent unlock until the user toggles off/on.
  if (isBlocking()) {
    clearUnlockWindowEnd();
    return true;
  }
  logDebug('ScreenTime.maybeRestore', 'reblock attempted but isBlocking still false — will retry next foreground');
  return false;
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
  // absolute dates. Push intervalStart 5 seconds into the future (per the
  // library README's testSchedule pattern). iOS needs a small window to
  // register the schedule; if intervalStart is exactly `now` or in the past,
  // iOS may treat the schedule as already-passed and skip firing
  // intervalDidEnd. The 5s delay is harmless since shields are already
  // lifted via resetBlocks above.
  //
  // Midnight straddle: clamp intervalEnd to 23:59:59 today rather than wrap
  // into tomorrow. iOS's straddle-midnight semantics for `repeats: false`
  // are ambiguous across versions. Users who unlock right before midnight
  // get a shorter window.
  const nowMs = Date.now();
  const startMs = nowMs + 5_000;
  const intendedEndMs = startMs + UNLOCK_MINUTES * 60 * 1000;
  const start = new Date(startMs);
  const intended = new Date(intendedEndMs);
  const crossesMidnight = intended.getDate() !== start.getDate();
  const end = crossesMidnight
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59)
    : intended;

  // Record the window end timestamp so the JS-side foreground safety net and
  // the background task can re-apply shields if intervalDidEnd is dropped by
  // iOS (memory pressure, scheduling quirks). Without this, a missed
  // callback = permanent unlock.
  saveUnlockWindowEnd(end.getTime());

  const schedule = {
    intervalStart: {
      hour: start.getHours(),
      minute: start.getMinutes(),
      second: start.getSeconds(),
    },
    intervalEnd: {
      hour: end.getHours(),
      minute: end.getMinutes(),
      second: end.getSeconds(),
    },
    repeats: false,
  };
  startMonitoring(MONITOR_NAME, schedule, []);
  logDebug('ScreenTime.startUnlockWindow', 'monitor scheduled', {
    intervalStart: schedule.intervalStart,
    intervalEnd: schedule.intervalEnd,
    windowEndTs: end.getTime(),
    minutesUntilEnd: Math.round((end.getTime() - nowMs) / 60000),
  });
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
  clearUnlockWindowEnd();
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
