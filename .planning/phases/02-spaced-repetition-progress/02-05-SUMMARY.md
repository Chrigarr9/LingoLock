---
phase: 02-spaced-repetition-progress
plan: 05
subsystem: ui
tags: [react-native, expo, mmkv, fsrs, expo-router, useFocusEffect]

# Dependency graph
requires:
  - phase: 02-spaced-repetition-progress
    provides: "statsService (getStreak, getChapterMastery, getCardsDueCount, getCurrentChapterNumber) and content bundle (getTotalCards)"
provides:
  - "Home screen wired to real MMKV-persisted streak, chapter mastery %, and cards-due count"
  - "Stats refresh reactively via useFocusEffect when user returns from challenge"
  - "placeholderVocabulary.ts marked @deprecated — no longer imported by any screen"
  - "Language badge updated to SPANISH; greeting updated to ¡Hola!"
affects: [03-content-management, 05-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useFocusEffect pattern for refreshing derived stats when screen re-gains focus"
    - "Pluralization inline: {streak} {streak === 1 ? 'day' : 'days'}"
    - "Dynamic progress bar width via template literal: width={`${chapterProgress}%`}"

key-files:
  created: []
  modified:
    - app/index.tsx
    - src/data/placeholderVocabulary.ts

key-decisions:
  - "useFocusEffect + useCallback chosen over useEffect so stats update every time user returns from challenge, not just on mount"
  - "Cards-due label toggles between 'All caught up!' (0 due) and 'Review ready' (>0 due) for motivational feedback"
  - "placeholderVocabulary.ts kept (not deleted) with @deprecated JSDoc — avoids breaking any tutorial/test references"

patterns-established:
  - "Focus-refresh pattern: useFocusEffect wrapping stat-loading callbacks on dashboard screens"

requirements-completed: [PROG-02, PROG-04, PROG-06]

# Metrics
duration: 5min
completed: 2026-03-02
---

# Phase 2 Plan 05: Wire Home Screen to Real Stats Summary

**Home screen now shows live streak, chapter mastery %, and cards-due count from MMKV/FSRS — stats refresh on every return from challenge via useFocusEffect**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-02T22:24:00Z
- **Completed:** 2026-03-02T23:30:00Z
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify)
- **Files modified:** 2

## Accomplishments
- Home screen imports replaced: removed `placeholderVocabulary`, added `statsService` and content `bundle`
- All stat values (streak, chapter mastery, cards due) now sourced from MMKV-persisted FSRS state
- Stats refresh reactively whenever user returns from challenge screen via `useFocusEffect`
- Language badge updated from GERMAN to SPANISH; greeting updated from "Hallo!" to "¡Hola!"
- `placeholderVocabulary.ts` deprecated with `@deprecated` JSDoc — kept for reference, no longer imported
- End-to-end Phase 2 flow verified on device by human: cloze cards, FSRS scheduling, stats persistence, deep link integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire home screen to real stats** - `410a2d8` (feat)
2. **Task 2: Verify end-to-end Phase 2 flow** - checkpoint:human-verify (approved — no code commit)

**Plan metadata:** (docs commit — see final commit hash)

## Files Created/Modified
- `app/index.tsx` - Home screen wired to real stats via statsService + content bundle; useFocusEffect for reactive refresh
- `src/data/placeholderVocabulary.ts` - Marked @deprecated; no longer imported by any screen

## Decisions Made
- `useFocusEffect` + `useCallback` chosen over `useEffect` so stats update every time the user returns from the challenge screen (not just on initial mount)
- "All caught up!" / "Review ready" label driven by `cardsDue === 0` check — motivational feedback for users who have cleared their queue
- `placeholderVocabulary.ts` kept (not deleted) to avoid breaking any test or tutorial references; @deprecated JSDoc documents its status

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 2 (Spaced Repetition & Progress) is now fully complete:
- 02-01: Data Foundation (ClozeCard types + content bundle)
- 02-02: Storage & FSRS Services (MMKV persistence, scheduling)
- 02-03: Card Selector & Stats Services (session composition, streak tracking)
- 02-04: Challenge Screen (cloze format, FSRS-driven flow)
- 02-05: Home Screen Wired to Real Stats

Ready for Phase 3 (Content Management / Anki import) or Phase 4 (Native Screen Time integration), depending on roadmap priority.

---
*Phase: 02-spaced-repetition-progress*
*Completed: 2026-03-02*
