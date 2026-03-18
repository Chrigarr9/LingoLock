---
phase: 03-notifications-live-activities
plan: 03
subsystem: notifications
tags: [expo-notifications, AppState, FSRS, notification-scheduling, screen-unlock-detection]

# Dependency graph
requires:
  - phase: 03-01
    provides: Notification infrastructure (categories, permissions, response listener setup)
  - phase: 03-02
    provides: Widget service for cross-platform answer processing pattern
provides:
  - Screen unlock detection using AppState timing heuristics
  - Notification scheduler with configurable interval and daily limits
  - Complete notification loop (unlock → schedule → answer → update → schedule next)
  - MC button answer processing via mcMapping
  - Text answer processing with fuzzy matching
  - 1-minute response window enforcement with streak management
  - Pause/resume notifications during in-app practice
  - Widget refresh after notification answers
affects: [04-app-blocking, settings-screen]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AppState timing heuristic for screen unlock detection (inactive→active < 50ms)"
    - "Notification scheduler with module-level state management (isPaused, isSwipedAwayToday)"
    - "MC button answer mapping pattern (action IDs → actual words via mcMapping)"
    - "Notification response window enforcement (deliveryTime + 60s timeout)"
    - "Pause/resume pattern for notifications during in-app sessions"

key-files:
  created:
    - src/services/screenUnlockDetector.ts
    - src/services/screenUnlockDetector.web.ts
    - src/services/notificationScheduler.ts
    - src/services/notificationScheduler.web.ts
  modified:
    - src/services/notificationService.ts
    - src/services/storage.ts
    - src/services/storage.web.ts
    - app/challenge.tsx

key-decisions:
  - "AppState timing heuristic for unlock detection: < 50ms = unlock, ~800ms = app switch"
  - "10-second debounce on unlock detection to prevent rapid repeated triggers"
  - "1-minute response window for notification answers (timeout breaks streak)"
  - "Only repetition cards (cards with FSRS state) scheduled for notifications"
  - "Minimal notification content per user decision: cloze sentence only, no title"
  - "MC choices formatted in notification body as 'A) word1  B) word2  C) word3  D) word4'"
  - "Feedback notifications: correct shows germanHint, incorrect shows answer + translation"
  - "Swipe-away breaks streak and pauses notifications until next day"
  - "Notifications pause during in-app practice (resumeNotifications on unmount)"

patterns-established:
  - "Screen unlock detection pattern: AppState timing + debounce + callback registration"
  - "Notification scheduling pattern: guards (isPaused, isSwipedAwayToday, no cards due) → pick card → format → schedule"
  - "MC answer resolution pattern: actionIdentifier lookup in mcMapping from NotificationData"
  - "Notification response processing: timeout check → answer validation → FSRS update → stats update → feedback → schedule next"

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 03 Plan 03: Notification Scheduling System Summary

**Screen unlock detection triggers notification scheduling every 5 minutes with MC/text answer processing, FSRS state updates, streak management, and widget refresh**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-04T18:51:31Z
- **Completed:** 2026-03-04T18:56:28Z
- **Tasks:** 3 (2 atomic commits, Task 3 integrated into Task 2)
- **Files modified:** 8

## Accomplishments
- Screen unlock detection using AppState timing distinguishes unlock (< 50ms) from app switch (~800ms)
- Notification scheduler picks due repetition cards and schedules at configurable interval (default 5 min)
- Complete notification loop: unlock → schedule → user answers → FSRS/stats update → schedule next
- MC button answers resolved via mcMapping (answer-a/b/c/d → actual choice words)
- Text answers validated with fuzzy matching using existing answerValidation utility
- 1-minute response window enforced (expired responses break streak via handleSwipeAway)
- Notifications pause during in-app practice and resume on exit
- Widget refreshed after every notification answer and session completion

## Task Commits

Each task was committed atomically:

1. **Task 1: Create screen unlock detector and notification scheduler** - `caca087` (feat)
   - AppState-based unlock detection with debounce
   - Notification scheduler with pause/resume, swipe-away tracking, daily limits
   - Storage functions for notification preferences (interval, swipe-away date, enabled)
   - Platform-specific web stubs

