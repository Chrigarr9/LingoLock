# Project Research Summary

**Project:** Vokabeltrainer - iOS Vocabulary Learning App with Screen Time Integration
**Domain:** Hybrid - Vocabulary Learning + Screen Time Management
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH

## Executive Summary

Vokabeltrainer combines two well-established domains (vocabulary learning and screen time management) into a novel hybrid approach: interrupt app usage with vocabulary challenges to convert distraction time into learning time. The recommended implementation uses Expo SDK 55 with React Native, leveraging iOS Screen Time APIs via native TurboModules, MMKV for high-performance storage, and proven spaced repetition algorithms (SM-2/FSRS). The core innovation - interruption-based learning - requires careful UX design to feel helpful rather than punishing.

The technical stack is mature and well-documented, with high confidence in recommended technologies. However, iOS Screen Time API integration presents critical challenges: FamilyActivityPicker crashes with large app selections, DeviceActivityMonitor callbacks are unreliable in production, and Apple's API has fundamental limitations (no passcode protection for third-party apps, shield UI cannot open parent app). These are Apple bugs with known workarounds, not implementation risks. The architecture must be designed around these constraints from day one.

Critical success factor: Frame the product as a "commitment device" and "helpful reminder" rather than "strict blocking." Users can disable Screen Time permissions via iOS Settings, making enforcement impossible. The value proposition is voluntary learning through interruption friction, not parental-control-style enforcement. Product positioning and UX framing are as important as technical implementation.

## Key Findings

### Recommended Stack

Vokabeltrainer uses a modern React Native stack optimized for iOS development without a Mac (via EAS Build) and offline-first architecture. Expo SDK 55 includes React Native 0.83 with New Architecture (mandatory in 2026), providing JSI/TurboModule support essential for Screen Time API integration. Development happens on Ubuntu with cloud builds.

**Core technologies:**
- **Expo SDK 55 + EAS Build**: Enables iOS builds without Mac, includes React Native 0.83 with New Architecture (mandatory), TurboModule support for native APIs
- **react-native-device-activity**: Community library wrapping iOS FamilyControls/ManagedSettings/DeviceActivity frameworks for Screen Time integration
- **MMKV**: 30x faster than AsyncStorage for vocabulary decks, learning progress, and app state; synchronous API, encryption support, works with New Architecture
- **Zustand**: Lightweight state management (~3KB) for global UI state, 2026 default over Redux for small-to-medium apps
- **WatermelonDB**: Relational database for structured vocabulary data with lazy loading, <1ms queries on 10K+ records, fully observable
- **NativeWind v4**: Tailwind CSS for React Native; compiles ahead-of-time (no runtime cost), industry standard styling in 2026
- **SM-2/FSRS Algorithm**: Proven spaced repetition scheduling; SM-2 baseline, FSRS (via ts-fsrs library) for superior accuracy

