# Pitfalls Research

**Domain:** React Native + iOS Screen Time API Integration (Vocabulary Trainer App)
**Researched:** 2026-03-01
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: FamilyActivityPicker Memory Crashes

**What goes wrong:**
The FamilyActivityPicker crashes when users search for apps or expand categories containing many tokens. When a category contains enough tokens to exceed the 50MB memory limit (typically 100-200+ apps), the picker crashes 50-100% of the time. This is a known iOS bug (FB11400221, FB12270644, FB13551195, FB14067691) that persists across iOS versions including iOS 18.

**Why it happens:**
Apple's FamilyActivityPicker has a memory management bug where large result sets exceed the 50MB limit, especially common for heavy Safari users with many open tabs or users with 200+ apps installed.

**How to avoid:**
- Implement crash detection in the React Native wrapper around FamilyActivityPicker
- Display an explanation dialog when crash is detected
- Provide a "retry" option in the UI
- Consider limiting the initial selection to fewer categories
- Add fallback UI positioned behind the native picker view (as recommended by react-native-device-activity library)

**Warning signs:**
- Users report app crashes when selecting apps to block
- Crashes occur specifically when tapping "Other" category or using search
- Issue appears more frequently for users with many apps installed

**Phase to address:**
Phase 1 (App Blocking MVP) - Must handle this before app selection UI is usable. Include crash recovery UI from day one.

---

### Pitfall 2: Random ApplicationToken Changes Break State

**What goes wrong:**
iOS randomly provides new, unknown ApplicationToken values to app extensions (ShieldConfigurationDataSource and ShieldActionDelegate) that don't match the tokens originally selected via FamilyActivityPicker. This causes shield UI to display incorrectly or fail to display at all. Token values can suddenly change even for the same app, making it impossible to determine context (re-intervention, countdown, block session, or focus filter). This is an Apple bug (FB14082790).

**Why it happens:**
iOS internal token management is unreliable. Tokens change unpredictably, especially when apps move between different ManagedSettingsStore instances (e.g., focus block to recurring block).

**How to avoid:**
- Store multiple token representations: ApplicationToken, bundle identifier, and display name when available
- Implement fuzzy matching logic to handle token mismatches
- Use `familyActivitySelectionId` for referencing tokens instead of passing tokens directly through the codebase (tokens can be very large, especially with includeEntireCategory flag)
- Design UI to gracefully handle unknown tokens with generic shield messaging
- Never assume token stability across app launches or store migrations

**Warning signs:**
- Shield UI shows incorrect app information
- Previously blocked apps no longer block after app restart
- Logs show unfamiliar ApplicationToken values in extensions

**Phase to address:**
Phase 1 (App Blocking MVP) - Core architecture decision. Token handling strategy must be established before implementing blocking logic.

---

### Pitfall 3: DeviceActivityMonitor Callbacks Don't Fire

**What goes wrong:**
DeviceActivityMonitor's `intervalDidStart`, `intervalDidEnd`, and `eventDidReachThreshold` callbacks are extremely unreliable, especially on iOS 17+. They either don't fire at all, fire prematurely, or terminate early. The callbacks work in debug mode when connected to Xcode but fail in release mode or when disconnected. This is a critical iOS bug affecting all apps using Device Activity framework.

**Why it happens:**
iOS has systemic issues with the Screen Time API implementation. Certain activities in the callback (reading/writing User Defaults, sending analytics) cause early termination. The bug is intermittent and affects production builds more than debug builds.

**How to avoid:**
- DO NOT rely on DeviceActivityMonitor for critical blocking logic
- Move all blocking logic to ManagedSettings direct manipulation instead of monitoring callbacks
- If using monitors, keep callback code minimal - no User Defaults, no analytics, no network calls
- Implement alternative detection mechanisms (app state monitoring, manual schedule checks)
- Hard limit of 20 simultaneous monitors - design schedule architecture carefully to stay under this limit
- For vocabulary app: Don't use DeviceActivityMonitor for unblocking rewards - use manual timer checks instead

**Warning signs:**
- Apps don't unblock at the end of scheduled time
- Apps don't block at the start of scheduled time
- Callbacks work in Xcode but not in production
- User reports that time limits don't update

