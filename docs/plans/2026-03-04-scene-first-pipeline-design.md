# Scene-First Content Pipeline Design

## Problem

The current pipeline generates story text first, then retrofits image prompts in a separate pass. This creates a fundamental misalignment: the image prompter must reverse-engineer visual scenes from sentences that weren't written with visuals in mind. Abstract sentences, phone calls, and internal thoughts are hard to visualize after the fact.

## Solution

Treat story creation like directing a movie. The LLM thinks in **scenes** (locations) and **shots** (camera focuses within a scene) first, then writes sentences that naturally describe what's visible. Image prompts are a co-product of story generation, not a post-hoc addition.

## Data Model

```
Chapter
├─ scenes[]
│   ├─ setting: string            # reusable location tag (e.g. "maria_bedroom_berlin")
│   ├─ description: string        # overall environment for visual consistency
│   └─ shots[]
│       ├─ focus: string          # what the camera focuses on (vocab-driven)
│       ├─ image_prompt: string   # full prompt for image model (before style/tag injection)
│       └─ sentences[]
│           ├─ source: string     # Spanish sentence
│           └─ sentence_index: int # global index within chapter (0-based)
```

- **Scene** = a location. All shots in a scene share the same environment.
- **Shot** = one generated image. Focus driven by vocabulary words.
- **Sentences** = 1-3 sentences per shot, describing what's visible.
- `sentence_index` provides flat ordering for compatibility with downstream passes.

## Pipeline Flow

```
Current:
  Pass 1: Story text (story_generator.py)
  Pass 2: Translation (sentence_translator.py)
  Pass 3: Word extraction (word_extractor.py)
  BUILD:  Vocabulary DB (vocabulary_builder.py)
  Pass 4: Image prompt generation (image_prompter.py)  <-- SEPARATE
  Pass 5: Image generation (image_generator.py)

New:
  Pass 1: Story + Scenes + Shots + Image Prompts (scene_story_generator.py)  <-- INTEGRATED
  Pass 2: Translation (sentence_translator.py, unchanged)
  Pass 3: Word extraction (word_extractor.py, unchanged)
  BUILD:  Vocabulary DB (vocabulary_builder.py, unchanged)
  Pass 5: Image generation (image_generator.py, extended)

Pass 4 eliminated. image_prompter.py deleted.
```

## LLM Prompt Strategy

The system prompt frames the LLM as a film director writing a screenplay:

- Think visually first: establish the scene, then plan shots that highlight vocabulary
- Each shot focuses on 1-2 vocabulary words as the prominent visual element
- Characters can be prominent when the scene calls for it
- CEFR level comes from config (not hardcoded)
- Consecutive shots must focus on different objects/angles for variety
- Output is structured JSON matching the data model above

**Post-processing by pipeline code** (not LLM responsibility):
- Style prefix (from `image_generation.style` config) prepended to every `image_prompt`
- Character `visual_tag` strings (from config) appended to shots where characters appear
- "no text, no writing, no letters" appended to every prompt

This ensures visual consistency without relying on the LLM to remember style/tag rules.

## Compatibility Layer

`scene_story_generator.py` provides two extraction helpers:

1. **`extract_flat_sentences(chapter_json) -> list[SentencePair]`**
   - Walks scenes → shots → sentences, returns flat list ordered by `sentence_index`
   - Used by Pass 2 (translation) and Pass 3 (word extraction) unchanged

2. **`extract_image_prompts(chapter_json) -> list[ImagePrompt]`**
   - Extracts shot-level image prompts, keyed by `ch{NN}_s{NN}` (sentence_index of first sentence in shot)
   - Writes `image_prompts.json` in the existing format for Pass 5

## Image Provider Abstraction

`image_generator.py` gains multi-provider support, routed by model name:

| Model pattern | Provider | API |
|---|---|---|
| `FLUX.*`, `black-forest-labs/*` | Together.ai | `TOGETHER_API_KEY` |
| `imagen-*` | Google AI Studio | `GEMINI_API_KEY` |

Config example:
```yaml
image_generation:
  model: "imagen-3.0-generate-002"   # or "FLUX.1-schnell"
  style: "modern cartoon illustration, crisp outlines, vibrant flat colors..."
  width: 768
  height: 512
```

Provider is auto-detected from the model name. No new config fields needed.

## File Changes

### New files
- `pipeline/scene_story_generator.py` — scene-first story + image prompt generation

### Modified files
- `scripts/run_all.py` — remove Pass 4 step, route Pass 1 to scene_story_generator
- `pipeline/image_generator.py` — add Google AI Studio provider alongside Together.ai

### Deleted files
- `pipeline/image_prompter.py` — its job is now part of Pass 1
- `pipeline/story_generator.py` — replaced by scene_story_generator.py

### Unchanged files
- `pipeline/sentence_translator.py`
- `pipeline/word_extractor.py`
- `pipeline/vocabulary_builder.py`
- `pipeline/llm.py`
- `pipeline/models.py` (may need minor additions for scene/shot types)
- `pipeline/config.py`
- `scripts/build-content.ts`

## Caching

- Output: `stories/chapter_NN.json` (structured JSON, replaces `.txt`)
- Cached on disk. If file exists, Pass 1 is skipped.
- To regenerate: delete the chapter JSON file.

## Config Changes

No new config fields. Existing fields used:
- `story.cefr_level` — drives sentence complexity
- `protagonist.visual_tag` — injected into shot prompts programmatically
- `image_generation.model` — now accepts Imagen models alongside Flux
- `image_generation.style` — prepended to all image prompts programmatically