**Critical requirements:**
- Apple Family Controls entitlement (manual approval, 2+ weeks) required BEFORE development
- iOS 15.1+ deployment target
- Physical iOS device for testing (Screen Time APIs don't work in simulator)
- Paid Apple Developer account ($99/year) for code signing

### Expected Features

Users come to Vokabeltrainer with expectations shaped by two distinct domains: vocabulary apps (Anki, Duolingo) and screen time management (OneSec, Forest). The research identifies clear table stakes, differentiators, and anti-features to avoid.

**Must have (table stakes):**
- **Spaced Repetition Algorithm**: Industry standard since Anki; users expect scientifically-proven optimal intervals (SM-2 minimum, FSRS preferred)
- **Anki Deck Import (.apkg)**: De facto standard format; must support HTML, images, audio, CSS styling, multiple note types
- **App Blocking with Vocabulary Gate**: Core innovation - block selected apps, require X vocabulary answers to unlock
- **Per-App Configuration**: Different interruption patterns per app (1 word for quick apps, 5 for social media); essential for user control
- **Progress Tracking**: Words mastered, daily/weekly stats, retention rate, current streak
- **Success-Based Unlocking**: Require completion (not perfection) to unlock; prevent mindless clicking through
- **Whitelist/Exceptions**: Critical apps (phone, messages, maps) always accessible
- **Flexible Time Limits**: Per-app daily limits, scheduled blocking (weekdays vs weekends)

**Should have (competitive differentiators):**
- **Breathing Exercise + Vocab**: OneSec's 10-second breath pause (57% usage reduction) combined with vocabulary learning
- **Learning Streaks Per App**: "You've learned 47 words through Instagram interruptions" - gamification + attribution
- **Context-Aware Interruptions**: Don't interrupt during calls, navigation, music (detect app context) - technically complex but high value
- **Real Tree Planting**: Following Forest's proven model - plant real trees based on learning achievements

**Defer (v2+ or avoid entirely):**
- **All-or-Nothing Learning**: Requiring 100% accuracy creates frustration and abandonment; completion > perfection
- **Gamification Overload**: Points, badges, leagues, avatars distract from learning; focus on meaningful metrics (words mastered, retention)
- **Complete App Blocking**: iOS makes this impossible without MDM; creates frustration when bypassed; friction-based delays work better
- **Elaborate Social Features**: Friend requests, messaging, profiles require moderation, privacy policies, content filtering; massive scope creep
- **Real-Time Cross-Device Sync**: Backend complexity, sync conflicts, cost; single-device experience first, manual export/import for power users

### Architecture Approach

The architecture follows React Native New Architecture (mandatory in 2026) with TurboModules for synchronous native API access. iOS Screen Time APIs run in isolated App Extensions with strict limitations (5 MB memory, no network, no main app communication). The design works around Apple's API constraints rather than fighting them.

**Major components:**

1. **React Native UI Layer** — User-facing screens, vocabulary challenges, statistics display; Zustand for state management; NativeWind for styling
2. **Screen Time TurboModule (Swift)** — Wraps FamilyControls/ManagedSettings APIs; requests permissions, configures blocking, manages app selection
3. **DeviceActivityMonitor Extension (Swift)** — Separate isolated process (5 MB memory limit); triggers interruptions at configured intervals; communicates via App Groups UserDefaults
4. **Storage Layer (MMKV + WatermelonDB)** — MMKV for settings/state, WatermelonDB for vocabulary cards/progress; both persist to disk with automatic Zustand middleware
5. **Spaced Repetition Service (TypeScript)** — FSRS algorithm implementation (ts-fsrs library); calculates next review time, schedules cards
6. **APKG Parser Service (TypeScript/Node.js)** — Parses Anki .apkg files (SQLite wrapped in ZIP); extracts cards, media, models; transforms to app data model

**Key architectural patterns:**
- **App Groups for Extension Communication**: Main app writes configuration to shared UserDefaults; DeviceActivityMonitor extension reads (one-way only)
- **Direct ManagedSettings Manipulation**: Don't rely on DeviceActivityMonitor callbacks (unreliable in production); apply/remove shields directly
- **FamilyActivitySelectionId References**: Never store raw ApplicationTokens (they change randomly); use selection IDs for stable references
- **Zustand + MMKV Persistence**: State automatically persists via middleware; survives force-close and app updates

### Critical Pitfalls

Research identified 10 critical pitfalls specific to iOS Screen Time API integration and React Native development. The top 5 are architectural constraints that shape the entire product:

1. **FamilyActivityPicker Memory Crashes** — Apple's app picker crashes when categories contain 100-200+ apps (known iOS bug, multiple radar reports). Implement crash detection, retry UI, fallback positioning. Address in Phase 1 before app selection UI ships.

2. **Random ApplicationToken Changes Break State** — iOS randomly provides new, unknown tokens that don't match originally selected apps, breaking shield UI. Never store raw tokens; use familyActivitySelectionId references; implement fuzzy matching for unknown tokens. Address in Phase 1; core architecture decision.

3. **DeviceActivityMonitor Callbacks Don't Fire** — intervalDidStart, intervalDidEnd, eventDidReachThreshold are extremely unreliable in production (work in debug, fail in release). Don't rely on callbacks for blocking logic; use direct ManagedSettings manipulation; implement fallback polling. Address in Phase 1; critical for blocking reliability.

4. **Shield Extensions Cannot Open Parent App** — Shield UI only supports .none, .close, .defer actions; no way to return users to app for vocabulary prompts. Design vocabulary prompts BEFORE blocking occurs, not from shield screen. Address in Phase 1; shapes entire user flow.

5. **No Passcode Protection for Third-Party Apps** — Users can revoke FamilyControls permissions via Settings even with Screen Time passcode. Frame as "commitment device" not "strict blocking"; monitor authorization status; show non-intrusive re-enable reminders. Address in Phase 1; affects marketing, onboarding, and positioning.

**Additional high-impact pitfalls:**
- **Development Without Mac Creates Blind Spots**: iOS Simulator requires Mac; all testing on physical devices (slower iteration). Budget for device + Apple Developer account in Phase 0.
- **AsyncStorage Data Loss on Force-Close**: Vocabulary progress can disappear after crashes/updates. Use redux-persist or similar; write after every card review. Address in Phase 2.
- **APKG Parsing Memory Issues**: Large Anki decks (2GB+) crash on mobile. Set file size limits (<100MB); show progress indicators; test with large decks. Address in Phase 3.

## Implications for Roadmap

Based on research, the roadmap must address Apple entitlement approval bottleneck (2+ weeks) and build around Screen Time API limitations from day one. Suggested 4-phase structure prioritizes MVP validation before investing in advanced features.

### Phase 0: Foundation & Entitlements (Week -2 to Day 3)
**Rationale:** Apple Family Controls entitlement approval blocks all Screen Time development; must request BEFORE starting Phase 1. Project setup (EAS Build, physical device, Apple Developer account) unblocks iOS testing.

**Delivers:**
- Apple Family Controls entitlement approved (2+ week lead time)
- Expo SDK 55 project initialized with TypeScript
- EAS Build configured for iOS development builds
- Physical iOS 15.1+ test device provisioned
- Basic app structure with Expo Router navigation

**Critical path:** Entitlement approval runs in parallel with project setup.

**Avoids Pitfalls:**
- Development Without Mac (use EAS Build, physical device)
- Late entitlement request blocking launch

### Phase 1: App Blocking MVP (Week 1-3)
**Rationale:** Core value prop is interruption-based vocabulary learning; blocking must work reliably before adding spaced repetition complexity. Address all Screen Time API pitfalls upfront (picker crashes, token handling, callback unreliability, shield limitations).

**Delivers:**
- Screen Time TurboModule with FamilyControls authorization
- App selection UI with FamilyActivityPicker (crash recovery included)
- Basic ManagedSettings blocking (direct manipulation, no DeviceActivityMonitor callbacks)
- Per-app configuration (words required, block duration)
- Simple vocabulary challenge UI (hardcoded test cards)
- Success-based unlocking (must complete X cards)
- Whitelist/exceptions for critical apps

**Uses (from STACK.md):**
- react-native-device-activity for Screen Time APIs
- Expo Modules API for TurboModule integration
- MMKV for persisting app selection and configuration
- Zustand for blocking state management

**Implements (from ARCHITECTURE.md):**
- Screen Time TurboModule
- App Groups shared container
- DeviceActivityMonitor extension (minimal implementation)
- Direct ManagedSettings shield application

**Avoids (from PITFALLS.md):**
- FamilyActivityPicker crashes (crash detection + retry UI)
- Random ApplicationToken changes (use familyActivitySelectionId)
- DeviceActivityMonitor callback unreliability (direct ManagedSettings)
- Shield cannot open parent app (vocabulary UI in main app)
- No passcode protection (frame as commitment device in onboarding)

**Research flag:** SKIP research-phase - Screen Time API patterns well-documented in PITFALLS.md and ARCHITECTURE.md.

### Phase 2: Spaced Repetition Core (Week 4-6)
**Rationale:** Vocabulary learning effectiveness depends on scientifically-proven scheduling. SM-2 algorithm is table stakes; users expect cards at optimal intervals. Progress tracking essential for engagement and retention metrics.

**Delivers:**
- SM-2 spaced repetition algorithm implementation
- Card data model (question, answer, difficulty, ease factor, interval, next review date)
- Review history tracking (timestamp, rating, interval changes)
- Progress statistics (words reviewed, mastered, retention rate, current streak)
- Persistent storage with AsyncStorage data loss protection
- Next card selection logic (prioritize due cards by retrievability)
- Multi-modal card display (text + images, audio deferred to v1.1)

**Uses (from STACK.md):**
- Custom SM-2 implementation or ts-fsrs library for FSRS
- WatermelonDB for card storage and progress tracking (alternative: MMKV if staying simple)
- MMKV for quick card state lookups
- Zustand for current session state

**Implements (from ARCHITECTURE.md):**
- Spaced Repetition Service
- Vocabulary data models (Card, Deck, Progress)
- Progress Tracker Service

**Avoids (from PITFALLS.md):**
- AsyncStorage data loss (write after every card review, use redux-persist)
- Spaced repetition algorithm bugs (use tested library or validate against Anki)
- Timezone handling errors (test midnight transitions)

**Research flag:** SKIP research-phase - SM-2/FSRS algorithms well-documented with reference implementations.

### Phase 3: Anki Import (Week 7-8)
**Rationale:** Users bring existing vocabulary from Anki ecosystem (.apkg is de facto standard). Import unlocks network effects - thousands of free decks available. Defer to Phase 3 because MVP can validate with hardcoded test decks first.

**Delivers:**
- .apkg file import via DocumentPicker
- SQLite parser for collection.anki2 database
- Card extraction (notes, fields, templates, scheduling metadata)
- Media file handling (images, audio) from .apkg archive
- Data transformation from Anki schema to app data model
- Import progress indication and error handling
- File size validation (<100MB initial limit)

**Uses (from STACK.md):**
- anki-apkg-parser library for SQLite parsing
- React Native DocumentPicker for file selection
- WatermelonDB for storing imported cards

**Implements (from ARCHITECTURE.md):**
- APKG Parser Service
- Deck Importer Service

**Avoids (from PITFALLS.md):**
- APKG parsing memory issues (file size limits, progress indicators, chunk processing)
- Loading entire database on every launch (import once, store locally)
- Malformed APKG files (validate schema, sanitize inputs)

**Research flag:** MEDIUM - May need research-phase for APKG file format edge cases and schema variations across Anki versions.

### Phase 4: Enhanced Interruptions (Week 9-10)
**Rationale:** Basic blocking from Phase 1 proves core concept; Phase 4 adds differentiators that improve engagement and reduce friction. Breathing exercise (OneSec model) reduces impulsive behavior; scheduled blocking and usage analytics round out table-stakes screen time features.

**Delivers:**
- 10-second breathing exercise before vocabulary challenge (OneSec integration)
- Scheduled blocking (weekdays vs weekends, time-of-day rules)
- Usage analytics dashboard (time per app, daily/weekly trends, most-blocked apps)
- Learning streaks per app ("47 words learned through Instagram")
- Streak tracking with streak freeze feature
- DeviceActivityMonitor integration for timer-based interruptions (3-5 min thresholds)

**Uses (from STACK.md):**
- DeviceActivity eventDidReachThreshold for timer triggers
- TanStack Query for analytics data fetching (if adding backend later)

**Implements (from ARCHITECTURE.md):**
- Timer-based interruption flow
- Usage analytics aggregation
- Streak tracking logic

**Avoids (from PITFALLS.md):**
- DeviceActivityMonitor callback unreliability (implement fallback polling)
- Over-restrictive blocking (maintain escape hatches, user control)

**Research flag:** SKIP research-phase - Patterns well-documented; OneSec and Forest models provide clear references.

### Phase Ordering Rationale

**Dependencies drive sequence:**
- Phase 0 must precede everything (entitlement approval is 2+ week blocker)
- Phase 1 before Phase 2 (blocking infrastructure must exist before adding vocabulary complexity)
- Phase 2 before Phase 3 (data model must exist before importing into it)
- Phase 3 can run parallel to Phase 4 (independent features)

**Risk mitigation:**
- Phase 1 addresses all critical Screen Time API pitfalls upfront (picker crashes, token handling, callback issues)
- Phase 2 validates spaced repetition with test data before investing in import complexity
- Phase 3 deferred until MVP proven (import is table stakes but not blocking for initial validation)
- Phase 4 adds engagement features after core loop works

**MVP validation boundary:**
- Phases 0-2 deliver minimum viable product: app blocking + vocabulary challenges + spaced repetition
- Phase 3-4 enhance MVP based on validation learnings

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Anki Import):** APKG file format has schema variations across Anki versions; edge cases in HTML/CSS rendering; media file extraction strategies. MEDIUM confidence - anki-apkg-parser library exists but may need workarounds for large files or malformed decks.

