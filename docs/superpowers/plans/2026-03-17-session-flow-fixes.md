# Session Flow Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three session-flow edge cases: wrong-answer retries being silently dropped at session end; aborted sessions not recording new words against the daily budget; and replace the automatic unlimited-budget fallback with an explicit "Learn more new words" user choice.

**Architecture:** All session-flow changes live in `challenge.tsx`. Two new tracking refs (`totalCardCount`, `answeredNewCardIds`) replace the existing `newCardCount` ref, a `retriesUsed` Set prevents infinite retry loops, and a `hasMoreCards` state drives the new "Learn more" UI. Web storage tests are added to the existing `storage.web.test.ts`. A one-line docstring fix lives in `cardSelector.ts`.

**Tech Stack:** React Native / Expo 55, TypeScript, ts-jest, localStorage (web adapter)

---

## Files Changed

| File | Change |
|------|--------|
| `src/services/cardSelector.ts` | Fix docstring for `getCurrentChapter` |
| `src/services/storage.web.test.ts` | Add tests for daily-budget storage functions |
| `app/challenge.tsx` | Three session-flow fixes + "Learn more" UI |

---

## Task 1: Fix `getCurrentChapter` docstring

The docstring says mastery uses `isCardMastered` (stability ≥ 21 days), but the code uses `isCardLearned` (entered Review state). Fix the comment to match the code.

**Files:**
- Modify: `src/services/cardSelector.ts:145-146`

- [ ] **Step 1: Edit the docstring**

In `src/services/cardSelector.ts`, replace lines 145–146:

```
 * mastered if isCardMastered(loadCardState(card.id)) is true.
```

with:

```
 * learned if isCardLearned(loadCardState(card.id)) is true (i.e. card has
 * entered the Review state after completing its initial learning steps).
```

- [ ] **Step 2: Commit**

```bash
git add src/services/cardSelector.ts
git commit -m "docs: fix getCurrentChapter docstring — uses isCardLearned not isCardMastered"
```

---

## Task 2: Add web storage tests for daily-budget functions

`storage.web.test.ts` already tests card state CRUD, stats, audio prefs — but never imports or tests `loadNewWordsPerDay`, `saveNewWordsPerDay`, `loadNewWordsIntroducedToday`, or `recordNewWordsIntroduced`. Add a full test suite for these.

**Files:**
- Modify: `src/services/storage.web.test.ts`

- [ ] **Step 1: Add import for the four functions**

Add to the existing import block in `storage.web.test.ts` (around line 41–53):

```ts
import {
  saveCardState,
  loadCardState,
  loadAllCardStates,
  deleteCardState,
  saveStats,
  loadStats,
  saveAudioMuted,
  loadAudioMuted,
  saveAudioSpeed,
  loadAudioSpeed,
  saveNewWordsPerDay,
  loadNewWordsPerDay,
  loadNewWordsIntroducedToday,
  recordNewWordsIntroduced,
  clearAllData,
} from './storage.web';
```

- [ ] **Step 2: Add the test suite at the end of the file**

