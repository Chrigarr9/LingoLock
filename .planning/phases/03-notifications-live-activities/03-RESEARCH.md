# Phase 3: Notifications & Live Activities - Research

**Researched:** 2026-03-04
**Domain:** iOS notifications and Live Activities with Expo/React Native
**Confidence:** MEDIUM-HIGH

## Summary

iOS notifications and Live Activities in Expo require careful orchestration between local notification scheduling, interactive action handling, and Live Activity state management. The standard approach uses `expo-notifications` (SDK 55+) for local notifications with interactive categories, and `expo-widgets` for Live Activities and Lock Screen widgets.

For this vocabulary app, the architecture needs to address three main challenges: (1) scheduling notifications based on screen unlock detection (which requires AppState monitoring since native screen lock detection isn't available in Expo), (2) creating interactive notifications with text input or multiple-choice buttons without requiring app launch, and (3) building persistent Lock Screen widgets that display vocabulary cards and support full practice sessions.

The key technical constraint is that iOS Live Activities have an 8-hour maximum duration and are designed for short-lived, user-initiated activities—not all-day vocabulary practice. The user's requirement for "always-on" Lock Screen widgets means using Home Screen widgets (which are persistent) rather than true Live Activities. Additionally, iOS notification categories support up to 4 custom actions but typically only display 2 in banner view, and text input in notifications requires authentication on iOS.

**Primary recommendation:** Use expo-notifications for timed local notifications with interactive categories (text input + multiple choice), expo-widgets for persistent Lock Screen/Home Screen widgets with practice session support, and React Native AppState API with timing heuristics to detect screen unlocks (since native screen lock detection requires ejecting from Expo).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Notification Timing & Frequency:**
- **Detection method:** Trigger notifications when screen is unlocked
- **Interval:** Send notification every 5 minutes when screen is unlocked
- **Configurable:** Notification interval must be configurable in settings (user preference)
- **In-app pause:** No notifications while user is in practice session
- **Streak loss:** Swiping away notification breaks streak and pauses notifications until next day
- **Resume logic:** After swipe-away, notifications resume the next day (not same day)
- **Daily limit:** Notifications stop when all due cards (per FSRS) are completed (natural limit, no artificial cap)
- **Response window:** Notification only counts if answered within 1 minute of delivery

**Interactive Notification Design:**
- **Input methods:** Same as in-app practice — user types answer (any language) OR multiple choice based on card state
- **Full question display:** Notification shows full sentence with gap (minimal, text-only)
- **No app opening required:** User pulls down notification, types answer, submits — never opens app
- **Dynamic updates preferred:** If iOS supports dynamic notification updates:
  - Correct answer: Show "✓ Correct" on same notification
  - Incorrect answer: Update same notification with correct answer + new challenge
- **Static fallback:** If dynamic updates not supported:
  - Correct answer: Notification silently disappears
  - Incorrect answer: Send new notification with correct answer + new challenge (all in one)
- **Partial interaction:** If user pulls down notification but doesn't submit within 1 minute → treat as swipe-away (streak lost, pause until next day)

**Live Activity Presentation (Lock Screen & Home Screen):**
- **Always-on widget:** Lock Screen widget is always present when cards are due
- **Full practice session:** User can complete entire practice session on widget (same functionality as in-app)
- **Card advancement:** Same as in-app practice session:
  - Type answer → auto-advance to next card on correct submission
  - Wrong answer → tap "Next" button OR swipe left to continue
- **Progress indicators:** Show card + "X cards left today" on widget
- **Empty state:** When no cards due, show either:
  - Nothing (widget disappears)
  - Motivational message + streak display
- **Input methods:** Same as in-app (type answer OR multiple choice based on card state)
- **Image support:** If Lock Screen/Home Screen supports images, show full card (picture + sentence)
- **Home Screen widget:** Identical functionality to Lock Screen widget (same implementation, different placement)
- **Minimalistic design:** Widget UI must be clean, focused, optimized for lock screen constraints

**Notification Content Strategy:**
- **FSRS integration:** Notifications and widgets pull from same "due now" queue as in-app practice
- **Notification filtering (5-min alerts):** Only show repetition cards (words user has seen at least once)
- **Widget content:**
  - If pictures supported: Show both new cards AND repetition cards (full FSRS queue)
  - If pictures NOT supported: Only show repetition cards (words seen at least once)
- **Answer impact:** Answers via notification or widget update FSRS intervals identically to in-app practice
- **Queue priority:** Same FSRS due-now logic as in-app (no special prioritization for notifications/widgets)
- **No separate pools:** All practice contexts (in-app, notification, widget) share same card queue and scheduling

### Claude's Discretion

- Exact notification UI layout and styling (within iOS constraints)
- Widget size constraints and layout optimization
- Loading states and transitions
- Error handling for notification/widget delivery failures
- Haptic feedback patterns
- Motivational message content for empty state

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

The established libraries/tools for Expo notifications and Live Activities:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-notifications | 0.30+ | Local notifications, interactive categories, scheduling | Official Expo SDK for notifications, supports local and remote push, interactive actions, background handlers |
| expo-widgets | SDK 55+ | Live Activities and Home Screen widgets | Official Expo SDK for building iOS widgets with Expo UI components, no Swift required |
| React Native AppState | Built-in | App state monitoring (active/background/inactive) | Built into React Native, required for screen state detection |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| expo-task-manager | Latest | Background notification task handling | When notifications need to trigger JS code while app is backgrounded/killed |
| react-native-mmkv | 4.1.2+ | Fast key/value storage with concurrent access | Already in project, supports concurrent access for widgets/extensions |
| fuse.js | 7.1.0+ | Fuzzy matching for text answers | Already in project for free-text answer validation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| expo-widgets | Voltra | Voltra uses JSX→SwiftUI conversion, more flexible but requires config plugin setup and has iOS 16.2+ requirement. expo-widgets is official Expo solution with better integration. |
| expo-widgets | react-native-widget-extension | Requires native Swift/SwiftUI code, loses Expo managed workflow benefits |
| AppState timing heuristics | react-native-lock-detection | Requires ejecting from Expo, native module for each platform |

**Installation:**
```bash
npx expo install expo-notifications expo-widgets
```

**Note:** expo-notifications config plugin must be added to app.json plugins array for iOS token sync and notification capabilities.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── services/
│   ├── notificationService.ts       # Notification scheduling, categories, handlers
│   ├── widgetService.ts             # Widget updates, Live Activity state
│   └── screenLockDetection.ts       # AppState monitoring for unlock detection
├── components/
│   ├── widgets/
│   │   ├── VocabularyWidget.tsx     # Lock Screen/Home Screen widget component
│   │   └── WidgetCard.tsx           # Card display for widgets
│   └── notifications/
│       └── NotificationHandler.tsx  # Notification response handling
└── hooks/
    ├── useNotificationScheduler.ts   # Hook for scheduling notifications
    └── useScreenUnlockDetector.ts    # Hook for screen unlock events
```

### Pattern 1: Local Notification Scheduling with Interactive Categories

**What:** Schedule notifications with custom action categories that support text input and button actions.

**When to use:** For vocabulary reminders that allow direct answering from notifications.

**Example:**
```typescript
// Source: https://docs.expo.dev/versions/latest/sdk/notifications/
import * as Notifications from 'expo-notifications';

// Register category with text input and multiple choice actions
await Notifications.setNotificationCategoryAsync('vocabulary-challenge', [
  {
    identifier: 'answer-text',
    buttonTitle: 'Type Answer',
    textInput: {
      submitButtonTitle: 'Submit',
      placeholder: 'Enter translation...'
    },
    options: {
      opensAppToForeground: false
    }
  },
  {
    identifier: 'answer-a',
    buttonTitle: 'A) Option 1',
    options: { opensAppToForeground: false }
  },
  {
    identifier: 'answer-b',
    buttonTitle: 'B) Option 2',
    options: { opensAppToForeground: false }
  }
]);

// Schedule notification with category
await Notifications.scheduleNotificationAsync({
  content: {
    title: 'Time for vocabulary!',
    body: 'The cat is ___ the table.',
    data: { cardId: '123', correctAnswer: 'on' },
    categoryIdentifier: 'vocabulary-challenge'
  },
  trigger: {
    seconds: 300, // 5 minutes
    repeats: false
  }
});
```

### Pattern 2: Screen Unlock Detection with AppState

**What:** Monitor AppState transitions to detect screen unlocks using timing heuristics.

**When to use:** When native screen lock detection is unavailable (Expo managed workflow).

**Example:**
```typescript
// Source: React Native AppState API + https://dev.to/shtabnoy/react-native-appstate-a-workaround-to-detect-screen-lock-26cm
import { AppState } from 'react-native';

let lastInactiveTime: number | null = null;

AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'inactive') {
    lastInactiveTime = Date.now();
  } else if (nextAppState === 'active' && lastInactiveTime) {
    const timeDiff = Date.now() - lastInactiveTime;

    // Screen lock transition is 5-8ms, minimize to home is ~800ms
    if (timeDiff < 50) {
      // Likely screen unlock - schedule notification
      scheduleNextNotification();
    }

    lastInactiveTime = null;
  }
});
```

### Pattern 3: Notification Response Handling

**What:** Handle user interactions with notifications (button taps, text input) in foreground and background.

**When to use:** For processing vocabulary answers submitted via notifications.

**Example:**
```typescript
// Source: https://docs.expo.dev/versions/latest/sdk/notifications/
import * as Notifications from 'expo-notifications';

