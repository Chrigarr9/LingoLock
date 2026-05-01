# Scramble Card UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five targeted UX improvements to the letter-scramble card: adaptive answer-row tile sizing, a 10-second hint blink, faster scramble→text promotion, correct FSRS grading when hint-demoting scramble→MC4, and showing the German translation (not the Spanish word) in the correct-answer checkmark.

**Architecture:** Pure function change for the FSRS threshold (unit-testable); isolated component edit for tile sizing; two coordinated changes (ClozeCard + challenge.tsx) for the hint blink; single-line fixes in challenge.tsx and ClozeCard for the grading and translation display.

**Tech Stack:** React Native, Expo 55, react-native-paper, ts-fsrs, Jest 29

---

## File Map

| File | What changes |
|------|-------------|
| `src/services/fsrs.ts` | Line 130: threshold `5.0` → `2.5` |
| `src/services/fsrs.test.ts` | New file: unit tests for `getAnswerType` threshold |
| `src/components/LetterScramble.tsx` | Separate pool/answer tile sizes; remove `flexWrap` from answer row |
| `src/components/ClozeCard.tsx` | Add `hintShouldBlink` prop + Animated pulse; change ✓ feedback to show `germanHint` |
| `app/challenge.tsx` | 10s blink timer; clear on hint tap; `handleMCSelect` scramble-demotion fix |

---

## Task 1: FSRS Threshold — test + fix

**Files:**
- Create: `src/services/fsrs.test.ts`
- Modify: `src/services/fsrs.ts:130`

- [ ] **Step 1.1 — Write a failing test for the new threshold**

  Create `src/services/fsrs.test.ts`:

  ```ts
  import { getAnswerType } from './fsrs';
  import type { CardState } from '../types/vocabulary';

  function makeState(stability: number): CardState {
    return {
      cardId: 'test',
      due: new Date().toISOString(),
      stability,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      reps: 1,
      lapses: 0,
      state: 2, // Review
    };
  }

  describe('getAnswerType', () => {
    it('returns mc4 for null (new card)', () => {
      expect(getAnswerType(null)).toBe('mc4');
    });

    it('returns mc4 when stability < 1.0', () => {
      expect(getAnswerType(makeState(0.9))).toBe('mc4');
    });

    it('returns scramble when stability is 1.0', () => {
      expect(getAnswerType(makeState(1.0))).toBe('scramble');
    });

    it('returns scramble when stability is 2.4', () => {
      expect(getAnswerType(makeState(2.4))).toBe('scramble');
    });

    it('returns text when stability is exactly 2.5', () => {
      expect(getAnswerType(makeState(2.5))).toBe('text');
    });

    it('returns text when stability is 10.0', () => {
      expect(getAnswerType(makeState(10.0))).toBe('text');
    });
  });
  ```

- [ ] **Step 1.2 — Run tests to see the 2.5 cases fail**

  ```bash
  npx jest src/services/fsrs.test.ts --no-coverage
  ```

  Expected: tests for `2.4` (scramble) and `2.5` (text) both fail because the current threshold is `5.0`.

- [ ] **Step 1.3 — Change the threshold in `src/services/fsrs.ts:130`**

  Replace:
  ```ts
  if (cardState.stability >= 5.0) return 'text';
  ```
  With:
  ```ts
  if (cardState.stability >= 2.5) return 'text';
  ```

- [ ] **Step 1.4 — Run tests to confirm all pass**

  ```bash
  npx jest src/services/fsrs.test.ts --no-coverage
  ```

  Expected: 6 tests, all PASS.

- [ ] **Step 1.5 — Run full test suite to check for regressions**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all tests pass. `cardSelector.test.ts` mocks `getAnswerType` so it is unaffected.

- [ ] **Step 1.6 — Commit**

  ```bash
  git add src/services/fsrs.test.ts src/services/fsrs.ts
  git commit -m "feat: lower scramble→text stability threshold from 5.0 to 2.5"
  ```

---

## Task 2: Adaptive Answer-Row Tile Sizing

**Files:**
- Modify: `src/components/LetterScramble.tsx`

