# Roadmap: LingoLock

## Overview

LingoLock transforms vocabulary learning from an active chore into a passive habit by integrating vocabulary challenges throughout the day. Using multiple iOS mechanisms (Shortcuts automation, Local Notifications, Live Activities), the app creates consistent vocabulary practice moments: when unlocking the phone, opening apps, via timed notifications, and through Lock Screen widgets. The roadmap delivers this value in 5 phases: Shortcuts Integration sets up app-open and unlock automations, Spaced Repetition implements scientifically-proven learning algorithms, Deck Import unlocks the Anki ecosystem, Notifications & Live Activities add timed reminders and Lock Screen interaction, and Configuration enables per-app customization. Each phase builds on the previous, with clear success criteria that validate the core value proposition.

**Technical Approach:** Multi-layered iOS integration (NO FamilyControls/Screen Time API required)
1. **Shortcuts Automation:** "When device unlocks" / "When [App] opens" → Run LingoLock
2. **Timed Notifications:** Local notifications every 3-5 min with interactive actions
3. **Live Activities:** Lock Screen widget with real-time vocabulary challenges
4. **Interactive Notifications:** Answer directly from notification/Lock Screen
5. **URL Scheme:** Deep-linking back to original apps after challenges

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Shortcuts Integration & Basic UI** - URL scheme, unlock automation, app-open automation, vocabulary challenge screen, Shortcuts tutorial
- [ ] **Phase 2: Spaced Repetition & Progress** - FSRS algorithm, card display, progress tracking, offline persistence
- [ ] **Phase 3: Deck Import** - Anki .apkg file parsing, card extraction, media handling
- [ ] **Phase 4: Notifications & Live Activities** - Timed notifications, interactive notifications, Lock Screen widget, real-time challenges
- [ ] **Phase 5: Configuration & Settings** - Per-app configuration, whitelist, input modes, notification preferences

## Phase Details

