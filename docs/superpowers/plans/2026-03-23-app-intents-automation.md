# App Intents Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the URL-copy-paste Shortcuts setup with a native iOS App Intent ("Start Practice in LingoLock") that has a searchable app picker parameter, and simplify the challenge screen to always run in continuous mode with an inline "Continue to [App]" button that appears after N correct answers.

**Architecture:** A native Expo module registers an `AppIntent` with a `SourceApp` enum parameter. When triggered, the intent writes the source app name to App Group UserDefaults and opens LingoLock (`openAppWhenRun = true`). The RN app consumes this value on foreground via a bridge function. The challenge screen always runs in continuous mode; when a source app is detected, a "Continue to [App]" button appears inline after the user achieves the configurable correct-answer threshold. All unlock-trigger code is removed.

**Tech Stack:** Expo SDK 55, React Native, Swift (App Intents framework iOS 16+), expo-modules-core, MMKV storage, expo-linking

---

## File Map

### Modified Files
| File | Responsibility |
|------|---------------|
| `src/types/vocabulary.ts` | Remove `'unlock'` from ChallengeParams.type, make count/type optional |
| `src/services/storage.ts` | Add `automationCardThreshold` load/save (default 3) |
| `src/utils/deepLinkHandler.ts` | Simplify challenge link parsing — source-only, no count/type required |
| `src/utils/deepLinkOpener.ts` | Expand APP_SCHEMES with more social apps, export for reuse |
| `src/components/ContinueButton.tsx` | Simplify: remove unlock logic, restyle for inline use |
| `app/challenge.tsx` | Remove fixed mode, always continuous, inline continue button after threshold |
| `app/settings.tsx` | Add "Automation" section with card threshold stepper |
| `app/tutorial.tsx` | Rewrite: remove unlock section, update to App Intent instructions |
| `app/_layout.tsx` | Add AppState listener to consume pending automation source |
| `app.json` | Deduplicate LSApplicationQueriesSchemes and App Group entries |

### New Files
| File | Responsibility |
|------|---------------|
| `modules/expo-app-intents/expo-module.config.json` | Expo module config |
| `modules/expo-app-intents/ios/ExpoAppIntentsModule.swift` | RN bridge: `consumeAutomationSource()` |
| `modules/expo-app-intents/ios/StartPracticeIntent.swift` | App Intent definition + SourceApp enum |
| `modules/expo-app-intents/ios/AppShortcuts.swift` | AppShortcutsProvider for auto-registration |
| `modules/expo-app-intents/src/index.ts` | TypeScript API: `consumeAutomationSource()` |
| `modules/expo-app-intents/src/ExpoAppIntents.types.ts` | TypeScript types |
| `src/services/automationService.ts` | Consume + clear automation source on foreground |

### Deleted (or emptied of unlock-specific code)
- `UNLOCK_URL` constant in tutorial.tsx
- `'unlock'` case handling in ContinueButton, deepLinkHandler, challenge.tsx
- `mode: 'fixed'` code paths in challenge.tsx
- `recordAbort` calls (no more forced sessions to abort)

---

## Task 1: Types, Storage, Deep Links, and app.json Cleanup

> **Note:** Types, deep link handler, and layout are updated together in one task to avoid intermediate compile errors.

**Files:**
- Modify: `src/types/vocabulary.ts:8-20`
- Modify: `src/services/storage.ts` (add after notification preferences)
- Modify: `src/utils/deepLinkHandler.ts:56-94`
- Modify: `app/_layout.tsx:154-162`
- Modify: `app.json:23-73`

- [ ] **Step 1: Update ChallengeParams type**

In `src/types/vocabulary.ts`, simplify ChallengeParams:

```typescript
export interface ChallengeParams {
  /** Source app or label (e.g. "Instagram", "Practice", "Notification") */
  source: string;

  /** Number of vocabulary cards (legacy deep links — ignored, threshold from settings) */
  count?: number;

  /** Challenge trigger type (legacy — kept for backward compat, defaults to 'app_open') */
  type?: 'app_open';
}
```

Remove the `'unlock'` union member entirely.

- [ ] **Step 2: Simplify parseChallengeLink (same commit)**

In `src/utils/deepLinkHandler.ts`, replace `parseChallengeLink` to only require `source`. Make `count` and `type` optional:

