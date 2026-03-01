# Roadmap: Vokabeltrainer

## Overview

Vokabeltrainer transforms vocabulary learning from an active chore into a passive habit by interrupting app usage with vocabulary challenges. Using iOS Shortcuts automation (like OneSec), the app intercepts app openings and presents vocabulary challenges before allowing access. The roadmap delivers this value in 4 phases: Shortcuts Integration sets up the interception mechanism and basic UI, Spaced Repetition implements scientifically-proven learning algorithms with progress tracking, Deck Import unlocks the Anki ecosystem, and Configuration adds per-app customization. Each phase builds on the previous, with clear success criteria that validate the core value proposition.

**Technical Approach:** iOS Shortcuts Automation (NO FamilyControls/Screen Time API required)
- User configures Shortcuts automation: "When [App] opens → Run Vokabeltrainer Shortcut"
- Shortcut opens Vokabeltrainer app via URL scheme
- User completes vocabulary challenge
- Vokabeltrainer deep-links to original app

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Shortcuts Integration & Basic UI** - URL scheme, vocabulary challenge screen, Shortcuts tutorial
- [ ] **Phase 2: Spaced Repetition & Progress** - FSRS algorithm, card display, progress tracking, offline persistence
- [ ] **Phase 3: Deck Import** - Anki .apkg file parsing, card extraction, media handling
- [ ] **Phase 4: Configuration & Settings** - Per-app configuration, whitelist, input modes

## Phase Details

### Phase 1: Shortcuts Integration & Basic UI
**Goal**: User can trigger vocabulary challenges via iOS Shortcuts when opening apps
**Depends on**: Nothing (first phase)
**Requirements**: BLCK-03 (vocabulary challenge screen), partial CARD-02/03/06/07 (basic card display & answer checking)
**Success Criteria** (what must be TRUE):
  1. Expo project initializes successfully and runs in Expo Go on iPhone
  2. App registers custom URL scheme (vokabeltrainer://) that iOS Shortcuts can invoke
  3. URL scheme accepts parameters: source app name, number of cards to show
  4. Fullscreen vocabulary challenge screen displays with placeholder cards
  5. User can answer card via free-text input and see correct/incorrect feedback
  6. After completing challenge, "Open [App Name]" button deep-links to original app
  7. In-app tutorial explains how to set up Shortcuts automation (with screenshots/video)
  8. Tutorial includes copy-paste Shortcut template for quick setup
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 2: Spaced Repetition & Progress
**Goal**: Vocabulary learning uses scientifically-proven scheduling and tracks user progress
**Depends on**: Phase 1
**Requirements**: CARD-01 through CARD-11 (complete card learning system), PROG-01 through PROG-08 (progress tracking), OFFL-01 through OFFL-03 (offline support)
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
**Plans**: TBD

Plans:
- [ ] TBD during planning

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

### Phase 4: Configuration & Settings
**Goal**: User can customize app behavior per Shortcut automation and manage preferences
**Depends on**: Phase 1
**Requirements**: CONF-01 through CONF-04 (per-app configuration), BLCK-01, BLCK-02, BLCK-05 (app management), CARD-04, CARD-05 (input mode selection)
**Success Criteria** (what must be TRUE):
  1. User can configure different settings per Shortcut automation (identified by source app name)
  2. User can set number of vocabulary questions per app (1-10 cards)
  3. User can disable specific app automations without deleting the Shortcut
  4. User can re-enable previously disabled app automations
  5. User can choose input mode per deck (free-text, multiple-choice, yes/no)
  6. User can mark certain apps as "never interrupt" (whitelist)
  7. All configuration persists across app restarts
  8. Settings screen shows list of configured Shortcuts with edit/disable options
**Plans**: TBD

Plans:
- [ ] TBD during planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

**Note:** Phase 5 (Timer Interruptions) removed - not feasible with Shortcuts approach (requires background execution)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shortcuts Integration & Basic UI | 0/TBD | Not started | - |
| 2. Spaced Repetition & Progress | 0/TBD | Not started | - |
| 3. Deck Import | 0/TBD | Not started | - |
| 4. Configuration & Settings | 0/TBD | Not started | - |

---
*Roadmap created: 2026-03-01*
*Last updated: 2026-03-01 (revised for Shortcuts approach)*