**Phase to address:**
Phase 1 (App Blocking MVP) - Critical architecture decision. Must choose monitoring strategy before implementing any scheduling logic. Plan to NOT depend on callbacks.

---

### Pitfall 4: Shield Extensions Cannot Open Parent App

**What goes wrong:**
The shield interface only supports three actions: `.none`, `.close`, or `.defer`. There's no way to return users to the parent app from the shield screen for interventions or vocabulary practice prompts. This is an Apple limitation (FB15079668).

**Why it happens:**
Apple's Screen Time API design decision. Third-party apps lack features available to native Screen Time.

**How to avoid:**
- Use local notifications as workaround to prompt users back to the app (unreliable - notifications can be delayed or blocked by Focus modes)
- Design vocabulary prompts to appear BEFORE blocking occurs, not from shield screen
- Set realistic expectations: vocabulary prompts happen in-app, not from shield
- Consider using `.defer` action to give users a short window to return to app voluntarily
- Document this limitation clearly in user onboarding

**Warning signs:**
- Users expect to practice vocabulary from the shield screen
- Product design assumes shield-to-app navigation

**Phase to address:**
Phase 1 (App Blocking MVP) - Critical UX design constraint. Must shape the entire user flow around this limitation.

---

### Pitfall 5: No Passcode Protection for Third-Party Apps

**What goes wrong:**
Users can easily revoke FamilyControls permissions via iOS Settings toggles even when Screen Time is passcode-locked. This completely undermines the app's blocking functionality. Native Screen Time has passcode protection, but third-party apps using the API don't get this feature (FB18794535).

**Why it happens:**
Apple doesn't provide passcode protection APIs to third-party developers.

**How to avoid:**
- Monitor authorization status and alert users when permissions are revoked
- Provide clear onboarding explaining this limitation
- Consider this a "feature" not a "parental control" - it's self-discipline, not enforcement
- For vocabulary app context: Frame as voluntary commitment, not strict blocking
- Detect permission revocation quickly and show non-intrusive reminders to re-enable

**Warning signs:**
- Marketing materials promise "strict blocking"
- Users expect parental-control level enforcement
- Support tickets about "bypassing" the app

**Phase to address:**
Phase 1 (App Blocking MVP) - Critical for setting correct user expectations. Affects marketing copy, onboarding flow, and feature positioning.

---

### Pitfall 6: Development Without Mac Creates Blind Spots

**What goes wrong:**
Building iOS apps on Ubuntu using EAS Build means you cannot test on iOS Simulator (requires Mac + Xcode). All testing must happen on physical devices, which slows iteration. Device testing requires paid Apple Developer account for code signing. Critical issues only discovered late in development when testing on device.

**Why it happens:**
iOS Simulator only runs on macOS. EAS Build runs on cloud servers but you can't interact with simulators remotely.

**How to avoid:**
- Budget for physical iOS test devices from day one
- Pay for Apple Developer account immediately (required for device testing)
- Set up EAS Build development builds early - don't wait until first release
- Test Screen Time API features frequently on device - they behave differently than simulators
- Accept slower iteration cycles - plan sprints accordingly
- Consider cloud Mac service (MacStadium, AWS EC2 Mac) for simulator access if budget allows

**Warning signs:**
- Planning to "test on simulator first, device later"
- No Apple Developer account enrollment started
- No iOS test device procured
- Timeline assumes rapid iteration like web development

**Phase to address:**
Phase 0 (Project Setup) - Before writing any iOS-specific code. Infrastructure must be in place.

---

### Pitfall 7: AsyncStorage Data Loss on iOS App Termination

**What goes wrong:**
AsyncStorage does not reliably persist data when app is force-closed on iOS. Previously stored keys can disappear on app reload, especially after force-close or app updates. This is a known React Native issue affecting vocabulary progress, learned cards, and app configuration.

**Why it happens:**
AsyncStorage on iOS has race conditions during app termination. Write operations may not complete before process kill. iOS file-based storage can be cleared in certain scenarios (low storage, app updates).

**How to avoid:**
- Use redux-persist or similar library that adds persistence guarantees on top of AsyncStorage
- Implement write-ahead logging pattern for critical data (vocabulary progress)
- Add checksum/timestamp verification to detect corrupted state
- For vocabulary app: Maintain vocabulary progress in multiple persistence layers (AsyncStorage + optional cloud backup)
- Write immediately after each card review, don't batch writes
- Test specifically: force-close app mid-review session and verify state restoration