```typescript
function parseChallengeLink(parsed: ReturnType<typeof Linking.parse>): DeepLinkParams | null {
  try {
    const rawSource = parsed.queryParams?.source as string;
    const source = rawSource ? rawSource.slice(0, 64).replace(/[^\x20-\x7E]/g, '') : rawSource;

    if (!source) {
      console.warn('[DeepLink] Missing required source parameter');
      return null;
    }

    // Count and type are optional (legacy compat)
    const countStr = parsed.queryParams?.count as string;
    const count = countStr ? parseInt(countStr, 10) : undefined;

    return {
      type: 'challenge',
      params: {
        source,
        count: count && !isNaN(count) ? count : undefined,
        type: 'app_open',
      }
    };
  } catch (error) {
    console.error('[DeepLink] Failed to parse challenge link:', error);
    return null;
  }
}
```

- [ ] **Step 3: Update _layout.tsx deep link handler (same commit)**

In `app/_layout.tsx`, update the challenge deep link case to not reference `count` or `type`:

```typescript
if (deepLink.type === 'challenge') {
  router.push({
    pathname: '/challenge',
    params: {
      source: deepLink.params.source,
    },
  });
}
```

- [ ] **Step 4: Add automation threshold to storage**

In `src/services/storage.ts`, add after the notification preferences section:

```typescript
// ---------------------------------------------------------------------------
// Automation preferences
// ---------------------------------------------------------------------------

const AUTOMATION_CARD_THRESHOLD_KEY = 'automation_card_threshold';

/**
 * Load the number of correct cards required before the "Continue to [App]"
 * button appears during automation-triggered sessions.
 * Returns 3 if never set.
 */
export function loadAutomationCardThreshold(): number {
  return statsStorage.getNumber(AUTOMATION_CARD_THRESHOLD_KEY) ?? 3;
}

/**
 * Persist the automation card threshold.
 * Clamped to [1, 10].
 */
export function saveAutomationCardThreshold(n: number): void {
  statsStorage.set(AUTOMATION_CARD_THRESHOLD_KEY, Math.max(1, Math.min(10, n)));
}
```

- [ ] **Step 5: Deduplicate app.json**

In `app.json`, the `LSApplicationQueriesSchemes` array has every entry duplicated. Remove duplicates. Also remove the duplicate in `com.apple.security.application-groups`. Also remove the duplicate `"fetch"` in UIBackgroundModes.

The cleaned arrays should each contain unique entries only.

- [ ] **Step 6: Commit**

```bash
git add src/types/vocabulary.ts src/utils/deepLinkHandler.ts app/_layout.tsx src/services/storage.ts app.json
git commit -m "refactor: remove unlock type, simplify deep links, add automation threshold storage"
```

---

## Task 2: Expand APP_SCHEMES and Simplify ContinueButton

**Files:**
- Modify: `src/utils/deepLinkOpener.ts:12-39`
- Modify: `src/components/ContinueButton.tsx`

- [ ] **Step 1: Expand APP_SCHEMES with more social apps**

Replace the `APP_SCHEMES` dictionary in `deepLinkOpener.ts` with an expanded list. Add a helper `isKnownApp()`:

```typescript
const APP_SCHEMES: Record<string, string> = {
  // Social
  'Instagram': 'instagram://',
  'TikTok': 'tiktok://',
  'Facebook': 'fb://',
  'Twitter': 'twitter://',
  'X': 'twitter://',
  'Snapchat': 'snapchat://',
  'Threads': 'barcelona://',
  'BeReal': 'bereal://',
  'Pinterest': 'pinterest://',
  'Reddit': 'reddit://',
  'LinkedIn': 'linkedin://',
  'Tumblr': 'tumblr://',
  // Messaging
  'WhatsApp': 'whatsapp://',
  'Telegram': 'telegram://',
  'Discord': 'discord://',
  'Signal': 'sgnl://',
  'Messenger': 'fb-messenger://',
  // Video & Streaming
  'YouTube': 'youtube://',
  'Netflix': 'netflix://',
  'Twitch': 'twitch://',
  'Disney+': 'disneyplus://',
  'Prime Video': 'aiv://',
  // Music
  'Spotify': 'spotify://',
  'Apple Music': 'music://',
  'SoundCloud': 'soundcloud://',
  // Browsers & Utilities
  'Chrome': 'googlechrome://',
  'Safari': 'x-safari-https://',
  'Gmail': 'googlegmail://',
  'Maps': 'maps://',
  'Photos': 'photos-redirect://',
  'Messages': 'sms://',
  'Mail': 'message://',
  'Notes': 'mobilenotes://',
  'Calendar': 'calshow://',
  'Reminders': 'x-apple-reminder://',
  'Settings': 'app-settings://',
  // Gaming
  'Roblox': 'robloxmobile://',
  'Clash Royale': 'clashroyale://',
};

/**
 * Check if a source name corresponds to a known external app.
 * Used to determine if the "Continue to [App]" button should appear.
 */
export function isKnownApp(name: string): boolean {
  return name in APP_SCHEMES;
}
```