```ts
// ---------------------------------------------------------------------------
// Daily new-word budget
// ---------------------------------------------------------------------------

describe('loadNewWordsPerDay / saveNewWordsPerDay', () => {
  it('returns 20 by default when nothing is stored', () => {
    expect(loadNewWordsPerDay()).toBe(20);
  });

  it('returns the value that was saved', () => {
    saveNewWordsPerDay(10);
    expect(loadNewWordsPerDay()).toBe(10);
  });

  it('clamps values below 1 to 1', () => {
    saveNewWordsPerDay(0);
    expect(loadNewWordsPerDay()).toBe(1);
  });

  it('clamps values above 50 to 50', () => {
    saveNewWordsPerDay(99);
    expect(loadNewWordsPerDay()).toBe(50);
  });
});

describe('loadNewWordsIntroducedToday', () => {
  it('returns 0 when nothing has been recorded', () => {
    expect(loadNewWordsIntroducedToday()).toBe(0);
  });

  it('returns 0 when the stored date is not today', () => {
    // Write a count for yesterday
    localStorage.setItem('ll.new_words_today_date', '2000-01-01');
    localStorage.setItem('ll.new_words_today', '15');
    expect(loadNewWordsIntroducedToday()).toBe(0);
  });

  it('returns the stored count when the stored date is today', () => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('ll.new_words_today_date', today);
    localStorage.setItem('ll.new_words_today', '7');
    expect(loadNewWordsIntroducedToday()).toBe(7);
  });
});

describe('recordNewWordsIntroduced', () => {
  it('sets today count to the given value when called for the first time', () => {
    recordNewWordsIntroduced(5);
    expect(loadNewWordsIntroducedToday()).toBe(5);
  });

  it('accumulates on subsequent calls (additive)', () => {
    recordNewWordsIntroduced(5);
    recordNewWordsIntroduced(3);
    expect(loadNewWordsIntroducedToday()).toBe(8);
  });

  it('resets to a fresh count if called with stale date in storage', () => {
    localStorage.setItem('ll.new_words_today_date', '2000-01-01');
    localStorage.setItem('ll.new_words_today', '99');
    recordNewWordsIntroduced(4);
    expect(loadNewWordsIntroducedToday()).toBe(4);
  });

  it('recording 0 does not corrupt the count', () => {
    recordNewWordsIntroduced(3);
    recordNewWordsIntroduced(0);
    expect(loadNewWordsIntroducedToday()).toBe(3);
  });
});
```

- [ ] **Step 3: Run the tests and verify they all pass**

```bash
npx jest src/services/storage.web.test.ts --no-coverage
```

Expected: all new tests pass. (These are pure unit tests against the localStorage mock — no production code change needed.)

- [ ] **Step 4: Commit**

```bash
git add src/services/storage.web.test.ts
git commit -m "test: add web storage tests for daily new-word budget functions"
```

---

## Task 3: Fix session flow in `challenge.tsx`

Three interrelated fixes in one file. Each sub-step is independently verifiable.

**Files:**
- Modify: `app/challenge.tsx`

### 3a — Replace tracking refs

Remove the old `newCardCount` ref. Add three new refs.

- [ ] **Step 1: Update the ref declarations** (around lines 49–50)

Replace:
```ts
const originalCardCount = useRef(0);
const newCardCount = useRef(0);
```

With:
```ts
const originalCardCount = useRef(0);   // original session length — used for stats + progress display
const totalCardCount = useRef(0);      // grows when wrong-answer cards are re-inserted
const retriesUsed = useRef(new Set<string>()); // card IDs that have already been re-inserted once
const answeredNewCardIds = useRef(new Set<string>()); // card IDs of new cards that were answered
```

### 3b — Track answered new cards in answer handlers

Every time a card is answered (correct or incorrect), if it was a first-encounter card we add it to `answeredNewCardIds`. This gives us an accurate count even when sessions are aborted.

- [ ] **Step 2: Update `handleCorrect`** (around line 180)

After the existing `updateCardFSRS` call, add:
```ts
const handleCorrect = (sessionCard: SessionCard, grade: ReviewGrade) => {
  updateCardFSRS(sessionCard, grade);
  if (sessionCard.isFirstEncounter) answeredNewCardIds.current.add(sessionCard.card.id);
  setIsCorrect(true);
  // ... rest unchanged
```

- [ ] **Step 3: Update `handleIncorrect`** (around line 195)