// Register listener at module top-level (fires even when app is killed)
Notifications.addNotificationResponseReceivedListener((response) => {
  const { actionIdentifier, notification, userText } = response;
  const { cardId, correctAnswer } = notification.request.content.data;

  if (actionIdentifier === 'answer-text' && userText) {
    // Validate answer with fuzzy matching
    const isCorrect = validateAnswer(userText, correctAnswer);
    handleAnswer(cardId, isCorrect);
  } else if (actionIdentifier.startsWith('answer-')) {
    // Handle multiple choice button
    const selectedOption = actionIdentifier.split('-')[1];
    const isCorrect = selectedOption === correctAnswer;
    handleAnswer(cardId, isCorrect);
  }
});
```

### Pattern 4: Widget State Management with MMKV

**What:** Share state between app and widgets using MMKV's concurrent access support.

**When to use:** For widgets that display vocabulary cards from the same FSRS queue.

**Example:**
```typescript
// Source: https://github.com/mrousavy/react-native-mmkv + https://docs.expo.dev/versions/v55.0.0/sdk/widgets/
import { MMKV } from 'react-native-mmkv';
import { updateTimeline } from 'expo-widgets';

// MMKV supports concurrent access for widgets/extensions
const storage = new MMKV({
  id: 'vocabulary-shared',
  // Same ID used by widget for concurrent read access
});

