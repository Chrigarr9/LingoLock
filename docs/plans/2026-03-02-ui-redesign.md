# LingoLock UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign all 3 screens from bare-bones StyleSheet to polished iOS-native UI using React Native Paper with a custom theme.

**Architecture:** Install React Native Paper, create a centralized iOS theme with light/dark variants, wrap the app in PaperProvider, then rebuild each screen/component using Paper primitives (Card, Button, TextInput, Surface, List.Item). All scattered `isDark ?` ternaries are replaced by Paper's `useTheme()` hook.

**Tech Stack:** React Native Paper (MD3), Expo SDK 55, Expo Router, TypeScript

---

### Task 1: Install React Native Paper

**Files:**
- Modify: `package.json`

**Step 1: Install react-native-paper and its icon dependency**

Run:
```bash
npx expo install react-native-paper react-native-vector-icons
```

Expected: Packages install successfully with SDK 55 compatibility.

**Step 2: Verify TypeScript still compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install react-native-paper and vector-icons"
```

---

### Task 2: Create iOS Theme

**Files:**
- Create: `src/theme/index.ts`

**Step 1: Create the theme file**

Create `src/theme/index.ts` with the following content:

```typescript
import {
  MD3LightTheme,
  MD3DarkTheme,
  configureFonts,
  useTheme,
} from 'react-native-paper';

const iOSColors = {
  light: {
    primary: '#007AFF',
    onPrimary: '#FFFFFF',
    primaryContainer: '#D6E4FF',
    onPrimaryContainer: '#001B3D',
    secondary: '#8E8E93',
    onSecondary: '#FFFFFF',
    background: '#FFFFFF',
    onBackground: '#000000',
    surface: '#FFFFFF',
    onSurface: '#000000',
    surfaceVariant: '#F2F2F7',
    onSurfaceVariant: '#8E8E93',
    outline: 'rgba(60,60,67,0.12)',
    error: '#FF3B30',
    onError: '#FFFFFF',
    errorContainer: '#FFE5E3',
    onErrorContainer: '#410002',
  },
  dark: {
    primary: '#0A84FF',
    onPrimary: '#FFFFFF',
    primaryContainer: '#003A70',
    onPrimaryContainer: '#D6E4FF',
    secondary: '#8E8E93',
    onSecondary: '#FFFFFF',
    background: '#000000',
    onBackground: '#FFFFFF',
    surface: '#1C1C1E',
    onSurface: '#FFFFFF',
    surfaceVariant: '#1C1C1E',
    onSurfaceVariant: '#8E8E93',
    outline: 'rgba(235,235,245,0.12)',
    error: '#FF453A',
    onError: '#FFFFFF',
    errorContainer: '#930006',
    onErrorContainer: '#FFE5E3',
  },
};

const fontConfig = {
  fontFamily: 'System',
};

export const lightTheme = {
  ...MD3LightTheme,
  roundness: 12,
  colors: {
    ...MD3LightTheme.colors,
    ...iOSColors.light,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#34C759',
    successDark: '#30D158',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: 12,
  colors: {
    ...MD3DarkTheme.colors,
    ...iOSColors.dark,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#30D158',
    successDark: '#30D158',
  },
};

export type AppTheme = typeof lightTheme;

export const useAppTheme = () => useTheme<AppTheme>();
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/theme/index.ts
git commit -m "feat: create iOS theme with light/dark Paper themes"
```

---

### Task 3: Wrap App in PaperProvider

**Files:**
- Modify: `app/_layout.tsx`

**Step 1: Update the root layout**

Replace the entire content of `app/_layout.tsx` with:

```typescript
import { Stack, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { ChallengeParams } from '../src/types/vocabulary';
import { lightTheme, darkTheme } from '../src/theme';

export default function RootLayout() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handleDeepLink = (params: ChallengeParams) => {
    console.log('[App] Deep link received:', params);
    router.push({
      pathname: '/challenge',
      params: {
        source: params.source,
        count: params.count.toString(),
        type: params.type,
      },
    });
  };

  useDeepLink(handleDeepLink);

  return (
    <PaperProvider theme={theme}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'LingoLock' }} />
        <Stack.Screen
          name="challenge"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="tutorial"
          options={{
            presentation: 'modal',
            title: 'Setup Tutorial',
          }}
        />
      </Stack>
    </PaperProvider>
  );
}
```

**Step 2: Start web server and verify app loads**

Run:
```bash
npx expo start --web
```

Expected: App loads at http://localhost:8081 without errors. PaperProvider wraps the app.

**Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: wrap app in PaperProvider with iOS theme"
```

