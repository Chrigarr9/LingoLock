# Scramble Card UX Improvements — Design Spec

**Date:** 2026-05-01  
**Branch:** screen-time-api  
**Status:** Approved

---

## Summary

Four focused improvements to the letter-scramble card experience:

1. Adaptive answer-row tile sizing so the placed-word never wraps mid-word
2. Gentle hint blink after 10 seconds of inactivity
3. Lower the scramble→text stability threshold from 5.0 → 2.5
4. Hint-demoted scramble→MC4 correct answer treated as `'again'` (not known)

---

## Change 1 — Adaptive Answer-Row Tile Sizing

**Problem:** `answerRow` uses `flexWrap: 'wrap'`, causing long words to split mid-word (e.g., 9 tiles on row 1, 3 on row 2).

**Fix:** Two independent tile sizes — pool tiles keep their current large size for easy tapping; answer tiles shrink to fit the full word on one line.

**File:** `src/components/LetterScramble.tsx`

### Implementation

```
const { width: screenWidth } = useWindowDimensions();

// Pool tiles — large for easy tapping (unchanged)
const poolTileSize = shuffled.length > 8 ? 38 : 44;
const poolFontSize = shuffled.length > 8 ? 17 : 20;

// Answer tiles — adaptive: fit all letters on one row
const ANSWER_HORIZONTAL_PADDING = 32;  // card left+right padding
const TILE_GAP = 6;
const availableWidth = screenWidth - ANSWER_HORIZONTAL_PADDING;
const answerTileSize = Math.max(
  24,
  Math.floor((availableWidth - TILE_GAP * (shuffled.length - 1)) / shuffled.length)
);
const answerFontSize = Math.max(11, Math.floor(answerTileSize * 0.45));
```

- `answerRow` removes `flexWrap: 'wrap'`; instead `flexWrap: 'nowrap'` so tiles never orphan
- `poolRow` keeps `flexWrap: 'wrap'` (unchanged layout)
- Floor of 24px on answer tile (very long words still readable)

---

## Change 2 — Hint Blink After 10 Seconds

**Problem:** No inactivity prompt exists; users may not discover the hint.

**Design:** A gentle Animated opacity loop on the hint touchable in `ClozeCardDisplay`, triggered by a prop from `challenge.tsx`. Starts at card load, fires once after 10s, stops when the card advances or the hint is tapped.

### New prop on `ClozeCardDisplayProps`

```ts
/** When true, pulse the hint button to attract attention */
hintShouldBlink?: boolean;
```

### Timer in `challenge.tsx`

```ts
const [hintShouldBlink, setHintShouldBlink] = useState(false);

// Reset blink state on every card advance (currentIndex or queue change)
useEffect(() => {
  setHintShouldBlink(false);
  const t = setTimeout(() => setHintShouldBlink(true), 10_000);
  return () => clearTimeout(t);
}, [currentIndex]);

// Clear blink when hint is tapped
const handleHintRequest = () => {
  setHintShouldBlink(false);
  if (answerType === 'text' || answerType === 'scramble') {
    setDemotedMode(demoteAnswerType(answerType));
  }
};
```

### Animation in `ClozeCard.tsx`

```ts
const blinkAnim = useRef(new Animated.Value(1)).current;

useEffect(() => {
  if (hintShouldBlink) {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  } else {
    blinkAnim.stopAnimation();
    blinkAnim.setValue(1);
  }
}, [hintShouldBlink]);
```

The hint `Pressable` wrapper becomes an `Animated.View` with `opacity: blinkAnim`. Blink only runs when `hintIsTappable` is also true (no blink after answer is shown or in MC4 mode).

---

## Change 3 — Lower Scramble→Text Threshold

**Problem:** With `request_retention: 0.9`, Hard answers grow stability slowly (~×1.18 each). Reaching 5.0 from a first Good (~2.3) takes 5–6 consecutive Hard answers, keeping cards stuck in scramble.

**Fix:** Change threshold from `5.0` to `2.5`.

**File:** `src/services/fsrs.ts:130`

```ts
// Before
if (cardState.stability >= 5.0) return 'text';

// After
if (cardState.stability >= 2.5) return 'text';
```