function updateWidgetContent() {
  const dueCards = getDueCards(); // From FSRS scheduling

  // Store cards for widget access
  storage.set('widget.dueCards', JSON.stringify(dueCards));
  storage.set('widget.cardsLeft', dueCards.length);

  // Trigger widget timeline update
  updateTimeline({
    entries: [{
      date: new Date(),
      relevance: 1.0,
      dueCards: dueCards.slice(0, 1), // First card
      cardsLeft: dueCards.length
    }]
  });
}
```

### Pattern 5: Persistent Home Screen Widget (Not Live Activity)

**What:** Use Home Screen widget that persists indefinitely rather than Live Activity with 8-hour limit.

**When to use:** For "always-on" vocabulary practice widgets that aren't tied to a temporary activity.

**Example:**
```typescript
// Source: https://docs.expo.dev/versions/v55.0.0/sdk/widgets/
import { createWidget } from 'expo-widgets';

const VocabularyWidget = createWidget({
  supportedFamilies: ['systemSmall', 'systemMedium'],

  render: ({ dueCards, cardsLeft }) => (
    <WidgetContainer>
      {dueCards.length > 0 ? (
        <VocabularyCard card={dueCards[0]} />
        <ProgressText>{cardsLeft} cards left today</ProgressText>
      ) : (
        <EmptyState>All caught up! 🎉</EmptyState>
      )}
    </WidgetContainer>
  )
});