### Phase 1: Shortcuts Integration & Basic UI
**Goal**: User can trigger vocabulary challenges via iOS Shortcuts when unlocking device or opening apps
**Depends on**: Nothing (first phase)
**Requirements**: BLCK-03, BLCK-04 (vocabulary challenge screen), UNLK-01, UNLK-02 (unlock automation), partial CARD-02/03/06/07 (basic card display & answer checking)
**Success Criteria** (what must be TRUE):
  1. Expo project initializes successfully and runs in development build on iPhone
  2. App registers custom URL scheme (lingolock://) that iOS Shortcuts can invoke
  3. URL scheme accepts parameters: source app name, number of cards to show, trigger type (unlock/app-open)
  4. Fullscreen vocabulary challenge screen displays with placeholder cards
  5. User can answer card via free-text input and see correct/incorrect feedback
  6. After completing challenge, "Open [App Name]" button deep-links to original app (or shows message for unlock type)
  7. In-app tutorial explains how to set up two Shortcuts automations:
     - "When device unlocks → Run LingoLock"
     - "When [App] opens → Run LingoLock"
  8. Tutorial includes step-by-step screenshots for Shortcuts setup
  9. Device unlock automation works reliably and shows vocabulary challenge
**Plans**: 7 plans in 4 waves

Plans:
- [x] 1-01-PLAN.md — Expo SDK 55 upgrade + development build setup
- [x] 1-02-PLAN.md — Placeholder vocabulary data structure
- [x] 1-03-PLAN.md — URL scheme deep linking + parameter parsing
- [x] 1-04-PLAN.md — Vocabulary challenge screen UI
- [x] 1-05-PLAN.md — Answer input + fuzzy matching validation
- [x] 1-06-PLAN.md — Deep-linking to source apps
- [x] 1-07-PLAN.md — Tutorial screen implementation

### Phase 2: Spaced Repetition & Progress
**Goal**: Vocabulary learning uses scientifically-proven scheduling and tracks user progress
**Depends on**: Phase 1
**Requirements**: CARD-01 through CARD-11 (complete card learning system), PROG-01 through PROG-07 (progress tracking), OFFL-01 through OFFL-03 (offline support)
> Note: PROG-08 (per-app stats UI) deferred to Phase 5 per user decision. Phase 2 captures the data; Phase 5 builds the UI.
**Success Criteria** (what must be TRUE):
  1. System schedules cards using FSRS spaced repetition algorithm with scientifically-optimal intervals
  2. User can answer cards via free-text (default), multiple-choice (4 options), or yes/no modes
  3. After answering, user sees correct answer with images and audio (if present in card data)
  4. Incorrect answers reschedule card for 60-second review, correct answers follow FSRS schedule
  5. User can view daily streak count, overall success rate, and overall progress percentage
  6. User can view per-app statistics (which Shortcut automations triggered how many cards)
  7. All vocabulary data, progress, and statistics persist locally using MMKV/WatermelonDB
  8. App functions fully offline with no network dependency
  9. Data survives app force-close and device restart
**Plans**: 5 plans in 4 waves

Plans:
- [ ] 02-01-PLAN.md — Pipeline bug fix + ClozeCard types + build-time content transform
- [ ] 02-02-PLAN.md — Install ts-fsrs + MMKV + FSRS scheduler + storage services
- [ ] 02-03-PLAN.md — Card selector + stats service (TDD)
- [ ] 02-04-PLAN.md — Cloze challenge screen UI + FSRS-driven session flow
- [ ] 02-05-PLAN.md — Home screen wiring + end-to-end verification

### Phase 3: Deck Import
**Goal**: User can import Anki vocabulary decks into the app
**Depends on**: Phase 2
**Requirements**: DECK-01 through DECK-05
**Success Criteria** (what must be TRUE):
  1. User can select .apkg file from device storage via iOS document picker
  2. System parses .apkg file (ZIP-compressed SQLite) and extracts all card data
  3. System imports card front/back text, images, and audio files into local database
  4. User can view list of all imported decks in app
  5. User can select which deck is currently active for learning
  6. Import handles large decks (up to 100MB) with progress indication and clear error messages
  7. Imported cards immediately available in next vocabulary challenge
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 4: Notifications & Live Activities
**Goal**: User receives timed vocabulary reminders via notifications and can interact with Lock Screen widget
**Depends on**: Phase 2 (needs FSRS scheduling and card data)
**Requirements**: NOTF-01 through NOTF-05 (timed notifications), INOT-01 through INOT-05 (interactive notifications), LIVE-01 through LIVE-04 (Live Activities)
**Success Criteria** (what must be TRUE):
  1. System schedules local notifications every configurable interval (3/5/10 min)
  2. Notifications show: "Time for vocabulary! 🧠" with vocabulary word preview
  3. User tapping notification opens LingoLock with full vocabulary challenge
  4. Notifications include interactive buttons (A/B/C/D for multiple choice)
  5. User can answer vocabulary directly from notification without opening app
  6. System provides immediate feedback on notification (✓ Correct / ✗ Try again)
  7. Answered cards via notification count toward progress/streak
  8. Live Activity appears on Lock Screen showing current vocabulary card
  9. User can answer vocabulary directly on Lock Screen (swipe down for options)
  10. Live Activity updates in real-time with new card after correct answer
  11. Live Activity shows streak count and daily progress
  12. Notifications only appear during active hours (9 AM - 10 PM, configurable)
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 5: Configuration & Settings
**Goal**: User can customize app behavior per Shortcut automation and manage preferences
**Depends on**: Phase 1
**Requirements**: CONF-01 through CONF-04 (per-app configuration), BLCK-01, BLCK-02, BLCK-05 (app management), CARD-04, CARD-05 (input mode selection), UNLK-03, NOTF-04, NOTF-05, LIVE-05 (settings)
**Success Criteria** (what must be TRUE):
  1. User can configure different settings per Shortcut automation (identified by source app name)
  2. User can set number of vocabulary questions per app (1-10 cards)
  3. User can disable specific app automations without deleting the Shortcut
  4. User can re-enable previously disabled app automations
  5. User can choose input mode per deck (free-text, multiple-choice, yes/no)
  6. User can mark certain apps as "never interrupt" (whitelist)
  7. User can configure notification interval (3/5/10 min)
  8. User can configure active notification hours (e.g., 9 AM - 10 PM)
  9. User can enable/disable unlock automation
  10. User can enable/disable Live Activities
  11. All configuration persists across app restarts
  12. Settings screen shows list of configured Shortcuts with edit/disable options
**Plans**: TBD

Plans:
- [ ] TBD during planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

**Note:** Screen Time API timer interruptions deferred to potential Phase 6 (requires FamilyControls entitlement). Replaced by Notifications + Live Activities approach for v1.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shortcuts Integration & Basic UI | 7/7 | Human verification needed | 2026-03-02 |
| 2. Spaced Repetition & Progress | 4/5 | In Progress|  |
| 3. Deck Import | 0/TBD | Not started | - |
| 4. Notifications & Live Activities | 0/TBD | Not started | - |
| 5. Configuration & Settings | 0/TBD | Not started | - |

---
*Roadmap created: 2026-03-01*
*Last updated: 2026-03-02 (Phase 1 executed, awaiting device testing)*