Replace the existing `handleIncorrect` entirely:
```ts
const handleIncorrect = (sessionCard: SessionCard) => {
  updateCardFSRS(sessionCard, 'again');
  const cardId = sessionCard.card.id;
  if (sessionCard.isFirstEncounter) answeredNewCardIds.current.add(cardId);
  setIsCorrect(false);
  setShowAnswer(true);
  setShowReveal(true);
  // Only re-insert once per card — prevents the last-4-cards silent-drop bug
  // and guards against infinite retry loops.
  if (!retriesUsed.current.has(cardId)) {
    retriesUsed.current.add(cardId);
    // Pre-compute the new queue outside the state updater — updaters must be
    // pure (no side effects), and React may call them twice in Strict Mode.
    const newQ = handleWrongAnswer(queue, currentIndex, sessionCard);
    totalCardCount.current = newQ.length;
    setQueue(newQ);
  }
};
```

### 3c — Fix `advanceToNext` end condition and budget recording

The old end condition `nextIndex >= originalCardCount.current` caused re-inserted cards near the end to be skipped silently. Switch to `totalCardCount.current`. Also record the budget here (completion path).

- [ ] **Step 4: Update `advanceToNext`** (around line 135)

Replace the function:
```ts
const advanceToNext = () => {
  if (advanceTimer.current) clearTimeout(advanceTimer.current);
  const nextIndex = currentIndex + 1;
  if (nextIndex < totalCardCount.current) {
    setCurrentIndex(nextIndex);
    setShowAnswer(false);
    setIsCorrect(null);
    setAnsweredChoice(null);
    setShowReveal(false);
    setHintUsed(false);
  } else {
    updateStatsAfterSession(correctCount, originalCardCount.current, params.source ?? 'unknown');
    recordNewWordsIntroduced(answeredNewCardIds.current.size);
    const extra = buildSession(Infinity, params.source);
    setHasMoreCards(extra.length > 0);
    setIsComplete(true);
  }
};
```

### 3d — Record budget on abort (close button)

Currently the close button never calls `recordNewWordsIntroduced`, so aborting a session lets the next session re-use the full daily budget. Fix: always record answered new cards on close.

- [ ] **Step 5: Update the close button handler** (around line 274)

Replace the `onPress` handler of the close IconButton:
```ts
onPress={() => {
  if (advanceTimer.current) clearTimeout(advanceTimer.current);
  // Record new words seen before abort — but NOT if session already completed
  // (advanceToNext already recorded them; isComplete may still be false in the
  // current closure if the user taps close before the next render).
  if (!isComplete && answeredNewCardIds.current.size > 0) {
    recordNewWordsIntroduced(answeredNewCardIds.current.size);
  }
  if (mode === 'fixed' && !isComplete) {
    recordAbort(params.source ?? 'unknown');
  }
  router.back();
}}
```

### 3e — Session init: remove auto-Infinity fallback, add `hasMoreCards` state

- [ ] **Step 6: Add `hasMoreCards` state** near the other useState declarations (around line 68):

```ts
const [hasMoreCards, setHasMoreCards] = useState(false);
```

- [ ] **Step 7: Rewrite the session init `useEffect`** (lines 74–108):

```ts
useEffect(() => {
  let session: SessionCard[];
  if (mode === 'continuous') {
    session = buildSession(loadNewWordsPerDay(), params.source);
  } else {
    session = buildSession(parseInt(params.count || '3', 10), params.source);
  }

  if (session.length === 0) {
    // Check if unlimited budget would yield cards (budget exhausted, not truly done)
    const extra = buildSession(Infinity, params.source);
    setHasMoreCards(extra.length > 0);
    setIsEmpty(true);
    setIsComplete(true);
  } else {
    setQueue(session);
    originalCardCount.current = session.length;
    totalCardCount.current = session.length;
  }

  console.log('[Challenge] Started:', {
    source: params.source,
    mode,
    type: params.type,
    sessionLength: session.length,
  });
}, []);
```

### 3f — Add `startExtraSession` function

- [ ] **Step 8: Add the function** (after `handleHintRequest`, before the glass style block):

