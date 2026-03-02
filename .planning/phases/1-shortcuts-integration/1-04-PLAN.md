---
phase: 1-shortcuts-integration
plan: 04
type: execute
wave: 2
depends_on: [1-01, 1-02]
files_modified:
  - app/challenge.tsx
  - src/components/VocabularyCard.tsx
  - app/_layout.tsx
autonomous: false

must_haves:
  truths:
    - "User sees fullscreen vocabulary challenge screen when deep link triggers"
    - "Screen displays vocabulary card with question (front) text"
    - "Card uses iOS-native aesthetic (SF Pro font, system colors, minimalist)"
    - "Screen adapts to light and dark mode automatically"
  artifacts:
    - path: "app/challenge.tsx"
      provides: "Challenge screen route"
      min_lines: 100
      contains: "useLocalSearchParams"
    - path: "src/components/VocabularyCard.tsx"
      provides: "Card component for displaying vocabulary"
      min_lines: 60
      contains: "useColorScheme"
    - path: "app/_layout.tsx"
      provides: "Challenge route registered in navigation"
      contains: "challenge"
  key_links:
    - from: "app/challenge.tsx"
      to: "src/components/VocabularyCard.tsx"
      via: "Component import and rendering"
      pattern: "import.*VocabularyCard"
    - from: "app/challenge.tsx"
      to: "src/data/placeholderVocabulary.ts"
      via: "Import placeholder cards for display"
      pattern: "PLACEHOLDER_CARDS"
    - from: "app/_layout.tsx"
      to: "app/challenge.tsx"
      via: "Navigation routing on deep link"
      pattern: "router\\.push.*challenge"
---

<objective>
Create fullscreen vocabulary challenge screen with iOS-native card-based UI.

Purpose: Display vocabulary questions in a clean, minimalist interface matching iOS design language. This is the core learning interface where users will spend most of their time.

Output: Functional challenge screen showing placeholder vocabulary cards with iOS-native styling and dark mode support.
</objective>

<execution_context>
@/home/ubuntu/.claude/get-shit-done/workflows/execute-plan.md
@/home/ubuntu/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/ubuntu/Projects/vokabeltrainer/.planning/PROJECT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/ROADMAP.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/STATE.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-CONTEXT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-RESEARCH.md
@/home/ubuntu/Projects/vokabeltrainer/app/_layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Create VocabularyCard component</name>
  <files>src/components/VocabularyCard.tsx</files>
  <action>
Create card component that displays vocabulary question with iOS-native styling.

Create file: `src/components/VocabularyCard.tsx`

User decisions from CONTEXT.md:
- Card-based presentation (not full-bleed)
- iOS-native aesthetic with minimalist design
- Vocabulary is the hero (largest element, centered)
- Minimal chrome (no headers, icons, branding)
- Neutral, professional, modern feel
- Follows iOS design conventions (SF Pro font, system colors)

Implementation:
```typescript
import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { VocabularyCard as VocabCardType } from '../types/vocabulary';

interface VocabularyCardProps {
  card: VocabCardType;
  showAnswer: boolean;
  isCorrect?: boolean;
}

export function VocabularyCard({ card, showAnswer, isCorrect }: VocabularyCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[
      styles.card,
      { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }
    ]}>
      {/* Front (Question) */}
      <Text style={[
        styles.frontText,
        { color: isDark ? '#ffffff' : '#000000' }
      ]}>
        {card.front}
      </Text>

      {/* Back (Answer) - Only shown after submission */}
      {showAnswer && (
        <Text style={[
          styles.backText,
          { color: isCorrect ? '#34c759' : '#ff3b30' }  // iOS green/red
        ]}>
          {card.back}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 32,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  frontText: {
    fontSize: 34,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'System',  // SF Pro on iOS
  },
  backText: {
    fontSize: 28,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
    fontFamily: 'System',
  },
});
```