The pool row keeps its current large tiles (44px/38px) for easy tapping. The answer row shrinks tiles to fit the full word on one line.

- [ ] **Step 2.1 — Add `useWindowDimensions` import**

  In `src/components/LetterScramble.tsx` line 2, change:
  ```ts
  import { View, StyleSheet, Pressable } from 'react-native';
  ```
  To:
  ```ts
  import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
  ```

- [ ] **Step 2.2 — Replace the tile-size calculation block (lines 74–75)**

  Replace:
  ```ts
  const tileSize = shuffled.length > 8 ? 38 : 44;
  const fontSize = shuffled.length > 8 ? 17 : 20;
  ```
  With:
  ```ts
  const { width: screenWidth } = useWindowDimensions();

  // Pool tiles — large for easy tapping
  const poolTileSize = shuffled.length > 8 ? 38 : 44;
  const poolFontSize = shuffled.length > 8 ? 17 : 20;

  // Answer tiles — shrink to fit the whole word on one row
  const ANSWER_H_PADDING = 32; // left+right card padding
  const TILE_GAP = 6;
  const answerTileSize = Math.max(
    24,
    Math.floor((screenWidth - ANSWER_H_PADDING - TILE_GAP * (shuffled.length - 1)) / shuffled.length),
  );
  const answerFontSize = Math.max(11, Math.floor(answerTileSize * 0.45));
  ```

- [ ] **Step 2.3 — Update the answer row to use `answerTileSize` and remove wrapping**

  Replace the entire `answerRow` `View` (lines 80–107, starting `<View style={styles.answerRow}>` ending `</View>`):
  ```tsx
  <View style={styles.answerRow}>
    {shuffled.map((_, i) => {
      const hasLetter = i < placed.length;
      return (
        <Pressable
          key={`slot-${i}`}
          onPress={hasLetter ? () => handlePlacedTap(i) : undefined}
          style={[
            styles.tile,
            {
              width: answerTileSize,
              height: answerTileSize,
              backgroundColor: hasLetter
                ? theme.colors.primaryContainer
                : theme.custom.glassBackground,
              borderColor: hasLetter
                ? theme.colors.primary
                : theme.custom.glassBorder,
            },
          ]}
        >
          <Text style={[styles.tileLetter, { fontSize: answerFontSize, color: theme.colors.onPrimaryContainer }]}>
            {hasLetter ? shuffled[placed[i]] : ''}
          </Text>
        </Pressable>
      );
    })}
  </View>
  ```

- [ ] **Step 2.4 — Update the pool row to use `poolTileSize` and `poolFontSize`**

  Replace the entire `poolRow` `View` (lines 109–146, starting `<View style={styles.poolRow}>` ending `</View>`):
  ```tsx
  <View style={styles.poolRow}>
    {shuffled.map((letter, i) => (
      <Pressable
        key={`pool-${i}`}
        onPress={() => handlePoolTap(i)}
        disabled={disabled || !available[i]}
        style={[
          styles.tile,
          {
            width: poolTileSize,
            height: poolTileSize,
            backgroundColor: available[i]
              ? theme.colors.surfaceVariant
              : 'transparent',
            borderColor: available[i]
              ? theme.colors.outline
              : 'transparent',
            opacity: available[i] ? 1 : 0.2,
          },
        ]}
      >
        <Text
          style={[
            styles.tileLetter,
            {
              fontSize: poolFontSize,
              color: theme.colors.onSurfaceVariant,
            },
          ]}
        >
          {letter}
        </Text>
      </Pressable>
    ))}
  </View>
  ```

- [ ] **Step 2.5 — Update `answerRow` style to prevent wrapping**

  In the `StyleSheet.create` block at the bottom of the file, change the `answerRow` style:
  ```ts
  answerRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    gap: 6,
  },
  ```

- [ ] **Step 2.6 — Run full test suite (no component tests, just regression check)**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 2.7 — Start the dev server and manually verify**

  ```bash
  npx expo start
  ```

  Open challenge screen on a card with a long word (>8 letters). Verify:
  - Pool tiles are large and easy to tap
  - Answer slots are smaller but the full word fits on one line
  - No tiles orphaned on a second row