Phases with standard patterns (skip research-phase):
- **Phase 0 (Foundation):** Standard Expo setup; well-documented in official docs
- **Phase 1 (App Blocking):** Screen Time API pitfalls thoroughly researched in PITFALLS.md; react-native-device-activity library provides reference implementation
- **Phase 2 (Spaced Repetition):** SM-2/FSRS algorithms have reference implementations (ts-fsrs library); well-documented pattern
- **Phase 4 (Enhanced Interruptions):** OneSec and Forest models provide clear patterns; DeviceActivity usage documented

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Expo SDK 55, React Native 0.83, MMKV, Zustand verified from official sources and 2026 articles. react-native-device-activity confirmed via GitHub. Version numbers cross-referenced with changelogs. |
| Features | MEDIUM | Table stakes and differentiators identified from competitor analysis (Anki, Duolingo, OneSec, Forest). Anti-features based on community feedback and UX research. APKG import requirements from official Anki docs. Some features inferred from general SaaS patterns. |
| Architecture | MEDIUM | TurboModule and App Groups patterns verified from Apple docs and React Native official guides. Screen Time API architecture confirmed via react-native-device-activity library and Apple DeviceActivity documentation. Project structure based on Expo best practices. Some integration details inferred from library examples. |
| Pitfalls | HIGH | All 10 pitfalls verified from multiple sources: Apple Developer Forums (radar reports with FB numbers), react-native-device-activity GitHub issues, riedel.wtf Screen Time API analysis, Stack Overflow threads. Workarounds confirmed from community implementations. |