**Progression at 2.5:**
- New card, first Good → stability ~2.3 → still scramble (by a small margin)
- One Hard + one Good, or two Goods → stability reaches ~2.5–2.7 → promotes to text
- Single Hard answer keeps users slightly longer in scramble, which feels intentional

---

## Change 4 — Scramble→MC4 Hint Demotion = `'again'` (correct-looking, wrong FSRS)

**Problem:** `handleMCSelect` always calls `handleCorrect(currentCard, 'good')` on a correct pick, even when the card was hint-demoted from scramble. This records the card as "known" when it wasn't.

**Fix:** When `hintUsed && baseAnswerType === 'scramble'`, call `handleCorrect(currentCard, 'again')`. This shows the answer as correct visually (green MC tile, checkmark) while applying the FSRS 'again' grade — stability drops and the card is scheduled for an early re-review. The card is **not** re-queued mid-session (no `handleWrongAnswer` call); it just comes back sooner next session.

**File:** `app/challenge.tsx` — `handleMCSelect` (line ~307)

```ts
const handleMCSelect = (choice: string) => {
  if (!currentCard || currentCard.card.kind !== 'cloze') return;
  setAnsweredChoice(choice);
  setUserAnswer(choice);
  const correct = choice === currentCard.card.wordInContext;
  const isScrambleDemotion = hintUsed && baseAnswerType === 'scramble';
  if (correct) {
    // Scramble demotion: show correct but penalise FSRS as 'again'
    handleCorrect(currentCard, isScrambleDemotion ? 'again' : 'good');
  } else {
    handleIncorrect(currentCard);
  }
};
```

Visual result: MC grid shows the correct tile green, ClozeCard shows `✓ <germanHint>` (see Change 5), card advances normally in session but FSRS schedules it as a miss.

---

## Change 5 — Show German Word Translation in Correct-Answer Feedback

**Problem:** On a correct non-fuzzy answer, `ClozeCard.tsx` shows `✓ habitación` (the target Spanish word). This duplicates what the user just typed — it doesn't add learning value. The German meaning is more useful.

**Fix:** Replace `card.wordInContext` with `card.germanHint` (plus `germanHintGeneral` when present) in the correct-answer feedback line.

**File:** `src/components/ClozeCard.tsx` (line ~211–218)

```tsx
// Before
{showAnswer && isCorrect === true && !isFuzzy && (
  <Text style={[styles.feedbackText, { color: correctColor }]}>
    {`✓ ${card.wordInContext}`}
  </Text>
)}

// After
{showAnswer && isCorrect === true && !isFuzzy && (
  <Text style={[styles.feedbackText, { color: correctColor }]}>
    {`✓ ${card.germanHint}`}
    {card.germanHintGeneral ? (
      <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '400' }}>
        {`  (${card.germanHintGeneral})`}
      </Text>
    ) : null}
  </Text>
)}
```

The wrong-answer feedback (`✗ userAnswer`) and fuzzy feedback (`≈ userAnswer`) are unchanged — those already show what the user typed, which is the right context for error feedback.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/LetterScramble.tsx` | Adaptive answer tile sizing; `useWindowDimensions` |
| `src/services/fsrs.ts` | Threshold 5.0 → 2.5 |
| `app/challenge.tsx` | 10s blink timer; `hintShouldBlink` state; fix `handleMCSelect` |
| `src/components/ClozeCard.tsx` | `hintShouldBlink` prop; Animated opacity loop; show `germanHint` in correct feedback |

---

## Edge Cases

- **Very long words (>14 letters)**: Answer tile floor is 24px, font floor 11px. Readable but compact — acceptable tradeoff.
- **Blink on MC4 cards**: `hintIsTappable` is already false for MC4 — blink won't show even if timer fires.
- **Hint tapped before 10s**: Timer is cleared in `handleHintRequest`; no blink fires.
- **Card advances before 10s**: `useEffect` cleanup clears the timer; `hintShouldBlink` resets to false.
- **Scramble→MC4 wrong answer**: Already calls `handleIncorrect` — no change needed.
- **Text→Scramble hint demotion**: Unchanged — still rates as `'hard'` on correct text answer.
- **`germanHintGeneral` presence**: Shown inline in smaller text for both the new correct-feedback line and the existing pre-answer hint area (no change to pre-answer hint).
