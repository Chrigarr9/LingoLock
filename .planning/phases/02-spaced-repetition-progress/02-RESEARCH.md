# Phase 2: Spaced Repetition & Progress - Research

**Researched:** 2026-03-02
**Domain:** FSRS spaced repetition, MMKV local persistence, bundled content pipeline, cloze card format
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Content & Deck Structure**
- Content is **bundled at build time** — pipeline output is transformed into a TypeScript/JSON file that ships with the app. No runtime import.
- **All 11 chapters** must be generated before Phase 2 implementation starts (currently 2 of 11 exist)
- **Pipeline examples bug fix only** — fix the vocabulary_builder.py bug that assigns ALL chapter sentences as examples for every word (should filter to sentences actually containing the word)
- **Distractors generated programmatically** at build-transform time (not via LLM) — pick from same POS / similar CEFR level in the vocabulary list
- Card data mapping: pipeline `source` (Spanish word) becomes what user produces, pipeline `target` (German translation) becomes the hint

**Card Format (Productive Cloze)**
- **Card face**: Spanish sentence with the target word blanked out + German hint word displayed
  - Example: "María está en su _____ en Berlín." + hint: "Zimmer"
- **User answers**: The Spanish word that fills the blank → "habitación"
- **After answering**: Briefly show the full German translation of the sentence + grammar notes (POS, context note)
- Learning direction is **production** — user sees German hint, must produce the Spanish word in context
- For MC modes, choices are **Spanish word options** (correct word + distractors from the vocabulary)

**Answer Type Progression**
- Answer types are **dynamic based on FSRS stability** (not fixed per word):
  1. **MC2** (2 choices) — first exposure, easiest (50% baseline)
  2. **MC4** (4 choices) — intermediate (25% baseline)
  3. **Text input** — mastery level, pure recall
- The same word graduates through: MC2 → MC4 → Text as learning progresses

