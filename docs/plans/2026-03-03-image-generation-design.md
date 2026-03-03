# Image Generation Pipeline Design

## Goal

Add automated illustration generation to the content pipeline so every cloze card has a visual memory cue. Uses Flux Kontext Dev for character-consistent scenes and Flux Schnell for scenery-only shots.

## Cost

~$2.36 for 200 sentences. Gemini Flash for prompt generation adds ~$0.02.

## Config Changes

Extend the existing `protagonist` with a visual `description` field. Add an `image_generation` section.

```yaml
protagonist:
  name: "Maria"
  gender: "female"
  origin_country: "Germany"
  origin_city: "Berlin"
  description: "mid-20s, light brown shoulder-length hair, warm brown eyes, slim build"  # NEW

image_generation:
  enabled: true
  provider: "together"
  model: "black-forest-labs/FLUX.1-kontext-dev"
  cheap_model: "black-forest-labs/FLUX.1-schnell"
  style: "warm storybook illustration, semi-realistic modern picture book, soft lighting"
  width: 768
  height: 512
```

No separate `characters` section. The protagonist comes from config. Secondary characters (friend, taxi driver, waiter) are identified by the LLM from chapter contexts — they only appear once or twice and don't need reference images.

## Pipeline Architecture

```
Pass 1: Story Generation        (existing, unchanged)
Pass 2: Sentence Translation     (existing, unchanged)
Pass 3: Word Extraction          (existing, unchanged)
BUILD:  Vocabulary Database      (existing, unchanged)
         ↓
Pass 4: Image Prompt Generation  ← NEW (Gemini Flash)
         ↓
Pass 5: Image Generation         ← NEW (Flux APIs)
         ↓
REPORT: Coverage Analysis        (existing, unchanged)
```

Passes 4-5 run after BUILD because they don't affect vocabulary ordering. Images are purely additive. You can re-run image generation without touching the rest of the pipeline.

## Pass 4: Image Prompt Generation

Single Gemini Flash call that reads the entire story and outputs a structured prompt per sentence.

### Input

- All chapter stories (concatenated)
- All sentence translations
- Protagonist config (name, gender, origin, description)
- Chapter contexts from config
- The configured art style

### LLM Task

For each sentence, the LLM:
1. Writes a visual scene description in English (image generation models work best with English prompts)
2. Categorizes as `character_scene` (protagonist visible) or `scene_only` (no protagonist)
3. Identifies the setting/location

Every sentence gets an image — no skipping. Even dialogue-heavy sentences get a visual cue (close-up, gesture, environment).

### Output

`output/{deck_id}/image_prompts.json`:

```json
{
  "protagonist_prompt": "Portrait of María, a young German woman in her mid-20s, light brown shoulder-length hair, warm brown eyes, slim build, wearing a casual travel outfit",
  "style": "warm storybook illustration, semi-realistic modern picture book, soft lighting",
  "sentences": [
    {
      "chapter": 1,
      "sentence_index": 0,
      "source": "María está en su habitación en Berlín.",
      "image_type": "character_scene",
      "characters": ["protagonist"],
      "prompt": "A young woman carefully folding clothes into a large open suitcase on a bed, cozy Berlin apartment with warm lamp light, books and photos on the shelf",
      "setting": "maria_bedroom_berlin"
    },
    {
      "chapter": 1,
      "sentence_index": 5,
      "source": "Las calles están llenas de gente.",
      "image_type": "scene_only",
      "characters": [],
      "prompt": "A busy Buenos Aires street with colorful colonial buildings and people walking, warm afternoon light, trees lining the sidewalk",
      "setting": "buenos_aires_street"
    }
  ]
}
```

## Pass 5: Image Generation

Three-stage process using the Flux API via together.ai.

### Step A: Generate Character Reference (once)

```
protagonist_prompt → Flux Schnell ($0.003)
→ output/{deck_id}/references/protagonist.webp
```

This reference image is used as input for all `character_scene` images to maintain visual consistency of the protagonist across the entire deck.

### Step B: Generate Sentence Images

For each sentence in image_prompts.json:

- `character_scene`: reference image + prompt → Flux Kontext Dev ($0.025)
- `scene_only`: prompt alone → Flux Schnell ($0.003)

All prompts are appended with the configured art style.

Images saved to `output/{deck_id}/images/ch{NN}_s{NN}.webp`.

### Step C: Write Manifest

`output/{deck_id}/image_manifest.json`:

```json
{
  "generated_at": "2026-03-03T14:30:00Z",
  "reference": "references/protagonist.webp",
  "model_character": "black-forest-labs/FLUX.1-kontext-dev",
  "model_scene": "black-forest-labs/FLUX.1-schnell",
  "images": {
    "ch01_s00": { "file": "images/ch01_s00.webp", "status": "success" },
    "ch01_s01": { "file": "images/ch01_s01.webp", "status": "success" },
    "ch01_s02": { "file": null, "status": "failed", "error": "API timeout" }
  }
}
```

### Resumability

The manifest tracks generation status per sentence. On re-run:
- Skip images with `"status": "success"`
- Retry images with `"status": "failed"`
- `--force` flag regenerates specific sentences or chapters
- `--dry-run` shows what would be generated and estimated cost

## Build Integration

`build-content.ts` reads `image_manifest.json`, copies successful images to `assets/images/cards/`, and generates a lookup map in `bundle.ts`:

```typescript
export const cardImages: Record<string, number> = {
  'ch01_s00': require('../../assets/images/cards/ch01_s00.webp'),
  'ch01_s01': require('../../assets/images/cards/ch01_s01.webp'),
};
```

Each ClozeCard references images by key (`image: "ch01_s00"`). ClozeCard.tsx looks up the require() value from the map. Cards without images (failed generation) gracefully degrade — the card works fine, just without an illustration.

## Files to Create

| File | Purpose |
|---|---|
| `pipeline/image_prompter.py` | Pass 4: Gemini-based image prompt generation |
| `pipeline/image_generator.py` | Pass 5: Flux API calls + manifest management |
| `scripts/generate_image_prompts.py` | Standalone script for Pass 4 |
| `scripts/generate_images.py` | Standalone script for Pass 5 |

## Files to Modify

| File | Change |
|---|---|
| `pipeline/config.py` | Add `description` to Protagonist, add ImageGenerationConfig |
| `pipeline/models.py` | Add image-related fields to sentence/manifest models |
| `scripts/run_all.py` | Add Pass 4 + 5 to pipeline orchestration |
| `configs/spanish_buenos_aires.yaml` | Add protagonist description + image_generation section |
| `scripts/build-content.ts` | Read manifest, copy images, generate require map |
| `src/components/ClozeCard.tsx` | Look up images from cardImages map |

## Cost Estimate (200 sentences)

| Item | Count | Unit Cost | Total |
|---|---|---|---|
| Image prompts (Gemini Flash) | 1 call | ~$0.02 | $0.02 |
| Character reference (Schnell) | 1 | $0.003 | $0.003 |
| Character scenes (Kontext Dev) | ~80 | $0.025 | $2.00 |
| Scene-only (Schnell) | ~120 | $0.003 | $0.36 |
| **Total** | | | **~$2.38** |

## Environment Variables

```
TOGETHER_API_KEY=...    # For Flux image generation via together.ai
GEMINI_API_KEY=...      # Already exists, used for Pass 4 prompt generation
```