**Overall confidence:** MEDIUM-HIGH

Research is comprehensive for iOS Screen Time API integration (HIGH confidence) and technology stack selection (HIGH confidence). Features and UX patterns have MEDIUM confidence - based on competitor analysis and general domain knowledge rather than direct user research. Architecture patterns are MEDIUM confidence - core patterns verified but some implementation details will need validation during development.

### Gaps to Address

**During planning/execution:**

- **Screen Time API behavior in production vs development**: DeviceActivityMonitor callbacks and shield UI behave differently when disconnected from Xcode. Test frequently on physical devices in release mode throughout Phase 1.

- **APKG file format edge cases**: Anki schema has evolved over 15+ years; older decks may use deprecated fields or structures. Validate anki-apkg-parser library against diverse real-world decks during Phase 3. Budget time for parser workarounds.

- **User tolerance for interruption friction**: Research suggests OneSec's breathing pause reduces usage by 57%, but Vokabeltrainer adds vocabulary challenge (more friction). Unknown if users find this helpful or annoying. Validate in Phase 1-2 MVP with early testers.

- **FSRS algorithm performance on mobile**: ts-fsrs library performance benchmarks are for desktop. Verify scheduling calculations don't block UI on large decks (10K+ cards) during Phase 2. May need to move to native module or Web Worker if slow.

