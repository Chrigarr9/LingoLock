# Phase 1: Shortcuts Integration & Basic UI - Research

**Researched:** 2026-03-02
**Domain:** Expo React Native, iOS Shortcuts automation, Deep linking
**Confidence:** HIGH

## Summary

This phase requires building a React Native app with Expo that integrates with iOS Shortcuts automation for device unlock and app-open triggers. The standard approach uses Expo SDK 55+ with custom URL schemes for deep linking, though custom schemes have significant limitations (only work when app is installed, no App Store fallback). Key technical challenges include: (1) custom URL schemes don't work in Expo Go, requiring development builds, (2) iOS Shortcuts automation has reliability issues when device is locked, and (3) returning to home screen programmatically isn't directly supported on iOS.

The research shows Expo provides robust deep linking APIs via the Linking module, fuzzy string matching is best handled by Fuse.js (lightweight, widely used), and iOS-native UI is achieved through React Native's built-in components with platform-specific styling. Development builds are mandatory for testing custom URL schemes - Expo Go cannot handle them.

**Primary recommendation:** Use Expo SDK 55 with development builds (not Expo Go), implement custom URL scheme via app.json, parse URL parameters with Linking API, use Fuse.js for fuzzy answer matching, and leverage native TextInput with iOS-specific props for authentic feel.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**1. Vocabulary Challenge Screen Design**
- Card-based presentation (not full-bleed)
- iOS-native aesthetic (latest iOS design language)
- Minimalist & modern (clean, uncluttered)
- Should feel like a native iOS component
- Essentials only - No extra context on screen
- No streak counters, progress bars, or daily goals during challenge
- Focus exclusively on the vocabulary question/answer
- Vocabulary/question is the hero - Largest element, centered
- Minimal chrome (no unnecessary headers, icons, or branding during challenge)
- Neutral, professional, modern design feel
- Not playful, not energetic - calm and efficient
- Follows iOS design conventions (SF Pro font, system colors, etc.)

**2. Answer Input & Feedback**
- iOS native TextField (UITextField equivalent in React Native)
- Standard system appearance (follows light/dark mode automatically)
- Keyboard type: Default, but consider language-specific later
- Both submission methods work: Return key on keyboard submits answer, Explicit "Check Answer" button also submits
- Card visualization approach - Answer appears on the card itself after submission
- No separate overlay or modal
- Clean transition between question → answer state
- Fuzzy matching enabled: Ignore case, Ignore apostrophes (' vs '), Ignore diacritics/accents (e = é = è = ẽ), Trim whitespace
- Show correct answer immediately after wrong answer
- No retry attempts (see answer, move to next card)

**3. Tutorial/Onboarding Experience**
- Tutorial Format (Priority Order): 1) Preferred: Deep link or iCloud Shortcut share link (tap button → auto-configure Shortcuts automation), 2) Fallback: Step-by-step screenshots
- Tutorial Placement (All Three): First launch (appears in onboarding flow), Skippable (user can dismiss), Always accessible (available in Settings anytime)
- Tutorial Scope: Both automations in one tutorial (Device Unlock + App-Open automation setup), Combined flow, not separate tutorials

