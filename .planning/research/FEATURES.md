# Feature Research

**Domain:** Vocabulary Learning + Screen Time Management (Hybrid App)
**Researched:** 2026-03-01
**Confidence:** MEDIUM

## Feature Landscape

This research covers TWO domains that Vokabeltrainer combines:
1. **Vocabulary Learning** (Anki, Duolingo, etc.)
2. **Screen Time Management** (OneSec, Forest, Opal, etc.)

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

#### Vocabulary Learning Domain

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Spaced Repetition Algorithm | Industry standard since Anki, scientifically proven to improve retention | MEDIUM | FSRS (Free Spaced Repetition Scheduler) is current SOTA as of 2023; SM2 algorithm is baseline. Users expect words to appear at optimal intervals. |
| Flashcard Import (.apkg) | Anki's .apkg format is the de facto standard for vocabulary decks | MEDIUM | Must support HTML, images, sounds, CSS styling, and multiple note types (basic, cloze, image occlusion). Scheduling data optional but valuable. |
| Progress Tracking | Users expect to see what they've learned and retention rates | LOW | Minimum: mastered words count, daily/weekly stats. Expected metrics: retention rate, success rate, time spent. |
| Multi-modal Cards | Audio, images, and text are expected in modern flashcards | MEDIUM | HTML content support required. Audio playback for pronunciation. Image display for visual learning. |
| Streak Tracking | Gamification standard - users maintaining 7-day streaks are 3.6x more engaged | LOW | Daily completion tracking. Streak freeze feature reduces churn by 21% (optional but valuable). |

#### Screen Time Management Domain

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| App Blocking/Restriction | Core function - users expect to control which apps are blocked | MEDIUM | Android: AccessibilityService or UsageStatsManager. Requires careful UX to avoid frustration. |
| Flexible Time Limits | Users expect different limits for weekdays vs weekends, or by time of day | MEDIUM | Per-app daily limits are baseline. Weekly limits and scheduled blocking are table stakes in 2026. |
| Usage Analytics | Users expect to see time spent per app, daily totals, trends | MEDIUM | Must show: per-app usage, daily/weekly trends, most-used apps. iOS Screen Time and Android Digital Wellbeing set expectations. |
| Whitelist/Exceptions | Users need emergency access or certain apps always available | LOW | Essential apps (phone, messages, maps) should be easily exempted. Per-app or category-based exceptions. |
| Bypass Prevention | Users expect the blocker to actually work, not be easily defeated | HIGH | CRITICAL PITFALL: Easy bypasses (time change, settings toggle, VPN disable) destroy user trust. Android is more controllable than iOS. |