- **Apple entitlement approval timeline**: Research indicates 2+ weeks typical, but some developers report months-long delays or rejections. Request entitlement immediately in Phase 0 with detailed justification. Have contingency plan if delayed past 3 weeks.

- **EAS Build credits/costs**: Free plan includes limited builds. Unlimited builds require paid plan ($29-99/month depending on tier). Budget for paid EAS subscription or plan build usage carefully.

**Validation checkpoints:**

- **Phase 1 exit criteria**: App blocking works reliably on physical device in release mode; picker crashes handled gracefully; vocabulary challenge UX feels helpful not punishing
- **Phase 2 exit criteria**: Spaced repetition scheduling matches Anki behavior on same card history; progress survives force-close and app updates
- **Phase 3 exit criteria**: Successfully imports top 10 most popular Anki decks from AnkiWeb without errors

## Sources

### Primary (HIGH confidence)
- **STACK.md** — Expo SDK 55 changelog, React Native 0.83 docs, MMKV benchmarks, WatermelonDB vs Realm comparisons, Zustand vs Redux articles
- **FEATURES.md** — Anki docs, Duolingo gamification analysis, OneSec app review, Forest effectiveness research, microlearning studies
- **ARCHITECTURE.md** — React Native New Architecture docs, Apple DeviceActivity framework docs, TurboModule guides, react-native-mmkv GitHub
- **PITFALLS.md** — Apple Developer Forums (FB11400221, FB12270644, FB14082790 radar reports), riedel.wtf Screen Time API analysis, react-native-device-activity GitHub issues

### Secondary (MEDIUM confidence)
- Expo best practices articles (2026) for project structure and EAS Build workflows
- State of JS 2025 survey for technology adoption trends (Zustand 40%, Redux declining)
- Medium articles comparing state management libraries (Zustand vs Redux Toolkit 2026)
- Blog posts on spaced repetition algorithm implementations (SM-2 vs FSRS technical principles)

### Tertiary (LOW confidence, needs validation)
- Community forum discussions on AsyncStorage data loss workarounds
- Stack Overflow threads on Anki APKG parsing challenges
- Blog posts estimating Apple entitlement approval timelines (anecdotal)
- User reviews of screen time apps inferring feature expectations

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