- [ ] **Step 2.8 — Commit**

  ```bash
  git add src/components/LetterScramble.tsx
  git commit -m "feat: adaptive answer-row tile sizing in letter scramble"
  ```

---

## Task 3: Show German Translation in Correct-Answer Feedback

**Files:**
- Modify: `src/components/ClozeCard.tsx:211–218`

- [ ] **Step 3.1 — Replace the correct-answer feedback text**

  In `src/components/ClozeCard.tsx`, replace lines 211–218:
  ```tsx
  {showAnswer && isCorrect === true && !isFuzzy && (
    <Text
      variant="bodyMedium"
      style={[styles.feedbackText, { color: correctColor }]}
    >
      {`✓ ${card.wordInContext}`}
    </Text>
  )}
  ```
  With:
  ```tsx
  {showAnswer && isCorrect === true && !isFuzzy && (
    <Text
      variant="bodyMedium"
      style={[styles.feedbackText, { color: correctColor }]}
    >
      {`✓ ${card.germanHint}`}
      {card.germanHintGeneral ? (
        <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '400' }}>
          {`  (${card.germanHintGeneral})`}
        </Text>
      ) : null}
    </Text>
  )}
  ```

- [ ] **Step 3.2 — Start dev server and manually verify**

  ```bash
  npx expo start
  ```

  Answer a scramble or text card correctly. Verify the checkmark line shows the German word (e.g., `✓ Zimmer`) instead of the Spanish word (`✓ habitación`). If the card has a `germanHintGeneral`, verify it appears in muted text beside it.

- [ ] **Step 3.3 — Commit**

  ```bash
  git add src/components/ClozeCard.tsx
  git commit -m "feat: show German translation in correct-answer checkmark feedback"
  ```

---

## Task 4: Scramble→MC4 Hint Demotion Graded as 'again'

**Files:**
- Modify: `app/challenge.tsx` — `handleMCSelect` (~line 307)

When a scramble card is hint-demoted to MC4 and the user picks correctly, the correct answer is shown visually but FSRS is graded as `'again'` (the card comes back sooner next session).

- [ ] **Step 4.1 — Update `handleMCSelect`**

  In `app/challenge.tsx`, replace the `handleMCSelect` function (lines ~307–317):
  ```ts
  const handleMCSelect = (choice: string) => {
    if (!currentCard || currentCard.card.kind !== 'cloze') return;
    setAnsweredChoice(choice);
    setUserAnswer(choice);
    const correct = choice === currentCard.card.wordInContext;
    if (correct) {
      handleCorrect(currentCard, 'good');
    } else {
      handleIncorrect(currentCard);
    }
  };
  ```
  With:
  ```ts
  const handleMCSelect = (choice: string) => {
    if (!currentCard || currentCard.card.kind !== 'cloze') return;
    setAnsweredChoice(choice);
    setUserAnswer(choice);
    const correct = choice === currentCard.card.wordInContext;
    const isScrambleDemotion = hintUsed && baseAnswerType === 'scramble';
    if (correct) {
      // Scramble demotion: visually correct but FSRS penalises as 'again'
      handleCorrect(currentCard, isScrambleDemotion ? 'again' : 'good');
    } else {
      handleIncorrect(currentCard);
    }
  };
  ```

- [ ] **Step 4.2 — Start dev server and manually verify**

  ```bash
  npx expo start
  ```

  Find a scramble card (stability 1.0–2.5). Tap the hint lightbulb — card demotes to MC4. Pick the correct answer. Verify:
  - The selected tile shows green (correct visually)
  - The checkmark line shows the German translation (from Task 3)
  - Check the FSRS scheduled date in app state is much sooner than a normal `'good'` grade would produce (this is hard to verify directly — confirming correct code is sufficient)

- [ ] **Step 4.3 — Commit**

  ```bash
  git add app/challenge.tsx
  git commit -m "feat: grade scramble→MC4 hint-demoted correct pick as 'again'"
  ```

---

## Task 5: Hint Blink After 10 Seconds

**Files:**
- Modify: `src/components/ClozeCard.tsx` — add prop + Animated pulse
- Modify: `app/challenge.tsx` — add 10s timer state + clear on hint tap + pass prop

