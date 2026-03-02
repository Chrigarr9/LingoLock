---
phase: 02-spaced-repetition-progress
plan: "04"
subsystem: ui
tags: [react-native, expo, fsrs, cloze-card, spaced-repetition, vocabulary]

# Dependency graph
requires:
  - phase: 02-spaced-repetition-progress
    plan: "01"
    provides: ClozeCard and SessionCard types in src/types/vocabulary.ts
  - phase: 02-spaced-repetition-progress
    plan: "02"
    provides: scheduleReview, createNewCardState, saveCardState, loadCardState services
  - phase: 02-spaced-repetition-progress
    plan: "03"
    provides: buildSession, handleWrongAnswer, updateStatsAfterSession services

provides:
  - ClozeCardDisplay component (sentence with blank + German hint before answer; highlighted word after)
  - AnswerReveal component (German sentence translation + POS grammar note post-answer)
  - Fully rewritten challenge.tsx using FSRS-driven session — no placeholder data

affects:
  - Phase 3 (Anki import): ClozeCard.image/audio stubs ready for population
  - Phase 4 (Screen Time / App Blocking): challenge.tsx UX patterns
  - Home screen StatsCard (already using statsService)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - FSRS answer cycle: loadCardState → createNewCardState (if null) → scheduleReview → saveCardState
    - Wrong-answer queue mutation: handleWrongAnswer returns new array; originalCardCount.current tracks initial length
    - Dynamic expo-av require with `as any` to avoid missing @types/expo-av at compile time
    - Auto-advance timer: setTimeout(advanceToNext, 1500ms) with cleanup in useEffect

key-files:
  created:
    - src/components/ClozeCard.tsx
    - src/components/AnswerReveal.tsx
  modified:
    - app/challenge.tsx

key-decisions:
  - "createNewCardState() used when loadCardState returns null (first-time cards) before calling scheduleReview"
  - "AUTO_ADVANCE_MS set to 1500ms (vs 500ms in Phase 1) to give user time to read the AnswerReveal"
  - "expo-av audio stub uses dynamic require with any type — avoids requiring @types/expo-av until Phase 3"
  - "originalCardCount.current ref tracks initial session size so ProgressDots never grows with wrong-answer re-insertions"

patterns-established:
  - "FSRS update pattern: loadCardState → createNewCardState fallback → scheduleReview → saveCardState"
  - "Session integrity: originalCardCount.current set once in useEffect mount, used for all progress/completion checks"
  - "Cloze rendering: sentence.split('_____') produces prefix/suffix parts; blank shown as underlined before answer"

requirements-completed: [CARD-02, CARD-03, CARD-04, CARD-05, CARD-06, CARD-07, CARD-08, CARD-09, CARD-10, CARD-11]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 2 Plan 04: Challenge Screen — Cloze + FSRS Summary

**FSRS-driven cloze challenge screen with ClozeCardDisplay (blank + German hint), AnswerReveal (German translation + grammar), and full MC2/MC4/Text answer flow replacing Phase 1 placeholder cards**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T22:16:32Z
- **Completed:** 2026-03-02T22:19:52Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 rewritten)

## Accomplishments

- ClozeCardDisplay replaces VocabularyCard in challenge flow: renders Spanish sentence with blank + lightbulb German hint before answer; full sentence with green/red word highlight after
- AnswerReveal shows Italian/German sentence translation (italic) + POS and contextNote grammar label below the card post-answer
- challenge.tsx fully rewritten: buildSession() replaces PLACEHOLDER_CARDS, three answer modes (MC2/MC4/Text) driven by SessionCard.answerType, wrong answers re-inserted via handleWrongAnswer, FSRS state updated on every answer, stats updated on session completion
- CARD-09/CARD-10 stubs ready: ClozeCardDisplay conditionally renders image (Image component) and audio (expo-av dynamic require) when card.image/card.audio are truthy — currently all pipeline content omits these fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ClozeCard display and AnswerReveal components** - `4e58640` (feat)
2. **Task 2: Rewrite challenge screen for FSRS-driven cloze flow** - `540cfae` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/components/ClozeCard.tsx` — ClozeCardDisplay component: cloze sentence with blank, German hint, answer type indicator, conditional image/audio stubs
- `src/components/AnswerReveal.tsx` — Post-answer reveal: German sentence translation + POS/contextNote grammar note
- `app/challenge.tsx` — Fully rewritten: FSRS session building, three answer modes, wrong-answer re-insertion, auto-advance, stats update on completion

## Decisions Made

- `createNewCardState()` called as fallback when `loadCardState` returns null, ensuring new cards are properly initialized before `scheduleReview` is called on them
- `AUTO_ADVANCE_MS` increased from 500ms (Phase 1) to 1500ms to give user time to read the AnswerReveal German translation
- `expo-av` audio stub uses `require('expo-av') as any` (dynamic, not static import) to avoid compile-time errors when expo-av is not yet installed — will be used in Phase 3 Anki import
- `originalCardCount.current` ref (set once at session init) used for all progress tracking so ProgressDots total stays fixed even when wrong-answer re-insertions grow the queue

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript check of individual `.tsx` files via `npx tsc --noEmit file.tsx` reported false `--jsx` flag errors (artifact of file-level invocation without tsconfig). Used project-wide `npx tsc --noEmit` for verification instead — confirmed clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full FSRS learning loop is now complete: session building → card display → answer validation → FSRS scheduling → stats persistence
- ClozeCard image/audio stubs (CARD-09/CARD-10) are in place for Phase 3 Anki .apkg import
- Phase 2 is now functionally complete pending the stats/home screen display (Plan 02-05 if it exists) or Phase 3

---
*Phase: 02-spaced-repetition-progress*
*Completed: 2026-03-02*
