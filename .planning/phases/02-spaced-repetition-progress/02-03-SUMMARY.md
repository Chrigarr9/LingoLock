---
phase: 02-spaced-repetition-progress
plan: 03
subsystem: services
tags: [spaced-repetition, fsrs, session-building, streak, chapter-mastery, jest, ts-jest, tdd]

# Dependency graph
requires:
  - phase: 02-01
    provides: ClozeCard types, ChapterData, content bundle (CHAPTERS, getChapterCards)
  - phase: 02-02
    provides: FSRS service (isDue, isCardMastered, getAnswerType), storage service (loadCardState, loadAllCardStates, loadStats, saveStats)
provides:
  - buildSession(): SessionCard[] — due-first priority, new word fill, guaranteed 1 new per session
  - handleWrongAnswer(): immutable re-insertion at currentIndex+4
  - getCurrentChapter(): first chapter below 80% mastery threshold
  - updateStatsAfterSession(): streak, totals, per-app stats update
  - getStreak(): returns 0 for stale streaks (> 1 day old)
  - getSuccessRate(): rounded integer percentage
  - getChapterMastery(chapterNumber): percentage of chapter cards in Review state
  - getCardsDueCount(): count of FSRS-due cards
  - getCurrentChapterNumber(): delegates to cardSelector
affects: [phase 03, phase 04, phase 05, challenge-screen, stats-ui, session-controller]

# Tech tracking
tech-stack:
  added: [jest@30, ts-jest@29, @types/jest, jest.config.js, __mocks__/react-native-mmkv.js, __mocks__/react-native.js]
  patterns: [TDD red-green, service mocking with jest.mock, immutable queue operations, Fisher-Yates shuffle]

key-files:
  created:
    - src/services/cardSelector.ts
    - src/services/cardSelector.test.ts
    - src/services/statsService.ts
    - src/services/statsService.test.ts
    - jest.config.js
    - __mocks__/react-native-mmkv.js
    - __mocks__/react-native.js
  modified:
    - package.json

key-decisions:
  - "Jest 30 + ts-jest 29 with diagnostics:false — allows test files to import not-yet-existing modules during RED phase without TS compilation blocking test runner"
  - "at-least-1-new guarantee: maxDue = cardCount - 1, always reserves 1 slot for new word, new word comes from current chapter first (or overflow to next)"
  - "handleWrongAnswer inserts at min(currentIndex + 4, queue.length) — 4 positions ahead or append at end"
  - "getStreak returns 0 for stale streaks (lastSessionDate > yesterday) — shows reality; updateStatsAfterSession resets on next session start"
  - "getCurrentChapterNumber delegates to cardSelector.getCurrentChapter — single source of truth"
  - "MMKV mock uses in-memory Map — createMMKV() factory returns Map-backed store for clean test isolation"

patterns-established:
  - "Jest service mock pattern: jest.mock('./dependency', () => ({ fn: jest.fn() })) at top of test file before imports"
  - "Streak date comparison: ISO date string slice(0,10) comparison — no date library needed"
  - "TDD RED: commit test before implementation so RED phase is preserved in git history"

requirements-completed: [CARD-04, CARD-05, CARD-11, PROG-01, PROG-02, PROG-03, PROG-04, PROG-05, PROG-06, PROG-07]

# Metrics
duration: 5min
completed: 2026-03-02
---

# Phase 2 Plan 3: Card Selector & Stats Service Summary

**FSRS session builder with due-first priority, 1-new guarantee, wrong-answer reinsertion, and streak/mastery stats — all tested with Jest TDD (32 tests pass)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-02T22:07:17Z
- **Completed:** 2026-03-02T22:12:00Z
- **Tasks:** 2 (4 commits: 2 RED + 2 GREEN)
- **Files modified:** 8 (4 new services/tests, jest config, 2 mocks, package.json)

## Accomplishments

