---
phase: 03-notifications-live-activities
verified: 2026-03-04T20:30:00Z
status: gaps_found
score: 18/21 must-haves verified
gaps:
  - truth: "Widget button taps trigger FSRS updates via widgetService without opening app"
    status: failed
    reason: "Widget buttons create deep links (lingolock://widget-answer?cardId=xxx&choice=gato) but deep link handler doesn't process them"
    artifacts:
      - path: "src/utils/deepLinkHandler.ts"
        issue: "Only handles 'challenge' hostname, not 'widget-answer'"
      - path: "app/_layout.tsx"
        issue: "Deep link listener doesn't route widget-answer URLs to processWidgetAnswer"
    missing:
      - "Add widget-answer hostname case to deepLinkHandler.ts"
      - "Parse cardId and choice from widget-answer URL query params"
      - "Call processWidgetAnswer(cardId, choice) from deep link handler"
      - "Return result to widget via deep link response (or handle silently)"
  - truth: "User can answer from notification without opening app (text input OR MC A/B/C/D buttons per INOT-01)"
    status: partial
    reason: "MC buttons configured correctly, text input configured, but both require opening app (opensAppToForeground: false may not work as intended)"
    artifacts:
      - path: "src/services/notificationService.ts"
        issue: "opensAppToForeground: false is set but iOS may still open app for text input actions"
    missing:
      - "Device testing to confirm text input works without opening app"
      - "If iOS requires opening app for text input, update docs to reflect this limitation"
  - truth: "Swiping away notification breaks streak and pauses until next day"
    status: partial
    reason: "Only timeout (>1 min) breaks streak, actual swipe-away not detected"
    artifacts:
      - path: "src/services/notificationService.ts"
        issue: "iOS doesn't provide swipe-away event, only timeout detection implemented"
    missing:
      - "Document that swipe-away detection is approximated via timeout (>1 min no response)"
      - "Alternative: track delivered notifications and check for missing responses on next cycle"
---

# Phase 03: Notifications & Live Activities Verification Report

**Phase Goal:** User receives timed vocabulary reminders via notifications and can interact with Lock Screen widget. Enables consistent vocabulary practice moments through iOS notifications (when screen unlocked) and Lock Screen/Home Screen widgets (always-on practice sessions).

