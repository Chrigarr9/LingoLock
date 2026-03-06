# Answer Type Redesign

## Changes from Current System

**Remove mc2 entirely.** Two choices is too easy — nearly 50% guess rate, teaches nothing.

### New Progression (stability-based)

| Stage | Stability | Answer Type | Description |
|-------|-----------|-------------|-------------|
| New/Fragile | < 2.0 | `mc4` | 4 multiple choice options. First encounter + early reviews. |
| Recall | ≥ 2.0 | `text` | Free text input with optional hint button. |

### FSRS Rating Grades (expand from 2 to 4)

| Scenario | Rating | Effect |
|----------|--------|--------|
| Wrong answer | `Again` | Reset to short interval, card re-enters learning |
| MC4 correct | `Good` | Normal progression |
| Text correct (no hint) | `Good` | Normal progression |
| Text correct (used hint) | `Hard` | Correct but shorter next interval — comes back sooner |
| User taps "I know this" | `Easy` | Large stability boost, much longer interval — skip ahead |

### Hint System (text mode only)

When answer type is `text`, show a **hint button** (e.g., lightbulb icon). On tap:
- Reveal first and last letter + word length: `P _ _ _ _ _ _ A` (for "pregunta")
- User still types the full word
- If correct after hint → `Rating.Hard` (not `Good`)
- Hint button disappears after use (one hint per card per review)

### "I Know This" / Easy Button

For words the user already knows (e.g., common cognates like "hotel", "taxi", "radio"):

**Option A — Pre-answer "Already know" button:**
- Small text link below the card: "Already know this?"
- Tap → reveal answer + rate as `Rating.Easy`
- Available on ALL answer types (mc4 and text)
- FSRS `Easy` gives a massive stability boost (often jumps to 10+ day interval immediately)
- The card essentially fast-tracks to long intervals, appearing rarely

**Option B — Post-answer Easy confirmation:**
- After a correct answer, show 2 buttons: "Good" and "Too Easy"
- "Too Easy" → `Rating.Easy`
- More conservative: user proves they know it first
- Downside: extra tap on every correct answer

**Recommendation: Option A** — it's faster and respects the user's self-knowledge. If they're wrong about knowing it, the word will come back naturally when they fail a future review. FSRS self-corrects.

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
```

**`challenge.tsx` changes:**
- Pass grade string instead of boolean to `scheduleReview`
- MC4 correct → `'good'`, wrong → `'again'`
- Text correct without hint → `'good'`, with hint → `'hard'`, wrong → `'again'`
- "Already know" button → `'easy'`

**`ClozeCard.tsx` changes:**
- Remove mc2 rendering path
- Add hint button to text input mode
- Add "Already know this?" link below card
- Hint state: `hintUsed: boolean` tracked per card presentation

**`getProgressLabel` update:**
```
New        — never seen (null)
Seen       — stability < 2.0 (mc4 stage)
Remembered — stability 2.0–21 (text stage)
Mastered   — stability ≥ 21
```
(Remove "Recognized" level since mc2 is gone)