- [ ] **Step 2: Simplify ContinueButton**

Rewrite `src/components/ContinueButton.tsx` — remove unlock logic, remove Alert for unknown apps (just don't render the button), make it a Pressable styled for inline use on the challenge screen:

```tsx
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useAppTheme } from '../theme';
import { openSourceApp } from '../utils/deepLinkOpener';

interface ContinueButtonProps {
  sourceApp: string;
}

export function ContinueButton({ sourceApp }: ContinueButtonProps) {
  const theme = useAppTheme();
  const [isOpening, setIsOpening] = useState(false);

  const handlePress = async () => {
    setIsOpening(true);
    await openSourceApp(sourceApp);
    setIsOpening(false);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isOpening}
      style={[styles.button, { backgroundColor: theme.colors.surfaceVariant }]}
      accessibilityLabel={`Continue to ${sourceApp}`}
      accessibilityRole="button"
    >
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>
        {isOpening ? 'Opening...' : `Continue to ${sourceApp}`}
      </Text>
      <Icon source="arrow-right" size={18} color={theme.colors.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 20,
    alignSelf: 'stretch',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
```

- [ ] **Step 3: Update app.json LSApplicationQueriesSchemes**

Replace the `LSApplicationQueriesSchemes` array in `app.json` with the complete deduplicated list — every URL scheme from `APP_SCHEMES` must appear (without the `://` suffix). The complete list:

```json
"LSApplicationQueriesSchemes": [
  "instagram", "tiktok", "fb", "twitter", "snapchat", "barcelona",
  "bereal", "pinterest", "reddit", "linkedin", "tumblr",
  "whatsapp", "telegram", "discord", "sgnl", "fb-messenger",
  "youtube", "netflix", "twitch", "disneyplus", "aiv",
  "spotify", "music", "soundcloud",
  "googlechrome", "x-safari-https", "googlegmail", "maps",
  "photos-redirect", "sms", "message", "mobilenotes", "calshow",
  "x-apple-reminder", "app-settings", "robloxmobile", "clashroyale"
]
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/deepLinkOpener.ts src/components/ContinueButton.tsx app.json
git commit -m "feat: expand app list, simplify ContinueButton for inline use"
```

---

## Task 3: Challenge Screen — Continuous Mode with Inline Button

This is the largest task. The challenge screen becomes continuous-only. When the source is a known app, the "Continue to [App]" button appears after the user gets N correct answers (threshold from settings). The button stays visible for the rest of the session.

**Files:**
- Modify: `app/challenge.tsx`

- [ ] **Step 1: Remove fixed mode and unlock imports**

Remove these from challenge.tsx:
- Remove `recordAbort` import from `statsService`
- Remove `mode` param parsing and the `mode === 'fixed'` conditional
- Remove the `ContinueButton` import from `../src/components/ContinueButton` (we'll re-add it differently)
- Remove `handleClose` abort logic for fixed sessions

- [ ] **Step 2: Add automation state and imports**

At the top of the component, add:

```tsx
import { ContinueButton } from '../src/components/ContinueButton';
import { isKnownApp } from '../src/utils/deepLinkOpener';
import { loadAutomationCardThreshold } from '../src/services/storage';
```

Add state for automation:

```tsx
// Automation: show "Continue to [App]" button after threshold correct answers
const isAutomation = isKnownApp(params.source ?? '');
const automationThreshold = isAutomation ? loadAutomationCardThreshold() : 0;
const showContinueButton = isAutomation && correctCount >= automationThreshold;
```

Note: `isAutomation` and `automationThreshold` are derived from params (constant for the session), not state. `showContinueButton` is derived from `correctCount` (state) and the threshold.

- [ ] **Step 3: Simplify session initialization**

In the `useEffect` that initializes the session, always use continuous mode:

```tsx
useEffect(() => {
  const session = buildSession(chapters, loadNewWordsPerDay(), params.source);
  // ... rest stays the same but remove the mode === 'continuous' conditional
}, []);
```

- [ ] **Step 4: Render inline ContinueButton**

In the render section, add the ContinueButton between the card area and the Next button. It should appear after the answer is shown AND after threshold is met, OR before the answer when the threshold was already met on a previous card:

```tsx
{/* Continue to [App] — appears after automation threshold met */}
{showContinueButton && !isComplete && (
  <ContinueButton sourceApp={params.source!} />
)}
```

Place this right after the `mcArea`/`textArea`/`selfRated` blocks and before (or alongside) the Next button.

- [ ] **Step 5: Simplify completion screen**

On the completion screen, remove the `mode === 'fixed'` ContinueButton conditional. The completion screen now only shows:
- Accuracy stats
- "Learn more new words" button (if `hasMoreCards`)
- "Done" button (always — no more forced sessions)
- If `isAutomation`, also show `ContinueButton` on the completion screen

Remove the `ContinueButton` import that was used in the old completion area (the one from `../src/components/ContinueButton` with the old props). The new ContinueButton takes only `sourceApp`.

- [ ] **Step 6: Clean up handleClose**

Simplify `handleClose` — no more abort tracking:

```tsx
const handleClose = () => {
  if (advanceTimer.current) clearTimeout(advanceTimer.current);
  if (!isComplete && answeredNewCardIds.current.size > 0) {
    recordNewWordsIntroduced(answeredNewCardIds.current.size);
  }
  router.back();
};
```

- [ ] **Step 7: Commit**

```bash
git add app/challenge.tsx
git commit -m "feat: challenge screen continuous-only with inline Continue button"
```

---

## Task 4: Settings — Automation Card Threshold

**Files:**
- Modify: `app/settings.tsx`

- [ ] **Step 1: Add automation threshold imports and state**

Add imports:

```tsx
import {
  // ... existing imports ...
  loadAutomationCardThreshold,
  saveAutomationCardThreshold,
} from '../src/services/storage';
```

Add state:

```tsx
const [automationThreshold, setAutomationThreshold] = useState(() => loadAutomationCardThreshold());
```

Add handlers:

```tsx
function handleThresholdDecrement() {
  const next = Math.max(1, automationThreshold - 1);
  setAutomationThreshold(next);
  saveAutomationCardThreshold(next);
}

function handleThresholdIncrement() {
  const next = Math.min(10, automationThreshold + 1);
  setAutomationThreshold(next);
  saveAutomationCardThreshold(next);
}
```

- [ ] **Step 2: Add Automation section to settings UI**

Add a new card section after the Learning section and before Notifications:

```tsx
{/* ── Automation Settings (native only) ── */}
{Platform.OS !== 'web' && (
  <View style={[styles.card, glassStyle]}>
    <Text
      variant="titleSmall"
      style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
    >
      App Automation
    </Text>

    <View style={styles.settingRow}>
      <View style={styles.settingLabelGroup}>
        <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
          Cards Before App
        </Text>
        <Text
          variant="bodySmall"
          style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          Correct answers needed before you can continue to the app
        </Text>
      </View>
      <View style={styles.stepper}>
        <IconButton
          icon="minus"
          size={20}
          iconColor={theme.custom.brandBlue}
          onPress={handleThresholdDecrement}
          disabled={automationThreshold <= 1}
          style={styles.stepperButton}
        />
        <Text
          variant="titleMedium"
          style={[styles.stepperValue, { color: theme.colors.onSurface }]}
        >
          {automationThreshold}
        </Text>
        <IconButton
          icon="plus"
          size={20}
          iconColor={theme.custom.brandBlue}
          onPress={handleThresholdIncrement}
          disabled={automationThreshold >= 10}
          style={styles.stepperButton}
        />
      </View>
    </View>
  </View>
)}
```

- [ ] **Step 3: Commit**

```bash
git add app/settings.tsx
git commit -m "feat: add automation card threshold setting"
```

---

## Task 5: Tutorial Rewrite

**Files:**
- Modify: `app/tutorial.tsx`

- [ ] **Step 1: Remove unlock section and URL constants**

Remove `UNLOCK_URL` constant. Remove `APP_OPEN_URL` constant. Remove the `CopyableUrl` component and `copyToClipboard` helper (no longer needed). Remove `expo-clipboard` lazy import.

- [ ] **Step 2: Rewrite tutorial content**

Replace the tutorial content with new steps for App Intent setup. The tutorial should guide users through:

1. **Open the Shortcuts app** — same as before, with existing screenshot
2. **Go to Automation** — tap Automation tab, tap + — same as before
3. **Choose "App" trigger** — Select the app you want to practice before (e.g., Instagram). Choose "Is Opened". Set "Run Immediately"
4. **Add LingoLock action** — Tap "New Blank Automation", tap "Add Action", search for "LingoLock"
5. **Select "Start Practice"** — Tap "Start Practice in LingoLock". In the action, tap "App" and select the same app (e.g., Instagram)
6. **Done!** — Tap Done. Now every time you open that app, LingoLock will show vocabulary cards first

Update the subtitle text:

```
LingoLock uses iOS Shortcuts to show vocabulary cards before you open your favorite apps. Set up an automation once, and it works automatically.
```

Remove the second section ("2. App-Open Automation (Optional)") — there's only one flow now.

Note: keep the existing tutorial screenshot assets for steps 1-2. Steps 3-6 will need new screenshots eventually but text-only is fine for now (remove the `image` props for steps that no longer match).

- [ ] **Step 3: Commit**

```bash
git add app/tutorial.tsx
git commit -m "refactor: rewrite tutorial for App Intent automation setup"
```

---

## Task 6: Native Expo Module — App Intent

This task creates the native iOS module that registers the "Start Practice in LingoLock" App Intent with a searchable app picker parameter.

**Files:**
- Create: `modules/expo-app-intents/expo-module.config.json`
- Create: `modules/expo-app-intents/ios/ExpoAppIntentsModule.swift`
- Create: `modules/expo-app-intents/ios/StartPracticeIntent.swift`
- Create: `modules/expo-app-intents/ios/AppShortcuts.swift`
- Create: `modules/expo-app-intents/src/index.ts`
- Create: `modules/expo-app-intents/src/ExpoAppIntents.types.ts`

- [ ] **Step 1: Create module config**

Create `modules/expo-app-intents/expo-module.config.json`:

```json
{
  "platforms": ["ios"],
  "ios": {
    "modules": ["ExpoAppIntentsModule"]
  }
}
```

- [ ] **Step 2: Create the SourceApp enum and StartPracticeIntent**

Create `modules/expo-app-intents/ios/StartPracticeIntent.swift`:

```swift
import AppIntents
import Foundation

/// Apps available for the "Start Practice" automation.
/// The user picks one when setting up the Shortcuts automation.
/// This list MUST match APP_SCHEMES in src/utils/deepLinkOpener.ts.
@available(iOS 16.0, *)
enum SourceApp: String, AppEnum {
    // Social
    case instagram = "Instagram"
    case tiktok = "TikTok"
    case facebook = "Facebook"
    case twitter = "Twitter"
    case x = "X"
    case snapchat = "Snapchat"
    case threads = "Threads"
    case bereal = "BeReal"
    case pinterest = "Pinterest"
    case reddit = "Reddit"
    case linkedin = "LinkedIn"
    case tumblr = "Tumblr"
    // Messaging
    case whatsapp = "WhatsApp"
    case telegram = "Telegram"
    case discord = "Discord"
    case signal = "Signal"
    case messenger = "Messenger"
    // Video & Streaming
    case youtube = "YouTube"
    case netflix = "Netflix"
    case twitch = "Twitch"
    case disneyPlus = "Disney+"
    case primeVideo = "Prime Video"
    // Music
    case spotify = "Spotify"
    case appleMusic = "Apple Music"
    case soundcloud = "SoundCloud"
    // Browsers & Utilities
    case chrome = "Chrome"
    case safari = "Safari"
    case gmail = "Gmail"
    case maps = "Maps"
    case photos = "Photos"
    case messages = "Messages"
    case mail = "Mail"
    case notes = "Notes"
    case calendar = "Calendar"
    case reminders = "Reminders"
    case settings = "Settings"
    // Gaming
    case roblox = "Roblox"
    case clashRoyale = "Clash Royale"

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "App"

    static var caseDisplayRepresentations: [SourceApp: DisplayRepresentation] {
        [
            .instagram: "Instagram",
            .tiktok: "TikTok",
            .facebook: "Facebook",
            .twitter: "Twitter",
            .x: "X",
            .snapchat: "Snapchat",
            .threads: "Threads",
            .bereal: "BeReal",
            .pinterest: "Pinterest",
            .reddit: "Reddit",
            .linkedin: "LinkedIn",
            .tumblr: "Tumblr",
            .whatsapp: "WhatsApp",
            .telegram: "Telegram",
            .discord: "Discord",
            .signal: "Signal",
            .messenger: "Messenger",
            .youtube: "YouTube",
            .netflix: "Netflix",
            .twitch: "Twitch",
            .disneyPlus: "Disney+",
            .primeVideo: "Prime Video",
            .spotify: "Spotify",
            .appleMusic: "Apple Music",
            .soundcloud: "SoundCloud",
            .chrome: "Chrome",
            .safari: "Safari",
            .gmail: "Gmail",
            .maps: "Maps",
            .photos: "Photos",
            .messages: "Messages",
            .mail: "Mail",
            .notes: "Notes",
            .calendar: "Calendar",
            .reminders: "Reminders",
            .settings: "Settings",
            .roblox: "Roblox",
            .clashRoyale: "Clash Royale",
        ]
    }
}

/// App Intent: "Start Practice in LingoLock"
/// Triggered by Shortcuts automations. Writes the source app name to
/// App Group UserDefaults so the RN app can read it on foreground.
@available(iOS 16.0, *)
struct StartPracticeIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Practice"
    static var description = IntentDescription("Practice vocabulary before using an app")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "App")
    var sourceApp: SourceApp

    func perform() async throws -> some IntentResult {
        let defaults = UserDefaults(suiteName: "group.com.lingolock.app")
        defaults?.set(sourceApp.rawValue, forKey: "automationSource")
        return .result()
    }
}
```

- [ ] **Step 3: Create AppShortcutsProvider**

Create `modules/expo-app-intents/ios/AppShortcuts.swift`:

```swift
import AppIntents

/// Auto-registers the "Start Practice" shortcut in the Shortcuts app.
/// Users see it when searching for "LingoLock" in the action picker.
@available(iOS 16.4, *)
struct LingoLockShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        [
            AppShortcut(
                intent: StartPracticeIntent(),
                phrases: [
                    "Start practice in \(.applicationName)",
                    "Practice vocabulary with \(.applicationName)",
                ],
                shortTitle: "Start Practice",
                systemImageName: "book.fill"
            )
        ]
    }
}
```

- [ ] **Step 4: Create the Expo bridge module**

Create `modules/expo-app-intents/ios/ExpoAppIntentsModule.swift`:

```swift
import ExpoModulesCore

public class ExpoAppIntentsModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ExpoAppIntents")

        /// Read and clear the pending automation source app name.
        /// Returns the app name string (e.g. "Instagram") or nil if no
        /// automation is pending.
        Function("consumeAutomationSource") { () -> String? in
            let defaults = UserDefaults(suiteName: "group.com.lingolock.app")
            guard let source = defaults?.string(forKey: "automationSource") else {
                return nil
            }
            defaults?.removeObject(forKey: "automationSource")
            return source
        }
    }
}
```

- [ ] **Step 5: Create TypeScript API**

Create `modules/expo-app-intents/src/ExpoAppIntents.types.ts`:

```typescript
// No complex types needed — the API is a single string-returning function.
```

Create `modules/expo-app-intents/src/index.ts`:

```typescript
import { requireNativeModule, Platform } from 'expo-modules-core';

const ExpoAppIntents = Platform.OS === 'ios'
  ? requireNativeModule('ExpoAppIntents')
  : null;

/**
 * Read and clear the pending automation source app name.
 * Returns the app name (e.g. "Instagram") if an App Intent automation
 * just triggered, or null if no automation is pending.
 *
 * Call this on app foreground — the value is consumed (cleared) on read.
 * Returns null on non-iOS platforms.
 */
export function consumeAutomationSource(): string | null {
  if (!ExpoAppIntents) return null;
  return ExpoAppIntents.consumeAutomationSource() ?? null;
}
```

- [ ] **Step 6: Commit**

```bash
git add modules/expo-app-intents/
git commit -m "feat: native Expo module — App Intent with source app picker"
```

---

## Task 7: App Startup — Consume Automation Source

**Files:**
- Create: `src/services/automationService.ts`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Create automationService**

Create `src/services/automationService.ts`:

```typescript
import { Platform, AppState, AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { consumeAutomationSource } from '../../modules/expo-app-intents/src';

/**
 * Check for a pending App Intent automation on foreground.
 * If found, navigate to the challenge screen with the source app.
 */
export function checkPendingAutomation(): void {
  if (Platform.OS !== 'ios') return;

  const source = consumeAutomationSource();
  if (!source) return;

  console.log('[Automation] Detected pending automation for:', source);
  try {
    router.push({
      pathname: '/challenge',
      params: { source },
    });
  } catch (err) {
    console.error('[Automation] Failed to navigate:', err);
  }
}

/**
 * Register AppState listener that checks for pending automations
 * when the app comes to the foreground.
 *
 * @returns Cleanup function to remove the listener
 */
export function setupAutomationListener(): () => void {
  if (Platform.OS !== 'ios') return () => {};

  // Check immediately on setup (cold start from intent)
  // Use a short delay to ensure navigation is ready
  const timeout = setTimeout(() => checkPendingAutomation(), 300);

  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      checkPendingAutomation();
    }
  });

  return () => {
    clearTimeout(timeout);
    subscription.remove();
  };
}
```

- [ ] **Step 2: Wire into _layout.tsx**

In `app/_layout.tsx`, import and call the automation setup in the existing `useEffect`:

```typescript
import { setupAutomationListener } from '../src/services/automationService';
```

Inside the `useEffect` that sets up notifications and widgets, add:

```typescript
// Native: Setup automation listener for App Intent triggers
let cleanupAutomation: (() => void) | undefined;
if (Platform.OS !== 'web') {
  // ... existing notification/widget setup ...
  cleanupAutomation = setupAutomationListener();
}

return () => {
  cleanupNotifications?.();
  cleanupWidgetListener?.();
  cleanupAutomation?.();
};
```

- [ ] **Step 3: Commit**

```bash
git add src/services/automationService.ts app/_layout.tsx
git commit -m "feat: consume App Intent automation source on foreground"
```

---

## Task 8: Dead Code Cleanup

Remove all code that became unused after the unlock trigger and fixed-mode removal.

**Files:**
- Modify: `src/services/statsService.ts`
- Modify: `src/types/vocabulary.ts` (PersistedStats type)
- Modify: `package.json` (remove expo-clipboard)

- [ ] **Step 1: Remove abort tracking from statsService**

In `src/services/statsService.ts`, remove the `recordAbort` function entirely. It tracked forced-session aborts which no longer exist.

- [ ] **Step 2: Remove abort fields from PersistedStats**

In `src/types/vocabulary.ts`, remove `abortsToday`, `lastAbortDate`, and `totalAborts` from the `PersistedStats` interface. Also remove them from `DEFAULT_STATS` in `src/services/storage.ts`.

- [ ] **Step 3: Remove expo-clipboard dependency**

```bash
npm uninstall expo-clipboard
```

It was only used by the `CopyableUrl` component in tutorial.tsx, which was removed in Task 5.

- [ ] **Step 4: Verify no remaining references to removed code**

Search for leftover references:

```bash
npx tsc --noEmit
```

Fix any compile errors from removed types/functions.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore: remove dead abort tracking, expo-clipboard dependency"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `npx expo start` — app compiles without errors
- [ ] Home screen → Start Practice → continuous mode works normally (no inline button)
- [ ] Deep link `lingolock://challenge?source=Instagram` → challenge starts, inline button appears after N correct
- [ ] Settings → Automation → threshold stepper works (1-10)
- [ ] Tutorial shows updated instructions (no unlock, no URL copy)
- [ ] `npx expo prebuild --platform ios` — native module compiles
- [ ] In Xcode, verify the App Intent appears in the scheme's "App Intents" section
- [ ] On device: Shortcuts app → search "LingoLock" → "Start Practice" action visible
- [ ] On device: Create automation "When I open Instagram" → "Start Practice in LingoLock" → select Instagram → works end-to-end
