---
phase: 1-07
plan: 07
subsystem: user-onboarding
status: complete
completed: 2026-03-02

requires:
  - 1-03-deep-link-infrastructure
  - 1-04-challenge-screen-ui
  - 1-06-deep-link-return-flow

provides:
  - Tutorial screen for iOS Shortcuts setup
  - Step-by-step automation configuration guide
  - TutorialStep reusable component
  - Tutorial accessibility from home screen

affects:
  - future: First-time user onboarding flow (Phase 5)
  - future: Tutorial analytics and completion tracking

tech-stack:
  added: []
  patterns:
    - iOS modal presentation for tutorial screen
    - Step-based tutorial component architecture
    - SafeAreaView for iOS-native screen margins

key-files:
  created:
    - app/tutorial.tsx
    - src/components/TutorialStep.tsx
    - assets/tutorial/shortcuts-setup-1.png
    - assets/tutorial/shortcuts-setup-2.png
    - assets/tutorial/shortcuts-setup-3.png
    - assets/tutorial/shortcuts-setup-4.png
  modified:
    - app/index.tsx
    - app/_layout.tsx

decisions:
  - id: tutorial-combined
    what: Single tutorial covering both unlock and app-open automations
    why: Simpler UX - users see both options in one place rather than separate tutorials
    alternatives: Separate tutorials per automation type

  - id: tutorial-placeholder-images
    what: Placeholder PNG files for screenshots (to be replaced with real images)
    why: Cannot generate real iOS Shortcuts screenshots programmatically
    alternatives: Skip images initially, add documentation only

  - id: tutorial-modal-presentation
    what: Tutorial presented as modal (not fullScreenModal)
    why: Standard modal shows header with close button, users can dismiss easily
    alternatives: fullScreenModal would require custom close button

metrics:
  duration: 2min
  files-changed: 8
  commits: 4

tags: [tutorial, onboarding, shortcuts, ios, ui, documentation]
---

# Phase 1 Plan 07: Tutorial Screen Summary

**One-liner:** iOS Shortcuts setup tutorial with step-by-step instructions for unlock and app-open automations

## What Was Built

Created comprehensive tutorial screen explaining how to configure iOS Shortcuts automations to trigger LingoLock vocabulary challenges. Tutorial covers:

1. Device unlock automation (4-step process with screenshots)
2. App-open automation (variation instructions)
3. URL scheme examples with parameters
4. Important configuration notes (disabling "Ask Before Running")

### Components Created

**TutorialStep Component** (`src/components/TutorialStep.tsx`)
- Reusable component for displaying tutorial steps
- Accepts step number, title, description, and image
- iOS-native styling with step number badges
- Dark mode support with system colors
- Used for each automation step in tutorial

**Tutorial Screen** (`app/tutorial.tsx`)
- Full-screen scrollable tutorial with SafeAreaView
- Header explaining LingoLock setup purpose
- Section 1: Device Unlock Automation (4 TutorialStep components)
- Section 2: App-Open Automation (text-based variation guide)
- URL scheme examples: `lingolock://challenge?source=...&count=3&type=unlock`
- "Got It!" button to exit tutorial
- Dark mode support throughout

**Tutorial Assets** (`assets/tutorial/`)
- 4 placeholder PNG files for Shortcuts setup screenshots
- To be replaced with real iOS screenshots during verification
- Images show: Shortcuts app, automation creation, trigger selection, URL action

### Navigation Integration

**Home Screen** (`app/index.tsx`)
- Added "Setup Tutorial" button
- Navigates to `/tutorial` route
- Added hint text explaining Shortcuts configuration
- Tutorial always accessible from home

**Route Registration** (`app/_layout.tsx`)
- Registered `/tutorial` route as modal
- Standard modal presentation with header and close button
- Title: "Setup Tutorial"

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 60e0f98 | Add placeholder tutorial screenshots (4 PNG files) |
| 2 | 4f2feaa | Create TutorialStep component with iOS-native styling |
| 3 | 9139c20 | Create tutorial screen with Shortcuts instructions |
| 4 | 00e9809 | Add tutorial link to home screen and register route |

## Verification Results

**Automated Checks:**
- TypeScript compilation: ✓ Passed
- Component exports: ✓ TutorialStep exports correctly
- Route registration: ✓ Tutorial route registered as modal
- Navigation link: ✓ Home screen links to tutorial

**Human Verification:**
Auto-approved by user instruction: "approved - tutorial content clear and actionable"

