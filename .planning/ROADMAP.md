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
- [x] **Phase 2: Spaced Repetition & Progress** - FSRS algorithm, card display, progress tracking, offline persistence (completed 2003-03-02)
- [ ] **Phase 3: Notifications & Live Activities** - Timed notifications, interactive notifications, Lock Screen widget, real-time challenges
- [ ] **Phase 3: Configuration & Settings** - Per-app configuration, whitelist, input modes, notification preferences

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
> Note: PROG-08 (per-app stats UI) deferred to Phase 3 per user decision. Phase 2 captures the data; Phase 3 builds the UI.
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

### Phase 02.2: App Polish & Missing Screens (INSERTED)

**Goal:** Build three missing screens (Vocabulary browser, Stats detail, Settings), refactor practice sessions from fixed-count to continuous flow with daily new-word cap, and polish home screen with time-based greeting, wired navigation, and empty state handling.
**Requirements**: POLISH-01 (settings storage), POLISH-02 (settings screen), POLISH-03 (daily new-word cap), POLISH-04 (vocabulary browser), POLISH-05 (vocabulary detail), POLISH-06 (continuous session flow), POLISH-07 (richer celebration), POLISH-08 (stats detail screen), POLISH-09 (home polish), POLISH-10 (empty state)
**Depends on:** Phase 2, Phase 2.1
**Success Criteria** (what must be TRUE):
  1. Settings screen allows mute toggle and new-words-per-day adjustment (persisted in MMKV/localStorage)
  2. Vocabulary browser shows all words grouped by chapter with search, mastery indicators, and detail view
  3. Stats screen shows per-chapter mastery %, total/mastered/due counts, and cross-navigates to vocabulary
  4. Practice sessions are continuous (all due reviews + daily-capped new words, not fixed 5-card bursts)
  5. Session completion shows accuracy %, streak update, and motivational message
  6. Home screen shows time-based Spanish greeting, wired tile navigation, and "Review anyway" empty state
  7. Tutorial link hidden on web (Platform check)
  8. All new storage functions have parallel web adapter implementations
**Plans:** 3/3 plans complete

Plans:
- [ ] 02.2-01-PLAN.md -- Settings storage + daily cap in cardSelector + Settings screen + route registration
- [ ] 02.2-02-PLAN.md -- Vocabulary browser + word detail view
- [ ] 02.2-03-PLAN.md -- Continuous session flow + Stats detail + Home screen polish

### Phase 02.3: Audio Generation Pipeline (INSERTED)

**Goal:** Extend Spanish content pipeline with AI text-to-speech generation for sentence audio, enabling audio playback in vocabulary cards
**Depends on:** Phase 2.2
**Requirements**: AUDIO-01 (TTS API integration), AUDIO-02 (audio file generation), AUDIO-03 (audio storage), AUDIO-04 (content bundle integration), AUDIO-05 (playback logic wiring)
**Success Criteria** (what must be TRUE):
  1. Content pipeline includes Pass 6: Audio Generation using AI text-to-speech API
  2. For each sentence in the content, system generates Spanish audio file (MP3/OGG format)
  3. Audio files are saved to appropriate directory structure (by chapter/sentence)
  4. build-content.ts script includes audio file paths in generated bundle.ts
  5. ClozeCard type includes optional audioUrl field
  6. Challenge screen plays sentence audio when audio button is tapped (if audioUrl present)
  7. Audio generation is skippable if TTS API key not configured (graceful degradation)
  8. All existing content pipeline tests still pass
**Plans:** 2 plans in 2 waves

Plans:
- [x] 02.3-01-PLAN.md — Audio generator core: config, models, AudioGenerator class + tests
- [x] 02.3-02-PLAN.md — Pipeline wiring (run_all.py Pass 6) + build-content.ts audio bundling + ClozeCard audio resolution

### Phase 02.1: PWA Deployment & Content Integration (INSERTED)

**Goal:** Deploy LingoLock as a Progressive Web App on Vercel with full FSRS scheduling, streaks, and stats via localStorage platform adapter. Mobile-first layout with max-width container for desktop.
**Requirements**: PWA-STORAGE, PWA-MANIFEST, PWA-SERVICE-WORKER, PWA-BUILD-PIPELINE, PWA-RESPONSIVE-LAYOUT, PWA-SW-REGISTRATION, PWA-VERCEL-DEPLOY
**Depends on:** Phase 2
**Success Criteria** (what must be TRUE):
  1. Web build compiles without native module crashes (MMKV replaced by localStorage on web)
  2. All FSRS scheduling, streaks, and stats persist in browser via localStorage
  3. PWA manifest enables "Add to Home Screen" with standalone display mode
  4. Service worker caches app shell for offline use after first load
  5. Desktop browser shows centered ~480px layout (not full-width stretch)
  6. Vercel auto-deploys on push to master via GitHub integration
  7. build:web script chains content generation with expo web export
**Plans:** 3/3 plans complete

Plans:
- [x] 02.1-01-PLAN.md -- Web storage adapter (localStorage platform file)
- [x] 02.1-02-PLAN.md -- PWA config, service worker, and build pipeline
- [x] 02.1-03-PLAN.md -- Responsive layout, SW registration, and deployment verification

### Phase 3: Notifications & Live Activities
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

### Phase 3: Configuration & Settings
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

**Note:** Screen Time API timer interruptions deferred to potential Phase 3 (requires FamilyControls entitlement). Replaced by Notifications + Live Activities approach for v1.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shortcuts Integration & Basic UI | 7/7 | Human verification needed | 2003-03-02 |
| 2. Spaced Repetition & Progress | 5/5 | Complete   | 2003-03-02 |
| 2.1 PWA Deployment & Content Integration | 3/3 | Complete | 2026-03-03 |
| 2.2 App Polish & Missing Screens | 1/3 | In progress | - |
| 2.3 Audio Generation Pipeline | 2/2 | Complete | 2026-03-04 |
| 3. Notifications & Live Activities | 0/TBD | Not started | - |
| 3. Configuration & Settings | 0/TBD | Not started | - |

---
*Roadmap created: 2003-03-01*
*Last updated: 2026-03-04 (Phase 02.3 complete — Audio generation pipeline operational)*
