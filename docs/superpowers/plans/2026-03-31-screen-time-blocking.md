# Screen Time App Blocking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block distracting apps at the system level via Apple's Screen Time API, requiring FSRS flashcard completion to unlock for 10-minute windows with exponential escalation.

**Architecture:** `react-native-device-activity` wraps Apple's FamilyControls/ManagedSettings/DeviceActivity frameworks. All extension behavior is configured from JavaScript via data-driven UserDefaults — no custom Swift extension code needed. The library's Expo config plugin generates 3 iOS extension targets automatically. A new `screenTimeService.ts` orchestrates blocking/unblocking, while `escalationService.ts` contains pure escalation logic. The existing Shortcuts-based automation is removed entirely.

**Tech Stack:** `react-native-device-activity` v0.6.x, `@kingstinct/expo-apple-targets` (transitive dep), Expo 55, MMKV for local state, `ts-fsrs` for due card counting.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/services/escalationService.ts` | Pure escalation math (card count, unlock tracking, midnight reset) |
| Create | `__tests__/escalationService.test.ts` | Tests for escalation logic |
| Create | `src/services/screenTimeService.ts` | Orchestration: shield config, block/unblock, monitor setup, authorization |
| Modify | `src/services/storage.ts` | Add Screen Time MMKV keys (blockingEnabled, unlockCount, etc.) |
| Modify | `app/settings.tsx` | Add "App Blocking" section with authorization + app picker + toggle |
| Modify | `app/challenge.tsx` | Handle `source=screentime`, escalation-based card requirement, lift shields on completion |
| Modify | `app/_layout.tsx` | Remove automation listener, add Screen Time foreground redirect |
| Modify | `src/services/statsService.ts` | Export `getTotalDueCount` for Screen Time due-card-cleared check |
| Modify | `src/utils/deepLinkHandler.ts` | No changes needed — `source=screentime` already works via existing challenge handler |
| Modify | `app.json` | Add `react-native-device-activity` plugin config and 3 extension targets |
| Remove | `modules/expo-app-intents/` | Entire Shortcuts App Intents module |
| Remove | `plugins/withAppIntents.js` | Shortcuts config plugin |
| Remove | `src/services/automationService.ts` | Shortcuts automation listener |
| Remove | `app/grace.tsx` | Post-practice bounce-back screen (no longer needed) |

---

### Task 1: Install react-native-device-activity

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the library**

```bash
npx expo install react-native-device-activity
```

This also installs `@kingstinct/expo-apple-targets` as a transitive dependency.

- [ ] **Step 2: Verify installation**

```bash
node -e "const pkg = require('./node_modules/react-native-device-activity/package.json'); console.log(pkg.name, pkg.version)"
```

Expected: `react-native-device-activity 0.6.x`

- [ ] **Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore: install react-native-device-activity"
```

---

### Task 2: Configure app.json for Screen Time extensions

**Files:**
- Modify: `app.json`

- [ ] **Step 1: Add the react-native-device-activity plugin**

In `app.json`, add to the `plugins` array (after the existing `"./plugins/withAppIntents"` entry — that will be removed in Task 9):

```json
["react-native-device-activity", {
  "appleTeamId": "<APPLE_TEAM_ID>",
  "appGroup": "group.com.lingolock.app"
}]
```

Replace `<APPLE_TEAM_ID>` with the actual Apple Developer Team ID from the Expo/Xcode project.

- [ ] **Step 2: Add extension targets to EAS build config**

In `app.json` under `extra.eas.build.experimental.ios.appExtensions`, add three new entries alongside the existing `ExpoWidgetsTarget`:

```json
{
  "targetName": "ActivityMonitorExtension",
  "bundleIdentifier": "com.lingolock.app.ActivityMonitorExtension",
  "entitlements": {
    "com.apple.developer.family-controls": true,
    "com.apple.security.application-groups": ["group.com.lingolock.app"]
  }
},
{
  "targetName": "ShieldConfiguration",
  "bundleIdentifier": "com.lingolock.app.ShieldConfiguration",
  "entitlements": {
    "com.apple.developer.family-controls": true,
    "com.apple.security.application-groups": ["group.com.lingolock.app"]
  }
},
{
  "targetName": "ShieldAction",
  "bundleIdentifier": "com.lingolock.app.ShieldAction",
  "entitlements": {
    "com.apple.developer.family-controls": true,
    "com.apple.security.application-groups": ["group.com.lingolock.app"]
  }
}
```

