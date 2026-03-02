---
phase: 1-shortcuts-integration
plan: 03
type: execute
wave: 2
depends_on: [1-01]
files_modified:
  - app/_layout.tsx
  - src/utils/deepLinkHandler.ts
  - src/hooks/useDeepLink.ts
autonomous: true

must_haves:
  truths:
    - "App listens for incoming deep links when launched or backgrounded"
    - "Deep link URLs are parsed into structured parameters"
    - "URL parameters (source, count, type) are extracted correctly"
  artifacts:
    - path: "src/utils/deepLinkHandler.ts"
      provides: "URL parsing and parameter extraction"
      exports: ["parseDeepLink"]
      min_lines: 30
    - path: "src/hooks/useDeepLink.ts"
      provides: "React hook for deep link events"
      exports: ["useDeepLink"]
      min_lines: 40
    - path: "app/_layout.tsx"
      provides: "Deep link listener setup in root component"
      contains: "useDeepLink"
  key_links:
    - from: "app/_layout.tsx"
      to: "src/hooks/useDeepLink.ts"
      via: "Hook invocation in root layout"
      pattern: "useDeepLink\\("
    - from: "src/hooks/useDeepLink.ts"
      to: "expo-linking"
      via: "Linking API for URL events"
      pattern: "Linking\\.addEventListener"
    - from: "src/utils/deepLinkHandler.ts"
      to: "src/types/vocabulary.ts"
      via: "ChallengeParams type import"
      pattern: "import.*ChallengeParams"
---

<objective>
Implement deep link listening and URL parameter parsing for lingolock:// scheme.

Purpose: Enable iOS Shortcuts to trigger the app via lingolock://challenge?source=Instagram&count=3&type=app_open and extract parameters for challenge screen configuration.

Output: Working deep link infrastructure that captures URLs from both cold start and background state.
</objective>

<execution_context>
@/home/ubuntu/.claude/get-shit-done/workflows/execute-plan.md
@/home/ubuntu/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/ubuntu/Projects/vokabeltrainer/.planning/PROJECT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/ROADMAP.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/STATE.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-RESEARCH.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-CONTEXT.md
@/home/ubuntu/Projects/vokabeltrainer/app/_layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Create deep link URL parser</name>
  <files>src/utils/deepLinkHandler.ts</files>
  <action>
Create utility function to parse lingolock:// URLs and extract challenge parameters.

Create file: `src/utils/deepLinkHandler.ts`

Use Expo Linking.parse() API to extract query parameters from URLs like:
`lingolock://challenge?source=Instagram&count=3&type=app_open`

Implementation:
```typescript
import * as Linking from 'expo-linking';
import { ChallengeParams } from '../types/vocabulary';

export function parseDeepLink(url: string): ChallengeParams | null {
  const parsed = Linking.parse(url);

  // Validate hostname is "challenge"
  if (parsed.hostname !== 'challenge') {
    console.warn(`[DeepLink] Invalid hostname: ${parsed.hostname}, expected "challenge"`);
    return null;
  }

  // Extract and validate parameters
  const source = parsed.queryParams?.source as string;
  const countStr = parsed.queryParams?.count as string;
  const type = parsed.queryParams?.type as string;

  if (!source || !countStr || !type) {
    console.warn('[DeepLink] Missing required parameters:', { source, count: countStr, type });
    return null;
  }

  const count = parseInt(countStr, 10);
  if (isNaN(count) || count < 1 || count > 10) {
    console.warn(`[DeepLink] Invalid count: ${countStr}, must be 1-10`);
    return null;
  }

  if (type !== 'unlock' && type !== 'app_open') {
    console.warn(`[DeepLink] Invalid type: ${type}, must be 'unlock' or 'app_open'`);
    return null;
  }

  return {
    source,
    count,
    type: type as 'unlock' | 'app_open'
  };
}
```

Include validation and console logging for debugging during development.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify TypeScript compilation
Create test script that imports parseDeepLink and calls with example URLs
Check: Function returns ChallengeParams for valid URLs, null for invalid
  </verify>
  <done>
src/utils/deepLinkHandler.ts exists with parseDeepLink function, handles valid/invalid URLs correctly, TypeScript compiles
  </done>
</task>

