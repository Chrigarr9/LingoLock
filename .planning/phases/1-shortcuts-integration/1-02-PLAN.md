---
phase: 1-shortcuts-integration
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/data/placeholderVocabulary.ts
  - src/types/vocabulary.ts
autonomous: true

must_haves:
  truths:
    - "Hardcoded vocabulary cards exist for testing"
    - "Card data structure matches expected format (front, back, optional media)"
    - "Data is importable by other components"
  artifacts:
    - path: "src/data/placeholderVocabulary.ts"
      provides: "Array of example vocabulary cards"
      min_lines: 20
      exports: ["PLACEHOLDER_CARDS"]
    - path: "src/types/vocabulary.ts"
      provides: "TypeScript types for vocabulary system"
      exports: ["VocabularyCard"]
  key_links:
    - from: "src/data/placeholderVocabulary.ts"
      to: "src/types/vocabulary.ts"
      via: "Type imports"
      pattern: "import.*VocabularyCard"
---

<objective>
Create placeholder vocabulary data structure and TypeScript types for Phase 1 testing.

Purpose: Phase 1 doesn't implement Anki import (Phase 3), so we need hardcoded example cards to test challenge screen, answer validation, and deep linking flows. This establishes the data schema that Phase 3 will populate from .apkg files.

Output: Type-safe placeholder vocabulary data ready for challenge screen consumption.
</objective>

<execution_context>
@/home/ubuntu/.claude/get-shit-done/workflows/execute-plan.md
@/home/ubuntu/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/ubuntu/Projects/vokabeltrainer/.planning/PROJECT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/ROADMAP.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/STATE.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Create vocabulary TypeScript types</name>
  <files>src/types/vocabulary.ts</files>
  <action>
Create TypeScript type definitions for vocabulary card data structure.

Create file: `src/types/vocabulary.ts`

Define types:
```typescript
export interface VocabularyCard {
  id: string;              // Unique identifier
  front: string;           // Question/word to translate
  back: string;            // Correct answer/translation
  frontAudio?: string;     // Optional: path to front audio (Phase 2+)
  backAudio?: string;      // Optional: path to back audio (Phase 2+)
  frontImage?: string;     // Optional: path to front image (Phase 2+)
  backImage?: string;      // Optional: path to back image (Phase 2+)
  deckId?: string;         // Optional: which deck this belongs to (Phase 3+)
}

export interface ChallengeParams {
  source: string;          // App name or "Unlock"
  count: number;           // Number of cards to show (1-10)
  type: 'unlock' | 'app_open';
}
```

These types will be used by:
- Placeholder data (this plan)
- Challenge screen (Plan 04)
- Answer validation (Plan 05)
- Anki import (Phase 3)
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify types compile without errors
Check: File exports VocabularyCard and ChallengeParams types
  </verify>
  <done>
src/types/vocabulary.ts exists with VocabularyCard and ChallengeParams exported, TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Create placeholder vocabulary data</name>
  <files>src/data/placeholderVocabulary.ts</files>
  <action>
Create hardcoded vocabulary cards for Phase 1 testing.

Create file: `src/data/placeholderVocabulary.ts`

Import VocabularyCard type and create array of 10-15 example cards:

```typescript
import { VocabularyCard } from '../types/vocabulary';

export const PLACEHOLDER_CARDS: VocabularyCard[] = [
  {
    id: '1',
    front: 'hello',
    back: 'hola'
  },
  {
    id: '2',
    front: 'goodbye',
    back: 'adiós'
  },
  {
    id: '3',
    front: 'thank you',
    back: 'gracias'
  },
  // Add 7-12 more cards covering:
  // - Single words and phrases
  // - Words with diacritics (café, niño, français)
  // - Words with apostrophes (c'est, l'été)
  // - Mixed case variations
];
```

Include diverse examples to test fuzzy matching:
- Diacritics: café, niño, français, Москва
- Apostrophes: c'est, l'été, it's
- Case variations: HoLA, Hola, hola
- Spaces: "good morning", "buenos días"

This data will be replaced by real Anki import in Phase 3.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify data matches VocabularyCard type
Check: File exports PLACEHOLDER_CARDS array with 10+ cards
Check: Cards include diacritics and apostrophes for fuzzy match testing
  </verify>
  <done>
src/data/placeholderVocabulary.ts exists with PLACEHOLDER_CARDS array containing 10+ diverse vocabulary examples, TypeScript compilation succeeds
  </done>
</task>

</tasks>

<verification>
**Overall phase checks:**

1. Type definitions: `cat src/types/vocabulary.ts` shows VocabularyCard and ChallengeParams exports
2. Placeholder data: `cat src/data/placeholderVocabulary.ts` shows PLACEHOLDER_CARDS export
3. TypeScript validation: `npx tsc --noEmit` passes without errors
4. Data diversity: Grep for diacritics and apostrophes in placeholder data
5. Import test: Create temporary file importing both, verify no errors

**No runtime testing needed** - this is pure data structure creation.
</verification>

<success_criteria>
- VocabularyCard and ChallengeParams types defined in src/types/vocabulary.ts
- PLACEHOLDER_CARDS array with 10+ example cards in src/data/placeholderVocabulary.ts
- Cards include diverse examples (diacritics, apostrophes, case variations)
- TypeScript compilation succeeds without errors
- Data structure matches expected schema for challenge screen consumption
</success_criteria>

<output>
After completion, create `.planning/phases/1-shortcuts-integration/1-02-SUMMARY.md`
</output>