- [ ] **Step 3: Add Family Controls entitlement to main app**

In `app.json` under `ios.entitlements`, add:

```json
"com.apple.developer.family-controls": true
```

So the entitlements object becomes:

```json
"entitlements": {
  "com.apple.security.application-groups": ["group.com.lingolock.app"],
  "com.apple.developer.family-controls": true
}
```

- [ ] **Step 4: Commit**

```bash
git add app.json
git commit -m "chore: configure Screen Time extension targets and entitlements"
```

---

### Task 3: Create escalation logic with tests (TDD)

**Files:**
- Create: `src/services/escalationService.ts`
- Create: `__tests__/escalationService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/escalationService.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/escalationService.test.ts --no-cache
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the escalation logic**

Create `src/services/escalationService.ts`:

```typescript
/**
 * Escalation logic for Screen Time app blocking.
 *
 * Card requirements escalate exponentially per unlock cycle per day:
 *   Unlock 1: 3 cards, Unlock 2: 6, Unlock 3: 12, Unlock 4: 24, ...
 * Once all FSRS due cards are cleared for the day, switches to flat 3 cards.
 * All counters reset at midnight.
 */

/** Base number of cards for the first unlock */
export const BASE_CARDS = 3;

/** Flat rate after all due cards are cleared */
export const FLAT_RATE_CARDS = 3;

/** Maximum escalation cap (prevents absurd requirements) */
const MAX_ESCALATION = 96;

/**
 * Calculate the number of cards required for the current unlock.
 *
 * @param unlockCount - Number of unlocks completed today (0-indexed)
 * @param dueCardsCleared - Whether all FSRS due cards have been cleared today
 * @returns Number of cards the user must complete
 */
export function getRequiredCardCount(
  unlockCount: number,
  dueCardsCleared: boolean,
): number {
  if (dueCardsCleared) return FLAT_RATE_CARDS;
  return Math.min(BASE_CARDS * Math.pow(2, unlockCount), MAX_ESCALATION);
}

/**
 * Check if the user has cleared all due cards (triggers flat-rate mode).
 *
 * @param totalDueCount - Current total FSRS due card count across all bundles
 * @returns true if flat rate should be used
 */
export function shouldUseFlatRate(totalDueCount: number): boolean {
  return totalDueCount === 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/escalationService.test.ts --no-cache
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/escalationService.ts __tests__/escalationService.test.ts
git commit -m "feat: add escalation logic for Screen Time card requirements"
```

---

### Task 4: Add Screen Time storage functions

**Files:**
- Modify: `src/services/storage.ts`

- [ ] **Step 1: Add Screen Time MMKV keys and functions**

Add the following section to the end of `storage.ts`, before the "Debug / testing utilities" section:

```typescript
// ---------------------------------------------------------------------------
// Screen Time blocking preferences
// ---------------------------------------------------------------------------

const SCREEN_TIME_ENABLED_KEY = 'screen_time_enabled';
const SCREEN_TIME_UNLOCK_COUNT_KEY = 'screen_time_unlock_count';
const SCREEN_TIME_UNLOCK_DATE_KEY = 'screen_time_unlock_date';
const SCREEN_TIME_DUE_CLEARED_KEY = 'screen_time_due_cleared';
const SCREEN_TIME_DUE_CLEARED_DATE_KEY = 'screen_time_due_cleared_date';

/**
 * Load whether Screen Time app blocking is enabled.
 */
export function loadScreenTimeEnabled(): boolean {
  return statsStorage.getBoolean(SCREEN_TIME_ENABLED_KEY) ?? false;
}

/**
 * Persist Screen Time app blocking enabled state.
 */
export function saveScreenTimeEnabled(enabled: boolean): void {
  statsStorage.set(SCREEN_TIME_ENABLED_KEY, enabled);
}

/**
 * Load today's unlock count (for escalation calculation).
 * Returns 0 if on a new calendar day or never set.
 */
export function loadUnlockCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  const storedDate = statsStorage.getString(SCREEN_TIME_UNLOCK_DATE_KEY);
  if (storedDate !== today) return 0;
  return statsStorage.getNumber(SCREEN_TIME_UNLOCK_COUNT_KEY) ?? 0;
}

