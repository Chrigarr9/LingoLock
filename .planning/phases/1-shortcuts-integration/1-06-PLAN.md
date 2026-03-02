---
phase: 1-shortcuts-integration
plan: 06
type: execute
wave: 3
depends_on: [1-04, 1-05]
files_modified:
  - src/components/ContinueButton.tsx
  - src/utils/deepLinkOpener.ts
  - app/challenge.tsx
autonomous: false

must_haves:
  truths:
    - "After completing challenge, user sees 'Continue to [App]' button"
    - "Button text shows source app name from deep link params"
    - "Tapping button attempts to open source app via deep link"
    - "For unlock type, user sees message to manually return to home screen"
    - "Failed deep links show error message (not silent failure)"
  artifacts:
    - path: "src/utils/deepLinkOpener.ts"
      provides: "Deep link opening with error handling"
      exports: ["openSourceApp"]
      min_lines: 60
    - path: "src/components/ContinueButton.tsx"
      provides: "Button component for returning to source"
      exports: ["ContinueButton"]
      min_lines: 40
    - path: "app/challenge.tsx"
      provides: "Continue button integration after last card"
      contains: "ContinueButton"
  key_links:
    - from: "src/components/ContinueButton.tsx"
      to: "src/utils/deepLinkOpener.ts"
      via: "Call openSourceApp on button press"
      pattern: "openSourceApp\\("
    - from: "src/utils/deepLinkOpener.ts"
      to: "Linking.canOpenURL"
      via: "React Native Linking API"
      pattern: "Linking\\.canOpenURL"
---

<objective>
Implement deep-linking back to source apps after completing vocabulary challenge.

Purpose: After learning vocabulary, users need to seamlessly return to what they were doing (opening Instagram, returning to home screen). This completes the interruption loop - challenge -> learn -> continue.

Output: Working "Continue to [App]" button that deep-links to source apps or shows home screen message.
</objective>

<execution_context>
@/home/ubuntu/.claude/get-shit-done/workflows/execute-plan.md
@/home/ubuntu/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/ubuntu/Projects/vokabeltrainer/.planning/PROJECT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/ROADMAP.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/STATE.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-CONTEXT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-RESEARCH.md
@/home/ubuntu/Projects/vokabeltrainer/app/challenge.tsx
</context>

<tasks>

<task type="auto">
  <name>Create deep link opener utility</name>
  <files>src/utils/deepLinkOpener.ts</files>
  <action>
Create utility to open external apps via deep links with comprehensive error handling.

Create file: `src/utils/deepLinkOpener.ts`

