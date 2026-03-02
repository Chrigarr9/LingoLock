---
phase: 02-spaced-repetition-progress
plan: 02
subsystem: database
tags: [ts-fsrs, react-native-mmkv, spaced-repetition, storage, fsrs, nitro-modules]

# Dependency graph
requires: []
provides:
  - ts-fsrs, react-native-mmkv, react-native-nitro-modules installed as dependencies
  - MMKV singleton storage instances (cardStorage, statsStorage) for synchronous persistence
  - Card state CRUD: saveCardState, loadCardState, loadAllCardStates, deleteCardState
  - Stats persistence: saveStats, loadStats with default fallback
  - FSRS scheduler wrapper: scheduleReview, getAnswerType, isCardMastered, createNewCardState, isDue
  - Answer type graduation logic: stability < 1.5 = mc2, < 4.0 = mc4, >= 4.0 = text
affects:
  - 02-03-card-selector
  - 02-04-challenge-session
  - 02-05-stats-screen

# Tech tracking
tech-stack:
  added:
    - ts-fsrs@^5.2.3 (pure TypeScript FSRS spaced repetition algorithm)
    - react-native-mmkv@^4.1.2 (synchronous key-value storage via Nitro Modules)
    - react-native-nitro-modules@^0.34.1 (MMKV v4 peer dependency)
  patterns:
    - Module-level singleton pattern for FSRS scheduler (created once, never per call)
    - ISO string serialization pattern for Date fields in MMKV (Date objects only for ts-fsrs calls)
    - Two-storage pattern: separate MMKV instances for card states vs stats
    - Null-safe card state pattern: loadCardState returns null for unseen cards

key-files:
  created:
    - src/services/storage.ts
    - src/services/fsrs.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "MMKV v4 uses createMMKV() factory, not new MMKV() constructor — v3 API incompatible"
  - "MMKV v4 uses remove(key) method, not delete(key) for key deletion"
  - "ts-fsrs Card.learning_steps not persisted in CardState; set to 0 on deserialization (ts-fsrs recomputes from state)"
  - "Binary rating only: Rating.Good (correct) and Rating.Again (incorrect); no Hard/Easy per design decision"
  - "Stability thresholds: < 1.5 = mc2, < 4.0 = mc4, >= 4.0 = text (matches plan spec)"
  - "Mastery = State.Review (value 2): card has survived at least one full review cycle"

patterns-established:
  - "Services pattern: src/services/ for stateful business logic (storage, algorithms)"
  - "Serialization boundary: ISO strings at rest in MMKV, Date objects only when calling ts-fsrs"
  - "Null-safe state loading: loadCardState returns null for new cards, getAnswerType accepts null"

requirements-completed: [CARD-01, CARD-08, OFFL-02, OFFL-03]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 2 Plan 02: Storage & FSRS Services Summary

**MMKV synchronous storage layer and ts-fsrs scheduler wrapper with mc2/mc4/text graduation via stability thresholds**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T22:01:07Z
- **Completed:** 2026-03-02T22:04:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Installed ts-fsrs, react-native-mmkv, and react-native-nitro-modules as dependencies
- Created MMKV storage service with synchronous CRUD for card FSRS states and user stats
- Created FSRS scheduler wrapper with answer type graduation, mastery detection, and safe ISO string serialization

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies** - `34b5932` (chore)
2. **Task 2: Create MMKV storage service + FSRS scheduler service** - `bad6edd` (feat)

**Plan metadata:** `295f308` (docs: complete plan)

## Files Created/Modified

- `package.json` - Added ts-fsrs@^5.2.3, react-native-mmkv@^4.1.2, react-native-nitro-modules@^0.34.1
- `src/services/storage.ts` - MMKV singletons (cardStorage, statsStorage) + CRUD functions (114 lines)
- `src/services/fsrs.ts` - FSRS scheduler wrapper with serialization helpers and graduated answer types (138 lines)

## Decisions Made

- MMKV v4 API uses `createMMKV()` factory (not `new MMKV()`) and `remove(key)` (not `delete(key)`) — discovered and fixed during implementation.
- `Card.learning_steps` from ts-fsrs is not persisted in `CardState` because it is recomputed internally by ts-fsrs from the card's state on each call. Set to 0 during deserialization.
- Stability thresholds for answer graduation: 1.5 and 4.0 as specified in the plan. These values balance progression speed with appropriate difficulty exposure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed MMKV v4 delete method name**
- **Found during:** Task 2 (Create MMKV storage service)
- **Issue:** Plan showed `storage.delete(key)` but MMKV v4 uses `storage.remove(key)` — TypeScript type error TS2339
- **Fix:** Changed `cardStorage.delete(cardId)` to `cardStorage.remove(cardId)` in `deleteCardState()`
- **Files modified:** src/services/storage.ts
- **Verification:** `npx tsc --noEmit src/services/storage.ts` passes with no src/ errors
- **Committed in:** bad6edd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - API bug)
**Impact on plan:** Necessary fix for correct MMKV v4 API usage. No scope creep.

## Issues Encountered

- Pre-existing TypeScript type conflicts between React Native globals, Node.js types, and TypeScript DOM lib in `node_modules` — these are pre-existing in the project and do not affect our source files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All infrastructure for spaced repetition is in place: storage layer + scheduling algorithm
- 02-03 (card selector) and 02-04 (challenge session) can now use `loadCardState`, `scheduleReview`, and `getAnswerType` directly
- Both services type-check cleanly; no known blockers

---
*Phase: 02-spaced-repetition-progress*
*Completed: 2026-03-02*
