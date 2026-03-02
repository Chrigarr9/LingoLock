---
phase: 02-spaced-repetition-progress
plan: 01
subsystem: content-pipeline
tags: [typescript, python, pipeline, cloze-cards, fsrs, content-bundle]

# Dependency graph
requires:
  - phase: 01-shortcuts-integration
    provides: VocabularyCard and ChallengeParams types in src/types/vocabulary.ts
provides:
  - ClozeCard, ChapterData, CardState, SessionCard, PersistedStats types in src/types/vocabulary.ts
  - scripts/build-content.ts — build-time transform from pipeline JSON to TypeScript bundle
  - src/content/bundle.ts — auto-generated typed content with 111 cloze cards across 2 chapters
  - Fixed pipeline examples filtering (sentences now contain the target word)
affects: [03-anki-import, fsrs-scheduling, card-selection, challenge-ui, 02-02, 02-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Build-time codegen pattern: scripts/ directory for content transforms, output to src/content/
    - ClozeCard as core Phase 2 vocabulary data type
    - Distractor generation: same POS first, then CEFR proximity within ±1 level
    - Cloze sentence creation via regex case-insensitive first-occurrence replacement

key-files:
  created:
    - scripts/build-content.ts
    - src/content/bundle.ts
  modified:
    - spanish-content-pipeline/pipeline/vocabulary_builder.py
    - src/types/vocabulary.ts
    - package.json

key-decisions:
  - "Build-time codegen instead of runtime parsing: bundle.ts is pre-generated, no JSON parsing at app startup"
  - "ClozeCard.id format: {lemma}-ch{chapter:02d}-s{sentenceIndex:02d} for stable, human-readable IDs"
  - "Fixed pipeline bug in BOTH code paths (first-occurrence and duplicate accumulation), not just one"
  - "Distractors use vocabPool with same-POS preference and CEFR proximity (±1 level) as fallback"

patterns-established:
  - "Content pipeline pattern: Python generates chapter JSON → TypeScript script transforms to bundle.ts"
  - "Type extension pattern: Phase 2 types appended to vocabulary.ts after Phase 1 types with separator comment"
  - "Generated file header: AUTO-GENERATED comment + date + source path prevents accidental edits"

requirements-completed: [CARD-02, CARD-09, CARD-10, OFFL-01]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 02 Plan 01: Data Foundation Summary

**ClozeCard type system and build-time pipeline-to-bundle transform generating 111 typed cloze cards with distractors from 2 Spanish chapters**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T22:01:15Z
- **Completed:** 2026-03-02T22:04:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Fixed pipeline examples bug in vocabulary_builder.py — word examples now filtered to sentences actually containing the word (fix applied to both first-occurrence and duplicate accumulation paths)
- Defined 5 new Phase 2 TypeScript types: ClozeCard, ChapterData, CardState, SessionCard, PersistedStats
- Created scripts/build-content.ts — reads pipeline chapter JSON, generates typed bundle.ts with cloze sentences, German hints, CEFR levels, and distractors
- Generated src/content/bundle.ts with 111 cards (56 ch1 + 55 ch2), all type-checking cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix pipeline examples bug + Define Phase 2 types** - `66cb266` (feat)
2. **Task 2: Create build-time content transform script** - `2ea55fa` (feat)

## Files Created/Modified
- `spanish-content-pipeline/pipeline/vocabulary_builder.py` - Fixed examples filtering in both first-occurrence and duplicate accumulation loops
- `src/types/vocabulary.ts` - Added ClozeCard, ChapterData, CardState, SessionCard, PersistedStats interfaces
- `scripts/build-content.ts` - Build-time transform: pipeline JSON → typed TypeScript content bundle
- `src/content/bundle.ts` - Auto-generated: 111 cloze cards across 2 chapters with distractors
- `package.json` - Added build:content npm script

## Decisions Made
- Fixed BOTH code paths in vocabulary_builder.py (first-occurrence at line 78 and duplicate accumulation at line 89-91), not just the one specified in the plan — the bug affected both paths equally
- Used build-time codegen (vs. runtime JSON parsing): bundle.ts ships as TypeScript, no fs/JSON at runtime
- ClozeCard ID format `{lemma}-ch{chapter:02d}-s{sentenceIndex:02d}` provides stable, human-readable IDs for FSRS storage keys
- Distractor selection order: CEFR-close same-POS → remaining same-POS → any POS (fallback for sparse vocab)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pipeline bug in first-occurrence path (not just duplicate path)**
- **Found during:** Task 1 (Fix pipeline examples bug)
- **Issue:** Plan specified fixing only the duplicate accumulation loop, but the first-occurrence path at line 78 (`examples=list(chapter.sentences)`) had the same bug — it also added ALL chapter sentences regardless of whether the word appeared
- **Fix:** Changed `examples=list(chapter.sentences)` to `examples=[s for s in chapter.sentences if word.source.lower() in s.source.lower()]`
- **Files modified:** spanish-content-pipeline/pipeline/vocabulary_builder.py
- **Verification:** Both code paths now filter correctly
- **Committed in:** 66cb266 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed bad JavaScript `in` operator usage in build script**
- **Found during:** Task 2 (first script run)
- **Issue:** Accidentally wrote `word.source.toLowerCase() in ''` (JS `in` operator for object key check) instead of string `.includes()` method
- **Fix:** Removed the incorrect condition, used only `s.source.toLowerCase().includes(word.source.toLowerCase())`
- **Files modified:** scripts/build-content.ts
- **Verification:** Script runs successfully, generates 111 cards
- **Committed in:** 2ea55fa (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bug fixes)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- The "cemento" word in chapter 1 does not appear in any sentence (likely a data quality issue in the pipeline output — the word annotation has source "cemento" but the sentence about Recoleta cemetery uses "cementerio"). Logged as 1 skipped card. Non-blocking.

## Next Phase Readiness
- ClozeCard types and content bundle ready for FSRS scheduling (02-02)
- Bundle exports CHAPTERS, ALL_CARDS, getCardById, getChapterCards, getTotalCards
- Re-run `npm run build:content` after adding more chapters to pipeline output
- When Phase 3 Anki import runs, ClozeCard.image and ClozeCard.audio stubs are ready to populate

## Self-Check: PASSED

---
*Phase: 02-spaced-repetition-progress*
*Completed: 2026-03-02*