#### Hybrid Domain (Vokabeltrainer-Specific)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Interruption-Based Learning | Core value prop - vocab comes to user via app blocking | HIGH | Must feel helpful, not punishing. Microlearning research shows 17% better retention with small chunks. But friction must be meaningful, not annoying. |
| Per-App Configuration | Users will want different interruption patterns for different apps | MEDIUM | E.g., 1 word for quick apps, 5 words for social media. Timer intervals per app. Critical for user control. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Context-Aware Interruptions | Don't interrupt during calls, navigation, or critical tasks | HIGH | Detect app context (e.g., Maps during navigation, Spotify during music). Requires permission handling and smart detection. MEDIUM confidence - technically complex. |
| Adaptive Difficulty | Show easier words when user is in high-distraction context (e.g., scrolling social media) vs harder words during intentional study | HIGH | Combine spaced repetition with context awareness. Requires ML or heuristics to assess word difficulty and user state. |
| Success-Based Unlocking | Unlock app only after correctly answering X words (not just viewing them) | MEDIUM | Prevents mindless clicking through. Research shows friction reduces impulsive behavior by 57%. Core to value prop. |
| Learning Streaks Per App | Track vocabulary learning progress separately for each blocked app | LOW | "You've learned 47 words through Instagram interruptions this month." Gamification + attribution = motivation. |
| Real Tree Planting | Following Forest's model - plant real trees based on learning achievements | MEDIUM | Partnership required (e.g., Tree-Nation, One Tree Planted). Strong emotional connection. Forest proved this works. |
| Breathing Exercise + Vocab | Combine OneSec's breathing pause with vocabulary learning | MEDIUM | 10-second breath, then flashcard. Reduces impulsive app opening (OneSec reports 57% reduction) while adding learning. |
| Smart Deck Selection | Auto-select relevant vocabulary based on app context or time of day | HIGH | E.g., business vocab during work hours, casual vocab during evenings. Requires deck tagging and scheduling logic. |
| Social Accountability | Share streaks with friends, compete on leaderboards | MEDIUM | Duolingo's leagues increase lesson completion by 25%. But requires backend, user accounts, privacy considerations. |
| Offline Mode | Full functionality without internet for vocabulary review | LOW | Anki's killer feature. Essential for mobile users. Sync when online. |
| Custom Interruption Patterns | Power users can script their own blocking/learning rules | HIGH | "Block Instagram after 10 minutes, show 3 vocab words, allow 5 minutes, repeat." Advanced but sticky for power users. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Complete App Blocking (No Exceptions) | Users want "unbreakable" blocking to force discipline | iOS makes this impossible without enterprise MDM. Android users can bypass via safe mode, time changes, uninstall. Creates frustration when it fails. Research shows users prefer tracking over hard blocks. | Friction-based delays (OneSec model) with required vocabulary completion. Can't be bypassed easily, but allows emergency access. |
| Gamification Overload | Users request points, badges, leagues, achievements, levels, avatars, etc. | Novelty effect wears off quickly. Once gamification becomes shallow or overly competitive, it distracts from actual learning. Duolingo criticism: "More game than learning." | Focus on meaningful metrics (words mastered, retention rate, real-world usage). One or two key gamification elements (streaks, trees) done well. |
| All-or-Nothing Learning | "Must answer 100% correctly to unlock app" | Frustration and abandonment. Learning involves mistakes. Penalizing failure discourages engagement. | Require completion, not perfection. E.g., "Answer 5 words (even if incorrect) to unlock." Track accuracy separately for spaced repetition. |
| Word-of-the-Day Notifications | Push notifications teaching new words outside app usage | Push fatigue. Users ignore or disable. Doesn't leverage core value prop (interruption-based learning). | Vocabulary appears naturally during app blocking moments. No additional notifications needed. |
| Elaborate Social Features | Friend requests, messaging, profiles, shared decks, comments | Scope creep. Requires moderation, privacy policies, content filtering. Distracts from core value. | Simple streak sharing (read-only leaderboard). No social network. |
| Perfect Translation Memory | Store all possible translations and contexts for every word | Users expect exhaustive dictionaries. But creates complexity without value for flashcards. | Import what's in the deck. Link to external dictionaries (e.g., dict.cc, WordReference) for deep dives. Don't reinvent dictionaries. |
| Real-Time Syncing Across Devices | Users want instant sync of all data to all devices | Backend complexity, cost, sync conflicts, privacy concerns. Most vocabulary learning happens on one device. | Periodic sync (Anki's AnkiWeb model). Manual export/import for power users. Focus on single-device experience first. |
| Punitive Interruptions | "Block app for 1 hour if you fail vocabulary" | Negative reinforcement creates resentment. Users uninstall or bypass. | Positive reinforcement (unlock after learning). Delayed access (10-second breath + vocab) but not total blocking. |

## Feature Dependencies

```
VOCABULARY LEARNING CORE:
[Flashcard Data Model]
    ├──requires──> [Spaced Repetition Algorithm]
    ├──requires──> [Progress Tracking]
    └──requires──> [Multi-modal Display (text/image/audio)]

[Anki Import (.apkg)]
    └──requires──> [Flashcard Data Model]

[Streak Tracking]
    └──requires──> [Progress Tracking]

SCREEN TIME MANAGEMENT CORE:
[App Detection/Listing]
    ├──requires──> [Android Permissions (UsageStatsManager)]
    └──enables──> [App Blocking]

[App Blocking]
    ├──requires──> [AccessibilityService OR Device Admin]
    └──enables──> [Time Limits]

[Usage Analytics]
    └──requires──> [App Detection + UsageStatsManager]

HYBRID INTEGRATION:
[Interruption-Based Learning]
    ├──requires──> [App Blocking]
    ├──requires──> [Flashcard Display]
    └──enables──> [Success-Based Unlocking]

[Per-App Configuration]
    ├──requires──> [App Detection]
    └──enhances──> [Interruption-Based Learning]

[Context-Aware Interruptions]
    ├──requires──> [App Detection]
    ├──requires──> [Android Context APIs]
    └──conflicts──> [Simple Implementation] (adds complexity)

GAMIFICATION LAYER:
[Learning Streaks Per App]
    ├──requires──> [Progress Tracking]
    └──requires──> [Per-App Configuration]

[Real Tree Planting]
    ├──requires──> [Streak Tracking OR Progress Milestones]
    └──requires──> [External Partnership]

CONFLICTS:
[All-or-Nothing Learning]
    └──conflicts──> [User Retention] (high frustration)

[Complete App Blocking]
    └──conflicts──> [Platform Limitations] (iOS, Android safe mode)

[Elaborate Social Features]
    └──conflicts──> [MVP Timeline] (massive scope)
```

### Dependency Notes

- **Flashcard Data Model is foundational**: Everything else builds on this. Must support Anki's schema (notes, cards, note types, fields, templates).
- **Spaced Repetition requires progress tracking**: Can't schedule next review without knowing past performance.
- **App Blocking is Android-specific**: Different implementations for AccessibilityService vs Device Admin. iOS extremely limited.
- **Interruption-Based Learning is the core innovation**: Requires both blocking and flashcard display to work together seamlessly.
- **Per-App Configuration is essential for usability**: Without it, users can't customize interruption intensity.
- **Context-Aware Interruptions conflicts with simplicity**: Nice-to-have but adds significant complexity. Defer to v2.
- **Social features conflict with MVP scope**: Leaderboards require backend, accounts, moderation. Simple local-first approach is faster to market.

## MVP Definition

### Launch With (v1.0)

Minimum viable product — what's needed to validate the core concept.

- [x] **Anki Deck Import** — Core value prop. Users bring their existing vocabulary.
- [x] **Basic Spaced Repetition** — SM2 algorithm minimum. FSRS is nice-to-have but not blocking.
- [x] **App Blocking with Vocabulary Gate** — Core innovation. Block selected apps, require X vocabulary answers to unlock.
- [x] **Per-App Configuration** — Number of words required, block duration. Essential for user control.
- [x] **Simple Progress Tracking** — Words reviewed today, total mastered, current streak. Displayed in main screen.
- [x] **Flashcard Display (Text + Images)** — Basic card rendering. Audio is nice-to-have for v1.
- [x] **Success-Based Unlocking** — Must complete X cards (not just skip through) to unlock app.
- [x] **Whitelist/Exceptions** — Critical apps (phone, messages, maps) always accessible.

**Rationale**: These 8 features prove the concept: "Vocabulary learning happens automatically through app blocking." Without any of these, the app doesn't work. Everything else is enhancement.

### Add After Validation (v1.1 - v1.5)

Features to add once core is working and users are engaged.

- [ ] **Streak Tracking with Streak Freeze** — Add after progress tracking proves engagement. Reduces churn by 21%.
- [ ] **Audio Playback for Cards** — Expected for language learning. But v1 can work without it.
- [ ] **Advanced Spaced Repetition (FSRS)** — Upgrade from SM2 once base algorithm is proven.
- [ ] **Usage Analytics Dashboard** — Show time spent per app, trends, most-blocked apps. Valuable but not required for MVP.
- [ ] **Scheduled Blocking** — "Block Instagram only between 9am-5pm on weekdays." Requested feature but adds complexity.
- [ ] **Breathing Exercise Integration** — OneSec's 10-second pause + vocab. Enhances interruption pattern.
- [ ] **Learning Streaks Per App** — "47 words learned through Instagram." Motivating attribution.
- [ ] **Export/Backup** — Users will want to save progress. Add before major user base grows.

**Trigger for adding**: User retention >30% after 30 days, or direct user requests for specific features.

### Future Consideration (v2.0+)

Features to defer until product-market fit is established.

- [ ] **Real Tree Planting** — Requires partnership, payment processing. Emotionally powerful but operationally complex.
- [ ] **Context-Aware Interruptions** — Don't interrupt during navigation, calls. Technically challenging, nice-to-have.
- [ ] **Adaptive Difficulty** — Match word difficulty to user context. Requires ML or sophisticated heuristics.
- [ ] **Social Leaderboards** — Duolingo-style leagues. Requires backend, accounts, moderation. Massive scope.
- [ ] **Smart Deck Selection** — Auto-select vocabulary by time/context. Requires deck tagging, scheduling logic.
- [ ] **Custom Interruption Patterns** — Scriptable rules for power users. Small audience, high complexity.
- [ ] **AnkiWeb Sync** — Two-way sync with Anki ecosystem. Complex but valuable for power users.
- [ ] **Offline Mode** — Full functionality without internet. Important but v1 can require connectivity.

**Why defer**: These features are valuable but not essential for proving core value. Each requires significant development and some (social, partnerships, sync) require ongoing operational costs.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Anki Deck Import (.apkg) | HIGH | MEDIUM | P1 |
| App Blocking with Vocab Gate | HIGH | HIGH | P1 |
| Per-App Configuration | HIGH | MEDIUM | P1 |
| Basic Spaced Repetition (SM2) | HIGH | MEDIUM | P1 |
| Simple Progress Tracking | HIGH | LOW | P1 |
| Flashcard Display (Text + Image) | HIGH | LOW | P1 |
| Success-Based Unlocking | HIGH | LOW | P1 |
| Whitelist/Exceptions | HIGH | LOW | P1 |
| Streak Tracking | MEDIUM | LOW | P2 |
| Audio Playback | MEDIUM | MEDIUM | P2 |
| Advanced Spaced Rep (FSRS) | MEDIUM | MEDIUM | P2 |
| Usage Analytics Dashboard | MEDIUM | MEDIUM | P2 |
| Scheduled Blocking | MEDIUM | MEDIUM | P2 |
| Breathing Exercise Integration | MEDIUM | LOW | P2 |
| Learning Streaks Per App | MEDIUM | LOW | P2 |
| Export/Backup | MEDIUM | LOW | P2 |
| Real Tree Planting | HIGH | HIGH | P3 |
| Context-Aware Interruptions | MEDIUM | HIGH | P3 |
| Adaptive Difficulty | MEDIUM | HIGH | P3 |
| Social Leaderboards | MEDIUM | HIGH | P3 |
| Smart Deck Selection | LOW | HIGH | P3 |
| Custom Interruption Patterns | LOW | HIGH | P3 |
| AnkiWeb Sync | MEDIUM | HIGH | P3 |
| Offline Mode | MEDIUM | MEDIUM | P3 |

**Priority key:**
- **P1 (Must have for launch)**: Without these, the app doesn't fulfill its value proposition.
- **P2 (Should have, add when possible)**: Improve engagement and retention. Add after v1 validation.
- **P3 (Nice to have, future consideration)**: High value but high cost, or low value. Defer until PMF.

## Competitor Feature Analysis

| Feature | Anki | Duolingo | OneSec | Forest | Vokabeltrainer Approach |
|---------|------|----------|--------|--------|-------------------------|
| Spaced Repetition | ✓ (FSRS/SM2) | ✓ (Adaptive) | ✗ | ✗ | ✓ SM2 minimum, FSRS later |
| Deck Import | ✓ (.apkg) | ✗ (proprietary) | ✗ | ✗ | ✓ (.apkg - must have) |
| Gamification | Minimal | High (leagues, XP, streaks) | Minimal | Medium (trees, forests) | Medium (streaks, trees optional) |
| App Blocking | ✗ | ✗ | ✓ (friction-based) | ✓ (time-based) | ✓ (vocab-gated) |
| Usage Analytics | ✗ | ✓ (progress, XP) | ✓ (time saved) | ✓ (focus time) | ✓ (vocab + screen time) |
| Social Features | Shared decks only | High (leagues, friends) | ✗ | Medium (friend forests) | Low (simple sharing) |
| Interruption Learning | ✗ | ✗ (scheduled only) | Breathing only | ✗ | ✓ (CORE INNOVATION) |
| Real Tree Planting | ✗ | ✗ | ✗ | ✓ (partnership) | Maybe (v2) |
| Offline Mode | ✓ (full) | Limited | ✗ | ✓ (timer works) | v2 consideration |
| Multi-platform | ✓ (Win/Mac/Linux/iOS/Android) | ✓ (iOS/Android/Web) | iOS only | ✓ (iOS/Android) | Android first (iOS limited) |

### Key Insights from Competitor Analysis

**What Anki Does Well:**
- .apkg format is industry standard - must support
- Spaced repetition is scientifically proven - don't reinvent
- Offline-first design - important for mobile but defer to v2
- Customization depth - power users love this, but overwhelming for beginners

**What Duolingo Does Well:**
- Gamification increases engagement (leagues +25% completion)
- Streaks create habit (7-day streak = 3.6x retention)
- Mobile-first, bite-sized lessons
- But: criticized as "more game than learning" - avoid over-gamification

**What OneSec Does Well:**
- Friction-based interruption (57% usage reduction)
- Breathing exercise breaks autopilot
- Simple, focused UX
- But: no learning component - we add vocabulary

**What Forest Does Well:**
- Tree metaphor is emotionally powerful
- Real tree planting creates meaning
- Social accountability (friend forests)
- But: passive timer, no active learning during blocking

**Vokabeltrainer's Unique Position:**
- Combines Anki's spaced repetition + OneSec's interruption + Forest's positive framing
- Vocabulary learning happens during app blocking moments (no competitor does this)
- Turn screen time addiction into learning opportunity
- Risk: Complexity of combining two domains. Must feel cohesive, not bolted together.

## Domain-Specific Insights

### Vocabulary Learning Domain

**What Users Expect:**
- Scientifically-backed learning methods (spaced repetition is non-negotiable)
- Import existing content (don't lock users into proprietary formats)
- Progress visibility (they want to see mastery, not just completion)
- Context over rote memorization (sentences > isolated words)

**What Actually Works:**
- Microlearning: 17% more efficient than long-form learning
- Spaced repetition: FSRS shows better retention than SM2 but SM2 is sufficient for MVP
- Emotional/personal connection: self-made cards > downloaded decks
- Multi-modal learning: text + audio + images > text alone

**Common Pitfalls:**
- Learning without context (isolated words are harder to remember)
- Passive recognition vs active recall (must require typing/speaking, not just multiple choice)
- Over-gamification (points/badges distract from actual learning)
- Perfectionism (requiring 100% accuracy discourages engagement)

### Screen Time Management Domain

**What Users Expect:**
- Actual blocking that works (not easily bypassed)
- Flexibility (different rules for different apps/times)
- Emergency access (can't block critical apps like phone, maps)
- Analytics (show me where my time goes)

**What Actually Works:**
- Friction-based delays > hard blocking (57% usage reduction with friction)
- Positive framing > punishment (Forest's trees > app jail)
- Simple rules > complex configurations (most users want "block these apps after X minutes")
- Awareness > restriction (tracking alone increases mindfulness)

**Common Pitfalls:**
- Easy bypasses destroy trust (time change, settings toggle, uninstall)
- All-or-nothing blocking causes frustration and abandonment
- Over-restrictive = users disable the app entirely
- Platform limitations (iOS is very limited, Android is more flexible but users can still bypass)
- "Ignore Limit" buttons undermine the entire purpose

### Hybrid Domain (Vokabeltrainer-Specific)

**Core Innovation Risk:**
- Users might see interruptions as punishment, not opportunity
- Must feel helpful, not annoying
- Balance: enough friction to break autopilot, not so much they uninstall

**Design Principles:**
- Positive framing: "Learn while you wait" not "blocked until you learn"
- User control: per-app configuration is essential
- Graduated friction: start gentle (1 word), increase if user wants
- Escape hatch: whitelist for emergencies

**Success Metrics:**
- Do users learn vocabulary? (measured by spaced repetition performance)
- Do users reduce screen time? (measured by app usage analytics)
- Do users stay engaged? (30-day retention rate)

## Sources

### Vocabulary Learning Apps
- [Anki - powerful, intelligent flashcards](https://apps.ankiweb.net/)
- [Anki Review 2026: Spaced Repetition System](https://linguasteps.com/reviews/anki-review-2025-how-ankis-spaced-repetition-system-can-revolutionize-your-language-learning)
- [Spaced Repetition App Guide 2025-2026](https://makeheadway.com/blog/spaced-repetition-app/)
- [Duolingo's Gamification Success](https://www.blueoceanstrategy.com/blog/duolingo/)
- [Duolingo Gamification Explained](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)
- [5 Best Vocabulary Builder Apps in 2026](https://emergent.sh/learn/best-vocabulary-builder-apps)
- [14 Best Vocabulary Apps for 2026](https://www.speedreadinglounge.com/vocabulary-apps)
- [Anki Packaged Decks - Official Manual](https://docs.ankiweb.net/importing/packaged-decks.html)
- [APKG File Format Documentation](https://docs.fileformat.com/web/apkg/)

### Screen Time Management Apps
- [OneSec App Blocker - Google Play](https://play.google.com/store/apps/details?id=wtf.riedel.onesec)
- [OneSec App Review - Lowering Screen Time](https://www.bustle.com/wellness/one-sec-app-review-lowering-screen-time)
- [How OneSec Works (Official)](https://one-sec.app/blog/how-one-sec-works/)
- [Forest: Focus for Productivity](https://www.forestapp.cc/)
- [Forest App Review: Gamified Focus](https://www.primeproductiv4.com/apps-tools/forestapp-review)
- [Top 5 Screen Time Reduction Apps 2026](https://medium.com/@sharmaakanksha3009/top-5-screen-time-reduction-apps-you-must-try-before-2026-ios-android-398271f9e7bb)
- [Best Apps to Reduce Screen Time 2026](https://screenapp.io/blog/best-apps-to-reduce-screen-time)

### Research & Effectiveness
- [Microlearning Effectiveness Research 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12061706/)
- [Microlearning Statistics and Trends](https://elearningindustry.com/microlearning-statistics-facts-and-trends)
- [Gamification in Language Learning Effectiveness](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.1030790/full)
- [Duolingo's Gamification Secrets: Streaks & XP Boost Engagement by 60%](https://www.orizon.co/blog/duolingos-gamification-secrets)
- [Screen Time Research: Tracking vs Reducing Usage](https://www.journals.uchicago.edu/doi/abs/10.1086/714365)

### Common Pitfalls & Anti-patterns
- [Stop Using Flashcards (Anti-pattern Analysis)](https://www.supercocoapp.com/post/stop-using-flashcards/)
- [Disadvantages of Flashcards - Brainscape](https://www.brainscape.com/academy/disadvantages-flashcards/)
- [Ways to Bypass Screen Time Apps](https://eyepromise.com/blogs/news/ways-to-bypass-screen-time-apps-app-exploits)
- [Screen Time App Limits Not Working - Tech Lockdown](https://www.techlockdown.com/articles/screen-time-app-limits-not-working)
- [How Kids Bypass Screen Time - Kidslox](https://kidslox.com/how-to/bypass-screen-time/)

---
*Feature research for: Vokabeltrainer (Vocabulary Learning + Screen Time Management)*
*Researched: 2026-03-01*
*Confidence: MEDIUM (based on web search + domain analysis; verified with official documentation where available)*