**Warning signs:**
- Users report losing vocabulary progress after app crashes
- Bug reports about "reset" progress after app updates
- Data present in debug logs but missing after app restart

**Phase to address:**
Phase 2 (Spaced Repetition Core) - Critical for vocabulary progress tracking. Must be solved before users accumulate meaningful progress.

---

### Pitfall 8: Anki APKG Parsing Memory Issues

**What goes wrong:**
Large Anki .apkg files (2GB+) fail to import on mobile devices despite working on desktop. The anki-apkg-parser library requires loading entire database into memory. Error messages are vague ("This isn't a valid apkg file") making debugging difficult.

**Why it happens:**
Mobile devices have memory constraints. Anki files are SQLite databases wrapped in ZIP format - parsing requires extracting, which can exceed available memory. Large decks with media files exacerbate the problem.

**How to avoid:**
- Set file size limits in UI (warn before importing >100MB files)
- Parse APKG files in chunks/streaming mode if possible
- Show progress indicators during import to prevent user confusion
- Provide clear error messages distinguishing "file too large" from "corrupt file"
- For vocabulary app: Focus on "typical" deck sizes (1000-10000 cards, <50MB) for MVP
- Test with large decks early - don't assume library handles them
- Consider server-side parsing for very large decks

**Warning signs:**
- Import feature crashes with large decks
- Memory warnings in logs during import
- No file size validation before parsing starts

**Phase to address:**
Phase 3 (Anki Import) - Must handle before import feature ships. Include in acceptance criteria.

---

### Pitfall 9: Expo Config Plugins Break on Rebuild

**What goes wrong:**
Custom native modules created locally don't get included in EAS builds. They work in local development builds but fail in cloud builds with "native module not found" errors. Config plugins must be synchronous and serializable, but this isn't enforced until build time. Regex-based modifications in dangerous mods break on Expo version updates.

**Why it happens:**
EAS Build doesn't automatically package local native code. Config plugins require specific structure. File paths and dependencies must be explicit.

**How to avoid:**
- Follow Expo's config plugin tutorial exactly - don't improvise structure
- Use built-in withXcodeProject and similar helpers instead of custom file parsing
- Test local EAS builds (`eas build --local`) before pushing to cloud
- Keep config plugins simple - avoid regex when possible
- Document manual setup instructions as fallback if plugin fails
- For Screen Time extensions: Each extension needs its own bundle ID configuration in config plugin

**Warning signs:**
- Native module works locally but not in EAS builds
- Build succeeds but app crashes on launch with module errors
- Config plugin has complex regex or async operations

**Phase to address:**
Phase 1 (App Blocking MVP) - Critical when adding Screen Time native modules. Test EAS build integration immediately after adding native code.

---

### Pitfall 10: Spaced Repetition Algorithm Off-By-One Errors

**What goes wrong:**
Implementing spaced repetition algorithms (SM-2, FSRS) from scratch leads to subtle bugs in interval calculation. Common mistakes: timezone handling breaks "cards due today" logic, rounding errors accumulate over time, edge cases (first review, lapsed cards) handled incorrectly. These bugs are silent - algorithm appears to work but scheduling becomes suboptimal over weeks.

**Why it happens:**
Spaced repetition algorithms are deceptively complex. Timezone conversions, floating point math, and edge cases interact in non-obvious ways. Most tutorials and blog posts have implementation errors.

**How to avoid:**
- Use existing, tested libraries (ts-fsrs for FSRS algorithm) instead of implementing from scratch
- If implementing SM-2: Compare output against Anki's implementation on same card history
- Test edge cases explicitly: midnight timezone transitions, leap seconds, first-ever review, cards reviewed late
- For vocabulary app: Consider using Anki's algorithm directly by studying their open-source implementation
- Write property-based tests: "no card should ever have negative interval"
- Monitor scheduling in production: track "average interval" metric to detect algorithm drift

**Warning signs:**
- Cards cluster at specific intervals (7 days, 14 days) instead of spreading naturally
- Users report cards appearing "too soon" or "too late"
- Interval calculations differ between iOS and web if building multi-platform