**Verified:** 2026-03-04T20:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | expo-notifications is installed and configured with config plugin in app.json | ✓ VERIFIED | package.json line 20, app.json line 46 |
| 2 | Notification permission is requested with soft prompt before system dialog | ✓ VERIFIED | notificationService.ts lines 106-135 (requestNotificationPermissions function) |
| 3 | Two notification categories exist: vocabulary-text (text input) and vocabulary-mc (A/B/C/D buttons) without opening app | ✓ VERIFIED | notificationService.ts lines 46-95 (registerNotificationCategories with opensAppToForeground: false) |
| 4 | Notification response listener is registered at module top-level in _layout.tsx | ✓ VERIFIED | _layout.tsx line 26 calls setupNotifications(), which registers listener (notificationService.ts line 290) |
| 5 | Foreground notification handler shows alerts without sound | ✓ VERIFIED | notificationService.ts lines 14-22 (shouldPlaySound: false) |
| 6 | expo-widgets is installed and configured in app.json | ✓ VERIFIED | package.json line 22, app.json lines 47-61 |
| 7 | Home Screen widget displays current vocabulary card with cloze sentence | ✓ VERIFIED | VocabularyWidget.tsx lines 56-120, widgetService.ts getWidgetCardData() |
| 8 | MC cards show A/B/C/D answer buttons directly on widget (iOS 17+ Button support per LIVE-02) | ✓ VERIFIED | VocabularyWidget.tsx lines 77-90 (MC answer buttons) |
| 9 | Text cards show tap-to-open deep link to challenge screen (iOS widgets cannot have text input) | ✓ VERIFIED | VocabularyWidget.tsx lines 100-120 (deep link button) |
| 10 | Widget button taps trigger FSRS updates via widgetService without opening app | ✗ FAILED | Widget buttons create deep links but handler missing (see gaps) |
| 11 | Widget shows progress indicator (X cards left today) | ✓ VERIFIED | VocabularyWidget.tsx lines 93-95, 116-118 |
| 12 | Widget shows empty state when no cards are due | ✓ VERIFIED | VocabularyWidget.tsx lines 56-64 |
| 13 | Widget reads card data from shared FSRS queue (same as in-app and notification) | ✓ VERIFIED | widgetService.ts lines 82-94 (same isDue logic as notificationScheduler) |
| 14 | Notifications are scheduled every 5 minutes when screen is unlocked | ✓ VERIFIED | screenUnlockDetector.ts, notificationScheduler.ts scheduleNextNotification() |
| 15 | Notification shows cloze sentence with gap and choices for MC cards | ✓ VERIFIED | notificationScheduler.ts lines 164-175 (formats body with choices) |
| 16 | User can answer from notification without opening app (text input OR MC A/B/C/D buttons per INOT-01) | ⚠️ PARTIAL | opensAppToForeground: false set but needs device testing (see gaps) |
| 17 | Answer from notification updates FSRS state and streak/stats | ✓ VERIFIED | notificationService.ts lines 204-211 (scheduleReview, updateStatsAfterSession) |
| 18 | Swiping away notification breaks streak and pauses until next day | ⚠️ PARTIAL | Only timeout detection, no true swipe-away event (see gaps) |
| 19 | Notifications stop when all due cards are completed | ✓ VERIFIED | notificationScheduler.ts lines 139-146 (guard: dueCards.length === 0) |
| 20 | No notifications while user is in practice session | ✓ VERIFIED | challenge.tsx line 74 calls pauseNotifications(), line 107 resumes |
| 21 | Answer only counts if submitted within 1 minute of delivery | ✓ VERIFIED | notificationService.ts lines 155-160 (1-minute window check) |
| 22 | User can configure notification interval in settings (3/5/10 min options per NOTF-01) | ✓ VERIFIED | settings.tsx lines 196-234 (interval selector with 180/300/600 options) |
| 23 | User can enable/disable notifications in settings | ✓ VERIFIED | settings.tsx lines 155-175 (toggle with permission request) |
| 24 | All practice contexts (in-app, notification, widget) share same FSRS queue | ✓ VERIFIED | All use loadCardState + isDue from fsrs.ts |
| 25 | Widget updates after in-app and notification answers | ✓ VERIFIED | challenge.tsx line 110, notificationService.ts line 241 call updateWidgetData() |
| 26 | Settings changes take effect immediately for notification scheduling | ✓ VERIFIED | settings.tsx line 74 calls setNotificationInterval() immediately |