Use iOS system colors for automatic dark mode adaptation.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify component compiles
Check: Component uses useColorScheme for dark mode
Check: Typography matches iOS design (fontSize 34 for hero text)
Check: Colors use iOS system palette (green #34c759, red #ff3b30)
  </verify>
  <done>
src/components/VocabularyCard.tsx exists with iOS-native styling, dark mode support, and card-based layout
  </done>
</task>

<task type="auto">
  <name>Create challenge screen route</name>
  <files>app/challenge.tsx</files>
  <action>
Create challenge screen that displays vocabulary cards and manages challenge state.

Create file: `app/challenge.tsx`

Use Expo Router's useLocalSearchParams to receive deep link parameters.

Implementation:
```typescript
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, useColorScheme, SafeAreaView, StatusBar } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { VocabularyCard } from '../src/components/VocabularyCard';
import { PLACEHOLDER_CARDS } from '../src/data/placeholderVocabulary';

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{
    source: string;
    count: string;
    type: 'unlock' | 'app_open';
  }>();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const cardCount = parseInt(params.count || '3', 10);
  const cards = PLACEHOLDER_CARDS.slice(0, cardCount);
  const currentCard = cards[currentIndex];

  useEffect(() => {
    // Log challenge start
    console.log('[Challenge] Started:', {
      source: params.source,
      count: cardCount,
      type: params.type
    });
  }, []);

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: isDark ? '#000000' : '#ffffff' }
    ]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.content}>
        {currentCard && (
          <VocabularyCard
            card={currentCard}
            showAnswer={showAnswer}
          />
        )}

        {/* Input and navigation will be added in Plan 05 and 06 */}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
});
```

Use SafeAreaView to handle iOS notch and home indicator (per RESEARCH.md).
Answer input will be added in Plan 05, navigation buttons in Plan 06.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify screen compiles
Check: Screen uses useLocalSearchParams to receive deep link params
Check: Screen imports and renders VocabularyCard component
Check: SafeAreaView used for iOS safe area handling
Check: StatusBar adapts to light/dark mode
  </verify>
  <done>
app/challenge.tsx exists with challenge screen displaying vocabulary cards, receives deep link params via router
  </done>
</task>

<task type="auto">
  <name>Wire deep link navigation to challenge screen</name>
  <files>app/_layout.tsx</files>
  <action>
Update root layout to navigate to challenge screen when deep link is received.

Modify `app/_layout.tsx`:

```typescript
import { Stack, useRouter } from 'expo-router';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { ChallengeParams } from '../src/types/vocabulary';

export default function RootLayout() {
  const router = useRouter();

  const handleDeepLink = (params: ChallengeParams) => {
    console.log('[App] Deep link received:', params);

    // Navigate to challenge screen with params
    router.push({
      pathname: '/challenge',
      params: {
        source: params.source,
        count: params.count.toString(),
        type: params.type
      }
    });
  };

  useDeepLink(handleDeepLink);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'LingoLock' }} />
      <Stack.Screen
        name="challenge"
        options={{
          presentation: 'fullScreenModal',
          headerShown: false,
          animation: 'fade'
        }}
      />
    </Stack>
  );
}
```

Configure challenge route as fullScreenModal with no header (per user's fullscreen requirement).
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify layout compiles
Check: Layout registers "challenge" screen
Check: handleDeepLink navigates to /challenge with params
Check: Challenge screen configured as fullScreenModal with headerShown: false
  </verify>
  <done>
app/_layout.tsx navigates to challenge screen when deep link received, challenge screen configured as fullscreen modal
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Challenge screen UI with iOS-native card design, dark mode support, and deep link navigation.
  </what-built>
  <how-to-verify>
1. Build and run development build:
   ```
   npx expo run:ios
   ```

2. Trigger deep link from simulator:
   ```
   xcrun simctl openurl booted "lingolock://challenge?source=Instagram&count=3&type=app_open"
   ```

3. Verify challenge screen appears:
   - [ ] Fullscreen modal (no header)
   - [ ] Card with rounded corners (12px border radius)
   - [ ] Card background: light gray (#f2f2f7) in light mode, dark gray (#1c1c1e) in dark mode
   - [ ] Vocabulary text centered, large (34pt), bold
   - [ ] Typography uses System font (SF Pro on iOS)

4. Toggle dark mode (Settings > Developer > Dark Appearance):
   - [ ] Background changes to black
   - [ ] Card background changes to dark gray
   - [ ] Text changes to white
   - [ ] Status bar adapts (light-content in dark, dark-content in light)

5. Test with different parameters:
   ```
   xcrun simctl openurl booted "lingolock://challenge?source=Safari&count=5&type=unlock"
   ```
   - [ ] Screen shows first card from placeholder data
   - [ ] Console logs show correct params

Expected: Clean, minimalist card design matching iOS aesthetic, automatic dark mode adaptation.
  </how-to-verify>
  <resume-signal>
Type "approved" if visual design matches requirements, or describe issues (alignment, colors, spacing, fonts, dark mode).
  </resume-signal>
</task>

</tasks>

<verification>
**Overall phase checks:**

1. Component structure: `cat src/components/VocabularyCard.tsx` exports VocabularyCard component
2. Screen structure: `cat app/challenge.tsx` exports default ChallengeScreen
3. Navigation wiring: `cat app/_layout.tsx` includes challenge route and deep link navigation
4. TypeScript compilation: `npx tsc --noEmit` passes
5. Visual verification (human checkpoint): Card design, dark mode, fullscreen presentation

**Human verification required** - Visual design adherence to iOS guidelines and user requirements.
</verification>

<success_criteria>
- VocabularyCard component displays vocabulary with iOS-native styling
- Challenge screen route receives deep link parameters via Expo Router
- Deep link navigation triggers fullscreen challenge screen
- UI adapts to light and dark mode automatically
- Card-based presentation with minimalist design (no headers, minimal chrome)
- Typography and colors match iOS design language
- SafeAreaView handles notch and home indicator correctly
</success_criteria>

<output>
After completion, create `.planning/phases/1-shortcuts-integration/1-04-SUMMARY.md`
</output>