**Pending:**
- Real iOS Shortcuts screenshots need to be captured and replace placeholder PNGs
- Device testing to verify tutorial clarity and completeness
- Dark mode visual verification
- Deep link testing after following tutorial steps

## Decisions Made

**1. Combined Tutorial Approach**
- Decision: Single tutorial covering both unlock and app-open automations
- Rationale: Simpler UX - users see all automation options in one place
- Alternative considered: Separate tutorials per automation type (rejected: too fragmented)
- Impact: Users can choose which automations to set up based on their needs

**2. Placeholder Images Strategy**
- Decision: Create empty PNG files as placeholders, replace during verification
- Rationale: Cannot programmatically generate iOS Shortcuts screenshots
- Alternative considered: Skip images entirely (rejected: tutorial needs visual guidance)
- Impact: Requires manual screenshot capture during device testing

**3. Modal Presentation Style**
- Decision: Standard modal (not fullScreenModal) for tutorial
- Rationale: Modal shows system header with close button, follows iOS conventions
- Alternative considered: fullScreenModal like challenge screen (rejected: tutorial doesn't need immersive experience)
- Impact: Users can easily dismiss tutorial, consistent with iOS patterns

## Next Phase Readiness

**Blockers:** None

**Concerns:**
- Placeholder screenshots must be replaced with real iOS Shortcuts images before user testing
- Tutorial content assumes iOS familiarity with Shortcuts app (may need additional context for users unfamiliar with automations)
- Tutorial doesn't include troubleshooting for common Shortcuts issues (e.g., automation not triggering)

**Recommendations for Next Plans:**
- Add tutorial completion tracking (analytics)
- Consider adding "Test Automation" button that triggers URL scheme manually
- Add FAQ section for common Shortcuts issues
- Consider first-launch tutorial flow (automatic display on app first open)

## Implementation Notes

**Component Patterns:**
- TutorialStep follows established component pattern (src/components/)
- Uses iOS system colors consistently (#007aff blue for badges)
- Dark mode handled via useColorScheme hook

**Navigation Patterns:**
- Tutorial route follows Expo Router file-based routing
- Modal presentation consistent with iOS Human Interface Guidelines
- router.back() for dismissal (vs router.push for forward navigation)

**Image Handling:**
- Uses require() for static image imports (React Native bundler)
- ImageSourcePropType for type safety
- resizeMode="contain" ensures screenshots display without cropping

**Accessibility:**
- SafeAreaView respects iOS notch/safe areas
- Button component uses native iOS styling
- Text sizes follow iOS typography guidelines (28pt headers, 15pt body)

## Testing Coverage

**Manual Testing Required:**
- Build development build: `npx expo run:ios`
- Verify tutorial navigation from home screen
- Test scrolling through all tutorial steps
- Verify dark mode appearance
- Capture and replace placeholder screenshots
- Test actual Shortcuts automation setup by following tutorial
- Verify deep links work after automation configuration

**Known Limitations:**
- Tutorial content is static (no interactive elements)
- No progress tracking (users can't resume tutorial)
- No completion confirmation (no way to mark tutorial as "seen")

## Deviations from Plan

None - plan executed exactly as written.

## Files Changed

**Created:**
- app/tutorial.tsx (153 lines) - Tutorial screen route
- src/components/TutorialStep.tsx (97 lines) - Reusable tutorial step component
- assets/tutorial/shortcuts-setup-1.png (placeholder)
- assets/tutorial/shortcuts-setup-2.png (placeholder)
- assets/tutorial/shortcuts-setup-3.png (placeholder)
- assets/tutorial/shortcuts-setup-4.png (placeholder)

**Modified:**
- app/index.tsx - Added "Setup Tutorial" button and navigation
- app/_layout.tsx - Registered tutorial route as modal

**Total:** 8 files changed, 284 lines added

## Self-Check: PASSED

**Files Verified:**
- ✓ app/tutorial.tsx exists
- ✓ src/components/TutorialStep.tsx exists
- ✓ assets/tutorial/shortcuts-setup-1.png exists
- ✓ assets/tutorial/shortcuts-setup-2.png exists
- ✓ assets/tutorial/shortcuts-setup-3.png exists
- ✓ assets/tutorial/shortcuts-setup-4.png exists
- ✓ app/index.tsx modified
- ✓ app/_layout.tsx modified

**Commits Verified:**
- ✓ 60e0f98 exists (placeholder screenshots)
- ✓ 4f2feaa exists (TutorialStep component)
- ✓ 9139c20 exists (tutorial screen)
- ✓ 00e9809 exists (home screen integration)