### Part A — Add `hintShouldBlink` prop and animation to ClozeCard

- [ ] **Step 5.1 — Add `Animated` to the react-native import in `ClozeCard.tsx`**

  In `src/components/ClozeCard.tsx` line 2, change:
  ```ts
  import { View, StyleSheet, Platform, Image, Pressable, type ImageSourcePropType } from 'react-native';
  ```
  To:
  ```ts
  import { View, StyleSheet, Platform, Image, Pressable, Animated, type ImageSourcePropType } from 'react-native';
  ```

- [ ] **Step 5.2 — Add `hintShouldBlink` to `ClozeCardDisplayProps` interface**

  In `src/components/ClozeCard.tsx`, add after the `onAlreadyKnow` prop (around line 24):
  ```ts
  /** When true, gently pulse the hint button to attract attention */
  hintShouldBlink?: boolean;
  ```

- [ ] **Step 5.3 — Destructure `hintShouldBlink` in the component signature**

  In `src/components/ClozeCard.tsx`, the `ClozeCardDisplay` function signature (line ~40–53) currently ends with `contentHeight = 0,`. Add `hintShouldBlink = false,` before the closing `}`:
  ```ts
  export function ClozeCardDisplay({
    sessionCard,
    showAnswer,
    isCorrect,
    isFuzzy,
    isMuted,
    playbackSpeed = 1.0,
    onAudioFinish,
    onHintRequest,
    onAlreadyKnow,
    keyboardHeight = 0,
    userAnswer,
    contentHeight = 0,
    hintShouldBlink = false,
  }: ClozeCardDisplayProps) {
  ```

- [ ] **Step 5.4 — Add `blinkAnim` ref and animation `useEffect` inside the component body**

  In `src/components/ClozeCard.tsx`, after the line `const hintIsTappable = !!onHintRequest;` (line ~159), add:
  ```ts
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (hintShouldBlink && hintIsTappable) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      blinkAnim.stopAnimation();
      blinkAnim.setValue(1);
    }
  }, [hintShouldBlink, hintIsTappable]);
  ```

- [ ] **Step 5.5 — Wrap the hint `Pressable` in an `Animated.View`**

  In `src/components/ClozeCard.tsx`, the hint area (lines ~220–257) currently has:
  ```tsx
  {!showAnswer && (
    <View style={styles.hintArea}>
      <Pressable
        onPress={hintIsTappable ? onHintRequest : undefined}
        style={styles.hintRow}
        ...
      >
        ...
      </Pressable>
      {sessionCard.isFirstEncounter && onAlreadyKnow && ( ... )}
    </View>
  )}
  ```

  Wrap only the `Pressable` (not the "I know this" link) in an `Animated.View`:
  ```tsx
  {!showAnswer && (
    <View style={styles.hintArea}>
      <Animated.View style={{ opacity: blinkAnim }}>
        <Pressable
          onPress={hintIsTappable ? onHintRequest : undefined}
          style={styles.hintRow}
          accessibilityRole={hintIsTappable ? 'button' : undefined}
          accessibilityLabel={hintIsTappable ? 'Make it easier' : undefined}
        >
          <Icon
            source={hintIsTappable ? 'lightbulb-on-outline' : 'lightbulb-outline'}
            size={22}
            color={hintIsTappable ? theme.custom.hintYellow : theme.custom.brandBlue}
          />
          <Text
            variant="bodyLarge"
            style={[styles.germanHint, { color: hintIsTappable ? theme.custom.hintYellow : theme.custom.brandBlue }]}
          >
            {card.germanHint}
            {card.germanHintGeneral ? (
              <Text style={[styles.germanHintGeneral, { color: theme.colors.onSurfaceVariant }]}>
                {`  (${card.germanHintGeneral})`}
              </Text>
            ) : null}
          </Text>
        </Pressable>
      </Animated.View>
      {sessionCard.isFirstEncounter && onAlreadyKnow && (
        <Pressable onPress={onAlreadyKnow} accessibilityRole="button">
          <Text
            variant="labelSmall"
            style={[styles.alreadyKnowLink, { color: theme.colors.onSurfaceVariant }]}
          >
            I know this
          </Text>
        </Pressable>
      )}
    </View>
  )}
  ```

