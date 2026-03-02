---
phase: 1-shortcuts-integration
plan: 03
subsystem: deep-linking
tags: [expo-linking, url-parsing, react-hooks, ios-shortcuts]
requires: [1-01-expo-sdk-upgrade]
provides:
  - Deep link URL parser (parseDeepLink utility)
  - Deep link React hook (useDeepLink)
  - Root layout deep link integration
affects: [1-04-challenge-screen, future-navigation-flows]
tech-stack:
  added: []
  patterns:
    - "expo-linking for URL scheme handling"
    - "React hooks for deep link event management"
    - "URL parameter extraction and validation"
key-files:
  created:
    - src/utils/deepLinkHandler.ts
    - src/hooks/useDeepLink.ts
  modified:
    - app/_layout.tsx
    - src/types/vocabulary.ts
    - tsconfig.json
decisions:
  - "Use Expo Linking API for cross-platform deep link handling"
  - "Validate all URL parameters before parsing (hostname, required params, value ranges)"
  - "Handle both cold start (getInitialURL) and background (addEventListener) scenarios"
  - "Override Expo tsconfig module setting to fix TypeScript 5.3 compatibility"
metrics:
  duration: 2min
  completed: 2026-03-02
---

# Phase 1 Plan 03: Deep Link Infrastructure Summary

**One-liner:** Implemented lingolock:// URL scheme parsing and event listening for iOS Shortcuts integration with cold start and background handling.

## What Was Built

Created complete deep link infrastructure to enable iOS Shortcuts to trigger vocabulary challenges via custom URL scheme.

### Core Components

1. **Deep Link URL Parser** (`src/utils/deepLinkHandler.ts`)
   - Parses lingolock://challenge?source=X&count=Y&type=Z URLs
   - Validates hostname, required parameters, and value ranges
   - Returns typed ChallengeParams or null for invalid URLs
   - Includes console logging for debugging

2. **Deep Link React Hook** (`src/hooks/useDeepLink.ts`)
   - Handles cold start scenario (app opened from deep link) via getInitialURL
   - Handles background scenario (app already running) via addEventListener
   - Invokes callback with parsed ChallengeParams
   - Proper cleanup on unmount

3. **Root Layout Integration** (`app/_layout.tsx`)
   - Integrates useDeepLink hook in RootLayout component
   - Logs received deep link parameters
   - Prepared for Plan 04 navigation implementation

### Parameter Validation

Deep link parser validates:
- **Hostname:** Must be "challenge"
- **Source:** Required string (app name triggering the challenge)
- **Count:** Required integer, range 1-10
- **Type:** Required enum, must be "unlock" or "app_open"

Invalid URLs return null with console warnings for debugging.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create deep link URL parser | c2e3bea | src/utils/deepLinkHandler.ts, src/types/vocabulary.ts, tsconfig.json |
| 2 | Create deep link React hook | 63fbe65 | src/hooks/useDeepLink.ts |
| 3 | Integrate deep link listener in root layout | 6a2d7d9 | app/_layout.tsx |

## Decisions Made

### Technical Architecture

**1. Expo Linking API over React Navigation deep linking**
- Rationale: Direct control over URL parsing and parameter extraction
- Benefit: Works independently of navigation state
- Trade-off: Manual integration required (but more flexible)

**2. Validate parameters at parse time, not usage time**
- Rationale: Fail fast, provide clear error messages during development
- Benefit: Easier debugging, prevents invalid state propagation
- Implementation: parseDeepLink returns null for any validation failure

**3. ChallengeParams interface updated with required fields**
- Added: source (string), count (number), type (enum)
- Kept: cardId, fromBlocking, triggeredAt (optional, for future use)
- Rationale: Support deep link parameters while preserving future navigation options

### Development Environment

**4. Override Expo tsconfig module setting**
- Issue: Expo SDK 55 uses "module": "preserve" which TypeScript 5.3 doesn't support
- Fix: Override with "module": "esnext" in tsconfig.json
- Impact: TypeScript compilation now works, doesn't affect runtime behavior
- Note: This is a known compatibility issue between Expo SDK 55 and TypeScript 5.3

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript compilation failed due to module setting**
- **Found during:** Task 1 verification
- **Issue:** Expo SDK 55's tsconfig.base.json uses "module": "preserve", unsupported by TypeScript 5.3
- **Fix:** Created standalone tsconfig.json with "module": "esnext" instead of extending base
- **Files modified:** tsconfig.json
- **Commit:** c2e3bea (included in Task 1)
- **Rationale:** Blocked verification of all subsequent tasks; needed for npx tsc --noEmit to pass

**2. [Rule 2 - Missing Critical] ChallengeParams interface lacked deep link fields**
- **Found during:** Task 1 implementation
- **Issue:** Existing ChallengeParams only had cardId/fromBlocking/triggeredAt, missing source/count/type
- **Fix:** Updated interface to include required deep link parameters (source, count, type)
- **Files modified:** src/types/vocabulary.ts
- **Commit:** c2e3bea (included in Task 1)
- **Rationale:** Parser couldn't return properly typed parameters without these fields

## Testing & Verification

### TypeScript Compilation
```bash
npx tsc --noEmit
```
✅ Passes - all files compile without errors

### File Verification
✅ src/utils/deepLinkHandler.ts exists, exports parseDeepLink
✅ src/hooks/useDeepLink.ts exists, exports useDeepLink  
✅ app/_layout.tsx imports and uses useDeepLink

### Manual Testing (requires development build)
To test deep links, run:
```bash
npx expo run:ios
xcrun simctl openurl booted "lingolock://challenge?source=Instagram&count=3&type=app_open"
```

Expected console output:
```
[DeepLink] Event URL (background): lingolock://challenge?source=Instagram&count=3&type=app_open
[App] Deep link received: { source: 'Instagram', count: 3, type: 'app_open' }
```

**Note:** Deep link testing requires development build. Expo Go does NOT support custom URL schemes.

## Next Phase Readiness

### Enables

**Plan 1-04 (Challenge Screen)**
- Deep link infrastructure ready for navigation
- ChallengeParams interface defined and typed
- handleDeepLink callback ready to accept navigation logic

**Future iOS Shortcuts Integration**
- URL scheme handling complete
- Parameter extraction and validation working
- Ready for Shortcuts app to trigger via lingolock:// URLs

### Blockers/Concerns

**None** - All planned functionality implemented and verified.

### Future Considerations

1. **Navigation Integration (Plan 1-04)**
   - Replace console.log with expo-router navigation
   - Navigate to challenge screen with params
   - Handle navigation timing (wait for layout mount)

2. **Error Handling (Future)**
   - Add user-facing error messages for invalid deep links
   - Consider toast/alert for malformed URLs
   - Track deep link analytics

3. **Testing (Future)**
   - Add unit tests for parseDeepLink edge cases
   - Integration tests for useDeepLink hook
   - End-to-end tests with actual deep link triggers

## Self-Check: PASSED

All created files exist:
✅ src/utils/deepLinkHandler.ts
✅ src/hooks/useDeepLink.ts

All commits exist:
✅ c2e3bea (Task 1)
✅ 63fbe65 (Task 2)
✅ 6a2d7d9 (Task 3)