**4. Deep-Linking Flow & Navigation**
- Post-Challenge Behavior: After user answers correctly and sees answer, show next vocabulary card, display button "Continue to [Instagram]" or "Continue to Unlock", button deep-links to original source (app or home screen), user controls when to exit LingoLock
- Emergency Escape: Space bar pressed 3 times = skip all remaining vocabs and deep-link immediately
- Unlock vs App-Open (Consistent): Always deep-link to source (Device Unlock → return to home screen, App-Open → deep-link to that app), Same flow for both triggers
- Deep-Link Failure Handling: Stay in LingoLock (don't silently fail), Show error message "Can't open [App Name]", User can manually close app or try again

**5. Implementation Notes**
- Placeholder Data (Phase 1): Use hardcoded example vocabulary cards, Simple JSON structure or inline array, Real Anki import comes in Phase 3
- URL Scheme Parameters: `lingolock://challenge?source={app_name}&count={number}&type={unlock|app_open}`, Parse source to show in "Continue to [Source]" button, Parse type to determine deep-link destination
- iOS Native Look: Use iOS system components wherever possible, Follow iOS Human Interface Guidelines, Test in both light and dark mode

### Deferred Ideas (OUT OF SCOPE)
- Multiple input modes (Multiple Choice, Yes/No) → Phase 2
- Progress tracking UI (Streak, success rate) → Phase 2
- Real Anki deck import → Phase 3
- Spaced repetition scheduling → Phase 2
- Per-app customization (number of cards) → Phase 5
</user_constraints>

---

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Expo SDK | 55.x | React Native framework with managed workflow | Industry standard for rapid React Native development, handles native config, includes development builds |
| React Native | 0.83 | Cross-platform mobile framework | Bundled with Expo SDK 55, New Architecture enabled by default |
| expo-linking | Latest (in SDK 55) | Deep linking and URL scheme handling | Official Expo module, provides `Linking` API for URL parsing and event handling |
| React | 19.2 | UI library | Bundled with Expo SDK 55 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fuse.js | 7.x | Fuzzy string matching | For answer validation with fuzzy matching (ignore case, diacritics, etc.) - lightweight, zero dependencies |
| @expo/vector-icons | Latest (bundled) | iOS SF Symbols and system icons | For minimal UI icons matching iOS native feel |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fuse.js | String.normalize() + custom logic | Built-in JS method is faster but requires manual implementation of fuzzy rules; Fuse.js provides battle-tested configuration |
| Fuse.js | @nozbe/microfuzz | Microfuzz is smaller but less configurable; Fuse.js has better docs and more options for threshold tuning |
| Expo SDK | React Native CLI | CLI gives more control but requires manual native config; Expo provides managed workflow ideal for this use case |

**Installation:**
```bash
# Initialize Expo project
npx create-expo-app LingoLock

# Install fuzzy matching
npm install fuse.js

# Development build (required for custom URL schemes)
npx expo install expo-dev-client
```

---

## Architecture Patterns

### Recommended Project Structure
```
LingoLock/
├── app.json                 # Expo config (custom URL scheme here)
├── App.tsx                  # Root component, deep link listener
├── src/
│   ├── screens/
│   │   ├── ChallengeScreen.tsx      # Main vocabulary challenge UI
│   │   ├── TutorialScreen.tsx       # Shortcuts setup tutorial
│   │   └── OnboardingScreen.tsx     # First launch onboarding
│   ├── components/
│   │   ├── VocabularyCard.tsx       # Card component
│   │   ├── AnswerInput.tsx          # TextInput with submit logic
│   │   └── ContinueButton.tsx       # "Continue to [App]" button
│   ├── utils/
│   │   ├── answerValidation.ts      # Fuzzy matching logic with Fuse.js
│   │   ├── deepLinkHandler.ts       # Parse URL params, handle navigation
│   │   └── vocabularyData.ts        # Hardcoded placeholder cards
│   └── hooks/
│       └── useDeepLink.ts           # Custom hook for deep link events
└── ios/                     # Generated after first build (don't edit directly)
```

### Pattern 1: Custom URL Scheme Configuration
**What:** Configure custom URL scheme in app.json to enable `lingolock://` deep links
**When to use:** Required for iOS Shortcuts to trigger app
**Example:**
```json
// app.json
{
  "expo": {
    "name": "LingoLock",
    "slug": "lingolock",
    "scheme": "lingolock",
    "ios": {
      "bundleIdentifier": "com.yourname.lingolock",
      "supportsTablet": false
    }
  }
}
```
**Source:** [Expo Linking Documentation](https://docs.expo.dev/linking/into-your-app/)

### Pattern 2: Deep Link Event Listener Setup
**What:** Listen for incoming deep links in App.tsx using Linking API
**When to use:** App root component lifecycle (useEffect)
**Example:**
```typescript
// Source: Expo Linking API docs
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    // Handle initial URL (app opened from deep link)
    const handleInitialURL = async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        handleDeepLink(url);
      }
    };

    // Handle subsequent URLs (app already running)
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    handleInitialURL();

    return () => subscription.remove();
  }, []);

  const handleDeepLink = (url: string) => {
    const { hostname, path, queryParams } = Linking.parse(url);
    // Example: lingolock://challenge?source=Instagram&count=3&type=app_open
    // queryParams = { source: 'Instagram', count: '3', type: 'app_open' }
  };
}
```
**Source:** [Expo Linking API](https://docs.expo.dev/versions/latest/sdk/linking/)

### Pattern 3: URL Parameter Parsing
**What:** Extract query parameters from deep link URLs
**When to use:** In deep link handler to get source app, card count, trigger type
**Example:**
```typescript
// Source: Expo Linking.parse() docs
import * as Linking from 'expo-linking';

interface ChallengeParams {
  source: string;      // e.g., "Instagram" or "Unlock"
  count: number;       // e.g., 3
  type: 'unlock' | 'app_open';
}

function parseDeepLink(url: string): ChallengeParams | null {
  const parsed = Linking.parse(url);

  if (parsed.hostname !== 'challenge') {
    return null;
  }

  return {
    source: parsed.queryParams?.source as string || 'Unknown',
    count: parseInt(parsed.queryParams?.count as string) || 3,
    type: (parsed.queryParams?.type as 'unlock' | 'app_open') || 'unlock'
  };
}
```

### Pattern 4: Fuzzy Answer Validation with Fuse.js
**What:** Validate user answers with fuzzy matching (ignore case, diacritics, whitespace)
**When to use:** When user submits answer in TextInput
**Example:**
```typescript
// Source: Fuse.js documentation
import Fuse from 'fuse.js';

function validateAnswer(userInput: string, correctAnswer: string): boolean {
  // Normalize both strings
  const normalize = (str: string) =>
    str.normalize('NFD')           // Decompose accents
       .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
       .replace(/['']/g, '')       // Remove apostrophes
       .toLowerCase()
       .trim();

  const normalizedInput = normalize(userInput);
  const normalizedCorrect = normalize(correctAnswer);

  // Use Fuse.js for fuzzy matching
  const fuse = new Fuse([normalizedCorrect], {
    threshold: 0.2,        // 0.0 = exact, 1.0 = match anything
    ignoreLocation: true,  // Don't care where in string match occurs
  });

  const result = fuse.search(normalizedInput);
  return result.length > 0;
}
```
**Source:** [Fuse.js Options](https://www.fusejs.io/api/options.html)

**Alternative (Built-in JS):**
```typescript
// If not using Fuse.js, use built-in normalization
function validateAnswerSimple(userInput: string, correctAnswer: string): boolean {
  const normalize = (str: string) =>
    str.normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '')
       .replace(/['']/g, '')
       .toLowerCase()
       .trim();

  return normalize(userInput) === normalize(correctAnswer);
}
```
**Source:** [MDN String.normalize()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize)

### Pattern 5: iOS Native TextInput with Return Key Submit
**What:** Configure TextInput to submit on return key press and match iOS native styling
**When to use:** Answer input field in ChallengeScreen
**Example:**
```typescript
// Source: React Native TextInput docs
import { TextInput, useColorScheme } from 'react-native';

function AnswerInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const colorScheme = useColorScheme();
  const [answer, setAnswer] = useState('');

  return (
    <TextInput
      value={answer}
      onChangeText={setAnswer}
      placeholder="Your answer"
      placeholderTextColor={
        colorScheme === 'dark'
          ? 'rgba(235, 235, 245, 0.3)'  // iOS dark mode placeholder
          : 'rgba(60, 60, 67, 0.3)'     // iOS light mode placeholder
      }
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="done"
      enablesReturnKeyAutomatically={true}  // iOS: disable return when empty
      onSubmitEditing={() => onSubmit(answer)}
      style={{
        fontFamily: 'System',  // Uses SF Pro on iOS
        fontSize: 17,          // iOS body text size
        color: colorScheme === 'dark' ? '#fff' : '#000'
      }}
    />
  );
}
```
**Source:** [React Native TextInput](https://reactnative.dev/docs/textinput)

### Pattern 6: Deep Link to External App with Error Handling
**What:** Open external app or return to home screen with fallback on error
**When to use:** "Continue to [App]" button after challenge
**Example:**
```typescript
// Source: React Native Linking docs
import { Linking, Alert } from 'react-native';

async function openExternalApp(
  appName: string,
  type: 'unlock' | 'app_open'
): Promise<void> {
  if (type === 'unlock') {
    // iOS doesn't support programmatic home screen navigation
    // Best we can do is show a message and let user manually close
    Alert.alert(
      'Challenge Complete',
      'Swipe up or press home button to return to home screen',
      [{ text: 'OK' }]
    );
    return;
  }

  // For app-open type, try to deep link to the app
  const appURLSchemes: Record<string, string> = {
    'Instagram': 'instagram://',
    'Twitter': 'twitter://',
    'Safari': 'x-web-search://',  // Opens Safari
    // Add more app URL schemes as needed
  };

  const urlScheme = appURLSchemes[appName];

  if (!urlScheme) {
    Alert.alert('Error', `Can't open ${appName}`);
    return;
  }

  try {
    const canOpen = await Linking.canOpenURL(urlScheme);
    if (canOpen) {
      await Linking.openURL(urlScheme);
    } else {
      Alert.alert('Error', `Can't open ${appName}`);
    }
  } catch (error) {
    Alert.alert('Error', `Can't open ${appName}`);
  }
}
```
**Source:** [React Native Linking.openURL](https://reactnative.dev/docs/linking)

### Anti-Patterns to Avoid
- **Testing custom URL schemes in Expo Go:** Custom schemes don't work in Expo Go - always use development builds
- **Not normalizing both input and answer:** Only normalizing one side leads to inconsistent matching
- **Using BackHandler.exitApp() on iOS:** iOS doesn't support programmatic app exit - show message instead
- **Hardcoding color values:** Use `useColorScheme()` and platform colors for proper dark mode support
- **Assuming deep links always work:** Always use `Linking.canOpenURL()` before `Linking.openURL()` and handle failures gracefully

---

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy string matching | Custom levenshtein distance calculator | Fuse.js or String.normalize() | Edge cases like mixed diacritics, multi-word answers, different apostrophe characters require extensive testing |
| Diacritic removal | Character mapping dictionary (é→e, à→a, etc.) | String.normalize('NFD') + regex | Unicode has 300+ combining diacritical marks; built-in normalize() handles all of them |
| Deep link URL parsing | Manual string splitting and regex | Linking.parse() | Handles edge cases like URL encoding, multiple query params, missing params |
| Dark mode detection | AsyncStorage or global state | useColorScheme() hook | React Native hook automatically subscribes to system theme changes |
| iOS native colors | Hardcoded hex values | PlatformColor('label'), PlatformColor('systemBackground') | System colors automatically adapt to light/dark mode and accessibility settings |

**Key insight:** String manipulation and URL parsing have countless edge cases. Use battle-tested libraries (Fuse.js, native Linking API) rather than custom implementations that will break with non-ASCII input or malformed URLs.

---

## Common Pitfalls

### Pitfall 1: Custom URL Schemes Don't Work in Expo Go
**What goes wrong:** Developer configures `scheme: "lingolock"` in app.json, tests in Expo Go, deep links fail silently
**Why it happens:** Expo Go only supports `exp://` scheme, not custom schemes. Custom scheme configuration is build-time only.
**How to avoid:** Always use development builds for testing custom URL schemes. Run `npx expo run:ios` or build with EAS.
**Warning signs:** Deep links work in docs/examples but fail in your app; error "Could not open URL"
**Source:** [Expo Linking Docs](https://docs.expo.dev/linking/into-your-app/)

### Pitfall 2: iOS Shortcuts Automation Unreliability When Device Locked
**What goes wrong:** Device unlock automation works during testing (phone unlocked) but fails in production when user actually unlocks phone from sleep
**Why it happens:** iOS prevents many Shortcuts actions from running when device is locked for security. Some automations require device to be unlocked to complete.
**How to avoid:** Design automations to be idempotent and handle partial execution. Test with device actually locked (not just screen off). Consider showing notification instead of opening app immediately.
**Warning signs:** Automation works inconsistently; users report "unlock your iPhone to run" messages
**Source:** [Automators Community Discussion](https://talk.automators.fm/t/why-do-some-time-triggered-shortcuts-run-on-a-locked-iphone-and-others-fail/18608)

### Pitfall 3: SHA-256 Fingerprint Mismatch (Android-Specific, Document for Future)
**What goes wrong:** Deep links work perfectly in dev builds but fail completely in production
**Why it happens:** Each app variant (dev, staging, production) has different SHA-256 fingerprint. Using dev fingerprint in verification file breaks production.
**How to avoid:** While this phase is iOS-only, document that Android requires separate SHA-256 fingerprints for each build variant
**Warning signs:** Production app doesn't respond to deep links that worked in development
**Source:** [Medium: Deep Linking Debugging](https://medium.com/@shreyasdamase/deep-linking-in-react-native-expo-a-complete-guide-from-someone-who-just-spent-hours-debugging-38baeed51850)

### Pitfall 4: Not Handling App Launch vs. Background Deep Links
**What goes wrong:** Deep link listener only catches URLs when app is backgrounded, not when app is launched fresh
**Why it happens:** `Linking.addEventListener('url')` only fires for foreground events. Initial URL requires `Linking.getInitialURL()`
**How to avoid:** Use both `getInitialURL()` for app launch and `addEventListener()` for background state in useEffect
**Warning signs:** Deep links work when app is already running but not when launching from cold start
**Source:** [Expo Linking API](https://docs.expo.dev/versions/latest/sdk/linking/)

### Pitfall 5: iOS Does Not Support Programmatic Home Screen Return
**What goes wrong:** Developer tries to use `BackHandler.exitApp()` or navigation to return user to iOS home screen after unlock challenge
**Why it happens:** iOS sandboxing prevents apps from programmatically exiting themselves or navigating to home screen (security/UX guideline)
**How to avoid:** Show completion message instructing user to swipe up/press home button. Don't try to force-close app on iOS.
**Warning signs:** BackHandler.exitApp() has no effect on iOS; navigation attempts fail
**Source:** [React Native BackHandler Docs](https://reactnative.dev/docs/backhandler), [GitHub Issue #42715](https://github.com/facebook/react-native/issues/42715)

### Pitfall 6: Scheme Differences Between Dev Client and Standalone Apps
**What goes wrong:** Hardcoding URL scheme in Shortcut works in development build but breaks in production app
**Why it happens:** Dev client may use different scheme than configured in app.json
**How to avoid:** Always use `Linking.createURL()` to generate deep links dynamically, don't hardcode URLs in Shortcuts
**Warning signs:** Tutorial shortcuts work for developer but not for users; scheme mismatch errors
**Source:** [React Native Deep Linking Guide](https://launchyourapp.dev/blog/react-native-deep-linking-setup-testing-and-common-mistakes-to-avoid)

### Pitfall 7: Assuming TextInput Auto-Darkmode Support
**What goes wrong:** TextInput text is black in dark mode (invisible on dark background)
**Why it happens:** React Native doesn't automatically set TextInput color based on color scheme
**How to avoid:** Manually set `style.color` based on `useColorScheme()` result, or use `PlatformColor('label')`
**Warning signs:** User reports text disappearing in dark mode; placeholder visible but typed text isn't
**Source:** [GitHub Issue #27696](https://github.com/facebook/react-native/issues/27696)

---

## Code Examples

Verified patterns from official sources:

### Development Build Creation
```bash
# Source: Expo Development Builds docs
# Install dev client dependency
npx expo install expo-dev-client

# Build for iOS simulator (local)
npx expo run:ios

# Build for physical iOS device (requires Apple Developer account)
# Option 1: EAS Build (cloud)
eas build --profile development --platform ios

# Option 2: Local build (requires Xcode)
npx expo run:ios --device
```

### Minimal ChallengeScreen Component
```typescript
// Source: React Native docs + Expo Linking docs
import React, { useState } from 'react';
import { View, Text, TextInput, Button, useColorScheme } from 'react-native';

interface ChallengeScreenProps {
  sourceName: string;
  cardCount: number;
  type: 'unlock' | 'app_open';
}

function ChallengeScreen({ sourceName, cardCount, type }: ChallengeScreenProps) {
  const colorScheme = useColorScheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);

  // Placeholder data (Phase 1)
  const cards = [
    { front: 'hello', back: 'hola' },
    { front: 'goodbye', back: 'adiós' },
    { front: 'thank you', back: 'gracias' }
  ];

  const currentCard = cards[currentIndex];

  const handleSubmit = () => {
    setShowAnswer(true);
    // Validate answer here (using fuzzy matching)
  };

  const handleNext = () => {
    if (currentIndex < cardCount - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
      setUserAnswer('');
    }
  };

  return (
    <View style={{
      flex: 1,
      justifyContent: 'center',
      padding: 20,
      backgroundColor: colorScheme === 'dark' ? '#000' : '#fff'
    }}>
      {/* Card */}
      <View style={{
        backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20
      }}>
        <Text style={{
          fontSize: 34,
          fontWeight: '600',
          textAlign: 'center',
          color: colorScheme === 'dark' ? '#fff' : '#000'
        }}>
          {currentCard.front}
        </Text>

        {showAnswer && (
          <Text style={{
            fontSize: 28,
            textAlign: 'center',
            marginTop: 16,
            color: '#34c759'  // iOS green
          }}>
            {currentCard.back}
          </Text>
        )}
      </View>

      {/* Input */}
      {!showAnswer && (
        <>
          <TextInput
            value={userAnswer}
            onChangeText={setUserAnswer}
            placeholder="Your answer"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            enablesReturnKeyAutomatically={true}
            onSubmitEditing={handleSubmit}
            style={{
              fontSize: 17,
              padding: 12,
              backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7',
              color: colorScheme === 'dark' ? '#fff' : '#000',
              borderRadius: 8,
              marginBottom: 12
            }}
          />
          <Button title="Check Answer" onPress={handleSubmit} />
        </>
      )}

      {/* Continue button */}
      {showAnswer && (
        <Button
          title={`Continue to ${sourceName}`}
          onPress={() => {/* Handle deep link */}}
        />
      )}
    </View>
  );
}
```

### iOS Shortcuts URL Scheme
```
# Source: Apple Shortcuts documentation
# Basic URL to run a shortcut that opens LingoLock
shortcuts://run-shortcut?name=LingoLock&input=text&text=lingolock://challenge?source=Instagram&count=3&type=app_open

# Breakdown:
# - shortcuts://run-shortcut - iOS Shortcuts URL scheme
# - name=LingoLock - Name of the shortcut to run
# - input=text - Pass text as input
# - text=lingolock://challenge?... - The deep link URL to pass to the shortcut

# In the actual Shortcut:
# 1. "Open URL" action
# 2. URL: lingolock://challenge?source=Unlock&count=3&type=unlock
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Expo Go for all testing | Development builds for native features | Expo SDK 44+ (2021) | Custom URL schemes, push notifications, native modules now testable |
| Legacy Architecture | New Architecture (enabled by default) | Expo SDK 52+ (Nov 2024), mandatory in SDK 55+ (Jan 2026) | Better performance, improved interop, no opt-out in SDK 55+ |
| Custom character mapping for diacritics | String.normalize('NFD') + regex | ES6 (2015), widely supported 2018+ | Unicode-compliant, handles all combining marks automatically |
| Fuse.js v3 | Fuse.js v7 | 2023 | Better TypeScript support, improved performance |
| React Navigation v5 | React Navigation v6 / Expo Router v7 | RN v6: 2021, Expo Router v7: Jan 2026 | Expo Router provides file-based routing, auto deep linking config |

**Deprecated/outdated:**
- **Expo Go for production testing:** Cannot test custom URL schemes, push notifications, native modules. Use development builds instead.
- **blurOnSubmit prop:** Deprecated in React Native 0.70+, use `submitBehavior` instead
- **returnKeyType on Android:** Many options are iOS-only. Use `enterKeyHint` for cross-platform return key labels.
- **Universal Links without domain:** Custom URL schemes are legacy; modern apps should use Universal Links (iOS) / App Links (Android) for production

---

## Open Questions

Things that couldn't be fully resolved:

1. **iOS Home Screen Deep Link Mechanism**
   - What we know: iOS doesn't support programmatic exit to home screen via BackHandler or Linking API
   - What's unclear: Is there an undocumented URL scheme (like `prefs://` or `x-apple-home://`) that works?
   - Recommendation: Implement fallback UI message "Swipe up to return to home screen" for unlock type. Research further if critical.

2. **iOS Shortcuts Unlock Automation Reliability**
   - What we know: Some users report unlock automations fail when device is actually locked; works when device is already unlocked
   - What's unclear: Is this iOS 18-specific? Does it affect all automation types or just specific actions?
   - Recommendation: Test extensively with locked device, prepare fallback notification-based approach, communicate limitation to users in tutorial

3. **Shortcut Deep Link Auto-Configuration**
   - What we know: User wants one-tap shortcut installation via deep link (preferred over screenshots)
   - What's unclear: Can we programmatically create/install Shortcuts via deep link? Apple docs show `shortcuts://create-shortcut` but unclear if it can pre-populate actions
   - Recommendation: Research `shortcuts://` URL scheme parameters for pre-configuration. If not possible, fall back to screenshot tutorial + iCloud share link for copy-paste.

4. **Emergency Escape (Space Bar 3x) Feasibility**
   - What we know: User wants space bar pressed 3x to skip challenge and deep link immediately
   - What's unclear: How to detect space bar on iOS keyboard? Is there a keyPress event? Or should this be a hidden UI button?
   - Recommendation: iOS keyboard doesn't expose individual key events. Implement as hidden UI element (triple-tap screen region?) or visible "Emergency Exit" button instead.

5. **Fuse.js Threshold Tuning for Multi-Language Support**
   - What we know: Fuse.js threshold 0.0 = exact, 1.0 = anything. User wants fuzzy matching.
   - What's unclear: What threshold value works best for vocabulary answers? Different threshold for short vs. long words?
   - Recommendation: Start with threshold 0.2-0.3, test with real vocabulary data, allow per-language tuning in future

---

## Sources

### Primary (HIGH confidence)
- [Expo Linking Documentation](https://docs.expo.dev/linking/into-your-app/) - Custom URL scheme setup
- [Expo Linking API Reference](https://docs.expo.dev/versions/latest/sdk/linking/) - Linking methods and event listeners
- [Expo Development Builds Introduction](https://docs.expo.dev/develop/development-builds/introduction/) - Why development builds are required
- [React Native TextInput API](https://reactnative.dev/docs/textinput) - TextInput props and iOS-specific features
- [React Native Linking API](https://reactnative.dev/docs/linking) - openURL, canOpenURL, getInitialURL
- [React Native BackHandler API](https://reactnative.dev/docs/backhandler) - Android-only, iOS limitations
- [Fuse.js Options Documentation](https://www.fusejs.io/api/options.html) - Threshold, ignoreLocation settings
- [Apple Shortcuts URL Scheme](https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios) - Run shortcuts via URL
- [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55) - Current version, React Native 0.83

### Secondary (MEDIUM confidence)
- [Medium: Deep Linking in React Native Expo (2024)](https://medium.com/@shreyasdamase/deep-linking-in-react-native-expo-a-complete-guide-from-someone-who-just-spent-hours-debugging-38baeed51850) - Common pitfalls, SHA-256 issue
- [Medium: What's New in Expo SDK 55 (Jan 2026)](https://medium.com/@onix_react/whats-new-in-expo-sdk-55-6eac1553cee8) - Latest features
- [Automators Community: Unlock Automation Reliability](https://talk.automators.fm/t/why-do-some-time-triggered-shortcuts-run-on-a-locked-iphone-and-others-fail/18608) - iOS Shortcuts locked device issues
- [GitHub Issue #27696](https://github.com/facebook/react-native/issues/27696) - TextInput dark mode color bug
- [GitHub Issue #42715](https://github.com/facebook/react-native/issues/42715) - BackHandler.exitApp() doesn't work on iOS
- [React Native Deep Linking Guide (2026)](https://launchyourapp.dev/blog/react-native-deep-linking-setup-testing-and-common-mistakes-to-avoid) - Best practices

### Tertiary (LOW confidence)
- [Fuse.js GitHub Issues](https://github.com/krisk/Fuse/issues/576) - Threshold per field discussion
- [iOS Human Interface Guidelines Summary](https://www.nadcab.com/blog/apple-human-interface-guidelines-explained) - SF Pro font, system colors overview
- Various Stack Overflow discussions on string normalization, fuzzy matching thresholds

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Expo and Fuse.js are well-documented, current versions verified
- Architecture: HIGH - Patterns sourced from official Expo/React Native docs with working examples
- Pitfalls: MEDIUM-HIGH - Common pitfalls verified across multiple sources; iOS Shortcuts reliability is documented community issue; some edge cases remain untested
- iOS native UI: MEDIUM - Design guidelines are general; specific implementation will require iterative refinement
- Emergency escape mechanism: LOW - Space bar detection method unclear, needs implementation research

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (30 days - Expo ecosystem stable, SDK 55 just released in Jan 2026)

**Planner notes:**
- Development builds are MANDATORY - do not create tasks for Expo Go testing
- iOS home screen navigation is IMPOSSIBLE programmatically - plan for message UI instead
- Custom URL scheme will be unique to this app (`lingolock://`) - document format for Shortcuts tutorial
- Fuzzy matching threshold requires empirical tuning - plan testing task
- Emergency escape (space bar 3x) needs alternative implementation (not keyboard event-based)