---

### Task 4: Create ProgressDots Component

**Files:**
- Create: `src/components/ProgressDots.tsx`

**Step 1: Create the component**

Create `src/components/ProgressDots.tsx`:

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface ProgressDotsProps {
  total: number;
  current: number;
  results?: ('correct' | 'incorrect' | null)[];
}

export function ProgressDots({ total, current, results }: ProgressDotsProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => {
          let backgroundColor: string;
          if (results?.[i] === 'correct') {
            backgroundColor = theme.custom.success;
          } else if (results?.[i] === 'incorrect') {
            backgroundColor = theme.colors.error;
          } else if (i === current) {
            backgroundColor = theme.colors.primary;
          } else {
            backgroundColor = theme.colors.surfaceVariant;
          }

          return (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor },
                i === current && !results?.[i] && styles.activeDot,
              ]}
            />
          );
        })}
      </View>
      <Text
        variant="labelSmall"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        card {current + 1} of {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/ProgressDots.tsx
git commit -m "feat: create ProgressDots component for challenge progress"
```

---

### Task 5: Create StatsCard and StatRow Components

**Files:**
- Create: `src/components/StatsCard.tsx`
- Create: `src/components/StatRow.tsx`

**Step 1: Create StatRow component**

Create `src/components/StatRow.tsx`:

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface StatRowProps {
  label: string;
  value: string;
}

export function StatRow({ label, value }: StatRowProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.row}>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        {label}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
});
```

**Step 2: Create StatsCard component**

Create `src/components/StatsCard.tsx`:

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface, Text, ProgressBar } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface StatsCardProps {
  streak: number;
  progressPercent: number;
  cardsDue: number;
}

export function StatsCard({ streak, progressPercent, cardsDue }: StatsCardProps) {
  const theme = useAppTheme();

  return (
    <Surface style={styles.surface} elevation={1}>
      <View style={styles.streakRow}>
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
          {streak > 0 ? '\uD83D\uDD25' : '\u2744\uFE0F'} {streak}-day streak
        </Text>
      </View>
      <View style={styles.progressRow}>
        <ProgressBar
          progress={progressPercent / 100}
          color={theme.colors.primary}
          style={styles.progressBar}
        />
        <Text
          variant="labelSmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {progressPercent}%
        </Text>
      </View>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        {cardsDue} cards due today
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
});
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/StatRow.tsx src/components/StatsCard.tsx
git commit -m "feat: create StatsCard and StatRow dashboard components"
```

---

### Task 6: Redesign VocabularyCard Component

**Files:**
- Modify: `src/components/VocabularyCard.tsx`

**Step 1: Rewrite VocabularyCard with Paper components**

Replace the entire content of `src/components/VocabularyCard.tsx` with:

```typescript
import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, Divider } from 'react-native-paper';
import { useAppTheme } from '../theme';
import { VocabularyCard as VocabCardType } from '../types/vocabulary';

interface VocabularyCardProps {
  card: VocabCardType;
  showAnswer: boolean;
  isCorrect?: boolean;
}