- `cardSelector.ts`: session queue builder with due-first priority, new-word overflow across chapters, guaranteed 1 new word per session, wrong-answer re-insertion at +4 positions, Fisher-Yates shuffle for MC choices
- `statsService.ts`: streak tracking (consecutive days, gap reset, stale-streak return 0), success rate, chapter mastery from FSRS state, per-app session/card counting, cards-due count
- Jest test infrastructure established: jest + ts-jest + MMKV mock + React Native mock, 32 tests pass across both services

## Task Commits

Each task was committed atomically (TDD = RED then GREEN):

1. **Task 1 RED: cardSelector tests** - `fead3c6` (test)
2. **Task 1 GREEN: cardSelector implementation** - `440b8a3` (feat)
3. **Task 2 RED: statsService tests** - `44657c5` (test)
4. **Task 2 GREEN: statsService implementation** - `96a178c` (feat)

## Files Created/Modified

- `src/services/cardSelector.ts` — Session builder (buildSession, handleWrongAnswer, getCurrentChapter)
- `src/services/cardSelector.test.ts` — 12 tests covering all session scenarios and edge cases
- `src/services/statsService.ts` — Stats computation (streak, success rate, mastery, per-app)
- `src/services/statsService.test.ts` — 20 tests covering streak logic, mastery, success rate
- `jest.config.js` — Jest + ts-jest config with MMKV and RN module mappers
- `__mocks__/react-native-mmkv.js` — In-memory Map-backed MMKV mock
- `__mocks__/react-native.js` — Minimal React Native mock
- `package.json` — Added `test` script + jest/ts-jest dev dependencies

## Decisions Made

- **diagnostics: false in ts-jest**: Allows test files to reference modules that don't exist yet during TDD RED phase, so tests can run and fail at "module not found" level (true RED) rather than at TypeScript compilation
- **at-least-1-new guarantee**: `maxDue = cardCount - 1` always reserves one slot for a new word; this ensures learner always encounters something new each session (prevents pure review mode)
- **getStreak returns 0 for stale**: When lastSessionDate is > 1 day ago, return 0 (reality) not stored value — UI should show broken streak immediately
- **Chapter overflow for new words**: New cards are collected from current chapter first, then subsequent chapters in order — gives learner natural chapter progression

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Set up Jest test infrastructure (no test runner existed)**
- **Found during:** Task 1 setup
- **Issue:** No Jest config or test scripts in project; plan required `npx jest` to work
- **Fix:** Installed jest@30, ts-jest@29, @types/jest; created jest.config.js with ts-jest preset and module mappers for react-native and MMKV; added `__mocks__/` directory with mocks; added `test` script to package.json
- **Files modified:** jest.config.js, __mocks__/react-native-mmkv.js, __mocks__/react-native.js, package.json
- **Verification:** `npx jest --no-coverage` runs and all 32 tests pass
- **Committed in:** fead3c6 (Task 1 RED commit)

---

**Total deviations:** 1 auto-fixed (blocking infrastructure setup)
**Impact on plan:** Required setup — no test infrastructure existed yet. No scope creep.

## Issues Encountered

- ts-jest strict TypeScript mode caused implicit `any` type errors in test lambdas (.filter(sc => ...)) before the implementation modules existed — resolved by setting `diagnostics: false` in ts-jest config, which allows tests to run against missing modules for proper RED behavior

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- cardSelector and statsService are the core business logic for Phase 2
- Ready to wire into: challenge screen session controller, stats UI, home screen progress display
- Phase 2 Plan 4+ can import buildSession, handleWrongAnswer from cardSelector; updateStatsAfterSession, getStreak etc. from statsService
- No blockers

---
*Phase: 02-spaced-repetition-progress*
*Completed: 2026-03-02*

## Self-Check: PASSED

- FOUND: src/services/cardSelector.ts
- FOUND: src/services/cardSelector.test.ts
- FOUND: src/services/statsService.ts
- FOUND: src/services/statsService.test.ts
- FOUND: jest.config.js
- FOUND commit: fead3c6
- FOUND commit: 440b8a3
- FOUND commit: 44657c5
- FOUND commit: 96a178c
- Tests: 32 passed, 0 failed