**Phase to address:**
Phase 2 (Spaced Repetition Core) - Critical before algorithm goes live. Include algorithm validation in testing phase.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skipping config plugin for native modules | Faster initial setup | EAS builds fail in production; manual native code changes lost on rebuild | Never - config plugins are mandatory for Expo managed workflow |
| Using DeviceActivityMonitor callbacks for blocking logic | Matches Apple's example code | Unreliable blocking - callbacks don't fire in production | Never - use ManagedSettings direct manipulation instead |
| Storing ApplicationTokens directly in state | Simple data model | Tokens change randomly, breaking all app references | Never - use familyActivitySelectionId references |
| Implementing spaced repetition from scratch | "Learning experience" | Subtle bugs accumulate; algorithm drift over time | Only if building highly customized algorithm AND have SRS expertise |
| Testing only on simulator | Faster iteration | Screen Time API behaves completely differently on device | Never for Screen Time features - always test on device |
| Batching AsyncStorage writes | Better performance | Data loss on app termination | Only for non-critical data like UI preferences, never for vocabulary progress |
| Hardcoding bundle IDs in extensions | Faster setup | Can't reuse code across apps; EAS builds fail | Only for single-app prototypes, never for production |
| Skipping Apple approval request until app is ready | Focus on development first | Approval takes weeks/months - blocks launch | Never - request approval in Phase 0 |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| FamilyControls Authorization | Requesting authorization without explaining to user first | Show custom screen explaining why Screen Time access is needed, THEN request authorization. Apple rejection risk if you don't. |
| ManagedSettingsStore | Using single store for all blocking scenarios | Create separate stores for different contexts (focus, time limits, vocabulary blocks) to avoid token migration bugs (FB14237883) |
| ShieldConfiguration Extension | Trying to customize shield per app using ApplicationToken | Tokens are unreliable - design single shield UI that works for all blocked apps, use generic messaging |
| DeviceActivityReport | Expecting detailed time tracking | API isn't designed for time tracking out-of-the-box - must parse event names manually to extract timing info |
| Anki APKG Import | Assuming all APKG files follow spec | APKG files can be malformed, use old schema versions, or have missing fields - validate everything |
| EAS Build | Assuming local and cloud builds are identical | Cloud builds may have different Node versions, missing native dependencies, or environment variables - test cloud builds early |
| App Groups | Forgetting to configure App Group in Apple Developer portal | Extensions can't share data with main app - blocking won't work. Configure App Group BEFORE creating extensions. |
| Bundle IDs for Extensions | Using random naming convention | Follow exact pattern: base.ActivityMonitor, base.ShieldAction, base.ShieldConfiguration. Required for Apple approval. |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all vocabulary cards into memory | Fast initial load for small decks | Deck becomes unusable at 10,000+ cards; app crashes on launch | >5000 cards or >100MB deck with media |
| Storing full card review history | Accurate spaced repetition calculations | Database grows unbounded; queries slow down | After 6 months of daily use (50,000+ reviews) |
| Re-rendering entire card list on each review | Simple React state management | UI becomes laggy; scrolling stutters | >1000 cards in filtered view |
| Synchronous APKG parsing on main thread | Simple implementation | UI freezes during import; iOS kills app for watchdog timeout | Any deck >10MB or >1000 cards |
| Creating new ManagedSettingsStore per vocabulary session | Follows Apple examples | Hit iOS memory limits; blocking stops working | After 100+ study sessions without app restart |
| Using large includeEntireCategory selections | Easier than per-app selection | FamilyActivityPicker crashes; tokens too large to store efficiently | Selecting "Social Media" category with 50+ apps |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing FamilyControls authorization tokens in AsyncStorage without encryption | User privacy violation if device compromised | Use iOS Keychain for sensitive tokens via react-native-keychain library |
| Logging ApplicationToken values in production | Exposes user's app usage patterns | Redact all token values in production logs; log only token count or presence |
| Not validating APKG file contents before parsing | Malicious APKG files could contain SQL injection or path traversal | Sanitize all imported data; validate schema; use parameterized queries |
| Exposing vocabulary progress without authentication | User study data accessible to anyone with device | Implement device-level authentication or biometric lock for progress access |
| Hardcoding App Group identifier in code | Leaks internal app structure | Use Expo config plugin to inject App Group ID at build time |
| Not clearing ManagedSettings on app uninstall | Previously blocked apps stay blocked after uninstall | Implement cleanup in app lifecycle; provide "reset all blocks" option in settings |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Promising "strict blocking" in onboarding | Users feel betrayed when they discover Settings toggle | Frame as "commitment device" and "helpful reminder" not "unbreakable lock" |
| Hiding that FamilyActivityPicker might crash | Users blame your app for iOS bug | Show loading screen with "iOS sometimes has issues loading apps. If this screen doesn't load, please try again." |
| Not explaining Screen Time permission dialog | Users deny permission thinking it's invasive | Show custom screen BEFORE permission request explaining exactly what you'll access and why |
| Blocking apps without confirmation | Users panic when apps suddenly stop working | Always show preview of what will be blocked and when before applying ManagedSettings |
| No escape hatch in shield UI | Users feel trapped and delete app | Use `.defer` action to give "5 more minutes" option, plus clear explanation of why app is blocked |
| Importing APKG without progress indication | Users think app froze and force-close mid-import | Show progress bar with "Importing card X of Y" and estimated time |
| Not preserving vocabulary progress on crashes | Users lose hours of study time | Auto-save after every card review; show "restoring progress" on launch |
| Defaulting to blocking entire Social Media category | Power users have legitimate uses; creates frustration | Suggest individual app selection; explain category selection risks (performance + over-blocking) |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **App Blocking:** Blocks apps successfully - verify unblocking works reliably (common to forget intervalDidEnd issues)
- [ ] **FamilyActivityPicker:** Loads and selects apps - verify crash recovery UI handles 200+ app edge case
- [ ] **Shield Configuration:** Shows shield screen - verify works with random ApplicationToken changes (test after app restart)
- [ ] **Vocabulary Import:** Imports APKG file - verify large files (>50MB) don't crash and show appropriate errors
- [ ] **Spaced Repetition:** Cards appear on schedule - verify timezone transitions at midnight don't break "due today" logic
- [ ] **Progress Persistence:** Saves after each review - verify survives force-close and app updates
- [ ] **Extension Configuration:** Extensions build successfully - verify work in release mode disconnected from Xcode (debug mode hides bugs)
- [ ] **Bundle IDs:** Extensions have bundle IDs - verify all four IDs submitted for Apple approval (base + 3 extensions)
- [ ] **App Groups:** Data shares between app and extensions - verify App Group configured in Apple Developer portal, not just code
- [ ] **EAS Build:** Builds locally - verify cloud builds work with native modules included
- [ ] **Authorization Flow:** Requests permissions - verify re-authorization flow when user revokes in Settings
- [ ] **Token Handling:** Stores ApplicationTokens - verify uses familyActivitySelectionId references, not raw tokens

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| FamilyActivityPicker crashes for user | LOW | Detect crash, show dialog: "iOS had trouble loading your apps. Please try selecting apps again." Clear cached selection and retry. |
| ApplicationToken mismatch in production | MEDIUM | Log unknown tokens, display generic shield with "Blocked app" message. Prompt user to reconfigure app selection. Don't crash. |
| DeviceActivityMonitor callbacks stop firing | MEDIUM | Implement fallback: manual schedule checks every 60 seconds using timer. Detect missing callback and switch to polling mode. |
| AsyncStorage data loss after update | HIGH | Maintain backup copy in separate persistence layer (cloud or secondary local storage). On launch, check for data corruption and restore from backup. |
| APKG import crashes with large file | LOW | Catch exception, show "File too large" error, guide user to import smaller deck or split on desktop first. |
| EAS build fails with native module error | MEDIUM | Document manual native setup steps as fallback. If config plugin fails, provide instructions for manual Xcode/Android Studio configuration. |
| Spaced repetition algorithm bug discovered | HIGH | Can't retroactively fix bad scheduling. Provide "reset card history" option. Communicate bug fix in release notes. Implement migration to correct future reviews. |
| User revokes FamilyControls permission | LOW | Detect immediately on app launch, show non-blocking reminder to re-enable. Don't prevent app usage, but disable blocking features. |
| Extension crashes in production | MEDIUM | Extensions crash silently - difficult to detect. Implement health check: main app periodically verifies extensions respond. If not, prompt user to reinstall. |
| Vocabulary progress corrupted | HIGH | Validate progress data on load. If corrupted, offer "restore from X days ago" using backup. Last resort: start fresh but preserve deck structure. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| FamilyActivityPicker crashes | Phase 1 (App Blocking MVP) | Test with 200+ apps installed. Verify crash recovery dialog appears and retry works. |
| Random ApplicationToken changes | Phase 1 (App Blocking MVP) | Store tokens, restart app, verify shield still shows. Check logs for token mismatches. |
| DeviceActivityMonitor callbacks don't fire | Phase 1 (App Blocking MVP) | Schedule block, disconnect from Xcode, verify blocks/unblocks in release mode. |
| Shield can't open parent app | Phase 1 (App Blocking MVP) | Design review: verify user flow doesn't require shield-to-app navigation. |
| No passcode protection | Phase 1 (App Blocking MVP) | Marketing review: verify no "strict blocking" promises. Test permission revocation UX. |
| Development without Mac | Phase 0 (Project Setup) | Verify physical iOS device available, Apple Developer account active, EAS builds working. |
| AsyncStorage data loss | Phase 2 (Spaced Repetition Core) | Force-close app mid-review, restart, verify progress restored. Test after app update. |
| APKG parsing memory issues | Phase 3 (Anki Import) | Import 2GB test deck, verify graceful error. Import 50MB deck, verify success. |
| Expo config plugin errors | Phase 1 (App Blocking MVP) | Run `eas build --local`, verify succeeds. Run cloud build, verify native modules included. |
| Spaced repetition algorithm bugs | Phase 2 (Spaced Repetition Core) | Property-based tests for edge cases. Compare output to Anki on same card sequence. |