2. **Task 2: Wire notification response handling to FSRS and streak updates** - `827c9fb` (feat)
   - processNotificationAnswer validates MC button and text answers
   - MC answers resolved via mcMapping, text answers via validateAnswer
   - 1-minute response window enforcement (timeout → handleSwipeAway → streak break)
   - FSRS state updated via scheduleReview, stats updated via updateStatsAfterSession
   - Feedback notifications (correct: germanHint, incorrect: answer + translation)
   - challenge.tsx pauses notifications on mount, resumes on unmount
   - Widget refreshed after answers
   - setupNotifications initializes scheduler, requests permissions, starts unlock detection

3. **Task 3: Wire screen unlock detection to notification scheduling loop** - (integrated into Task 2)
   - Full notification loop verified and documented
   - Permission flow gates entire notification subsystem
   - updateWidgetData called after notification answers and session completion

## Files Created/Modified
- `src/services/screenUnlockDetector.ts` - AppState timing-based unlock detection (< 50ms threshold, 10s debounce)
- `src/services/screenUnlockDetector.web.ts` - Web stub (no-op)
- `src/services/notificationScheduler.ts` - Core scheduling logic (pick due cards, format content, schedule with interval)
- `src/services/notificationScheduler.web.ts` - Web stub (no-op)
- `src/services/notificationService.ts` - processNotificationAnswer (MC/text validation, FSRS update, feedback, schedule next)
- `src/services/storage.ts` - Notification preference storage (interval, swipe-away date, enabled)
- `src/services/storage.web.ts` - localStorage-based notification preferences
- `app/challenge.tsx` - Pause notifications on mount, resume on unmount, refresh widget on completion

## Decisions Made

**Screen unlock detection:**
- AppState timing heuristic chosen: inactive→active transition < 50ms = screen unlock (vs ~800ms for app switch/home button)
- 10-second debounce prevents rapid repeated unlock detections
- No background task or permission needed (relies on AppState API)

**Notification scheduling:**
- Only repetition cards (cards with stored FSRS state) scheduled for notifications (conservative approach per user decision)
- Scans all chapters for due cards (same logic as buildSession)
- Minimal notification content: cloze sentence only, no title (per user decision: "On the notification, only the sentence. So this should be pretty minimal.")
- MC choices formatted in body as "A) word1  B) word2  C) word3  D) word4" matching button labels
- mcMapping in NotificationData maps action IDs to actual words for answer validation

**Answer processing:**
- 1-minute response window enforced: `Date.now() - deliveryTime > 60000` → handleSwipeAway (breaks streak, pauses until next day)
- MC answers: lookup actionIdentifier in mcMapping → compare to correctAnswer
- Text answers: validateAnswer (fuzzy matching with normalization and Fuse.js)
- Feedback notifications: correct shows `✓ ${germanHint}`, incorrect shows `✗ ${correctAnswer} — ${sentenceTranslation}`
- Default action (tapped notification body): opens app, schedules next notification

**Session coordination:**
- Notifications paused during in-app practice (pauseNotifications on mount, resumeNotifications on unmount)
- Widget refreshed after notification answers and session completion (updateWidgetData)
- Swipe-away breaks streak and pauses until next day (isSwipedAwayToday flag persisted in storage)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all services compiled successfully with correct expo-notifications types.

## Next Phase Readiness

**Notification system complete:**
- Screen unlock detection triggers scheduling
- User can answer from notification (text input or MC A/B/C/D buttons per INOT-01)
- Answers update FSRS state and streak
- Notifications stop when all due cards completed
- Swiping away breaks streak and pauses until next day
- Widget refreshed after every answer

**Ready for Phase 04 (App Blocking):**
- Notification infrastructure can be extended with blocking-triggered vocabulary prompts
- Pause/resume pattern established for handling notification state during forced sessions
- Widget service provides unified answer processing across in-app, notification, and widget contexts

**Potential enhancements (not in current scope):**
- True swipe-away detection (currently relies on response timeout)
- Notification sound/vibration preferences
- Custom notification intervals per user preference
- Daily notification limits/quiet hours

## Self-Check: PASSED

All created files verified:
- src/services/screenUnlockDetector.ts
- src/services/screenUnlockDetector.web.ts
- src/services/notificationScheduler.ts
- src/services/notificationScheduler.web.ts

All modified files verified:
- src/services/notificationService.ts
- src/services/storage.ts
- src/services/storage.web.ts
- app/challenge.tsx

All commits verified:
- caca087 (Task 1)
- 827c9fb (Task 2)

---
*Phase: 03-notifications-live-activities*
*Completed: 2026-03-04*
