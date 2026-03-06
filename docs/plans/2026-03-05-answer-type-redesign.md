# Answer Type Redesign

## Changes from Current System

**Remove mc2 entirely.** Two choices is too easy — nearly 50% guess rate, teaches nothing.

### New Progression (stability-based)

| Stage | Stability | Answer Type | Description |
|-------|-----------|-------------|-------------|
| New/Fragile | < 2.0 | `mc4` | 4 multiple choice options. First encounter + early reviews. |
| Recall | >= 2.0 | `text` | Free text input with optional hint button. |

### FSRS Rating Grades (expand from 2 to 4)

| Scenario | Rating | Effect |
|----------|--------|--------|
| Wrong answer | `Again` | Reset to short interval, card re-enters learning |
| MC4 correct | `Good` | Normal progression |
| Text correct (no hint) | `Good` | Normal progression |
| Text correct (used hint) | `Hard` | Correct but shorter next interval — comes back sooner |
| User taps "Already know" (first encounter only) | `Easy` | Large stability boost, must prove recall via text within days |

### Hint System (text mode only)

When answer type is `text`, show a **hint button** (e.g., lightbulb icon). On tap:
- Reveal letters based on current stability (progressive difficulty)
- User still types the full word
- If correct after hint -> `Rating.Hard` (not `Good`)
- Hint button disappears after use (one hint per card per review)

#### Progressive Hint Levels

| Stability | Hint revealed | Example ("pregunta") |
|-----------|---------------|----------------------|
| 2.0 - 5.0 | First letter + last letter + word length | `P _ _ _ _ _ _ A` |
| 5.0 - 10.0 | First letter + word length | `P _ _ _ _ _ _ _` |
| >= 10.0 | First letter only | `P` |

As the user progresses, hints become less generous — creating a natural difficulty
ramp within text mode itself.

### "Already Know" Button (first encounter only)

For words the user already knows (e.g., common cognates like "hotel", "taxi", "radio"):

- Small text link below the card: "Already know this?"
- **Only visible when `cardState === null`** (card has never been seen before)
- Tap -> reveal answer + rate as `Rating.Easy`
- FSRS `Easy` gives a massive stability boost (jumps to ~5-10 day interval)
- Card comes back as `text` mode (stability well above 2.0) — user must prove recall
- If user fails the text recall later, card lapses to Relearning and drops to mc4
- **Button never reappears** — not on lapses, not on subsequent reviews

This respects the user's self-knowledge while requiring proof. FSRS self-corrects
if the user was wrong about knowing it.

### Progress Labels (6 levels, aligned with FSRS State)

| Label | Condition |
|-------|-----------|
| New | `cardState === null` |
| Learning | `state === State.Learning` |
| Reviewing | `state === State.Review && stability < 10` |
| Familiar | `state === State.Review && stability >= 10 && < 21` |
| Mastered | `state === State.Review && stability >= 21` |
| Relearning | `state === State.Relearning` |

Maps directly to ts-fsrs State enum (New=0, Learning=1, Review=2, Relearning=3)
with stability sub-divisions for the Review state. "Relearning" gives valuable
feedback — tells the user "you knew this but forgot it."

### Lapse Behavior

When a card lapses (wrong answer in text mode):
- Stability drops via FSRS, card enters `State.Relearning`
- If stability falls below 2.0, answer type reverts to `mc4`
- "Already know" button does NOT reappear (only for `cardState === null`)
- Progress label shows "Relearning"

### Implementation Notes

**`fsrs.ts` changes:**
```typescript
// Remove mc2, adjust threshold
export function getAnswerType(cardState: CardState | null): 'mc4' | 'text' {
  if (cardState === null) return 'mc4';
  if (cardState.stability < 2.0) return 'mc4';
  return 'text';
}

// Expand to 4 ratings
export function scheduleReview(
  cardState: CardState,
  grade: 'again' | 'hard' | 'good' | 'easy',
): CardState {
  const card = toFSRSCard(cardState);
  const ratingMap = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
  const { card: updatedCard } = scheduler.next(card, new Date(), ratingMap[grade]);
  return fromFSRSCard(cardState.cardId, updatedCard);
}

// Progressive hint level based on stability
export function getHintLevel(cardState: CardState): 'full' | 'medium' | 'minimal' {
  if (cardState.stability < 5.0) return 'full';      // first + last + length
  if (cardState.stability < 10.0) return 'medium';   // first + length
  return 'minimal';                                    // first letter only
}

// 6-level progress labels aligned with FSRS State
export function getProgressLabel(cardState: CardState | null):
  'New' | 'Learning' | 'Reviewing' | 'Familiar' | 'Mastered' | 'Relearning' {
  if (cardState === null) return 'New';
  if (cardState.state === State.Relearning) return 'Relearning';
  if (cardState.state === State.Learning) return 'Learning';
  if (cardState.stability >= 21) return 'Mastered';
  if (cardState.stability >= 10) return 'Familiar';
  return 'Reviewing';
}
```

**`challenge.tsx` changes:**
- Pass grade string instead of boolean to `scheduleReview`
- MC4 correct -> `'good'`, wrong -> `'again'`
- Text correct without hint -> `'good'`, with hint -> `'hard'`, wrong -> `'again'`
- "Already know" button -> `'easy'`
- Track `isFirstEncounter` (cardState was null) to show/hide "Already know" button

**`ClozeCard.tsx` changes:**
- Remove mc2 rendering path
- Add hint button to text input mode
- Add "Already know this?" link (only when `isFirstEncounter`)
- Hint state: `hintUsed: boolean` tracked per card presentation
- Hint display uses `getHintLevel` for progressive revelation

**`getCardProgressLevel` update (for progress bars):**
```
0 = never seen (null state)
1 = learning / relearning (stability < 2.0 or State.Learning/Relearning)
2 = early recall (stability 2.0-5.0)
3 = building recall (stability 5.0-10)
4 = familiar (stability 10-21)
5 = mastered (stability >= 21)
```

**Text input validation:**
- Already implemented in `src/utils/answerValidation.ts`
- Handles: case insensitive, diacritic removal, apostrophes, whitespace
- Fuzzy matching via Fuse.js (threshold 0.2) for typo tolerance
- No changes needed
