# Story-First Pipeline Redesign

## Problem

The current pipeline generates stories in a single LLM pass that simultaneously enforces CEFR level constraints, vocabulary targets, scene/shot structure, character consistency, and narrative quality. This produces text that reads like a vocabulary drill rather than a real story. The LLM juggles too many constraints at once.

## Solution

Separate story writing from CEFR simplification. Two new passes replace the current single-pass story generator:

- **Pass 0 (Unconstrained Story)**: Write natural Spanish prose organized into scenes/shots with image prompts. No CEFR limits, no vocabulary targets. Just tell a good story.
- **Pass 1 (CEFR Simplification)**: Take the unconstrained story and simplify each sentence to the target CEFR level. Preserve scene/shot structure and image prompts unchanged.

## Validated Approach

A/B tested with chapters 1-3 (gemini-3.1-flash-lite-preview):
- **Approach A** (pure prose, no structure): Beautiful literary Spanish.
- **Approach B** (scene/shot structure, no CEFR): Equally beautiful prose. Scene/shot framing does not hurt narrative quality.

Selected **Approach B** — equivalent prose quality with scene/shot/image-prompt structure included, eliminating the need for an extra structuring pass.

## Pipeline Architecture

```
Pass 0: Unconstrained Story Generation (NEW — replaces scene_story_generator.py)
  Input:  Chapter config (title, context), character tags, previous chapter summaries
  Output: stories_raw/chapter_XX.json (ChapterScene with scenes/shots/image_prompts)
  Model:  gemini-3.1-flash-lite-preview (or fallback)
  Notes:  No CEFR constraints. No vocabulary targets. No word count limits per sentence.
          Cross-chapter summaries for continuity (same mechanism as today).

Pass 1: CEFR Simplification (NEW)
  Input:  stories_raw/chapter_XX.json + target CEFR level from config
  Output: stories/chapter_XX.json (same ChapterScene structure, simplified sentences)
  Notes:  Simplifies vocabulary and grammar to target level.
          May split long sentences into shorter ones (updates sentence_index).
          Image prompts pass through unchanged.
          No vocabulary hints — the story context naturally produces level-appropriate words.

Pass 2: Translation (UNCHANGED)
  Input:  stories/chapter_XX.json
  Output: translations/chapter_XX.json

Pass 3: Word Extraction (UNCHANGED)
Pass 3c: Grammar Audit (UNCHANGED)

Pass 3d: Grammar Gap Filler (UPDATED)
  Input:  Simplified sentences from Pass 1 + chapter config + grammar audit report
  Output: New sentences inserted at narratively appropriate positions
  Changes:
    - Receives full simplified story text as context (not just chapter title/context)
    - Generates at correct CEFR level
    - Returns insert_after position for each new sentence
    - Re-indexes subsequent sentence_index values

Pass 3b: Vocab Gap Filler (UPDATED, same changes as 3d)
  Input:  Simplified sentences from Pass 1 + chapter config + coverage report
  Output: New sentences inserted at narratively appropriate positions
  Changes: Same as grammar gap filler above

Pass 4: Media Generation (UNCHANGED)
```

## Key Design Decisions

1. **No vocabulary hints to CEFR simplifier** — The chapter context (packing a suitcase, riding the subway, etc.) naturally produces level-appropriate vocabulary. Adding explicit vocab targets is redundant and adds prompt complexity.

2. **Drop vocabulary_planner.py** — Was a workaround for single-pass generation. No longer needed.

3. **Gap filler sentences get inserted at positions, not appended** — Makes them feel like they were always part of the story. Requires re-indexing subsequent sentence_index values in story JSON and translation files.

4. **Gap fillers receive simplified sentences as context** — They need to match the tone of what the learner reads, not the unconstrained version.

5. **Image prompts unchanged through simplification** — Pass 1 only modifies `source` text in sentences. Scene settings, shot focus, and image prompts are preserved from Pass 0.

6. **Raw stories cached separately** — `stories_raw/` preserves the unconstrained version. `stories/` contains the simplified version. If you want to re-simplify at a different level, delete `stories/` and re-run.

## Files to Create/Modify

### New files
- `pipeline/story_generator.py` — Pass 0: unconstrained story generation (replaces scene_story_generator.py)
- `pipeline/cefr_simplifier.py` — Pass 1: CEFR simplification

### Modified files
- `scripts/run_all.py` — Updated pipeline orchestration (Pass 0 → 1 → 2 → 3)
- `pipeline/grammar_gap_filler.py` — Accept story context, return insert positions
- `pipeline/gap_filler.py` — Accept story context, return insert positions

### Removed/deprecated
- `pipeline/scene_story_generator.py` — Replaced by story_generator.py
- `pipeline/vocabulary_planner.py` — No longer needed

## CEFR Simplification Prompt Design

The simplifier receives each chapter as a complete ChapterScene JSON and returns the same structure with simplified sentences. Key prompt elements:

- Target CEFR level with grammar/vocabulary constraints (same rules as current system prompt)
- "Preserve the narrative meaning and emotional tone"
- "You may split one complex sentence into two simpler ones"
- "Do not add new content or remove story beats"
- "Keep dialogue natural — simplify the words, not the emotion"
- "Return the same JSON structure with updated source fields"

## Gap Filler Context Design

Gap fillers receive:
```
- All simplified sentences for the chapter (numbered)
- Chapter title and config context
- The specific gap (missing word or grammar target)
- Target CEFR level
- Instruction: "Write a sentence using [word/grammar] that fits naturally
  between sentence N and N+1. Match the scene, characters, and tone."
```

They return:
```
- source: the new sentence in target language
- target: translation in native language
- insert_after: sentence_index to insert after
- scene_setting: which scene it belongs to (for potential image generation)
```