User requirements from CONTEXT.md:
- Deep-link to source app for app_open type
- Return to home screen for unlock type (iOS limitation: can't be done programmatically)
- Show error message on failure, don't fail silently
- Stay in LingoLock if deep link fails

Implementation (see RESEARCH.md Pattern 6 and Pitfall 5):
```typescript
import { Linking, Alert } from 'react-native';

/**
 * Known app URL schemes
 * Add more as needed based on user Shortcut configurations
 */
const APP_URL_SCHEMES: Record<string, string> = {
  'Instagram': 'instagram://',
  'Twitter': 'twitter://',
  'X': 'twitter://',
  'Safari': 'x-web-search://',
  'Messages': 'sms://',
  'Mail': 'message://',
  'Phone': 'tel://',
  'Maps': 'maps://',
  'Photos': 'photos-redirect://',
  'Calendar': 'calshow://',
  'Notes': 'mobilenotes://',
  'Reminders': 'x-apple-reminderkit://',
  'Settings': 'App-prefs://',
  'YouTube': 'youtube://',
  'WhatsApp': 'whatsapp://',
  'Telegram': 'telegram://',
  'Spotify': 'spotify://',
  'TikTok': 'snssdk1233://',
};

/**
 * Open source app via deep link or show appropriate message
 *
 * @param sourceName - Name of app to open (from deep link params)
 * @param type - Challenge type (unlock or app_open)
 */
export async function openSourceApp(
  sourceName: string,
  type: 'unlock' | 'app_open'
): Promise<void> {
  console.log('[DeepLink] Opening source:', { sourceName, type });

  // Handle unlock type: iOS cannot programmatically return to home screen
  if (type === 'unlock') {
    Alert.alert(
      'Challenge Complete! 🎉',
      'Swipe up or press the home button to return to your home screen.',
      [{ text: 'OK', style: 'default' }]
    );
    return;
  }

  // Handle app_open type: Try to deep link to the app
  const urlScheme = APP_URL_SCHEMES[sourceName];

  if (!urlScheme) {
    console.warn('[DeepLink] Unknown app:', sourceName);
    Alert.alert(
      'Cannot Open App',
      `URL scheme for "${sourceName}" is not configured.\n\nYou can manually open the app or close LingoLock.`,
      [{ text: 'OK' }]
    );
    return;
  }

  try {
    const canOpen = await Linking.canOpenURL(urlScheme);

    if (canOpen) {
      await Linking.openURL(urlScheme);
      console.log('[DeepLink] Successfully opened:', sourceName);
    } else {
      console.warn('[DeepLink] Cannot open URL scheme:', urlScheme);
      Alert.alert(
        'Cannot Open App',
        `"${sourceName}" might not be installed or accessible.\n\nYou can manually open the app or close LingoLock.`,
        [{ text: 'OK' }]
      );
    }
  } catch (error) {
    console.error('[DeepLink] Error opening app:', error);
    Alert.alert(
      'Error',
      `Failed to open "${sourceName}".\n\nYou can manually open the app or close LingoLock.`,
      [{ text: 'OK' }]
    );
  }
}
```

This handles all three scenarios:
1. Unlock type: Show message (iOS limitation per RESEARCH.md)
2. Known app: Deep link via URL scheme
3. Unknown app or error: Show error alert

Per RESEARCH.md Pitfall 5: iOS doesn't support programmatic exit or home screen navigation.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify utility compiles
Check: Function handles unlock type with Alert
Check: Function uses Linking.canOpenURL before Linking.openURL
Check: Function shows error alerts on failure (not silent)
Check: APP_URL_SCHEMES includes common iOS apps
  </verify>
  <done>
src/utils/deepLinkOpener.ts exists with openSourceApp function handling unlock/app_open types and error cases
  </done>
</task>

<task type="auto">
  <name>Create ContinueButton component</name>
  <files>src/components/ContinueButton.tsx</files>
  <action>
Create button component that displays source app name and handles deep linking.

Create file: `src/components/ContinueButton.tsx`

User requirement from CONTEXT.md:
- Display "Continue to [App Name]" or "Continue to Unlock"
- Button deep-links to original source

Implementation:
```typescript
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, useColorScheme } from 'react-native';
import { openSourceApp } from '../utils/deepLinkOpener';

interface ContinueButtonProps {
  sourceName: string;
  type: 'unlock' | 'app_open';
}

export function ContinueButton({ sourceName, type }: ContinueButtonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const buttonText = type === 'unlock'
    ? 'Finish Challenge'
    : `Continue to ${sourceName}`;

  const handlePress = () => {
    openSourceApp(sourceName, type);
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: isDark ? '#0a84ff' : '#007aff' }  // iOS blue
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Text style={styles.buttonText}>{buttonText}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'System',
  },
});
```

Use iOS system blue for primary action button. TouchableOpacity provides native iOS tap feedback.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify component compiles
Check: Component receives sourceName and type props
Check: Component calls openSourceApp on press
Check: Button text shows "Continue to [sourceName]" for app_open
Check: Button text shows "Finish Challenge" for unlock
Check: Button uses iOS blue color
  </verify>
  <done>
src/components/ContinueButton.tsx exists with iOS-native button that calls openSourceApp
  </done>
</task>

<task type="auto">
  <name>Integrate ContinueButton into challenge screen</name>
  <files>app/challenge.tsx</files>
  <action>
Update challenge screen to show ContinueButton after user completes all cards.

Modify `app/challenge.tsx`:

1. Import ContinueButton
2. Track whether challenge is complete (all cards answered)
3. Show ContinueButton instead of Next button on last card

```typescript
import { ContinueButton } from '../src/components/ContinueButton';

// Inside component:
const isLastCard = currentIndex === cards.length - 1;

const handleNext = () => {
  if (!isLastCard) {
    setCurrentIndex(currentIndex + 1);
    setShowAnswer(false);
    setIsCorrect(null);
  }
  // If last card, don't navigate - show ContinueButton instead
};

// In render, replace Next button logic:
{showAnswer && (
  <>
    {!isLastCard ? (
      <View style={styles.nextContainer}>
        <Button title="Next" onPress={handleNext} />
      </View>
    ) : (
      <ContinueButton
        sourceName={params.source || 'Home'}
        type={params.type || 'unlock'}
      />
    )}
  </>
)}
```

After last card is answered, ContinueButton appears. User decides when to exit LingoLock.

Per CONTEXT.md: "User controls when to exit LingoLock" - ContinueButton gives explicit control.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify screen compiles
Check: Screen imports and uses ContinueButton
Check: ContinueButton shown only on last card after answering
Check: Next button shown on non-last cards
Check: ContinueButton receives source and type from URL params
  </verify>
  <done>
app/challenge.tsx shows ContinueButton after last card is answered with correct source and type
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Deep-linking back to source apps with ContinueButton component and comprehensive error handling.
  </what-built>
  <how-to-verify>
1. Build and run development build:
   ```
   npx expo run:ios
   ```

2. Test app_open deep link (Instagram example):
   ```
   xcrun simctl openurl booted "lingolock://challenge?source=Instagram&count=2&type=app_open"
   ```

3. Complete challenge:
   - Answer first card (any answer)
   - Press "Next"
   - Answer second card
   - [ ] "Continue to Instagram" button appears (iOS blue, rounded)

4. Test button press:
   - Press "Continue to Instagram" button
   - [ ] If Instagram installed in simulator: App opens Instagram
   - [ ] If Instagram NOT installed: Alert shows "Instagram might not be installed or accessible"
   - [ ] Alert has "OK" button, stays in LingoLock (doesn't crash or hang)

5. Test unlock deep link:
   ```
   xcrun simctl openurl booted "lingolock://challenge?source=Home&count=1&type=unlock"
   ```
   - Answer card
   - [ ] "Finish Challenge" button appears
   - Press button
   - [ ] Alert shows "Challenge Complete! 🎉" with message about swiping up
   - [ ] Alert has "OK" button

6. Test unknown app:
   ```
   xcrun simctl openurl booted "lingolock://challenge?source=UnknownApp&count=1&type=app_open"
   ```
   - Answer card
   - [ ] "Continue to UnknownApp" button appears
   - Press button
   - [ ] Alert shows "URL scheme for UnknownApp is not configured"

7. Test common apps (if available in simulator):
   - Safari: Should open Safari
   - Messages: Should open Messages
   - Maps: Should open Maps

8. Check console logs:
   - Should log opening attempts with success/failure

Expected: Smooth return to source apps when possible, clear error messages when not possible, no silent failures.
  </how-to-verify>
  <resume-signal>
Type "approved" if deep linking works correctly with proper error handling, or describe issues (crashes, silent failures, wrong apps opening).
  </resume-signal>
</task>

</tasks>

<verification>
**Overall phase checks:**

1. Deep link utility: `cat src/utils/deepLinkOpener.ts` exports openSourceApp with error handling
2. Button component: `cat src/components/ContinueButton.tsx` exports ContinueButton
3. Integration: `cat app/challenge.tsx` shows ContinueButton on last card
4. TypeScript compilation: `npx tsc --noEmit` passes
5. Functional verification (human checkpoint): Deep linking, error handling, unlock vs app_open

**Human verification required** - Testing deep link opening and error scenarios.
</verification>

<success_criteria>
- openSourceApp utility handles unlock type (shows message), app_open type (deep links), and errors (shows alerts)
- APP_URL_SCHEMES includes common iOS apps (Instagram, Twitter, Safari, Messages, etc.)
- ContinueButton component displays correct text based on type
- Challenge screen shows ContinueButton after last card is answered
- Deep link failures show error messages (not silent failures)
- Unlock type shows home screen message (iOS limitation acknowledged)
- User can successfully return to known apps when installed
</success_criteria>

<output>
After completion, create `.planning/phases/1-shortcuts-integration/1-06-SUMMARY.md`
</output>
