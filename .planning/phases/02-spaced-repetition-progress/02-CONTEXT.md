# Phase 2: Spaced Repetition & Progress - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Vocabulary learning uses scientifically-proven FSRS spaced repetition scheduling, tracks user progress (streak, success rate, chapter mastery), and persists all data locally for fully offline use. Cards are selected intelligently per session, and wrong answers are re-inserted for immediate correction.

Pre-requisite: Pipeline must generate all 11 chapters and have the examples bug fixed before Phase 2 implementation begins.

</domain>

<decisions>
## Implementation Decisions

### Content & Deck Structure
- Content is **bundled at build time** — pipeline output is transformed into a TypeScript/JSON file that ships with the app. No runtime import.
- **All 11 chapters** must be generated before Phase 2 implementation starts (currently 2 of 11 exist)
- **Pipeline examples bug fix only** — fix the vocabulary_builder.py bug that assigns ALL chapter sentences as examples for every word (should filter to sentences actually containing the word)
- **Distractors generated programmatically** at build-transform time (not via LLM) — pick from same POS / similar CEFR level in the vocabulary list
- Card data mapping: pipeline `source` (Spanish word) becomes what user produces, pipeline `target` (German translation) becomes the hint

### Card Format (Productive Cloze)
- **Card face**: Spanish sentence with the target word blanked out + German hint word displayed
  - Example: "María está en su _____ en Berlín." + hint: "Zimmer"
- **User answers**: The Spanish word that fills the blank → "habitación"
- **After answering**: Briefly show the full German translation of the sentence + grammar notes (POS, context note)
- Learning direction is **production** — user sees German hint, must produce the Spanish word in context
- For MC modes, choices are **Spanish word options** (correct word + distractors from the vocabulary)

### Answer Type Progression
- Answer types are **dynamic based on FSRS stability** (not fixed per word):
  1. **MC2** (2 choices) — first exposure, easiest (50% baseline)
  2. **MC4** (4 choices) — intermediate (25% baseline)
  3. **Text input** — mastery level, pure recall
- The same word graduates through: MC2 → MC4 → Text as learning progresses

### Learning Flow & Pacing
- **Chapter-based unlock** — words unlock chapter by chapter following the story narrative (María's Buenos Aires journey)
- Next chapter unlocks when current chapter reaches ~80% mastery
- **Wrong answers re-inserted** ~3-5 cards later in the same session (keep seeing it until correct)
- After the session, FSRS schedules the next review normally

### Session Composition
- **Fixed count from URL parameter** — Shortcuts automation specifies the card count (e.g., count=5), session always shows that exact number
- Card slot priority: reviews due first, fill remaining with new words from current chapter
- **Always include at least 1 new word** per session — guarantees forward progress through chapters even on review-heavy days

### Stats & Progress
- **Progress = chapter mastery %** — percentage of words mastered in the current chapter. Reaching ~80% unlocks next chapter and progress bar resets. Home screen label "PROGRESS IN CHAPTER" already matches.
- **Streak = any completed session** — complete at least 1 challenge session (any card count) = streak maintained for that day. Low barrier encourages consistency.
- **Home screen**: keep current layout (streak card, chapter progress %, cards due), wire up with real data from persistence
- **Per-app stats**: track source app data in persistence (which app triggered how many sessions/cards) but don't build UI for it yet — data captured for Phase 5

### Claude's Discretion
- FSRS parameter tuning (initial stability, difficulty weights)
- Exact mastery threshold for answer type graduation (MC2 → MC4 → Text)
- Distractor selection algorithm details (beyond same POS / similar CEFR)
- Storage technology choice (MMKV vs WatermelonDB vs other)
- Data model design for persistence
- How "briefly show" the German sentence translation is implemented (timing, animation)

</decisions>

<specifics>
## Specific Ideas

- Card format is productive cloze: user produces Spanish, not German — this is more effective for language acquisition
- The story narrative (María's journey from Berlin to Buenos Aires) should drive chapter progression — each chapter is a story episode
- MC2 is easier than MC4 (50% vs 25% baseline chance) — progression goes MC2 → MC4 → Text, not the other way
- After answering (correct or wrong), briefly flash the full German sentence translation so the user sees the complete bilingual context
- Pipeline data needed per card: word annotations (`words/chapter_XX.json`) for the blank + `translations/chapter_XX.json` for the full sentence reveal

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VocabularyCard` component (`src/components/VocabularyCard.tsx`): Displays card front/back with answer feedback — needs adaptation for cloze format
- `AnswerInput` component (`src/components/AnswerInput.tsx`): Text input for free-text answers — reusable as-is for text mode
- `MultipleChoiceGrid` component (`src/components/MultipleChoiceGrid.tsx`): 2x2 and 1x2 grid for MC answers — reusable, choices change to Spanish words
- `ContinueButton` component (`src/components/ContinueButton.tsx`): Deep-links back to source app — reusable as-is
- `ProgressDots` component (`src/components/ProgressDots.tsx`): Dot-based progress — reusable as-is
- `StatsCard` component (`src/components/StatsCard.tsx`): Streak + progress + cards due — exists but home screen uses inline stats grid instead
- `answerValidation.ts` (`src/utils/answerValidation.ts`): Fuzzy matching with Fuse.js — reusable for text input validation
- `useDeepLink.ts` hook: URL scheme handling — reusable as-is

### Established Patterns
- **Expo Router** for navigation (file-based routing in `app/`)
- **React Native Paper** (Material Design 3) for UI components
- Custom theme system with glass effects, `brandOrange` accent, dark mode
- **No state management library** — React useState only (Phase 2 may need something more)
- **No persistence layer** — everything is in-memory/hardcoded (Phase 2 must add this)
- TypeScript throughout, `fuse.js` for fuzzy matching

### Integration Points
- `app/challenge.tsx:12` — imports `PLACEHOLDER_CARDS` → must switch to FSRS-scheduled cards from persistence
- `app/challenge.tsx:34` — `cards = PLACEHOLDER_CARDS.slice(0, cardCount)` → must use smart card selection (reviews + new words)
- `app/index.tsx:7` — imports `getTotalCards()` for hardcoded count → must read from persistence
- `app/index.tsx:90-113` — hardcoded "0 days" streak, "0%" progress → must read real stats
- `src/types/vocabulary.ts` — `VocabularyCard` type needs extending for cloze data (sentence, blank position, grammar notes)
- `src/data/placeholderVocabulary.ts` — will be replaced by bundled pipeline data + FSRS card state

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-spaced-repetition-progress*
*Context gathered: 2026-03-02*