---

## Sources

### iOS Screen Time API Issues
- [Apple's Screen Time API has some major issues - riedel.wtf](https://riedel.wtf/state-of-the-screen-time-api-2024/)
- [react-native-device-activity - GitHub](https://github.com/kingstinct/react-native-device-activity)
- [FamilyActivityPicker Crashing - Apple Developer Forums](https://developer.apple.com/forums/thread/743770)
- [DeviceActivityMonitor unreliable - Apple Developer Forums](https://developer.apple.com/forums/thread/743007)
- [Device Activity Extension not being called - Apple Developer Forums](https://developer.apple.com/forums/thread/705284)

### React Native Development
- [Offline-First React Native: How We Ship Apps - Medium](https://medium.com/@silverskytechnology/offline-first-react-native-how-we-ship-apps-that-work-without-the-internet-4f5b241f5d3d)
- [React Native AppState 2026 Updates - Medium](https://medium.com/@expertappdevs/react-native-appstate-2026-updates-insights-0b148103d10a)
- [AsyncStorage data loss on force close - GitHub Issue #962](https://github.com/react-native-async-storage/async-storage/issues/962)
- [How to Handle State Management in React Native](https://oneuptime.com/blog/post/2026-02-02-react-native-state-management/view)

### Expo & EAS Build
- [Introduction to config plugins - Expo Documentation](https://docs.expo.dev/config-plugins/introduction/)
- [Create a development build on EAS - Expo Documentation](https://docs.expo.dev/develop/development-builds/create-a-build/)
- [EAS Build - Expo Documentation](https://docs.expo.dev/build/introduction/)

### Spaced Repetition
- [Spaced Repetition Algorithm: A Three-Day Journey - GitHub](https://github.com/open-spaced-repetition/fsrs4anki/wiki/spaced-repetition-algorithm:-a-three%E2%80%90day-journey-from-novice-to-expert)
- [What spaced repetition algorithm does Anki use? - Anki FAQs](https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html)

### Anki APKG
- [anki-apkg-parser - GitHub](https://github.com/74Genesis/anki-apkg-parser)
- [APKG import errors - Anki Forums](https://forums.ankiweb.net/t/error-importing-apkg-file/33811)

---
*Pitfalls research for: React Native + iOS Screen Time API (Vokabeltrainer)*
*Researched: 2026-03-01*