// Note: Use systemSmall/systemMedium for Home Screen
// Use accessoryCircular/accessoryRectangular for Lock Screen
```

### Anti-Patterns to Avoid

- **Using Live Activities for persistent widgets:** Live Activities expire after 8 hours and are removed. Use Home Screen widgets for persistent "always-on" functionality.
- **Requesting notification permissions on app launch:** iOS shows one-time permission dialog; denied permissions require manual Settings change. Use soft prompt first with context.
- **Scheduling notifications without canceling old ones:** Duplicate notifications accumulate. Always call `cancelAllScheduledNotificationsAsync()` before scheduling new patterns.
- **Assuming notification actions work in all states:** Test action handling when app is killed, backgrounded, and in foreground—behavior differs significantly.
- **Modifying notifications directly:** iOS doesn't support dynamic notification updates. Instead, cancel old notification and schedule new one with updated content.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background notification processing | Custom native module for background JS | expo-task-manager + Notifications.registerTaskAsync | Complex native integration, platform-specific quirks, Expo handles lifecycle |
| Screen lock/unlock detection | Custom timing logic from scratch | AppState timing heuristics (inactive→active < 50ms) | iOS doesn't expose screen lock events; timing heuristic is established pattern |
| Notification permission flow | Custom permission request UI | Notifications.getPermissionsAsync + requestPermissionsAsync with soft prompt | iOS one-time dialog requires careful UX, Expo handles platform differences |
| Widget layout system | Custom layout algorithm | expo-widgets with VStack/HStack/ZStack | Widget layout uses SwiftUI primitives under the hood, manual layout breaks |
| Concurrent storage for widgets | Custom file-based IPC | MMKV with shared storage ID | MMKV has native concurrent read/write support, file locking is error-prone |

**Key insight:** iOS notifications and widgets have numerous edge cases (permission states, background/foreground/killed app states, iOS version differences, memory limits). The Expo SDK abstracts these complexities with tested patterns. Custom solutions will hit undocumented platform bugs.

## Common Pitfalls

### Pitfall 1: iOS Notification Permission Denial Recovery

**What goes wrong:** User denies notification permission on first request, app has no way to show system dialog again.

**Why it happens:** iOS shows notification permission dialog once. If denied, user must manually go to Settings → App → Notifications to enable.

**How to avoid:**
1. Check permission status with `getPermissionsAsync()` before requesting
2. Show soft prompt explaining value before `requestPermissionsAsync()`
3. If status is 'denied', show UI directing user to Settings with `Linking.openSettings()`
4. Never request permissions without context

**Warning signs:** Permission request called on app launch without explanation; no fallback UI for denied state.

### Pitfall 2: Notification Actions Not Working When App Is Killed

**What goes wrong:** Interactive notification actions work when app is in foreground/background, but fail when app is completely killed.

**Why it happens:** Notification response listener must be registered at module top-level to be available when app is launched by notification interaction. If registered inside component or after app initialization, it misses the launch event.

**How to avoid:**
1. Register `addNotificationResponseReceivedListener()` at module top-level in entry file
2. For background processing, register task with `Notifications.registerTaskAsync()` before app initialization
3. Test all notification actions with app in killed state

**Warning signs:** Notifications work fine during development but fail in production TestFlight builds; actions work when app is open but not when closed.

### Pitfall 3: Screen Unlock Detection Timing Variability

**What goes wrong:** AppState timing heuristic (inactive→active transition time) has false positives/negatives across iOS versions and device models.

**Why it happens:** The ~800ms home button vs ~5-8ms screen lock timing difference is empirical, not documented API behavior. iOS updates can change timing, and device performance affects measurements.

**How to avoid:**
1. Use timing threshold with buffer (e.g., < 50ms for screen lock, not exact 8ms)
2. Add secondary validation: check if app was truly inactive (no user interaction) before transition
3. Provide manual "Schedule Next Notification" button as fallback
4. Log timing measurements in production to detect iOS version changes

**Warning signs:** Notifications trigger when switching apps instead of only on screen unlock; notifications don't trigger on some device models.

### Pitfall 4: Widget State Staleness

**What goes wrong:** Widget shows outdated vocabulary cards even after cards are answered in-app or via notifications.

**Why it happens:** Widgets don't automatically refresh when app state changes. Widget updates must be explicitly triggered with `updateTimeline()` or `updateSnapshot()`.

**How to avoid:**
1. Call `updateTimeline()` after every card answer (in-app, notification, widget)
2. Use MMKV storage change listeners to detect shared state updates
3. Schedule periodic widget updates (every 15 minutes) as backup
4. Store widget update timestamp in MMKV to detect staleness

**Warning signs:** Widget shows same card even after answering; progress count doesn't update; widget shows cards marked as complete.

### Pitfall 5: Notification Response Timeout (1 Minute Window)

**What goes wrong:** User pulls down notification to answer but doesn't submit quickly, answer is lost or streak is incorrectly marked as broken.

**Why it happens:** User requirement specifies 1-minute response window, but iOS doesn't provide notification "expanded" event—only tap or action submission events.

**How to avoid:**
1. Store notification delivery timestamp in notification data payload
2. Compare delivery time to response time in listener, reject if > 1 minute
3. For partial interaction detection, there's no perfect solution—iOS doesn't expose "notification pulled down but not submitted" event
4. Consider more lenient timeout (2-3 minutes) to reduce false streak breaks

**Warning signs:** Users complain about streak breaks when they "answered" notification; timeout logic uses client-side time (vulnerable to clock changes).

### Pitfall 6: Notification Payload Size Limit (4KB)

**What goes wrong:** Notifications with image attachments or large data payloads fail silently or display without content.

**Why it happens:** iOS has 4KB limit for notification payloads (title + body + data + attachments). Large images or excessive JSON in data field exceed limit.

**How to avoid:**
1. Keep notification text minimal (title < 50 chars, body < 150 chars)
2. Store card IDs in data payload, not full card objects
3. Fetch card details from MMKV storage in notification handler
4. Avoid image attachments in notifications (use text-only as user specified)

**Warning signs:** Notifications work for some cards but not others; notifications appear blank; media attachments don't load.

### Pitfall 7: Live Activity 8-Hour Expiration

**What goes wrong:** Live Activity widget disappears after 8 hours, breaking "always-on" functionality.

**Why it happens:** Live Activities are designed for short-lived events (ride tracking, timers). Apple enforces 8-hour maximum duration, after which system removes the Live Activity.

**How to avoid:**
1. Use Home Screen widget instead of Live Activity for persistent vocabulary practice
2. If using Live Activity for specific feature, restart it every 7 hours with background task
3. Document that Lock Screen widgets (accessoryCircular/Rectangular) are temporary

**Warning signs:** User requirement says "always-on widget" but implementation uses `createLiveActivity()` instead of `createWidget()`.

## Code Examples

Verified patterns from official sources:

### Setting Up Notification Handler

```typescript
// Source: https://docs.expo.dev/versions/latest/sdk/notifications/
import * as Notifications from 'expo-notifications';

