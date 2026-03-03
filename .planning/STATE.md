---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-03T18:26:32.514Z"
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 12
  completed_plans: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Vokabeln müssen zum User kommen, nicht umgekehrt — Lernen wird automatisch in den Alltag integriert durch intelligentes App-Blocking, ohne dass der User aktiv eine Lern-Session starten muss.
**Current focus:** Phase 2 - Spaced Repetition & Progress

## Current Position

Phase: 2 of 4 (2-spaced-repetition-progress)
Plan: 5 of 5 in current phase
Status: Phase 2 complete
Last activity: 2026-03-02 — Completed 02-05-PLAN.md (Home Screen Wired to Real Stats)

Progress: [██████░░░░] ~60%

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 4 min
- Total execution time: 0.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1-shortcuts-integration | 7 | 28min | 4min |
| 2-spaced-repetition-progress | 5 | 19min | 3.8min |

**Recent Trend:**
- Last 3 plans: 02-03 (5min), 02-04 (3min), 02-05 (5min)
- Trend: Excellent velocity, tasks well-scoped

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- React Native + Expo chosen for iOS development without Mac
- Native Modules required for Screen Time API (FamilyControls framework)
- Anki .apkg import as content strategy (no preinstalled decks)
- FSRS spaced repetition algorithm (scientifically validated)
- Offline-first architecture (no cloud sync in v1)

