# Requirements: Vokabeltrainer

**Defined:** 2026-03-01
**Core Value:** Vokabeln müssen zum User kommen, nicht umgekehrt — Lernen wird automatisch in den Alltag integriert durch intelligentes App-Blocking, ohne dass der User aktiv eine Lern-Session starten muss.

## v1 Requirements

Requirements for initial MVP release. Focus: Table stakes only, no differentiators.

### Deck Management

- [ ] **DECK-01**: User can import Anki .apkg deck file via file picker
- [ ] **DECK-02**: System parses .apkg (ZIP-compressed SQLite) and extracts cards
- [ ] **DECK-03**: System imports card data: front text, back text, images, audio files
- [ ] **DECK-04**: User can view list of imported decks
- [ ] **DECK-05**: User can select which deck is currently active for learning

### App Blocking

- [ ] **BLCK-01**: User can select apps to block using iOS FamilyControls picker
- [ ] **BLCK-02**: User can add apps to whitelist (never blocked, e.g., Phone, Banking)
- [ ] **BLCK-03**: When user opens blocked app, system shows fullscreen vocabulary challenge
- [ ] **BLCK-04**: System prevents app from opening until vocabulary challenge is completed successfully
- [ ] **BLCK-05**: User can configure number of vocabulary questions per app-open (default: 3)

### Interruption Timer

- [ ] **INTR-01**: User can enable timer-based interruptions during app usage
- [ ] **INTR-02**: User can configure interruption interval (3 min, 5 min, 10 min options)
- [ ] **INTR-03**: System shows fullscreen vocabulary challenge after timer expires during app usage
- [ ] **INTR-04**: After completing vocabulary challenge, user sees "Back to App" button to resume
- [ ] **INTR-05**: User can configure number of vocabulary questions per interruption (default: 3)

### Per-App Configuration

- [ ] **CONF-01**: User can configure different settings per blocked app (number of questions, timer interval)
- [ ] **CONF-02**: User can disable app from blocking list without removing it
- [ ] **CONF-03**: User can re-enable previously disabled app
- [ ] **CONF-04**: System persists all per-app configurations across app restarts

### Card Learning (Spaced Repetition)

- [ ] **CARD-01**: System implements FSRS spaced repetition algorithm for card scheduling
- [ ] **CARD-02**: System shows vocabulary card with front side (question) text
- [ ] **CARD-03**: User can answer vocabulary card via free-text input (default mode)
- [ ] **CARD-04**: User can switch to multiple-choice mode (4 options) per deck
- [ ] **CARD-05**: User can switch to yes/no mode (2 options: correct/incorrect) per deck
- [ ] **CARD-06**: System shows back side (answer) after user submits answer
- [ ] **CARD-07**: System marks answer as correct/incorrect based on user input
- [ ] **CARD-08**: If answer is incorrect, card is rescheduled according to FSRS algorithm (60s interval for immediate review)
- [ ] **CARD-09**: System displays images on card if present in Anki deck
- [ ] **CARD-10**: System plays audio on card if present in Anki deck
- [ ] **CARD-11**: User must answer correctly to unlock blocked app (incorrect answers keep app blocked)

### Progress Tracking

- [ ] **PROG-01**: System tracks daily streak (consecutive days with at least one card answered)
- [ ] **PROG-02**: User can view current streak count in app
- [ ] **PROG-03**: System calculates overall success rate (% correct answers)
- [ ] **PROG-04**: User can view success rate in app
- [ ] **PROG-05**: System calculates overall progress (% of total cards mastered)
- [ ] **PROG-06**: User can view overall progress in app
- [ ] **PROG-07**: System tracks cards answered per app (which blocked apps triggered how many cards)
- [ ] **PROG-08**: User can view per-app statistics

### Offline Support

- [ ] **OFFL-01**: All vocabulary data stored locally on device (no cloud sync)
- [ ] **OFFL-02**: App functions fully offline after initial deck import
- [ ] **OFFL-03**: Progress and statistics persisted locally across app restarts

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Blocking

- **EBLK-01**: Breathing exercise before vocabulary challenge (OneSec-style)
- **EBLK-02**: Scheduled blocking (specific time windows, e.g., "block social media 9-5")
- **EBLK-03**: Usage analytics dashboard (time spent per app, interruptions triggered)

### Deck Features

- **DECK-10**: User can manage multiple decks simultaneously
- **DECK-11**: User can view per-deck statistics (cards mastered per deck)
- **DECK-12**: User can create custom cards within app (not just import)

### Gamification

- **GAMF-01**: Daily/weekly goals with progress bars
- **GAMF-02**: XP/Levels system with visual progression
- **GAMF-03**: Achievements/badges for milestones

### Settings

- **SETT-01**: Dark mode support
- **SETT-02**: Notification preferences configuration

### Platform

- **PLAT-01**: Android version with equivalent functionality
- **PLAT-02**: Cross-device sync (iCloud/Google Drive)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Android V1 | iOS focus, no Android test device available |
| Cross-device sync | Complexity, offline-first simplicity preferred |
| KI-generated vocabulary lists | Focus on Anki import, content creation later |
| Pre-installed vocabulary decks | Licensing unclear, user brings own content |
| Cloud backend | Offline-first, no server infrastructure costs |
| Web version | Mobile-native experience required for Screen Time API |
| Breathing exercises | Nice-to-have, defer to v2 |
| Scheduled blocking (time windows) | Complexity, defer to v2 |
| XP/Levels/Achievements | Gamification can distract, defer to v2 |
| Dark mode | Polish feature, defer to v2 |
| Import Anki learning progress | Complexity, fresh start is simpler |
| Custom card creation | Content management complexity, defer to v2 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (To be populated by roadmapper) | - | - |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 35 ⚠️

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after initial definition*