// Configure how notifications are presented when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Register listener (at module top-level, not inside component)
Notifications.addNotificationResponseReceivedListener((response) => {
  const { actionIdentifier, notification, userText } = response;

  // Default action (tapped notification)
  if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    // Open app to practice screen
    router.push('/practice');
  } else {
    // Custom action (text input or button)
    handleNotificationAction(response);
  }
});
```

### Requesting Notification Permissions with Soft Prompt

```typescript
// Source: https://docs.expo.dev/versions/latest/sdk/notifications/
import * as Notifications from 'expo-notifications';

async function requestNotificationPermissions() {
  // Check current status first
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') {
    return true;
  }

  if (existingStatus === 'denied') {
    // Show UI to direct user to Settings
    Alert.alert(
      'Enable Notifications',
      'Notifications are disabled. Please enable them in Settings to receive vocabulary reminders.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]
    );
    return false;
  }

  // Show soft prompt before requesting
  const userWantsNotifications = await showSoftPrompt();

  if (userWantsNotifications) {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  return false;
}
```

### Scheduling Notification on Screen Unlock

```typescript
// Source: React Native AppState + https://docs.expo.dev/versions/latest/sdk/notifications/
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

function setupScreenUnlockDetection() {
  let lastInactiveTime: number | null = null;
  let notificationScheduled = false;

  const subscription = AppState.addEventListener('change', async (nextAppState) => {
    if (nextAppState === 'inactive') {
      lastInactiveTime = Date.now();
    } else if (nextAppState === 'active' && lastInactiveTime) {
      const timeDiff = Date.now() - lastInactiveTime;

      // Screen unlock is fast transition (< 50ms)
      if (timeDiff < 50 && !notificationScheduled) {
        await scheduleVocabularyNotification();
        notificationScheduled = true;
      }

      lastInactiveTime = null;
    }
  });

  return () => subscription.remove();
}

