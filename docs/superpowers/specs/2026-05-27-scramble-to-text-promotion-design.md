# Scramble To Text Promotion Design

## Goal

Promote cards to free text after the first correct scramble review. A new card should still start with MC4, then show scramble on its first short-term review, then show free text on the next due review if the scramble was correct.

## Current Behavior

`getAnswerType()` selects the challenge mode from FSRS stability:

- `null` or stability `< 1.0`: MC4
- stability `1.0` through `2.49`: scramble
- stability `>= 2.5`: free text

After the first correct MC4 answer, FSRS typically sets stability around `2.3`, which keeps the first short-term review as scramble. After that first correct scramble, the card can still remain below the current `2.5` free-text threshold, causing another scramble later.

## Design

Lower the free-text threshold from `2.5` to `2.0`.

New mode selection:

- `null` or stability `< 1.0`: MC4
- stability `1.0` through `< 2.0`: scramble
- stability `>= 2.0`: free text

This preserves the first scramble because a correct MC4 answer still enters the scramble range for the short-term review. A correct scramble then advances the next due review into free text. The existing hint behavior remains unchanged: when a free-text card is shown, tapping the hint button demotes it to scramble.

## Scope

Update only the answer-type threshold, comments, and tests. Do not add persisted flags, migrations, or new scheduler state.

## Testing

Update `src/services/fsrs.test.ts` to assert:

- `1.0` is scramble
- `1.9` is scramble
- `2.0` is text
- higher stability remains text

Run the FSRS test suite after the change.
