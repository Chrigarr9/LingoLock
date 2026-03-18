# Phase 3: Notifications & Live Activities - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

User receives timed vocabulary reminders via notifications and can interact with Lock Screen widget. Enables consistent vocabulary practice moments through iOS notifications (when screen unlocked) and Lock Screen/Home Screen widgets (always-on practice sessions).

</domain>

<decisions>
## Implementation Decisions

### Notification Timing & Frequency
- **Detection method:** Trigger notifications when screen is unlocked
- **Interval:** Send notification every 5 minutes when screen is unlocked
- **Configurable:** Notification interval must be configurable in settings (user preference)
- **In-app pause:** No notifications while user is in practice session
- **Streak loss:** Swiping away notification breaks streak and pauses notifications until next day
- **Resume logic:** After swipe-away, notifications resume the next day (not same day)
- **Daily limit:** Notifications stop when all due cards (per FSRS) are completed (natural limit, no artificial cap)
- **Response window:** Notification only counts if answered within 1 minute of delivery

### Interactive Notification Design
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

### Live Activity Presentation (Lock Screen & Home Screen)
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

### Notification Content Strategy
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

</decisions>

<specifics>
## Specific Ideas

- **Minimal notification design:** "On the notification, only the sentence. So this should be pretty minimal."
- **No app opening:** "Basically the user should not need to open the app. You just pull it down, type the answer, and then back."
- **Widget as full session:** "On the lock screen we have an always on lock screen widget. And on this widget you could basically do the whole practice session. So it always there, it always has vocabulary and you just go through it just as on the practice session."
- **Configuration flexibility:** "If we only want to show... Or also new vocabulary on lock screen card. Maybe that's configurable as well."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-notifications-live-activities*
*Context gathered: 2026-03-04*