async function scheduleVocabularyNotification() {
  // Cancel any existing scheduled notifications
  await Notifications.cancelAllScheduledNotificationsAsync();

  const card = getNextDueCard(); // From FSRS queue

  if (card) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time for vocabulary!',
        body: card.sentence, // e.g., "The cat is ___ the table."
        data: {
          cardId: card.id,
          correctAnswer: card.answer,
          deliveryTime: Date.now(),
        },
        categoryIdentifier: 'vocabulary-challenge',
      },
      trigger: {
        seconds: 300, // 5 minutes (configurable)
      },
    });
  }
}
```

### Creating Persistent Home Screen Widget

```typescript
// Source: https://docs.expo.dev/versions/v55.0.0/sdk/widgets/
import { createWidget, VStack, HStack, Text, Image } from 'expo-widgets';
import { getWidgetData } from './widgetService';

const VocabularyWidget = createWidget({
  supportedFamilies: ['systemSmall', 'systemMedium'],

  render: () => {
    const { currentCard, cardsLeft } = getWidgetData();

    return (
      <VStack alignment="center" spacing={8}>
        {currentCard ? (
          <>
            <Image
              source={{ uri: currentCard.imageUrl }}
              width={100}
              height={100}
            />
            <Text font="headline">{currentCard.sentence}</Text>
            <Text font="caption">{cardsLeft} cards left today</Text>
          </>
        ) : (
          <VStack alignment="center">
            <Text font="title">All caught up!</Text>
            <Text font="caption">Great work today 🎉</Text>
          </VStack>
        )}
      </VStack>
    );
  }
});

export default VocabularyWidget;
```

### Handling Widget User Interactions

```typescript
// Source: https://docs.expo.dev/versions/v55.0.0/sdk/widgets/
import { addUserInteractionListener } from 'expo-widgets';

