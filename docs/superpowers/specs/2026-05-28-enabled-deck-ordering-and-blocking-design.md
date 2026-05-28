# Enabled Deck Ordering And Blocking Design

## Problem

Two related behaviors need to be corrected.

Subtitle-generated Spanish decks, especially `himym-s01-es`, should teach words in the same order the sentences appear in the episode. The current subtitle extraction flow chooses the best sentence per lemma by score, then sorts the final cards by episode and descending score. That makes card order reflect learning score rather than episode chronology.

Practice and Screen Time blocking currently behave too much like the active deck is the only deck. When multiple decks are enabled, due-card sessions and the due-cleared blocking latch can ignore work remaining in other enabled decks. Blocking should continue while any enabled deck still has required work, and sessions should draw from enabled decks in order without mixing cards.

## Goals

- Preserve episode chronology for subtitle deck cards.
- Use all enabled decks for practice and Screen Time unlock sessions.
- Keep enabled decks ordered and non-mixed: cards from one deck appear as a contiguous block before the next deck begins.
- Fill one Screen Time unlock immediately across decks. If the requirement is 5, deck A has 2 cards, and deck B has 10 cards, the session should show 2 from deck A followed by 3 from deck B.
- Release Screen Time blocking only when all enabled decks have no available unlock work, unless the user explicitly enables continued blocking after due/new work is cleared.
- Keep the active deck as a UI/default selection concept, but do not let it limit enabled-deck practice or blocking.

## Non-Goals

- No deck interleaving or weighted random mixing.
- No redesign of FSRS scheduling.
- No change to Screen Time unlock escalation rules beyond using the all-enabled-decks due-cleared condition.
- No broad UI redesign of the deck picker.

## Current Causes

`spanish-content-pipeline/pipeline/subtitle_word_extractor.py` collects the best sentence for each lemma by score, then sorts the chosen lemmas by `(episode, -score)`. This is useful for selecting a strong context sentence, but incorrect as final teaching order. The generated card IDs also use an episode-local counter derived from that score-sorted order, so `s00`, `s01`, and so on can describe ranking order rather than source sentence order.

`app/challenge.tsx` receives `chapters` from `useActiveBundle()` and passes only those chapters to `buildSession`, `getDueCards`, and `getDueCardIds`. `statsService.getTotalDueCount()` already has all-enabled-deck awareness for streaks, but the challenge due-cleared latch is derived from the active deck only. `screenTimeService.shouldRequireScreenTimeGate()` then trusts that global latch, which can release blocking while another enabled deck still has due reviews or new cards available for unlock practice.

## Proposed Approach

Use an ordered aggregate layer for enabled decks rather than flattening them into one virtual deck. The aggregate layer should load enabled bundle IDs in saved order, build a session for each bundle, and append each bundle's selected cards as a contiguous block.

For Screen Time sessions, the aggregate builder receives the remaining unlock requirement. It walks enabled decks in order, takes as many due cards as possible from the current deck, then tops up with new cards as needed. If the current deck cannot fill the remaining requirement, it moves to the next enabled deck and continues until the requirement is met or no enabled deck has cards available.

For voluntary practice, the aggregate builder should also walk enabled decks in order. The existing daily new-word budget remains global because `loadNewWordsIntroducedToday()` is global today. The implementation should avoid multiplying the daily new-word budget once per deck.

## Subtitle Ordering Design

The extractor should continue choosing the best sentence per lemma by score. Final output order should then be chronological:

1. Episode number ascending.
2. Source sentence index ascending.
3. Token position within the sentence ascending when multiple new lemmas come from the same sentence.
4. A stable lemma tie-breaker only if source positions are unavailable.

To support this, store source token position while collecting candidate lemmas. Generated card IDs should use the chronological episode-local card counter, so IDs reflect learning order in the generated deck. The build script can keep preserving `word_cards.json` order when writing chapter card arrays. Asset maps may remain alphabetically sorted because they do not affect session order.

## Session Data Flow

Add a small service-level helper, likely near `cardSelector`, that exposes enabled-deck operations:

- Load enabled bundle IDs with `loadEnabledBundles()`.
- Resolve each bundle with `getBundle(bundleId)`.
- Build per-bundle sessions using existing card-selection rules.
- Return cards in deck order without interleaving.
- Provide all-enabled-deck due IDs or due counts for due-cleared checks.

`app/challenge.tsx` should call this aggregate helper for session initialization, newly-due appends, completion `hasMoreCards`, and due-cleared checks. It should not use the active bundle's `chapters` as the authority for Screen Time or enabled-deck practice.

## Blocking Data Flow

The due-cleared latch should be tightened to mean: all enabled decks have no currently due review cards and no new cards available for required unlock practice. In other words, the latch is set only when an all-enabled-deck Screen Time session would produce no cards. Once that condition is observed, `saveDueCardsCleared()` can latch the free-day state for the date.

`screenTimeService.shouldRequireScreenTimeGate()` should not depend only on the latch if the latch was never reached. It should continue requiring a gate whenever `loadDueCardsCleared()` is false, which remains correct once the latch is only set from all-enabled-deck state. If continued blocking is enabled, it should keep using the existing flat-rate behavior.

## UI And Stats

Home due count should display the total practice count across enabled decks, not only the active deck. The deck picker can keep showing per-deck due counts and active/enabled controls.

The active deck remains useful for labels, deck picker highlighting, and any deck-specific browsing. It should not restrict practice sessions or Screen Time blocking when multiple decks are enabled.

## Error Handling

If an enabled imported deck has not loaded yet, existing `getBundle()` fallback behavior prevents crashes. The aggregate helper should avoid treating fallback content as the requested deck if `getBundle()` cannot resolve the enabled deck. It can skip unavailable bundles for the current build and rely on the provider loading pass to make them available later.

If no enabled deck has cards for a Screen Time unlock, the existing empty-session behavior should remain: the challenge marks itself empty/complete and the gate can be released only if the all-enabled-deck clear condition is true.

## Testing

Add pipeline tests that construct processed subtitle sentences where score order differs from sentence order. Assert that `extract_word_cards()` returns cards in episode/sentence/token order and that generated `sNN` IDs follow that order.

Add TypeScript tests for the aggregate session builder:

- Screen Time requirement 5, first deck has 2 available cards, second deck has 10: result is first deck's 2 cards followed by second deck's first 3 cards.
- Due cards still appear before new cards within each deck, preserving existing per-deck behavior.
- Deck blocks are not interleaved.

Add blocking tests:

- Due-cleared is not saved while any enabled deck still has due cards.
- Due-cleared is saved when all enabled decks are clear.
- `shouldRequireScreenTimeGate()` continues requiring the gate until the all-enabled-deck condition is latched.

## Rollout Notes

Regenerating subtitle decks may change generated card IDs if existing IDs were based on score-sorted counters. For built-in content this is acceptable if the deck has not been relied on as stable persisted user data. If preserving existing HIMYM progress is required, add a one-time migration from old IDs to new chronological IDs before shipping.