**From Plan 1-01 (Expo SDK 55 Upgrade):**
- Expo SDK 55 enables React Native 0.83 with New Architecture by default
- Development build required for custom URL schemes (doesn't work in Expo Go)
- Generated native iOS project excluded from git via .gitignore (regenerated via prebuild)
- Created placeholder assets for initial development (to be replaced with final designs)
- Use expo prebuild to generate native projects (don't commit ios/ or android/ directories)
- Development build workflow: expo run:ios instead of expo start --ios
- Custom URL schemes configured in app.json, propagated to native projects via prebuild

**From Plan 1-02 (Vocabulary Data Structure):**
- VocabularyCard schema includes optional media/tags/deckId for Phase 3 expansion
- Placeholder cards include German articles (der/die/das) for realistic testing
- Added ES2015+ lib to tsconfig for modern array methods (find, etc.)
- Established src/types/ pattern for TypeScript definitions
- Established src/data/ pattern for static/placeholder data

**From Plan 1-03 (Deep Link Infrastructure):**
- Use Expo Linking API for cross-platform deep link handling
- Validate all URL parameters before parsing (hostname, required params, value ranges)
- Handle both cold start (getInitialURL) and background (addEventListener) scenarios
- Override Expo tsconfig module setting to fix TypeScript 5.3 compatibility
- ChallengeParams interface now includes source, count, type fields for deep linking
- Established src/utils/ pattern for utility functions
- Established src/hooks/ pattern for custom React hooks

**From Plan 1-04 (Challenge Screen UI):**
- VocabularyCard uses iOS system colors (#34c759 green, #ff3b30 red) for answer feedback
- Challenge screen presented as fullScreenModal with headerShown: false for immersive experience
- Emergency escape via close button (✕) in top-right corner with accessibility support
- Typography sized at 34pt for hero vocabulary text (iOS large title size)
- Established src/components/ pattern for reusable UI components
- Dark mode pattern: useColorScheme() with conditional iOS system colors
- Modal pattern: fullScreenModal with fade animation and emergency escape

**From Plan 1-05 (Answer Input & Fuzzy Matching):**
- Fuse.js threshold 0.2 for typo tolerance (tunable based on user feedback)
- Normalization strategy: lowercase → NFD decomposition → remove diacritical marks → remove apostrophes → trim
- Two submission methods: return key (iOS "done") and button for accessibility
- Auto-focus input for immediate typing without manual tap
- Answer validation pattern: normalize → exact match → fuzzy match with Fuse.js
- Challenge flow pattern: input visible before submission, next button after submission
- iOS-native input styling: System font, standard text size (17pt), iOS placeholder colors

**From Plan 1-06 (Deep Link Return Flow):**
- URL scheme mapping for 20+ popular apps (Instagram, Twitter, TikTok, YouTube, etc.)
- canOpenURL pre-flight check to validate app availability before opening
- Alert dialogs for failed deep links instead of silent failures (user feedback)
- For unlock-type challenges: instructional alert instead of deep link attempt
- Deep link utility pattern: src/utils/ for external app integration helpers
- Type-specific behavior: Different UI/UX based on challenge type (unlock vs app_open)
- Accessibility pattern: Labels and hints for screen reader support on interactive elements

**From Plan 1-07 (Tutorial Screen):**
- Single tutorial covering both unlock and app-open automations (simpler UX)
- TutorialStep component pattern for reusable tutorial steps with images
- Placeholder screenshots to be replaced during device testing
- Tutorial presented as standard modal (not fullScreenModal) with system header
- Tutorial always accessible from home screen via "Setup Tutorial" button
- URL scheme examples shown: lingolock://challenge?source=...&count=3&type=unlock
- Important note about disabling "Ask Before Running" in Shortcuts automations

**From Plan 02-01 (Data Foundation — ClozeCard types + content bundle):**
- Build-time codegen (bundle.ts) instead of runtime JSON parsing — no fs/JSON at app startup
- ClozeCard.id format: {lemma}-ch{chapter:02d}-s{sentenceIndex:02d} for stable FSRS storage keys
- Pipeline examples bug fixed in BOTH code paths (first-occurrence and duplicate accumulation)
- Distractors: same POS + CEFR proximity (±1 level) preferred, fallback to any POS
- Content pipeline pattern: Python generates chapter JSON → TypeScript script transforms to bundle.ts
- scripts/ directory established for build-time transforms; src/content/ for generated content

**From Plan 02-02 (Storage & FSRS Services):**
- MMKV v4 uses createMMKV() factory (not new MMKV() constructor) and remove(key) not delete(key)
- ts-fsrs Card.learning_steps not persisted in CardState; recomputed internally from state on each call
- Binary rating only: Rating.Good (correct) and Rating.Again (incorrect); Hard/Easy excluded per design
- Answer type graduation thresholds: stability < 1.5 = mc2, < 4.0 = mc4, >= 4.0 = text
- Mastery definition: State.Review (value 2) — card has survived at least one full review cycle
- Services pattern established: src/services/ for stateful business logic (storage, algorithms)
- Serialization boundary: ISO strings at rest in MMKV, Date objects only when calling ts-fsrs

**From Plan 02-03 (Card Selector & Stats Services):**
- Jest 30 + ts-jest 29 with diagnostics:false for TDD RED phase support; MMKV mock uses in-memory Map
- buildSession always reserves 1 slot for new word (maxDue = cardCount - 1) even when enough due reviews exist
- getStreak returns 0 for stale streaks (lastSessionDate > yesterday) — shows reality; updateStatsAfterSession resets on next session
- handleWrongAnswer inserts at min(currentIndex + 4, queue.length) — 4 positions ahead or append
- getCurrentChapterNumber delegates to cardSelector.getCurrentChapter — single source of truth
- TDD pattern established: commit RED test file before GREEN implementation; diagnostics:false allows RED to fail at "module not found" level

**From Plan 02-04 (Challenge Screen — Cloze + FSRS):**
- createNewCardState() used as fallback when loadCardState returns null before calling scheduleReview on new cards
- AUTO_ADVANCE_MS 1500ms (vs 500ms Phase 1) to give user time to read AnswerReveal German translation
- expo-av audio stub uses dynamic require as any to avoid compile errors until Phase 3 installs expo-av
- originalCardCount.current ref tracks initial session size so ProgressDots total never grows with wrong-answer re-insertions

**From Plan 02-05 (Home Screen — Wired to Real Stats):**
- useFocusEffect + useCallback chosen over useEffect so stats update every return from challenge, not just on initial mount
- Cards-due label toggles "All caught up!" / "Review ready" based on cardsDue === 0 for motivational feedback
- placeholderVocabulary.ts kept (not deleted) with @deprecated JSDoc to avoid breaking tutorial/test references
- Focus-refresh pattern established: useFocusEffect wrapping stat-loading callbacks on dashboard screens

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

**Phase 1:**
- Apple Family Controls entitlement approval typically takes 2+ weeks; critical path blocker
- Physical iOS device required for Screen Time API testing (simulator unsupported)
- Paid Apple Developer account ($99/year) required for code signing and entitlements

**Phase 2:**
- FamilyActivityPicker crashes with large app selections (known iOS bug); requires crash recovery UI
- DeviceActivityMonitor callbacks unreliable in production; architecture must use direct ManagedSettings
- Shield UI cannot open parent app; vocabulary prompts must appear BEFORE blocking

**Phase 4:**
- APKG parsing may encounter schema variations across Anki versions; test with diverse real-world decks
- Large decks (2GB+) can cause memory issues; implement file size limits and chunked processing

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 02-05-PLAN.md (Home Screen Wired to Real Stats) — Phase 2 complete
Resume file: None

---
*State initialized: 2026-03-01*
*Last updated: 2026-03-02 (02-05 complete — Phase 2 complete)*