<task type="auto">
  <name>Create deep link React hook</name>
  <files>src/hooks/useDeepLink.ts</files>
  <action>
Create React hook to listen for deep link events and handle both cold start and background state.

Create file: `src/hooks/useDeepLink.ts`

Implement according to Expo Linking API pattern (see RESEARCH.md Pattern 2):
```typescript
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { parseDeepLink } from '../utils/deepLinkHandler';
import { ChallengeParams } from '../types/vocabulary';

export function useDeepLink(onDeepLink: (params: ChallengeParams) => void) {
  useEffect(() => {
    // Handle initial URL (app opened from deep link - cold start)
    const handleInitialURL = async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        console.log('[DeepLink] Initial URL:', url);
        const params = parseDeepLink(url);
        if (params) {
          onDeepLink(params);
        }
      }
    };

    // Handle subsequent URLs (app already running - background state)
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[DeepLink] Event URL:', event.url);
      const params = parseDeepLink(event.url);
      if (params) {
        onDeepLink(params);
      }
    });

    handleInitialURL();

    return () => subscription.remove();
  }, [onDeepLink]);
}
```

This hook handles BOTH scenarios:
- Cold start: Linking.getInitialURL()
- Background: Linking.addEventListener('url')

Callback receives parsed ChallengeParams, NOT raw URL string.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify hook compiles
Check: Hook uses both getInitialURL and addEventListener
Check: Hook calls parseDeepLink utility
Check: Hook cleanup removes event listener
  </verify>
  <done>
src/hooks/useDeepLink.ts exists with useDeepLink hook handling both cold start and background deep links, TypeScript compiles
  </done>
</task>

<task type="auto">
  <name>Integrate deep link listener in root layout</name>
  <files>app/_layout.tsx</files>
  <action>
Update root layout to listen for deep links and log parameters (navigation to challenge screen comes in Plan 04).

Modify `app/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { ChallengeParams } from '../src/types/vocabulary';

export default function RootLayout() {
  const handleDeepLink = (params: ChallengeParams) => {
    console.log('[App] Deep link received:', params);
    // TODO (Plan 04): Navigate to challenge screen with params
  };

  useDeepLink(handleDeepLink);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'LingoLock' }} />
    </Stack>
  );
}
```

For now, just log the parameters. Navigation to challenge screen will be implemented in Plan 04 after the screen exists.

Test by running development build and opening URL:
`xcrun simctl openurl booted "lingolock://challenge?source=Test&count=3&type=unlock"`
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify layout compiles
Check: app/_layout.tsx imports and calls useDeepLink
Check: handleDeepLink callback logs parameters
Build and test: Run dev build, trigger deep link, verify console shows parsed params
  </verify>
  <done>
app/_layout.tsx integrates useDeepLink hook, console logs show parsed ChallengeParams when deep link is triggered
  </done>
</task>

</tasks>

<verification>
**Overall phase checks:**

1. Deep link parser: `cat src/utils/deepLinkHandler.ts` exports parseDeepLink function
2. Deep link hook: `cat src/hooks/useDeepLink.ts` exports useDeepLink hook
3. Root layout integration: `cat app/_layout.tsx` calls useDeepLink
4. TypeScript compilation: `npx tsc --noEmit` passes
5. **Deep link test (requires development build):**
   - Run: `npx expo run:ios` to build for simulator
   - Open URL: `xcrun simctl openurl booted "lingolock://challenge?source=Instagram&count=3&type=app_open"`
   - Verify: Console logs show parsed params: {source: 'Instagram', count: 3, type: 'app_open'}

**Note:** Deep link testing REQUIRES development build. Expo Go will not respond to custom URL schemes.
</verification>

<success_criteria>
- parseDeepLink utility parses lingolock://challenge URLs and extracts source, count, type parameters
- useDeepLink hook handles both cold start (getInitialURL) and background (addEventListener) deep links
- Root layout (_layout.tsx) integrates useDeepLink and logs received parameters
- Invalid URLs are handled gracefully (return null, log warning)
- Development build responds to lingolock:// deep links from iOS Shortcuts or simulator
</success_criteria>

<output>
After completion, create `.planning/phases/1-shortcuts-integration/1-03-SUMMARY.md`
</output>