addUserInteractionListener((event) => {
  const { widgetId, buttonId, type } = event;

  if (buttonId === 'submit-answer') {
    // Process answer from widget text input
    const answer = getWidgetInputText(widgetId);
    const isCorrect = validateAnswer(answer);

    // Update FSRS scheduling
    updateCardProgress(isCorrect);

    // Advance to next card
    updateWidgetWithNextCard(widgetId);
  } else if (buttonId === 'next-card') {
    // User tapped "Next" after wrong answer
    updateWidgetWithNextCard(widgetId);
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Native Push Notification (RNPN) library | expo-notifications (official) | SDK 43 (2021) | Expo SDK integrated native notifications, RNPN no longer needed for managed workflow |
| Native Swift/SwiftUI for widgets | expo-widgets (Expo UI components) | SDK 55 Beta (Jan 2026) | Widgets can now be built with JSX/TSX without Swift, hot reload support |
| Manual Live Activity management | expo-widgets createLiveActivity() API | SDK 55 (2026) | Simplified Live Activity lifecycle with push notification support |
| AsyncStorage for widget data sharing | MMKV with concurrent access | react-native-mmkv 4.0+ (2024) | MMKV supports concurrent read/write for widgets/extensions, AsyncStorage doesn't |
| Static notification content | iOS 18 Priority Notifications | iOS 18 (Sept 2024) | Apple Intelligence prioritizes notifications, summaries enabled |

**Deprecated/outdated:**
- **expo-permissions package:** Deprecated in SDK 41, use module-specific permission methods (Notifications.getPermissionsAsync)
- **notification config in app.json:** Removed in SDK 55, must use expo-notifications config plugin instead
- **Live Activity second-by-second updates:** iOS 18 reduced update frequency to 5-15 seconds for battery optimization

## Open Questions

Things that couldn't be fully resolved:

1. **Dynamic Notification Updates**
   - What we know: iOS doesn't natively support modifying existing notification content. UNNotificationServiceExtension can modify content *before* delivery, not after display.
   - What's unclear: Whether the user's requirement for "dynamic updates" can be achieved with iOS APIs, or if fallback (cancel + reschedule) is the only option.
   - Recommendation: Implement static fallback approach (cancel old notification, schedule new one). Document that true dynamic updates aren't possible on iOS.

2. **Screen Unlock Detection Reliability**
   - What we know: AppState timing heuristic (inactive→active < 50ms = screen unlock) works but isn't documented API behavior.
   - What's unclear: Whether timing threshold varies significantly across iOS versions (18, 19, future releases) or device models.
   - Recommendation: Implement with timing threshold, add logging to monitor false positives/negatives, provide manual fallback button.

3. **Partial Notification Interaction Detection**
   - What we know: iOS notification APIs fire events for action submission, but not for "notification expanded but not submitted."
   - What's unclear: How to detect if user pulled down notification but didn't submit within 1-minute window (user requirement).
   - Recommendation: Can only detect response timeout (delivery time vs response time), not partial interaction. Consider more lenient timeout or remove "partial interaction = streak break" requirement.

4. **Widget Image Support on Lock Screen**
   - What we know: expo-widgets supports Image component with SF Symbols and custom images. Lock Screen accessories (accessoryCircular, accessoryRectangular) have size constraints.
   - What's unclear: Whether custom vocabulary card images (likely PNG/JPEG) can be displayed in Lock Screen accessories, or if only SF Symbols are supported.
   - Recommendation: Test Lock Screen accessory widgets with custom images. If not supported, implement user requirement fallback (text-only for Lock Screen, images for Home Screen).

5. **Notification Text Input Language Support**
   - What we know: iOS notification text input provides standard keyboard. User requirement specifies "any language" for answers.
   - What's unclear: Whether notification text input supports keyboard switching for multilingual input, or if locked to system keyboard.
   - Recommendation: Test with non-English vocabulary. If keyboard switching isn't available in notification text input, prioritize multiple-choice mode for notifications and reserve text input for in-app practice.

## Sources

### Primary (HIGH confidence)

- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/) - Official Expo SDK notification API, scheduling, interactive categories
- [Expo Widgets Documentation](https://docs.expo.dev/versions/v55.0.0/sdk/widgets/) - Official Expo SDK widgets and Live Activities API
- [Expo Push Notifications Guide](https://docs.expo.dev/push-notifications/what-you-need-to-know/) - Notification best practices and setup guide
- [Apple Local and Remote Notification Programming Guide](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/SupportingNotificationsinYourApp.html) - iOS notification category limits (4 actions max)

### Secondary (MEDIUM confidence)

- [React Native AppState Workaround for Screen Lock](https://dev.to/shtabnoy/react-native-appstate-a-workaround-to-detect-screen-lock-26cm) - Timing heuristic for screen unlock detection
- [Making Expo Notifications Actually Work](https://medium.com/@gligor99/making-expo-notifications-actually-work-even-on-android-12-and-ios-206ff632a845) - Common pitfalls and production issues
- [iOS Live Activities in React Native Guide](https://geekyants.com/blog/ios-live-activities-in-react-native-a-complete-guide) - Live Activities architecture patterns
- [Voltra: Live Activities with React](https://www.callstack.com/blog/live-activities-and-widgets-with-react-say-hello-to-voltra) - Alternative approach comparison
- [iOS 18 Priority Notifications](https://www.engagelab.com/blog/ios-18-priority-notifications) - iOS 18 notification features and updates
- [Pushwoosh iOS Push Notifications Guide 2026](https://www.pushwoosh.com/blog/ios-push-notifications/) - 2026 best practices and guidelines
- [iOS Push Notification Character Limits](https://www.engagelab.com/blog/push-notification-character-limits) - Notification content size constraints

### Tertiary (LOW confidence)

- [MMKV Storage Backgrounding Issues](https://github.com/mrousavy/react-native-mmkv/issues/542) - GitHub issue about MMKV data loss when backgrounded (needs validation)
- [Live Activities 8-Hour Limit](https://www.pushwoosh.com/blog/ios-live-activities/) - Community documentation of Apple's Live Activity constraints (verify with official docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - expo-notifications and expo-widgets are official Expo SDK packages with active development in SDK 55
- Architecture: MEDIUM-HIGH - Patterns verified from official docs, but screen unlock detection relies on undocumented timing heuristic
- Pitfalls: HIGH - Common issues documented in official troubleshooting guides and real-world production experiences
- Dynamic notification updates: LOW - Unclear if user requirement can be achieved with iOS APIs

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (30 days - Expo SDK stable, but iOS updates may introduce changes)

**Notes:**
- This research assumes Expo managed workflow (no native code). If ejecting to bare workflow, additional native module options become available (react-native-lock-detection, custom notification service extensions).
- iOS 18.4 introduced Priority Notifications in March 2026, but doesn't affect core notification scheduling/category APIs.
- expo-widgets in SDK 55 is recent (January 2026), expect rapid updates and improvements in SDK 56+.