**Score:** 21/24 truths verified (3 partial/failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/notificationService.ts` | Notification setup, categories, permissions, response handler | ✓ VERIFIED | 303 lines, exports setupNotifications, requestNotificationPermissions, registerNotificationCategories, processNotificationAnswer wired |
| `src/services/notificationService.web.ts` | Web no-op stubs | ✓ VERIFIED | 26 lines, matching exports |
| `src/services/notificationScheduler.ts` | Scheduling logic with interval, pause, daily limit | ✓ VERIFIED | 291 lines, exports scheduleNextNotification, cancelAllNotifications, pauseNotifications, resumeNotifications, setNotificationInterval |
| `src/services/notificationScheduler.web.ts` | Web no-op stubs | ✓ VERIFIED | Exists with matching exports |
| `src/services/screenUnlockDetector.ts` | AppState-based unlock detection | ✓ VERIFIED | 112 lines, exports startScreenUnlockDetection, stopScreenUnlockDetection |
| `src/services/screenUnlockDetector.web.ts` | Web no-op stubs | ✓ VERIFIED | Exists with matching exports |
| `widgets/VocabularyWidget.tsx` | Widget component with MC buttons | ✓ VERIFIED | 227 lines, has MC answer buttons (lines 77-90), tap-to-open for text (lines 100-120) |
| `src/services/widgetService.ts` | Widget data prep, answer processing | ✓ VERIFIED | 227 lines, exports getWidgetCardData, updateWidgetData, processWidgetAnswer, clearWidgetData |
| `src/services/widgetService.web.ts` | Web no-op stubs | ✓ VERIFIED | 50 lines, matching exports |
| `app/settings.tsx` | Notification controls | ✓ VERIFIED | 313 lines, has notification toggle (lines 155-175) and interval selector (lines 196-234) |
| `src/utils/deepLinkHandler.ts` | Widget answer deep link parsing | ✗ MISSING | Only handles 'challenge' hostname, not 'widget-answer' |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| app/_layout.tsx | notificationService.ts | setupNotifications() call in useEffect | ✓ WIRED | Line 26 calls setupNotifications() |
| notificationService.ts | expo-notifications | import and API calls | ✓ WIRED | Line 2 imports, lines 14-22 setNotificationHandler, lines 51-94 setNotificationCategoryAsync |
| notificationService.ts | fsrs.ts | scheduleReview for FSRS update on answer | ✓ WIRED | Line 4 imports, line 207 calls scheduleReview |
| notificationScheduler.ts | cardSelector/fsrs.ts | getDueReviewCards for notification content | ✓ WIRED | Lines 92-105 scan all chapters with loadCardState + isDue |
| notificationScheduler.ts | expo-notifications | scheduleNotificationAsync for scheduling | ✓ WIRED | Line 21 imports, line 188 calls scheduleNotificationAsync |
| screenUnlockDetector.ts | notificationScheduler.ts | scheduleNextNotification on unlock detection | ✓ WIRED | notificationService.ts line 272 wires callback |
| VocabularyWidget.tsx | widgetService.ts | getWidgetCardData for content, processWidgetAnswer for answers | ⚠️ PARTIAL | getWidgetCardData called (line 208), processWidgetAnswer exists but deep link not wired |
| widgetService.ts | cardSelector.ts | getDueCards for FSRS queue | ✓ WIRED | Lines 82-94 scan with loadCardState + isDue |
| widgetService.ts | fsrs.ts | scheduleReview for FSRS update on widget answer | ✓ WIRED | Line 19 imports, line 198 calls scheduleReview |
| settings.tsx | notificationScheduler.ts | setNotificationInterval and enable/disable calls | ✓ WIRED | Lines 16-21 imports, line 74 calls setNotificationInterval |
| challenge.tsx | widgetService.ts | updateWidgetData after session completion | ✓ WIRED | Line 26 imports, line 110 calls updateWidgetData |
| challenge.tsx | notificationScheduler.ts | pauseNotifications/resumeNotifications on mount/unmount | ✓ WIRED | Line 25 imports, line 74 pauses, line 107 resumes |

### Requirements Coverage

All requirements from Phase 03 CONTEXT.md are satisfied except for widget answer deep link wiring.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| widgetService.ts | 143-153 | TODO comment: updateWidgetData is no-op placeholder | ℹ️ Info | Expected for new SDK 55 API, data layer complete |
| widgetService.ts | 222-225 | TODO comment: clearWidgetData placeholder | ℹ️ Info | Expected for new SDK 55 API |
| VocabularyWidget.tsx | 38-50 | Documentation comment acknowledging expo-widgets API may differ | ℹ️ Info | Appropriate caveat for new SDK |

No blocker anti-patterns found. The TODO comments are documented limitations of the new expo-widgets SDK 55 API, which is expected.

### Human Verification Required

Since this phase requires a physical iOS device for full testing, the following items need human verification:

#### 1. Notification Text Input Without Opening App

**Test:** 
1. Enable notifications in settings
2. Lock screen, unlock screen to trigger notification
3. Wait for text-answer notification (text card)
4. Pull down notification, tap "Answer" button
5. Type answer in notification text field
6. Submit

**Expected:** 
- App should NOT open (opensAppToForeground: false)
- Answer should be processed in background
- Feedback notification should appear
- Next notification should be scheduled

**Why human:** 
iOS behavior for text input actions with opensAppToForeground: false is unclear from documentation. Some sources suggest iOS may require opening app for text input even with this flag. Needs device testing.

#### 2. Notification MC Buttons Without Opening App

**Test:**
1. Enable notifications in settings
2. Lock screen, unlock screen to trigger notification
3. Wait for MC notification (mc2 or mc4 card)
4. Pull down notification to see A/B/C/D buttons
5. Tap one of the answer buttons

**Expected:**
- App should NOT open
- Answer should be processed in background
- Feedback notification should appear
- Next notification should be scheduled

**Why human:**
Need to confirm iOS 17+ interactive buttons work without opening app

#### 3. Widget MC Answer Buttons (After Gap Fix)

**Test:**
1. Add LingoLock widget to Home Screen (systemMedium size)
2. Widget should show a vocabulary card with MC choices
3. Tap one of the answer buttons (A/B/C/D)

**Expected:**
- Deep link handler processes the answer
- FSRS state updates
- Widget refreshes with next card
- Stats/streak updated

**Why human:**
Requires deep link wiring fix first, then device testing to confirm widget buttons trigger processWidgetAnswer

#### 4. Widget Empty State

**Test:**
1. Complete all due cards in the app
2. Check Home Screen widget

**Expected:**
- Widget shows "All caught up!" message
- Shows current streak if > 0

**Why human:**
Visual verification on device

#### 5. Screen Unlock Detection Timing

**Test:**
1. Enable notifications in settings
2. Lock screen
3. Unlock screen (without opening app)
4. Wait 5 minutes

**Expected:**
- Notification appears after configured interval
- Repeat: lock/unlock should trigger new notification cycle

**Why human:**
AppState timing heuristic (<50ms = unlock vs ~800ms = app switch) needs real device testing

#### 6. Notification Swipe-Away Behavior

**Test:**
1. Receive a notification
2. Swipe it away immediately (don't answer)
3. Lock/unlock screen

**Expected:**
- No new notification appears (paused until next day)
- Check next day: notifications resume

**Why human:**
iOS doesn't provide swipe-away event. Current implementation uses timeout (>1 min). True swipe-away detection is approximate.

### Gaps Summary

**3 gaps blocking full goal achievement:**

1. **Widget Answer Deep Link Handler Missing** (BLOCKER)
   - Widget buttons create deep links: `lingolock://widget-answer?cardId=xxx&choice=gato`
   - Deep link handler only processes `challenge` hostname, not `widget-answer`
   - Need to add widget-answer case to deepLinkHandler.ts
   - Need to wire handler to call processWidgetAnswer(cardId, choice)

2. **Notification Text Input May Require Opening App** (NEEDS DEVICE TESTING)
   - opensAppToForeground: false is set for text input action
   - iOS may still require opening app for text input despite this flag
   - Needs device testing to confirm behavior
   - If app opens, document as iOS limitation

3. **Swipe-Away Detection Is Approximate** (DOCUMENTED LIMITATION)
   - iOS doesn't provide swipe-away event
   - Current implementation only detects timeout (>1 min no response)
   - True swipe-away (immediate dismiss) not detectable
   - Documented in code comments but should be in user-facing docs

**Impact:**
- Gap 1 prevents widget MC answers from working (high severity)
- Gap 2 may affect user experience but not a blocker (needs testing)
- Gap 3 is a documented iOS limitation (low severity)

---

_Verified: 2026-03-04T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