```ts
const startExtraSession = () => {
  const extra = buildSession(Infinity, params.source);
  if (extra.length === 0) return;
  setQueue(extra);
  originalCardCount.current = extra.length;
  totalCardCount.current = extra.length;
  retriesUsed.current = new Set();
  answeredNewCardIds.current = new Set();
  setCurrentIndex(0);
  setShowAnswer(false);
  setIsCorrect(null);
  setAnsweredChoice(null);
  setShowReveal(false);
  setHintUsed(false);
  setIsComplete(false);
  setIsEmpty(false);
  setHasMoreCards(false);
  setCorrectCount(0);
};
```

### 3g — Update progress display to use `totalCardCount`

- [ ] **Step 9: Update the progress label** (around line 317):

Replace:
```ts
CHAPTER {getCurrentChapter()} · CARD {currentIndex + 1} OF {originalCardCount.current}
```
With:
```ts
CHAPTER {getCurrentChapter()} · CARD {currentIndex + 1} OF {totalCardCount.current}
```

Also update the `ProgressDots` prop (around line 326):
```ts
<ProgressDots total={totalCardCount.current} current={currentIndex} />
```

### 3h — Update completion and empty screen UI

- [ ] **Step 10: Update the "all caught up" empty state message** (around line 426–430):

Replace the static body text:
```tsx
<Text
  variant="bodyMedium"
  style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}
>
  {hasMoreCards
    ? `Daily word budget reached. Tap below to keep learning!`
    : `No cards due and no new words available. Come back tomorrow!`}
</Text>
```

- [ ] **Step 11: Add "Learn more new words" button to the completion screen** (around line 463, after the streak row `</View>` that closes the completionCard):

After the closing `</View>` of `completionCard` in the normal-completion branch (the one with `accuracyHero`), add:
```tsx
{hasMoreCards && (
  <Pressable
    onPress={startExtraSession}
    style={[styles.learnMoreButton, { backgroundColor: theme.colors.surfaceVariant }]}
    accessibilityLabel="Learn more new words"
    accessibilityRole="button"
  >
    <Text style={[styles.learnMoreText, { color: theme.colors.onSurface }]}>
      Learn more new words
    </Text>
  </Pressable>
)}
```

Also add to the empty-screen branch (after the existing glass card for isEmpty):
```tsx
{hasMoreCards && (
  <Pressable
    onPress={startExtraSession}
    style={[styles.learnMoreButton, { backgroundColor: 'rgba(255,160,86,0.90)' }]}
    accessibilityLabel="Learn more new words"
    accessibilityRole="button"
  >
    <Text style={[styles.doneButtonText]}>Learn more new words</Text>
  </Pressable>
)}
```

- [ ] **Step 12: Add the `learnMoreButton` and `learnMoreText` styles** at the end of `StyleSheet.create({...})`:

```ts
learnMoreButton: {
  alignSelf: 'stretch',
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 14,
  borderRadius: 20,
},
learnMoreText: {
  fontSize: 16,
  fontWeight: '600',
},
```

### 3i — Verify and commit

- [ ] **Step 13: Run all tests to make sure nothing broke**

```bash
npx jest --no-coverage
```

Expected: all tests pass (challenge.tsx has no unit tests — these changes are verified by manual browser testing in the next step).

- [ ] **Step 14: Manual smoke test in browser**

```bash
npm run web
```

Open the PWA. Verify:
1. Complete a session — progress dots count re-inserted cards correctly (e.g. "CARD 7 OF 7" when you had a re-insert)
2. Start a session, answer some new cards, close early → start again → new cards are NOT re-offered as "new" (they already have FSRS state), budget is correctly reduced
3. Complete all due cards + exhaust daily budget → completion screen shows "Learn more new words" button → tapping it starts a new session with more new words

- [ ] **Step 15: Commit**

```bash
git add app/challenge.tsx
git commit -m "fix: correct session-flow edge cases — retry drop, abort budget, learn-more option"
```