### Part B — Timer in challenge.tsx

- [ ] **Step 5.6 — Add `hintShouldBlink` state in `challenge.tsx`**

  In `app/challenge.tsx`, after the existing `const [hasMoreCards, setHasMoreCards] = useState(false);` line (~98), add:
  ```ts
  const [hintShouldBlink, setHintShouldBlink] = useState(false);
  ```

- [ ] **Step 5.7 — Add a 10-second blink timer `useEffect`**

  In `app/challenge.tsx`, after the timer cleanup `useEffect` (the one that clears `advanceTimer.current` on unmount, ~lines 136–140), add:
  ```ts
  // Reset hint blink on every card advance; fire after 10s of no interaction
  useEffect(() => {
    setHintShouldBlink(false);
    const t = setTimeout(() => setHintShouldBlink(true), 10_000);
    return () => clearTimeout(t);
  }, [currentIndex]);
  ```

- [ ] **Step 5.8 — Clear the blink when the hint is tapped**

  In `app/challenge.tsx`, update `handleHintRequest` (lines ~319–323):
  ```ts
  const handleHintRequest = () => {
    setHintShouldBlink(false);
    if (answerType === 'text' || answerType === 'scramble') {
      setDemotedMode(demoteAnswerType(answerType));
    }
  };
  ```

- [ ] **Step 5.9 — Pass `hintShouldBlink` to scramble-mode `ClozeCardDisplay`**

  In `app/challenge.tsx`, find the scramble-mode `ClozeCardDisplay` (around line 511). Add `hintShouldBlink={hintShouldBlink}` after `onHintRequest`:
  ```tsx
  <ClozeCardDisplay
    key={currentCard.card.id}
    sessionCard={currentCard}
    showAnswer={showAnswer}
    isCorrect={isCorrect ?? undefined}
    isMuted={isMuted}
    playbackSpeed={audioSpeed}
    onAudioFinish={handleAudioFinish}
    onAlreadyKnow={currentCard.isFirstEncounter ? handleAlreadyKnow : undefined}
    onHintRequest={!showAnswer ? handleHintRequest : undefined}
    hintShouldBlink={hintShouldBlink}
    userAnswer={userAnswer ?? undefined}
    contentHeight={contentHeight}
  />
  ```

- [ ] **Step 5.10 — Pass `hintShouldBlink` to text-mode `ClozeCardDisplay`**

  In `app/challenge.tsx`, find the text-mode `ClozeCardDisplay` (around line 545). Add `hintShouldBlink={hintShouldBlink}` after `onHintRequest`:
  ```tsx
  <ClozeCardDisplay
    key={currentCard.card.id}
    sessionCard={currentCard}
    showAnswer={showAnswer}
    isCorrect={isCorrect ?? undefined}
    isFuzzy={isFuzzy}
    isMuted={isMuted}
    playbackSpeed={audioSpeed}
    onAudioFinish={handleAudioFinish}
    onHintRequest={!showAnswer ? handleHintRequest : undefined}
    hintShouldBlink={hintShouldBlink}
    keyboardHeight={keyboard.height}
    userAnswer={userAnswer ?? undefined}
    contentHeight={contentHeight}
  />
  ```

- [ ] **Step 5.11 — Run full test suite**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all tests pass (no component tests for these files, so this is a regression check only).

- [ ] **Step 5.12 — Start dev server and manually verify**

  ```bash
  npx expo start
  ```

  On a scramble or text card:
  - Wait 10 seconds without interacting → hint lightbulb starts pulsing (slow 600ms fade in/out)
  - Tap the hint → pulse stops immediately, card demotes
  - Advance to next card → timer resets, no pulse for 10s

  On an MC4 card:
  - Wait 10 seconds → no pulse visible (hint is not tappable in MC4)

- [ ] **Step 5.13 — Commit**

  ```bash
  git add src/components/ClozeCard.tsx app/challenge.tsx
  git commit -m "feat: pulse hint button after 10s inactivity on scramble/text cards"
  ```