export function VocabularyCard({ card, showAnswer, isCorrect }: VocabularyCardProps) {
  const theme = useAppTheme();

  const answerColor =
    isCorrect === undefined
      ? theme.colors.onSurface
      : isCorrect
        ? theme.custom.success
        : theme.colors.error;

  return (
    <Card style={styles.card} mode="elevated">
      <Card.Content style={styles.content}>
        <Text variant="headlineLarge" style={[styles.frontText, { color: theme.colors.onSurface }]}>
          {card.front}
        </Text>

        {showAnswer && (
          <>
            <Divider style={styles.divider} />
            <Text variant="headlineSmall" style={[styles.backText, { color: answerColor }]}>
              {card.back} {isCorrect !== undefined && (isCorrect ? ' \u2713' : ' \u2717')}
            </Text>
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 200,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  frontText: {
    textAlign: 'center',
    fontWeight: '600',
  },
  divider: {
    width: '60%',
    marginVertical: 16,
  },
  backText: {
    textAlign: 'center',
    fontWeight: '500',
  },
});
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/VocabularyCard.tsx
git commit -m "feat: redesign VocabularyCard with Paper Card and theme"
```

---

### Task 7: Redesign AnswerInput Component

**Files:**
- Modify: `src/components/AnswerInput.tsx`

**Step 1: Rewrite AnswerInput with Paper components**

Replace the entire content of `src/components/AnswerInput.tsx` with:

```typescript
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button } from 'react-native-paper';

interface AnswerInputProps {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AnswerInput({
  onSubmit,
  disabled = false,
  placeholder = 'Type your answer',
}: AnswerInputProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    if (answer.trim()) {
      onSubmit(answer);
      setAnswer('');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        mode="outlined"
        value={answer}
        onChangeText={setAnswer}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        disabled={disabled}
        style={styles.input}
      />
      <Button
        mode="contained"
        onPress={handleSubmit}
        disabled={disabled || !answer.trim()}
        style={styles.button}
      >
        Check Answer
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  input: {
    fontSize: 17,
  },
  button: {
    paddingVertical: 4,
  },
});
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/AnswerInput.tsx
git commit -m "feat: redesign AnswerInput with Paper TextInput and Button"
```

---

### Task 8: Redesign ContinueButton Component

**Files:**
- Modify: `src/components/ContinueButton.tsx`

**Step 1: Rewrite ContinueButton with Paper Button**

Replace the entire content of `src/components/ContinueButton.tsx` with:

```typescript
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Button } from 'react-native-paper';
import { openSourceApp } from '../utils/deepLinkOpener';

interface ContinueButtonProps {
  sourceApp: string;
  challengeType: 'unlock' | 'app_open';
  onPress?: () => void;
}

export function ContinueButton({ sourceApp, challengeType, onPress }: ContinueButtonProps) {
  const [isOpening, setIsOpening] = useState(false);

  const handlePress = async () => {
    onPress?.();

    if (challengeType === 'unlock') {
      Alert.alert(
        'Challenge Complete!',
        'You can now return to your home screen and access your apps.',
        [{ text: 'OK', style: 'default' }],
      );
      return;
    }

    setIsOpening(true);
    const result = await openSourceApp(sourceApp);
    setIsOpening(false);

    if (!result.success) {
      Alert.alert(
        'Cannot Open App',
        result.error || `Unable to open ${sourceApp}. Please open it manually.`,
        [{ text: 'OK', style: 'default' }],
      );
    }
  };

  return (
    <Button
      mode="contained"
      onPress={handlePress}
      disabled={isOpening}
      loading={isOpening}
      style={{ paddingVertical: 4 }}
      accessibilityLabel={`Continue to ${sourceApp}`}
      accessibilityHint={`Opens ${sourceApp}`}
    >
      {isOpening ? 'Opening...' : `Continue to ${sourceApp}`}
    </Button>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/ContinueButton.tsx
git commit -m "feat: redesign ContinueButton with Paper Button"
```

---

### Task 9: Redesign TutorialStep Component

**Files:**
- Modify: `src/components/TutorialStep.tsx`

**Step 1: Rewrite TutorialStep with Paper List.Item**

Replace the entire content of `src/components/TutorialStep.tsx` with:

```typescript
import React from 'react';
import { View, Image, StyleSheet, ImageSourcePropType } from 'react-native';
import { List, Text } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface TutorialStepProps {
  stepNumber: number;
  title: string;
  description: string;
  image: ImageSourcePropType;
}

export function TutorialStep({ stepNumber, title, description, image }: TutorialStepProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.container}>
      <List.Item
        title={title}
        titleStyle={styles.title}
        description={description}
        descriptionStyle={styles.description}
        descriptionNumberOfLines={10}
        left={() => (
          <View
            style={[
              styles.badge,
              { backgroundColor: theme.colors.primary },
            ]}
          >
            <Text variant="labelMedium" style={{ color: theme.colors.onPrimary }}>
              {stepNumber}
            </Text>
          </View>
        )}
      />
      <View style={styles.imageContainer}>
        <Image source={image} style={styles.image} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    alignSelf: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  imageContainer: {
    marginHorizontal: 16,
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/TutorialStep.tsx
git commit -m "feat: redesign TutorialStep with Paper List.Item"
```

---

### Task 10: Redesign Home Screen (Dashboard)

**Files:**
- Modify: `app/index.tsx`

**Step 1: Rewrite the Home screen as a dashboard**

Replace the entire content of `app/index.tsx` with:

```typescript
import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Button, List, Surface, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { StatsCard } from '../src/components/StatsCard';
import { StatRow } from '../src/components/StatRow';
import { getTotalCards } from '../src/data/placeholderVocabulary';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
      >
        <StatsCard streak={0} progressPercent={0} cardsDue={0} />

        <Button
          mode="contained"
          onPress={() =>
            router.push({
              pathname: '/challenge',
              params: { source: 'Practice', count: '3', type: 'app_open' },
            })
          }
          style={styles.practiceButton}
          contentStyle={styles.practiceButtonContent}
        >
          Start Practice
        </Button>

        <Surface style={styles.statsSurface} elevation={1}>
          <StatRow label="Today" value="0 / 0" />
          <StatRow label="Success" value="--" />
          <StatRow label="Total" value={`${getTotalCards()} cards`} />
        </Surface>

        <Surface style={styles.menuSurface} elevation={1}>
          <List.Item
            title="Setup Tutorial"
            left={(props) => <List.Icon {...props} icon="book-open-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/tutorial')}
          />
          <List.Item
            title="Manage Decks"
            left={(props) => <List.Icon {...props} icon="cards-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {}}
            description="Coming in Phase 3"
          />
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  practiceButton: {
    paddingVertical: 4,
  },
  practiceButtonContent: {
    paddingVertical: 8,
  },
  statsSurface: {
    padding: 16,
    borderRadius: 12,
  },
  menuSurface: {
    borderRadius: 12,
    overflow: 'hidden',
  },
});
```

**Step 2: Load http://localhost:8081 and verify the dashboard renders**

Expected: Dashboard shows stats card (all zeros), practice button, stats surface, and menu items. No crashes.

**Step 3: Commit**

```bash
git add app/index.tsx
git commit -m "feat: redesign Home screen as dashboard with Paper components"
```

---

### Task 11: Redesign Challenge Screen

**Files:**
- Modify: `app/challenge.tsx`

**Step 1: Rewrite the Challenge screen with Paper components**

Replace the entire content of `app/challenge.tsx` with:

```typescript
import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Card, IconButton, Text } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { VocabularyCard } from '../src/components/VocabularyCard';
import { AnswerInput } from '../src/components/AnswerInput';
import { ContinueButton } from '../src/components/ContinueButton';
import { ProgressDots } from '../src/components/ProgressDots';
import { PLACEHOLDER_CARDS } from '../src/data/placeholderVocabulary';
import { validateAnswer } from '../src/utils/answerValidation';

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{
    source: string;
    count: string;
    type: 'unlock' | 'app_open';
  }>();
  const router = useRouter();
  const theme = useAppTheme();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [results, setResults] = useState<('correct' | 'incorrect' | null)[]>([]);
  const [correctCount, setCorrectCount] = useState(0);

  const cardCount = Math.min(parseInt(params.count || '3', 10), PLACEHOLDER_CARDS.length);
  const cards = PLACEHOLDER_CARDS.slice(0, cardCount);
  const currentCard = cards[currentIndex];

  useEffect(() => {
    setResults(Array(cardCount).fill(null));
    console.log('[Challenge] Started:', {
      source: params.source,
      count: cardCount,
      type: params.type,
    });
  }, []);

  const handleAnswerSubmit = (userAnswer: string) => {
    const correct = validateAnswer(userAnswer, currentCard.back);
    setIsCorrect(correct);
    setShowAnswer(true);
    const newResults = [...results];
    newResults[currentIndex] = correct ? 'correct' : 'incorrect';
    setResults(newResults);
    if (correct) setCorrectCount((c) => c + 1);
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
      setIsCorrect(null);
    } else {
      setIsComplete(true);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <IconButton
          icon="close"
          size={24}
          iconColor={theme.colors.onSurfaceVariant}
          onPress={() => router.back()}
          accessibilityLabel="Close challenge"
        />
      </View>

      <View style={styles.content}>
        {!isComplete && currentCard && (
          <>
            <VocabularyCard
              card={currentCard}
              showAnswer={showAnswer}
              isCorrect={isCorrect ?? undefined}
            />

            {!showAnswer && (
              <View style={styles.inputArea}>
                <AnswerInput onSubmit={handleAnswerSubmit} />
              </View>
            )}

            {showAnswer && (
              <View style={styles.inputArea}>
                <Button mode="contained" onPress={handleNext}>
                  {currentIndex < cards.length - 1 ? 'Next' : 'Finish'}
                </Button>
              </View>
            )}
          </>
        )}

        {isComplete && params.source && (
          <View style={styles.completionArea}>
            <Card style={styles.completionCard} mode="elevated">
              <Card.Content style={styles.completionContent}>
                <Text variant="headlineSmall" style={{ color: theme.colors.onSurface }}>
                  Challenge Complete
                </Text>
                <Text
                  variant="bodyLarge"
                  style={{ color: theme.custom.success }}
                >
                  {'\u2713'} {correctCount}/{cardCount} correct
                </Text>
              </Card.Content>
            </Card>
            <ContinueButton
              sourceApp={params.source}
              challengeType={params.type || 'app_open'}
            />
          </View>
        )}
      </View>

      <ProgressDots total={cardCount} current={currentIndex} results={results} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
  },
  headerSpacer: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  inputArea: {
    marginTop: 24,
    gap: 12,
  },
  completionArea: {
    gap: 24,
  },
  completionCard: {
    alignItems: 'center',
  },
  completionContent: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
});
```

**Step 2: Navigate to http://localhost:8081/challenge?source=Instagram&count=3&type=app_open and verify**

Expected: Challenge screen shows Paper Card, outlined TextInput, contained Button, dots at bottom. Close icon in top-right using Paper IconButton.

**Step 3: Commit**

```bash
git add app/challenge.tsx
git commit -m "feat: redesign Challenge screen with Paper components and ProgressDots"
```

---

### Task 12: Redesign Tutorial Screen

**Files:**
- Modify: `app/tutorial.tsx`

**Step 1: Rewrite the Tutorial screen with Paper components**

Replace the entire content of `app/tutorial.tsx` with:

```typescript
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { TutorialStep } from '../src/components/TutorialStep';

export default function TutorialScreen() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          Configure iOS Shortcuts to trigger vocabulary challenges automatically
        </Text>

        <Surface style={styles.section} elevation={1}>
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            1. Device Unlock Automation
          </Text>

          <TutorialStep
            stepNumber={1}
            title="Open Shortcuts App"
            description="Launch the Shortcuts app from your home screen."
            image={require('../assets/tutorial/shortcuts-setup-1.png')}
          />
          <TutorialStep
            stepNumber={2}
            title="Create New Automation"
            description='Tap "Automation" tab at bottom, then tap "+" to create new automation.'
            image={require('../assets/tutorial/shortcuts-setup-2.png')}
          />
          <TutorialStep
            stepNumber={3}
            title='Select "When I unlock my iPhone"'
            description='Choose personal automation trigger "When I unlock my iPhone".'
            image={require('../assets/tutorial/shortcuts-setup-3.png')}
          />
          <TutorialStep
            stepNumber={4}
            title="Add Open URL Action"
            description={'Add action "Open URL" and enter:\n\nlingolock://challenge?source=Unlock&count=3&type=unlock\n\nDisable "Ask Before Running" and tap Done.'}
            image={require('../assets/tutorial/shortcuts-setup-4.png')}
          />
        </Surface>

        <Surface style={styles.section} elevation={1}>
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            2. App-Open Automation (Optional)
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.sectionBody, { color: theme.colors.onSurfaceVariant }]}
          >
            Repeat the same steps, but in Step 3, select "When I open an app" and choose which app to trigger LingoLock (e.g., Instagram, Twitter).
            {'\n\n'}
            Use URL:{'\n'}
            lingolock://challenge?source=[AppName]&count=3&type=app_open
            {'\n\n'}
            Replace [AppName] with the app name (e.g., Instagram).
          </Text>
        </Surface>

        <Button
          mode="contained"
          onPress={() => router.back()}
          style={styles.doneButton}
          contentStyle={styles.doneButtonContent}
        >
          Got It!
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionBody: {
    lineHeight: 22,
  },
  doneButton: {
    marginTop: 8,
    marginBottom: 24,
  },
  doneButtonContent: {
    paddingVertical: 8,
  },
});
```

**Step 2: Navigate to http://localhost:8081/tutorial and verify**

Expected: Tutorial renders with Paper Surfaces for sections, List.Item-based steps with badges, and a contained "Got It!" button.

**Step 3: Commit**

```bash
git add app/tutorial.tsx
git commit -m "feat: redesign Tutorial screen with Paper Surface and components"
```

---

### Task 13: Visual Verification and Final Cleanup

**Files:**
- Possibly modify: any file with minor tweaks

**Step 1: Run TypeScript check**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 2: Start dev server and verify all 3 screens**

Run:
```bash
npx expo start --web
```

Verify:
1. **Home (/)**: Dashboard with stats card, practice button, stats surface, menu list
2. **Challenge (/challenge?source=Test&count=3&type=app_open)**: Card with TextInput, dots at bottom, close icon
3. **Tutorial (/tutorial)**: Sections in Surface cards, numbered steps, Got It button

**Step 3: Remove any leftover unused imports or dead code**

Check each modified file for unused imports from the old design (e.g., `useColorScheme` in components that now use `useAppTheme()`).

**Step 4: Commit cleanup**

```bash
git add -A
git commit -m "chore: cleanup unused imports after UI redesign"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Install Paper + vector-icons | package.json |
| 2 | Create iOS theme | src/theme/index.ts |
| 3 | Wrap app in PaperProvider | app/_layout.tsx |
| 4 | Create ProgressDots | src/components/ProgressDots.tsx |
| 5 | Create StatsCard + StatRow | src/components/StatsCard.tsx, StatRow.tsx |
| 6 | Redesign VocabularyCard | src/components/VocabularyCard.tsx |
| 7 | Redesign AnswerInput | src/components/AnswerInput.tsx |
| 8 | Redesign ContinueButton | src/components/ContinueButton.tsx |
| 9 | Redesign TutorialStep | src/components/TutorialStep.tsx |
| 10 | Redesign Home screen | app/index.tsx |
| 11 | Redesign Challenge screen | app/challenge.tsx |
| 12 | Redesign Tutorial screen | app/tutorial.tsx |
| 13 | Visual verification + cleanup | any |

Total: 13 tasks, ~13 commits, each independently verifiable.