/**
 * Increment today's unlock count after a successful unlock.
 */
export function incrementUnlockCount(): void {
  const today = new Date().toISOString().slice(0, 10);
  const current = loadUnlockCount();
  statsStorage.set(SCREEN_TIME_UNLOCK_DATE_KEY, today);
  statsStorage.set(SCREEN_TIME_UNLOCK_COUNT_KEY, current + 1);
}

/**
 * Load whether all due cards have been cleared today.
 * Returns false if on a new calendar day or never set.
 */
export function loadDueCardsCleared(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const storedDate = statsStorage.getString(SCREEN_TIME_DUE_CLEARED_DATE_KEY);
  if (storedDate !== today) return false;
  return statsStorage.getBoolean(SCREEN_TIME_DUE_CLEARED_KEY) ?? false;
}

/**
 * Mark that all due cards have been cleared today.
 * Switches escalation from exponential to flat rate for the rest of the day.
 */
export function saveDueCardsCleared(): void {
  const today = new Date().toISOString().slice(0, 10);
  statsStorage.set(SCREEN_TIME_DUE_CLEARED_DATE_KEY, today);
  statsStorage.set(SCREEN_TIME_DUE_CLEARED_KEY, true);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/storage.ts
git commit -m "feat: add Screen Time storage keys for escalation tracking"
```

---

### Task 5: Create Screen Time service

**Files:**
- Create: `src/services/screenTimeService.ts`

- [ ] **Step 1: Create the service file**

Create `src/services/screenTimeService.ts`:

```typescript
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
  } catch {
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

  // Calculate 10-minute window from now
  const now = new Date();
  const end = new Date(now.getTime() + UNLOCK_MINUTES * 60 * 1000);

  // Start monitor — intervalDidEnd will fire and execute the re-blocking action
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
```

- [ ] **Step 2: Commit**

```bash
git add src/services/screenTimeService.ts
git commit -m "feat: create Screen Time service for shield and monitor orchestration"
```

---

### Task 6: Add App Blocking settings UI section

**Files:**
- Modify: `app/settings.tsx`

- [ ] **Step 1: Add imports**

At the top of `app/settings.tsx`, add:

```typescript
import {
  loadScreenTimeEnabled,
  saveScreenTimeEnabled,
  loadUnlockCount,
} from '../src/services/storage';
import {
  isScreenTimeAvailable,
  getScreenTimeAuthStatus,
  requestScreenTimeAuth,
  configureShield,
  blockApps,
  disableBlocking,
  getSelectionId,
} from '../src/services/screenTimeService';
```

- [ ] **Step 2: Add state variables**

Inside the `SettingsScreen` component, after the existing state declarations (around line 116), add:

```typescript
// Screen Time state
const screenTimeAvailable = isScreenTimeAvailable();
const [screenTimeEnabled, setScreenTimeEnabled] = useState(() => loadScreenTimeEnabled());
const [screenTimeAuthorized, setScreenTimeAuthorized] = useState(
  () => screenTimeAvailable && getScreenTimeAuthStatus() === 2,
);
const [showAppPicker, setShowAppPicker] = useState(false);
```

- [ ] **Step 3: Add handler functions**

After the existing handler functions (around line 188), add:

```typescript
async function handleScreenTimeToggle(value: boolean) {
  if (value) {
    if (!screenTimeAuthorized) {
      try {
        await requestScreenTimeAuth();
        setScreenTimeAuthorized(true);
      } catch {
        return; // user denied authorization
      }
    }
    configureShield();
    blockApps();
    setScreenTimeEnabled(true);
    saveScreenTimeEnabled(true);
  } else {
    disableBlocking();
    setScreenTimeEnabled(false);
    saveScreenTimeEnabled(false);
  }
}

function handleAppSelectionChange() {
  // Selection is auto-persisted by DeviceActivitySelectionViewPersisted
  // Re-apply blocks with the updated selection if blocking is enabled
  if (screenTimeEnabled) {
    blockApps();
  }
}
```

- [ ] **Step 4: Add the App Blocking UI section**

In the JSX, replace the existing "App Automation" section (the `{Platform.OS !== 'web' && (` block with the automation threshold stepper, lines ~319-367) with:

```tsx
{/* ── App Blocking (iOS with Screen Time) ── */}
{screenTimeAvailable && (
  <View style={[styles.card, glassStyle]}>
    <Text
      variant="titleSmall"
      style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
    >
      App Blocking
    </Text>

    <View style={styles.settingRow}>
      <View style={styles.settingLabelGroup}>
        <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
          Block Distracting Apps
        </Text>
        <Text
          variant="bodySmall"
          style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          Complete vocabulary cards to unlock apps for 10 minutes
        </Text>
      </View>
      <Switch
        value={screenTimeEnabled}
        onValueChange={handleScreenTimeToggle}
        color={theme.custom.brandBlue}
      />
    </View>

    {screenTimeEnabled && (
      <>
        <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
        <Pressable
          onPress={() => setShowAppPicker(true)}
          style={styles.settingRow}
        >
          <View style={styles.settingLabelGroup}>
            <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
              Blocked Apps
            </Text>
            <Text
              variant="bodySmall"
              style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Choose which apps require vocabulary practice
            </Text>
          </View>
          <IconButton
            icon="chevron-right"
            size={20}
            iconColor={theme.colors.onSurfaceVariant}
          />
        </Pressable>

        <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
        <View style={styles.settingRow}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Unlock duration: 10 minutes
          </Text>
        </View>

        <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
        <View style={styles.settingRow}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Today: {loadUnlockCount()} unlocks
          </Text>
        </View>
      </>
    )}
  </View>
)}

{/* App Picker Sheet */}
{showAppPicker && (() => {
  const { DeviceActivitySelectionSheetViewPersisted } = require('react-native-device-activity');
  return (
    <DeviceActivitySelectionSheetViewPersisted
      familyActivitySelectionId={getSelectionId()}
      headerText="Select apps to block"
      footerText="You'll need to complete vocabulary cards before using these apps."
      onSelectionChange={handleAppSelectionChange}
      onDismissRequest={() => setShowAppPicker(false)}
    />
  );
})()}
```

- [ ] **Step 5: Remove old automation imports and state**

Remove these imports from the top of `settings.tsx`:

```typescript
// REMOVE:
import { loadAutomationCardThreshold, saveAutomationCardThreshold } from '../src/services/storage';
```

Remove the `automationThreshold` state and its handlers (`handleThresholdDecrement`, `handleThresholdIncrement`).

- [ ] **Step 6: Commit**

```bash
git add app/settings.tsx
git commit -m "feat: add App Blocking settings section with Screen Time integration"
```

---

### Task 7: Integrate Screen Time into challenge screen

**Files:**
- Modify: `src/services/statsService.ts`
- Modify: `app/challenge.tsx`

- [ ] **Step 0: Export getTotalDueCount from statsService**

In `src/services/statsService.ts`, change the `getTotalDueCount` function from private to exported:

```typescript
// CHANGE:
function getTotalDueCount(): number {
// TO:
export function getTotalDueCount(): number {
```

This function counts FSRS due cards across all enabled bundles (excludes new/unseen cards). It's needed by the challenge screen to detect when all due cards are cleared (switching escalation to flat rate).

- [ ] **Step 1: Add Screen Time imports**

Replace the automation-related imports at the top of `challenge.tsx`:

```typescript
// REMOVE these lines:
import { isKnownApp, openSourceApp } from '../src/utils/deepLinkOpener';
import { loadAutomationCardThreshold, saveAutomationGraceStart } from '../src/services/storage';

// ADD these lines:
import { loadScreenTimeEnabled, loadUnlockCount, loadDueCardsCleared, incrementUnlockCount, saveDueCardsCleared } from '../src/services/storage';
import { getRequiredCardCount, shouldUseFlatRate } from '../src/services/escalationService';
import { startUnlockWindow, configureShield } from '../src/services/screenTimeService';
import { getTotalDueCount } from '../src/services/statsService';
```

Also keep the existing `ContinueButton` import removed — it's no longer needed.

- [ ] **Step 2: Replace automation logic with Screen Time logic**

Replace the automation detection block (around lines 69-75):

```typescript
// REMOVE:
const source = params.source ?? '';
const isAutomation = isKnownApp(source) || source === 'Other';
const canReturnToApp = isKnownApp(source);
const automationThreshold = useMemo(
  () => isAutomation ? loadAutomationCardThreshold() : 0,
  [isAutomation],
);

// REPLACE WITH:
const source = params.source ?? '';
const isScreenTime = source === 'screentime' && loadScreenTimeEnabled();

// Calculate required cards for Screen Time unlock
const screenTimeRequirement = useMemo(() => {
  if (!isScreenTime) return 0;
  const unlockCount = loadUnlockCount();
  const dueCleared = loadDueCardsCleared();
  return getRequiredCardCount(unlockCount, dueCleared);
}, [isScreenTime]);
```

- [ ] **Step 3: Update session initialization**

In the `useEffect` for session initialization (around line 101), replace the `budget` calculation:

```typescript
// REMOVE:
const budget = isAutomation ? Infinity : loadNewWordsPerDay();

// REPLACE WITH:
const budget = isScreenTime ? Infinity : loadNewWordsPerDay();
```

- [ ] **Step 4: Update session completion handler**

In the `advanceToNext` callback, after the session completes (around line 193, inside the `else` block after `updateStatsAfterSession`), add Screen Time unlock logic:

```typescript
// After the existing lines:
updateStatsAfterSession(correctCountRef.current, totalCardCount.current, params.source ?? 'unknown');
checkAndAdvanceStreak();
recordNewWordsIntroduced(answeredNewCardIds.current.size);
updateWidgetData();
rescheduleAfterExternalAnswer().catch(e => console.error('[Challenge] Reschedule failed:', e));

// ADD: Check if due cards are now cleared (for escalation mode switch)
if (isScreenTime && !loadDueCardsCleared()) {
  if (shouldUseFlatRate(getTotalDueCount())) {
    saveDueCardsCleared();
  }
}
```

- [ ] **Step 5: Replace the "Continue to App" header button with Screen Time unlock**

Replace the `showContinueButton` logic and the header continue button (around lines 374 and 401-419):

```typescript
// REMOVE:
const showContinueButton = isAutomation && correctCount >= automationThreshold;

// REPLACE WITH:
const showUnlockButton = isScreenTime && correctCount >= screenTimeRequirement;
```

Replace the header continue button JSX with:

```tsx
{showUnlockButton && (
  <Pressable
    onPress={() => {
      incrementUnlockCount();
      startUnlockWindow();
      router.dismissAll();
    }}
    style={[styles.headerContinue, { backgroundColor: theme.colors.surfaceVariant }]}
    accessibilityLabel="Unlock apps"
    accessibilityRole="button"
  >
    <Text style={[styles.headerContinueText, { color: theme.colors.onSurfaceVariant }]}>
      Unlock
    </Text>
    <Icon source="lock-open-outline" size={12} color={theme.colors.onSurfaceVariant} />
  </Pressable>
)}
```

- [ ] **Step 6: Update the completion screen**

Replace the automation-specific completion buttons. Remove the `ContinueButton` at the bottom and update the "Done" button:

```tsx
{/* Done button */}
<Pressable
  onPress={() => {
    if (isScreenTime && correctCountRef.current >= screenTimeRequirement) {
      incrementUnlockCount();
      startUnlockWindow();
    }
    router.dismissAll();
  }}
  style={[styles.doneButton, { backgroundColor: theme.colors.primary }]}
  accessibilityLabel="Done"
  accessibilityRole="button"
>
  <Text style={[styles.doneButtonText, { color: theme.colors.onPrimary }]}>
    {isScreenTime && correctCountRef.current >= screenTimeRequirement
      ? 'Unlock Apps'
      : 'Done'}
  </Text>
</Pressable>

{/* REMOVE the ContinueButton block entirely:
{isAutomation && canReturnToApp && (
  <ContinueButton sourceApp={source} onBeforeOpen={saveAutomationGraceStart} />
)}
*/}
```

- [ ] **Step 7: Update handleClose to remove automation grace**

In the `handleClose` function, remove the automation grace period:

```typescript
// REMOVE:
if (isAutomation && correctCountRef.current >= automationThreshold) {
  saveAutomationGraceStart();
}

// REPLACE WITH:
if (isScreenTime && correctCountRef.current >= screenTimeRequirement) {
  incrementUnlockCount();
  startUnlockWindow();
}
```

- [ ] **Step 8: Clean up unused imports**

Remove the `ContinueButton` import:

```typescript
// REMOVE:
import { ContinueButton } from '../src/components/ContinueButton';
```

- [ ] **Step 9: Commit**

```bash
git add app/challenge.tsx
git commit -m "feat: integrate Screen Time escalation into challenge screen"
```

---

### Task 8: Handle Screen Time app-open redirect in _layout.tsx

**Files:**
- Modify: `app/_layout.tsx`

When the user taps the shield button, `openApp` launches LingoLock. We need to detect this and navigate to the challenge screen.

- [ ] **Step 1: Add Screen Time imports**

Replace automation imports:

```typescript
// REMOVE:
import { setupAutomationListener } from '../src/services/automationService';
import { consumeAutomationSource } from '../modules/expo-app-intents/src';
import { isKnownApp, openSourceApp } from '../src/utils/deepLinkOpener';

// ADD:
import { loadScreenTimeEnabled } from '../src/services/storage';
import { isScreenTimeAvailable, isBlocking } from '../src/services/screenTimeService';
```

- [ ] **Step 2: Add foreground detection for shield-to-app redirect**

In the main `useEffect` (around line 96), replace the automation listener setup:

```typescript
// REMOVE:
// Setup automation listener for App Intent triggers
cleanupAutomation = setupAutomationListener();

// ADD:
// Screen Time: detect when app opens while shields are active
// This handles the shield button's "openApp" action
let lastBackgroundTime = 0;
const screenTimeSub = AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'background') {
    lastBackgroundTime = Date.now();
  }
  if (state === 'active' && loadScreenTimeEnabled() && isScreenTimeAvailable()) {
    // If the app just came from background (< 2 seconds ago) and shields are
    // active, the user likely tapped the shield button. Navigate to challenge.
    const wasRecentlyBackgrounded = Date.now() - lastBackgroundTime < 2000;
    if (wasRecentlyBackgrounded && isBlocking()) {
      router.replace({
        pathname: '/challenge',
        params: { source: 'screentime' },
      });
    }
  }
});
```

Update the cleanup return:

```typescript
// REMOVE:
cleanupAutomation?.();

// REPLACE WITH:
screenTimeSub.remove();
```

Also remove the `cleanupAutomation` variable declaration.

- [ ] **Step 3: Simplify deep link handler**

Remove the grace link handling from `handleDeepLink`:

```typescript
// REMOVE the grace case entirely:
} else if (deepLink.type === 'grace') {
  consumeAutomationSource();
  const { source } = deepLink.params;
  if (isKnownApp(source)) {
    openSourceApp(source);
  } else {
    router.replace({ pathname: '/grace', params: { source } });
  }
}

// Also remove consumeAutomationSource() from the challenge case:
if (deepLink.type === 'challenge') {
  // REMOVE: consumeAutomationSource();
  router.replace({
    pathname: '/challenge',
    params: { source: deepLink.params.source },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: add Screen Time foreground redirect, remove automation listener"
```

---

### Task 9: Remove Shortcuts-based automation

**Files:**
- Remove: `modules/expo-app-intents/intent-sources/StartPracticeIntent.swift`
- Remove: `modules/expo-app-intents/intent-sources/PracticeNeededIntent.swift`
- Remove: `modules/expo-app-intents/intent-sources/AppShortcuts.swift`
- Remove: `modules/expo-app-intents/ios/ExpoAppIntentsModule.swift`
- Remove: `modules/expo-app-intents/src/index.ts`
- Remove: `plugins/withAppIntents.js`
- Remove: `src/services/automationService.ts`
- Remove: `app/grace.tsx`
- Modify: `app.json`
- Modify: `src/services/storage.ts`

- [ ] **Step 1: Delete Shortcuts module and plugin files**

```bash
rm -rf modules/expo-app-intents
rm plugins/withAppIntents.js
rm src/services/automationService.ts
rm app/grace.tsx
```

- [ ] **Step 2: Remove withAppIntents plugin from app.json**

In `app.json`, remove the plugin entry:

```json
"./plugins/withAppIntents"
```

From the `plugins` array.

- [ ] **Step 3: Remove automation storage functions from storage.ts**

Remove the entire "Automation preferences" section from `src/services/storage.ts`:

```typescript
// REMOVE the entire block (lines ~266-310):
// ---------------------------------------------------------------------------
// Automation preferences
// ---------------------------------------------------------------------------
// ... everything from AUTOMATION_CARD_THRESHOLD_KEY through isWithinAutomationGrace()
```

Also remove the import at the top of storage.ts:

```typescript
// REMOVE:
import { setGraceTimestamp } from '../../modules/expo-app-intents/src';
```

- [ ] **Step 4: Remove grace deep link type from deepLinkHandler.ts**

In `src/utils/deepLinkHandler.ts`, remove:
- The `'grace'` case from the `DeepLinkParams` union type
- The `parseGraceLink` function
- The `parsed.hostname === 'grace'` branch in `parseDeepLink`

- [ ] **Step 5: Remove the grace screen route from _layout.tsx**

In `app/_layout.tsx`, remove:

```tsx
// REMOVE:
<Stack.Screen
  name="grace"
  options={{
    presentation: 'fullScreenModal',
    headerShown: false,
    animation: 'fade',
  }}
/>
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Shortcuts-based automation in favor of Screen Time API"
```

---

### Task 10: Clean up and verify build

**Files:**
- Various — fix any remaining broken imports

- [ ] **Step 1: Search for stale references**

Search the codebase for any remaining references to removed modules:

```bash
# Check for broken imports
grep -r "expo-app-intents" --include="*.ts" --include="*.tsx" --include="*.js" src/ app/
grep -r "automationService" --include="*.ts" --include="*.tsx" src/ app/
grep -r "saveAutomationGraceStart\|loadAutomationCardThreshold\|isWithinAutomationGrace" --include="*.ts" --include="*.tsx" src/ app/
grep -r "grace\.tsx\|/grace" --include="*.ts" --include="*.tsx" app/
grep -r "withAppIntents" --include="*.js" --include="*.json" .
grep -r "ContinueButton" --include="*.ts" --include="*.tsx" app/
```

Fix any remaining references found.

- [ ] **Step 2: Check TypeScript compilation**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 3: Run existing tests**

```bash
npx jest --passWithNoTests
```

All tests should pass, including the new escalation tests.

- [ ] **Step 4: Verify Expo config**

```bash
npx expo config --type introspect --platform ios 2>&1 | head -50
```

Check that the new plugin and extension targets are recognized.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: clean up stale imports and verify build"
```

---

## Notes for the Implementor

### Shield-to-App Redirect

The plan uses `openApp` as the shield button action (the library wraps an undocumented mechanism). If this doesn't work reliably during testing, switch to `sendNotification`:

```typescript
// Alternative shield config in screenTimeService.ts configureShield():
{
  primary: {
    behavior: 'close',
    actions: [{
      type: 'sendNotification',
      payload: {
        title: 'LingoLock',
        body: 'Tap to start your vocabulary challenge',
      },
    }],
  },
}
```

Then handle the notification tap in `notificationService.ts` to navigate to `/challenge?source=screentime`.

### Testing Without Entitlement

The Family Controls entitlement works in local Xcode development builds without Apple approval. Only TestFlight/App Store distribution requires the approved entitlement. To test:

1. Run `npx expo prebuild --platform ios`
2. Open `ios/LingoLock.xcworkspace` in Xcode
3. Build and run on a physical iOS device
4. The FamilyActivityPicker and shield system will work

### Midnight Reset

Escalation counters auto-reset because `loadUnlockCount()` and `loadDueCardsCleared()` check the stored date against today's date. No explicit reset logic or background task needed.

### ContinueButton Component

After removing `ContinueButton` usage from `challenge.tsx`, check if the component file (`src/components/ContinueButton.tsx`) is still used elsewhere. If not, it can be deleted in a follow-up cleanup.

### deepLinkOpener.ts

The `src/utils/deepLinkOpener.ts` file (with `APP_SCHEMES`, `isKnownApp`, `openSourceApp`) may still be referenced by other features. Only delete it if no imports remain after cleanup.
