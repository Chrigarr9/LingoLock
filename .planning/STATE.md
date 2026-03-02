# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Vokabeln müssen zum User kommen, nicht umgekehrt — Lernen wird automatisch in den Alltag integriert durch intelligentes App-Blocking, ohne dass der User aktiv eine Lern-Session starten muss.
**Current focus:** Phase 1 - Foundation & Entitlements

## Current Position

Phase: 1 of 5 (1-shortcuts-integration)
Plan: 4 of TBD in current phase
Status: In progress
Last activity: 2026-03-02 — Completed 1-04-PLAN.md (Challenge Screen UI)

Progress: [████░░░░░░] ~25%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 4 min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1-shortcuts-integration | 4 | 14min | 4min |

**Recent Trend:**
- Last 3 plans: 1-04 (1min), 1-03 (2min), 1-02 (2min)
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
Stopped at: Completed 1-04-PLAN.md (Challenge Screen UI)
Resume file: None

---
*State initialized: 2026-03-01*
*Last updated: 2026-03-02*