**Learning Flow & Pacing**
- **Chapter-based unlock** — words unlock chapter by chapter following the story narrative (María's Buenos Aires journey)
- Next chapter unlocks when current chapter reaches ~80% mastery
- **Wrong answers re-inserted** ~3-5 cards later in the same session (keep seeing it until correct)
- After the session, FSRS schedules the next review normally

**Session Composition**
- **Fixed count from URL parameter** — Shortcuts automation specifies the card count (e.g., count=5), session always shows that exact number
- Card slot priority: reviews due first, fill remaining with new words from current chapter
- **Always include at least 1 new word** per session — guarantees forward progress through chapters even on review-heavy days

**Stats & Progress**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CARD-01 | System implements FSRS spaced repetition algorithm for card scheduling | ts-fsrs library; `createEmptyCard`, `fsrs().next()`, `Rating.Again/Good/Easy` pattern |
| CARD-02 | System shows vocabulary card with front side (question) text | Existing `VocabularyCard` component adapted for cloze format |
| CARD-03 | User can answer vocabulary card via free-text input (default mode) | Existing `AnswerInput` + `validateAnswer` (Fuse.js); reusable as-is |
| CARD-06 | System shows back side (answer) after user submits answer | German sentence translation flash after answer; new reveal component |
| CARD-07 | System marks answer as correct/incorrect based on user input | Existing `validateAnswer`; MC mode: direct equality check |
| CARD-08 | If answer is incorrect, card rescheduled according to FSRS (60s interval for immediate review) | FSRS `Rating.Again` sets card to Learning state; session queue re-inserts 3-5 slots later; FSRS `due` updated after session end |
| CARD-09 | System displays images on card if present in Anki deck | Pipeline has no image data; stub required — Phase 3 (Anki import) will populate |
| CARD-10 | System plays audio on card if present in Anki deck | Pipeline has no audio data; stub required — Phase 3 will populate |
| CARD-11 | User must answer correctly to unlock blocked app | Existing challenge completion gate; already works via `isComplete` state |
| PROG-01 | System tracks daily streak (consecutive days with at least one card answered) | MMKV persistence: store `lastSessionDate` + `currentStreak`; check on session complete |
| PROG-02 | User can view current streak count in app | Home screen `CURRENT STREAK` card — wire to MMKV value |
| PROG-03 | System calculates overall success rate (% correct answers) | MMKV: accumulate `totalCorrect` + `totalAnswered`; compute on read |
| PROG-04 | User can view success rate in app | Home screen stats grid — add success rate display or reuse existing slot |
| PROG-05 | System calculates overall progress (% of total cards mastered) | Chapter mastery % from FSRS stability threshold; stored per-card in MMKV |
| PROG-06 | User can view overall progress in app | Home screen `PROGRESS IN CHAPTER` card — wire to computed chapter mastery % |
| PROG-07 | System tracks cards answered per app (which blocked apps triggered how many cards) | MMKV: `perAppStats` map keyed by `source` param; increment per session |
| PROG-08 | User can view per-app statistics | Data captured in MMKV for Phase 5 UI; no UI this phase |
| OFFL-01 | All vocabulary data stored locally on device (no cloud sync) | Bundled TS/JSON file ships with app; MMKV for card state |
| OFFL-02 | App functions fully offline after initial deck import | No network dependency in Phase 2; all data local |
| OFFL-03 | Progress and statistics persisted locally across app restarts | MMKV survives force-close and device restart |
</phase_requirements>

---

## Summary

Phase 2 has three interconnected technical domains: (1) transforming the Python pipeline output into a TypeScript content bundle, (2) implementing FSRS scheduling via `ts-fsrs`, and (3) persisting all card state and progress via `react-native-mmkv`. These three can be built independently in sequence — content bundle first (no external deps), FSRS scheduling layer second (pure TypeScript logic on top of the bundle), and persistence third (wires them together and survives restarts).

The cloze card format requires significant changes to the existing `VocabularyCard` component and the challenge screen flow. The card face changes from "front = question" to "sentence with blank + German hint", and the reveal changes from "show back" to "flash full German sentence translation". This is a targeted adaptation of existing components, not a rewrite.

The "60-second wrong answer" behavior is implemented at the session queue level, not the FSRS level. FSRS schedules the card for a future date after session end; during the session, wrong-answer cards are simply re-inserted 3-5 positions ahead in the local card queue. FSRS `Rating.Again` is still called to update the card's FSRS state for long-term scheduling, but the immediate in-session re-appearance is a queue management concern only.

**Primary recommendation:** Install `ts-fsrs` and `react-native-mmkv` (+ `react-native-nitro-modules`) as the two new dependencies; build a pure-TS content transform script; layer FSRS scheduling logic cleanly via a `src/services/` module pattern; store all state as JSON strings in MMKV.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ts-fsrs | 5.2.3 (latest) | FSRS algorithm implementation | Official TypeScript FSRS; High reputation on Context7; actively maintained by open-spaced-repetition org |
| react-native-mmkv | 4.1.2 (latest) | Local key-value persistence | ~30x faster than AsyncStorage; synchronous reads; JSI-based; Expo + New Architecture compatible |
| react-native-nitro-modules | 0.34.1 | Peer dependency of MMKV v4 | Required by MMKV v4 Nitro Module architecture |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (Node.js script — no new npm dep) | built-in | Build-time content transform: pipeline JSON → TypeScript bundle | Run once before app build; uses fs/path/JSON.stringify |
| fuse.js (already installed) | ^7.1.0 | Fuzzy answer matching for text input mode | Already in package.json; reuse `validateAnswer` from `src/utils/answerValidation.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-native-mmkv | WatermelonDB | WatermelonDB is better for relational queries and large datasets; overkill here — card states are ~100-500 JSON objects, flat key-value is sufficient |
| react-native-mmkv | AsyncStorage | AsyncStorage is async-only, slower, no JSI; MMKV's synchronous API simplifies React state management |
| ts-fsrs | Custom FSRS impl | FSRS math is non-trivial (17 parameters, memory stability formula); ts-fsrs is well-tested, actively maintained, TypeScript-first |
| Build-time transform script | Runtime JSON import | Runtime JSON `require()` works but a TS transform script lets us pre-compute distractors, validate data, and type-check at build time |

**Installation:**
```bash
npx expo install react-native-mmkv react-native-nitro-modules
npm install ts-fsrs
npx expo prebuild
```

Note: `react-native-mmkv` v4 requires `react-native-nitro-modules` as a peer dependency. Expo SDK 55 uses React Native 0.83 with New Architecture always enabled — MMKV v4 is fully compatible.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── content/
│   └── bundle.ts          # Generated by scripts/build-content.ts — the bundled card data
├── services/
│   ├── storage.ts         # MMKV instance singletons (cardStorage, statsStorage)
│   ├── fsrs.ts            # FSRS scheduler wrapper (scheduleReview, getAnswerType, getMasteryPct)
│   ├── cardSelector.ts    # Session card selection logic (due first, new fill, always 1 new)
│   └── statsService.ts    # Streak, success rate, chapter progress computation
├── types/
│   └── vocabulary.ts      # Extended with ClozeCard, CardFSRSState, SessionStats types
scripts/
└── build-content.ts       # Node.js build-time transform: pipeline JSON → src/content/bundle.ts
spanish-content-pipeline/
└── pipeline/
    └── vocabulary_builder.py  # Bug fix: filter examples to sentences containing the word
```

### Pattern 1: FSRS Card Scheduling

**What:** Use `ts-fsrs` to schedule next review after each answer. The `Rating` maps to answer correctness: wrong → `Rating.Again`; correct → `Rating.Good` (default), optionally `Rating.Easy`.

**When to use:** After every card answer during a challenge session.

```typescript
// Source: Context7 /open-spaced-repetition/ts-fsrs
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';

const params = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
  enable_short_term: false,
  // No learning_steps needed — wrong answers are handled in-session by queue, not FSRS
});

const scheduler = fsrs(params);

// On card creation (first time seen):
const newCard = createEmptyCard();

// After user answers:
function scheduleAfterAnswer(card: FSRSCard, correct: boolean): FSRSCard {
  const rating = correct ? Rating.Good : Rating.Again;
  const result = scheduler.next(card, new Date(), rating);
  return result.card; // Persist this updated card state
}
```

### Pattern 2: Answer Type Graduation via FSRS Stability

**What:** Use `card.stability` (internal FSRS metric reflecting long-term retention) to determine which answer mode to use. Higher stability = more difficult answer type.

**When to use:** When selecting which answer type to show for a card.

```typescript
// Source: Context7 /open-spaced-repetition/ts-fsrs — card.stability property
function getAnswerType(card: FSRSCard): 'mc2' | 'mc4' | 'text' {
  // New cards (stability = 0) start at MC2
  // These thresholds are Claude's discretion — tunable based on UX testing
  if (card.stability < 1.5) return 'mc2';   // First 1-2 reviews
  if (card.stability < 4.0) return 'mc4';   // Intermediate
  return 'text';                             // Mastered
}
```

### Pattern 3: Session Queue with Wrong-Answer Re-insertion

**What:** Session manages its own ordered card queue. Wrong answers are re-inserted 3-5 positions ahead. FSRS `Rating.Again` is called for FSRS scheduling purposes, but the in-session re-appearance is purely queue management.

**When to use:** Inside challenge screen session logic.

```typescript
// Conceptual pattern — implementation detail for planner
function buildSessionQueue(
  dueCards: ClozeCard[],
  newCards: ClozeCard[],
  totalCount: number
): ClozeCard[] {
  // Priority: due reviews first, fill remaining with new words
  // Always ensure at least 1 new word
  const queue = [...dueCards.slice(0, totalCount - 1)];
  const newCount = Math.max(1, totalCount - queue.length);
  queue.push(...newCards.slice(0, newCount));
  return queue;
}

function handleWrongAnswer(queue: ClozeCard[], wrongCard: ClozeCard, currentIndex: number): ClozeCard[] {
  const reinsertAt = Math.min(currentIndex + 4, queue.length); // ~3-5 later
  const newQueue = [...queue];
  newQueue.splice(reinsertAt, 0, wrongCard);
  return newQueue;
}
```

### Pattern 4: MMKV Storage Layer

**What:** Use `react-native-mmkv` v4 `createMMKV()` for synchronous persistence. Two separate storage instances: one for card FSRS states, one for stats/progress.

**When to use:** All persistence operations — reading card state on session start, writing after each card, updating stats on session end.

```typescript
// Source: Context7 /mrousavy/react-native-mmkv
import { createMMKV } from 'react-native-mmkv';

// Singleton instances — create once, reuse throughout app
export const cardStorage = createMMKV({ id: 'lingolock.cards' });
export const statsStorage = createMMKV({ id: 'lingolock.stats' });

// Card state: store JSON per card ID
function saveCardState(cardId: string, state: FSRSCard): void {
  cardStorage.set(cardId, JSON.stringify(state));
}

function loadCardState(cardId: string): FSRSCard | undefined {
  const json = cardStorage.getString(cardId);
  return json ? JSON.parse(json) : undefined;
}

// Stats: typed hooks for reactive home screen updates
import { useMMKVNumber, useMMKVString } from 'react-native-mmkv';
function useStreak() {
  const [streak] = useMMKVNumber('stats.currentStreak', statsStorage);
  return streak ?? 0;
}
```

### Pattern 5: Build-Time Content Transform

**What:** A Node.js/TypeScript script (`scripts/build-content.ts`) reads the pipeline `words/chapter_XX.json` and `translations/chapter_XX.json` files, fixes the examples bug, generates distractors, and emits `src/content/bundle.ts` as a typed export.

**When to use:** Run once (or after pipeline output changes) before building the app.

```typescript
// scripts/build-content.ts (conceptual — planner defines exact implementation)
// Input: spanish-content-pipeline/output/es-de-buenos-aires/words/chapter_XX.json
// Output: src/content/bundle.ts

export interface ClozeCard {
  id: string;               // e.g. "habitacion-ch01-s01"
  lemma: string;            // e.g. "habitación"
  wordInContext: string;    // Surface form in sentence: "habitación"
  germanHint: string;       // Contextual German: "Zimmer"
  sentence: string;         // Full Spanish sentence with blank placeholder: "María está en su _____ en Berlín."
  sentenceTranslation: string; // Full German translation for reveal: "María ist in ihrem Zimmer in Berlin."
  pos: string;              // "noun"
  contextNote: string;      // "feminine singular"
  chapter: number;          // 1
  cefrLevel: string | null; // "A2"
  distractors: string[];    // Other Spanish words, same POS / similar CEFR: ["maleta", "ropa", "camiseta"]
}

export const CHAPTERS: { chapterNumber: number; cards: ClozeCard[] }[] = [...];
```

### Anti-Patterns to Avoid

- **Storing Dates as Date objects in MMKV:** MMKV stores strings/numbers/booleans. Always serialize Date as ISO string (`date.toISOString()`) and deserialize with `new Date(str)`.
- **Creating a new FSRS scheduler per render:** Create the `fsrs()` instance once outside components and reuse it. FSRS parameter parsing has overhead.
- **Using FSRS `learning_steps` for in-session 60-second re-shows:** FSRS learning steps are for scheduling between sessions. In-session re-appearance must be managed by the session queue array, not FSRS.
- **AsyncStorage for card state:** Async reads cause loading flicker on challenge screen start. MMKV's synchronous `getString` reads all card states at session start without any async complexity.
- **Including all chapter sentences as examples for every word (the current pipeline bug):** The vocabulary_builder.py iterates all `chapter.sentences` for every word in a chapter instead of filtering to sentences that contain the word's surface form. This produces noisy, unusable example sentences.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spaced repetition scheduling | Custom SM-2/FSRS formula | `ts-fsrs` | FSRS has 17 parameters, memory decay formula, complex state machine (New/Learning/Review/Relearning); off-by-one in math causes subtly wrong intervals |
| Key-value persistence | AsyncStorage wrapper, custom SQLite | `react-native-mmkv` | Synchronous reads critical for challenge screen; AsyncStorage causes loading flicker; MMKV handles serialization, encryption, multi-instance |
| Fuzzy answer matching | Levenshtein distance implementation | `fuse.js` (already installed) | Already in project; handles diacritics, normalization pipeline exists in `answerValidation.ts` |
| Distractor generation via LLM | API call at runtime | Build-time script using vocabulary.json | LLM calls at runtime break offline requirement; same-POS/CEFR filtering from existing vocabulary list is deterministic, fast, offline |

**Key insight:** The two hardest problems in this phase (SRS math and fast persistence) each have a single well-maintained library that solves them completely. Don't reimplement either.

---

## Common Pitfalls

### Pitfall 1: MMKV v4 Breaking Changes from v3

**What goes wrong:** Code written for MMKV v3 (`new MMKV()`) fails in v4 (`createMMKV()`). If copying examples from the internet, many are v3 syntax.

**Why it happens:** MMKV v4 switched from a JS class to a Nitro Module with a factory function.

**How to avoid:** Use `createMMKV()` (not `new MMKV()`). Install `react-native-nitro-modules` alongside MMKV. Run `expo prebuild` after installation since MMKV requires native code regeneration.

**Warning signs:** `TypeError: MMKV is not a constructor` or `Failed to create a new MMKV instance`.

### Pitfall 2: MMKV Requires Expo Prebuild (Not Expo Go)

**What goes wrong:** App crashes on launch in Expo Go with MMKV installed.

**Why it happens:** MMKV is a native module (JSI/Nitro); it cannot run in Expo Go's JavaScript-only sandbox.

**How to avoid:** This project already uses development builds (`expo run:ios`) per Plan 1-01 decisions. Continue using development builds. After installing MMKV, run `npx expo prebuild` to regenerate native iOS project, then rebuild.

**Warning signs:** Any crash on startup mentioning TurboModules or NitroModules in Expo Go.

### Pitfall 3: Date Serialization in MMKV

**What goes wrong:** FSRS `Card` objects contain `Date` fields (`due`, `last_review`). `JSON.stringify` serializes them as ISO strings. `JSON.parse` deserializes them as plain strings, not Date objects. FSRS internally calls date comparison methods on these fields, causing `TypeError`.

**Why it happens:** JSON does not have a Date type. `JSON.parse` does not reconstruct Date objects.

**How to avoid:** After `JSON.parse`, explicitly reconstruct Date fields:
```typescript
function deserializeFSRSCard(json: string): Card {
  const raw = JSON.parse(json);
  return {
    ...raw,
    due: new Date(raw.due),
    last_review: raw.last_review ? new Date(raw.last_review) : undefined,
  };
}
```

**Warning signs:** `card.due.getTime is not a function` or FSRS returning incorrect intervals.

### Pitfall 4: Pipeline Examples Bug (Known Issue)

**What goes wrong:** `vocabulary.json` shows every word in a chapter has ALL sentences of that chapter as examples, not just sentences where the word appears.

**Why it happens:** `vocabulary_builder.py` line 52: `for s in chapter.sentences: lemma_examples[lemma].append(s)` — adds all sentences regardless of whether the word appears in them.

**How to avoid:** Fix: filter to sentences where `word.lemma.lower()` appears in `s.source.lower()` (or check the word's surface form `word.source`). The fix must be applied before building the remaining 9 chapters.

**Warning signs:** A word like "habitación" showing examples from sentences about taxis and airports that don't contain the word.

### Pitfall 5: Answer Type Graduation Threshold Too Aggressive

**What goes wrong:** Cards graduate from MC2 → MC4 → Text too quickly. User sees text input after only 2-3 reviews, before the word is actually retained.

**Why it happens:** FSRS stability grows quickly in first few reviews even for cards answered correctly by chance (MC2 has 50% baseline).

**How to avoid:** Set stability thresholds conservatively. Recommended starting values: MC2 until stability ≥ 1.5, MC4 until stability ≥ 4.0, then Text. These are Claude's discretion — tune based on UX testing.

**Warning signs:** Users reporting they feel "thrown into" text mode before they know the word.

### Pitfall 6: Cloze Sentence Blanking Edge Cases

**What goes wrong:** Simple string replacement of the word form in the sentence fails when the word appears in a different inflected form in the sentence than stored in the word annotation.

**Why it happens:** Pipeline stores the surface form (`wordInContext`) as it appears, but punctuation adjacency (quotes, periods) or accented character normalization can cause `indexOf` to miss.

**How to avoid:** Use the `wordInContext` field (the exact surface form from the pipeline) for blanking, not the lemma. Blank with a regex that matches word boundaries. Test with the actual chapter 1 data which includes words like "habitación" with accents and quoted sentences.

**Warning signs:** Blanked sentence shows the full word instead of the blank, or blanks in the wrong position.

---

## Code Examples

Verified patterns from official sources:

### Initialize FSRS and Schedule a Card

```typescript
// Source: Context7 /open-spaced-repetition/ts-fsrs
import { createEmptyCard, fsrs, generatorParameters, Rating, State, Card } from 'ts-fsrs';

const f = fsrs(generatorParameters({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
  enable_short_term: false,
}));

// First time seeing a card
const card: Card = createEmptyCard();

// After user answers correctly
const { card: updatedCard } = f.next(card, new Date(), Rating.Good);
// updatedCard.due = next review date
// updatedCard.stability = updated stability metric
// updatedCard.state = State.Review (after first successful review)

// After user answers incorrectly
const { card: failedCard } = f.next(card, new Date(), Rating.Again);
// failedCard.state = State.Learning
// failedCard.lapses += 1
```

### MMKV Storage Singleton Pattern

```typescript
// Source: Context7 /mrousavy/react-native-mmkv
// src/services/storage.ts
import { createMMKV } from 'react-native-mmkv';

export const cardStorage = createMMKV({ id: 'lingolock.cards' });
export const statsStorage = createMMKV({ id: 'lingolock.stats' });
```

### Store and Load FSRS Card State

```typescript
// Source: Context7 /mrousavy/react-native-mmkv — JSON storage pattern
import { Card } from 'ts-fsrs';
import { cardStorage } from './storage';

export function saveCardState(cardId: string, card: Card): void {
  cardStorage.set(cardId, JSON.stringify(card));
}

export function loadCardState(cardId: string): Card | undefined {
  const json = cardStorage.getString(cardId);
  if (!json) return undefined;
  const raw = JSON.parse(json);
  // Reconstruct Date objects — JSON.parse produces strings
  return {
    ...raw,
    due: new Date(raw.due),
    last_review: raw.last_review ? new Date(raw.last_review) : undefined,
  };
}
```

### Reactive Home Screen Stats with MMKV Hooks

```typescript
// Source: Context7 /mrousavy/react-native-mmkv — useMMKVNumber hook
import { useMMKVNumber, useMMKVString } from 'react-native-mmkv';
import { statsStorage } from '../services/storage';

export function useHomeStats() {
  const [streak] = useMMKVNumber('stats.currentStreak', statsStorage);
  const [chapterProgress] = useMMKVNumber('stats.chapterProgressPct', statsStorage);
  const [cardsDue] = useMMKVNumber('stats.cardsDueCount', statsStorage);
  return {
    streak: streak ?? 0,
    chapterProgress: chapterProgress ?? 0,
    cardsDue: cardsDue ?? 0,
  };
}
```

### Chapter Mastery Percentage

```typescript
// Claude's discretion: mastery = card has entered Review state (stability >= threshold)
import { State } from 'ts-fsrs';

function isCardMastered(card: Card): boolean {
  // A card is "mastered" for chapter unlock purposes when it has
  // been reviewed successfully at least once (state = Review)
  return card.state === State.Review;
}

function getChapterMastery(chapterCards: ClozeCard[], loadCardState: Function): number {
  const total = chapterCards.length;
  if (total === 0) return 0;
  const mastered = chapterCards.filter(c => {
    const state = loadCardState(c.id);
    return state && isCardMastered(state);
  }).length;
  return Math.round((mastered / total) * 100);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SM-2 (Anki classic) | FSRS (Free Spaced Repetition Scheduler) | 2022–2023 | Better retention prediction; Anki default since 2023 |
| `new MMKV(config)` | `createMMKV(config)` | MMKV v4 (2024–2025) | Breaking change; v4 is Nitro Module architecture |
| `MMKV` v2/v3 (TurboModule) | MMKV v4 (Nitro Module) | Late 2024 | v4 is stable at 4.1.2; requires react-native-nitro-modules peer dep |
| AsyncStorage | react-native-mmkv | Ongoing | ~30x faster synchronous reads; critical for challenge screen startup |
| Old Architecture (Bridge) | New Architecture (JSI/TurboModules) | Expo SDK 54→55 | SDK 55 requires New Architecture; MMKV v3+ works correctly |

**Deprecated/outdated:**
- `MMKV v2.x.x`: Old Architecture only; do not use with SDK 55 / RN 0.83
- `new MMKV()` constructor: Removed in v4, replaced by `createMMKV()` factory function
- `f.repeat()`: Still works in ts-fsrs but `f.next(card, date, rating)` is cleaner for single-rating scheduling

---

## Pipeline Data Structure (Verified)

The pipeline output structure is confirmed from examining actual files:

**`words/chapter_XX.json`** — per-chapter sentence + word annotation data:
```typescript
{
  chapter: number,
  sentences: Array<{ chapter, sentence_index, source: string, target: string }>,
  words: Array<{
    source: string,      // Surface form in sentence: "habitación"
    target: string,      // Contextual German translation: "Zimmer"
    lemma: string,       // Base form: "habitación"
    pos: string,         // "noun"
    context_note: string // "feminine singular"
  }>
}
```

**`vocabulary.json`** — global deduplicated vocabulary (96 entries for 2 chapters):
```typescript
{
  id: string,           // lemma
  source: string,       // lemma (same as id)
  target: string[],     // All German translations seen across contexts
  pos: string,
  frequency_rank: number | null,
  cefr_level: string | null,
  examples: SentencePair[]  // BUG: currently all sentences of the chapter, not filtered
}
```

**Content transform strategy:** The build script should use `words/chapter_XX.json` (not `vocabulary.json`) as the primary source, since it has per-sentence context. For each word annotation, find the sentence it belongs to by `sentence_index`, blank the `wordInContext` in the `source` sentence, and use `vocabulary.json` only for frequency rank, CEFR level, and distractor pool.

**Distractor selection:** From `vocabulary.json`, filter entries with same `pos` and `|cefr_level_rank - target_cefr_level_rank| <= 1`, excluding the correct lemma, pick 3 at random for MC4 (1 for MC2). With 96 vocabulary entries across 2 chapters, the pool is small but sufficient; 11 chapters will give a much larger pool.

---

## Open Questions

1. **Cloze blanking when word appears multiple times in sentence**
   - What we know: Pipeline `words` entries don't indicate which occurrence of a word in a multi-occurrence sentence is the target
   - What's unclear: If "maleta" appears twice in a sentence, which occurrence gets blanked?
   - Recommendation: Blank the first occurrence. If sentence has zero occurrences (pipeline bug), skip that card during transform and log a warning.

2. **FSRS stability thresholds for answer type graduation**
   - What we know: FSRS stability grows from 0 on new cards; typical first Good review produces stability ~1.5–4.5 depending on card difficulty
   - What's unclear: Exact threshold values that feel right for Spanish→German productive recall
   - Recommendation: Start with MC2 < 1.5, MC4 < 4.0, Text ≥ 4.0. These are locked as Claude's discretion and can be tuned post-implementation.

3. **80% chapter mastery definition for unlock**
   - What we know: User decision says "~80% mastery to unlock next chapter"; mastery definition is Claude's discretion
   - What's unclear: Whether "mastered" means `state === Review` or `stability >= X` or `reps >= 2`
   - Recommendation: Use `state === State.Review` as mastered (card has survived at least one review cycle). This is intuitive and testable.

4. **All 11 chapters prerequisite status**
   - What we know: Only 2 of 11 chapters exist in pipeline output; Phase 2 implementation cannot start without all 11 per user decision
   - What's unclear: Pipeline completion timeline
   - Recommendation: Content transform script should be designed to work with any N chapters so it can be tested with 2 chapters immediately; the 80% unlock mechanic will simply not allow chapter 3+ to unlock until data exists.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/open-spaced-repetition/ts-fsrs` — Card type, createEmptyCard, fsrs(), Rating, State, next(), scheduling patterns
- Context7 `/mrousavy/react-native-mmkv` — createMMKV, useMMKVNumber, useMMKVString, useMMKVObject, JSON storage pattern, Expo install
- npm registry (direct query) — ts-fsrs@5.2.3, react-native-mmkv@4.1.2, react-native-nitro-modules@0.34.1
- Project source files — package.json, src/types/vocabulary.ts, src/data/placeholderVocabulary.ts, app/challenge.tsx, app/index.tsx, spanish-content-pipeline/pipeline/models.py, spanish-content-pipeline/pipeline/vocabulary_builder.py
- Pipeline output files — words/chapter_01.json, translations/chapter_01.json, vocabulary.json (96 entries confirmed)

### Secondary (MEDIUM confidence)
- WebSearch: "Expo SDK 55 new architecture always enabled" — confirmed SDK 55 mandates New Architecture (no old arch option); sourced from expo.dev/changelog/sdk-55
- WebSearch: "react-native-mmkv v3 Expo SDK 55 react-native 0.83 compatibility" — confirmed MMKV v3/v4 compatible with RN 0.83 New Architecture

### Tertiary (LOW confidence)
- None — all critical claims verified via Context7 or official sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via Context7 and npm registry; MMKV v4 compatibility with Expo SDK 55/RN 0.83 confirmed via web search + official docs
- Architecture: HIGH — patterns derived directly from Context7 docs + existing project code
- Pitfalls: HIGH for MMKV/FSRS pitfalls (verified from official docs); MEDIUM for blanking edge cases (derived from data inspection + domain reasoning)
- Pipeline data structure: HIGH — verified from actual file inspection

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (MMKV and ts-fsrs are active libraries; check for minor version updates before installing)
