# Image Pipeline Redesign

**Date**: 2026-03-12
**Branch**: benchmark-v2
**Status**: Design approved, pending implementation

## Problem

The current image pipeline has five issues:

1. **Expensive, ineffective audit** — Pass 5c sends all 27 chapters (~62K tokens) to Sonnet 4.6 at ~24.6¢. It finds 84 issues (90% are oversized_shot — a text structure problem, not an image problem) but never applies any fixes.

2. **Oversized shots** — 41 shots have 4+ sentences because CEFR simplification (Pass 1) splits complex sentences into multiple simpler ones, inflating shots that were originally 2 sentences.

3. **Broken possessive grammar in prompts** — The visual tag replacement turns `PROTAGONIST's hands` into `...light blue jeans's hands` (18% of prompts affected, 65 shots).

4. **Prompt bloat** — Average 458 chars, max 1030. Multi-character shots paste 2-3 full visual tags (~120 chars each). FLUX models work best under 200 chars.

5. **Overpriced image generation** — Gemini 2.5 Flash Image at $0.039/img = $14.12 for 362 images. FLUX.1 Schnell costs $0.001/img = $0.38 total.

## Design

### Pass 5c Replacement: Two-Step Image Audit

Replace the single expensive Sonnet call with two Gemini 3.1 FL steps.

#### Step 1: Chapter-Level Scene Review (one call per chapter)

**Input**: All scenes from the chapter — shots with their sentences, focuses, and scene settings.

**Job**:
- Review scene flow across the chapter
- Split oversized shots (3+ sentences) into max-2-sentence shots, deciding split points based on visual coherence (which sentences form a visual moment)
- Assign/verify `focus` per shot ensuring visual variety across the chapter (no three consecutive close-ups of the same subject)

**Output**: Restructured shot list with sentence assignments and focus fields. No image prompts yet.

**Cost**: ~0.5¢ for all 27 chapters.

#### Step 2: Per-Shot Prompt Generation (batched per chapter)

**Input per shot**: Scene setting + description, shot focus, sentences in the shot, characters present (with image_tags).

**Job**:
- Write an image prompt that matches the current sentences
- Ensure the vocabulary focus item is visually prominent
- Keep prompt under 200 chars (pre-style/tag injection)

**Output**: Image prompt per shot.

**Cost**: ~2¢ for all 27 chapters (~362 shots).

**Total Pass 5c cost**: ~2.5¢ (was 24.6¢, 10x reduction).

### Character Tag Format

#### New `image_tag` config field

Each character gets a shorter `image_tag` (~60 chars) in addition to the existing `visual_tag`. The `image_tag` is used in image prompts; the `visual_tag` is kept for documentation/reference.

Principles:
- Always include age bracket (prevents kid/elderly misgeneration)
- Always include clothing colors (recognition across shots)
- Drop personality descriptors ("warm and practical", "easy-going grin")
- Drop unrenderable details ("light freckles on nose and cheeks", "side part", "reading glasses on a chain")

Tags:

| Character | image_tag |
|---|---|
| Maria | `young woman mid-20s, wavy light-brown hair, teal cardigan, white t-shirt, light blue jeans` |
| Ingrid | `woman early-50s, short wavy light-brown hair, blue eyes, beige cardigan` |
| Sofia | `young woman mid-20s, curly dark-brown hair, olive skin, colourful oversized t-shirt, wide-leg trousers` |
| Diego | `young man late-20s, dark curly hair, stubble, grey t-shirt, dark jeans, canvas messenger bag` |
| Lucas | `young man late-20s, short black hair, stubble, broad shoulders, navy t-shirt, jeans` |
| Valentina | `young woman mid-20s, long straight dark hair, square glasses, patterned blouse` |
| Roberto | `man 60s, silver combed-back hair, black shirt, elegant posture` |
| Kiosk vendor | `middle-aged man, casual shirt, small counter` |
| Check-in agent | `middle-aged woman, dark hair bun, airline uniform` |
| Shop assistant | `young man, green store apron, short hair` |
| Cashier | `young woman, store uniform, hair tied back` |
| Market vendor | `older man, weathered face, colourful stall` |
| Doctor | `woman 40s, white coat, stethoscope` |
| Pharmacist | `middle-aged man, white pharmacy coat, glasses` |
| Boat captain | `older man, captain's hat, standing at helm` |

#### Replacement logic in `_post_process()`

```
1. Find all PROTAGONIST / CHARACTER_NAME mentions in the raw prompt
2. First non-possessive mention → "Name (image_tag)"
3. Subsequent mentions → "Name" only
4. Possessive "PROTAGONIST's X" → "Name's X" (name only, no tag)
5. If only mention is possessive → "Name (image_tag)'s X"
```

Example:
```
Before: "Close-up of PROTAGONIST and SOFIA sharing mate. PROTAGONIST's hand holds the cup."
After:  "Close-up of Maria (young woman mid-20s, wavy light-brown hair, teal cardigan, jeans) and Sofia (young woman mid-20s, curly dark-brown hair, colourful t-shirt) sharing mate. Maria's hand holds the cup."
```

### Prompt Format

**Style prefix**: `cartoon, vibrant colors` (test against current long prefix on chapter 1)

**Suffix**: `no text, no writing, no letters`

**Target total prompt length**: 150-250 chars

**Structure**: `cartoon, vibrant colors, [scene description with inline character tags]. no text, no writing, no letters`

### Image Generation: Switch to FLUX.1 Schnell

**Config change**:
```yaml
image_generation:
  enabled: true
  model: "black-forest-labs/FLUX.1-schnell-Free"
  style: "cartoon, vibrant colors"
  width: 768
  height: 512
```

**Code**: No changes to `image_generator.py` — Together path already exists via `detect_provider()` and `_call_together()`.

**Test plan**:
1. Generate ~11 images for chapter 1 with FLUX Schnell + short style
2. Generate ~3 of the same shots with Gemini 2.5 Flash Image for comparison
3. Compare: character consistency, style fit, vocabulary visibility, text artifacts
4. Fallback order if FLUX Schnell quality is insufficient:
   - FLUX.2 Dev on fal.ai ($0.005/img) — needs fal.ai client
   - Imagen 4 Fast on Google ($0.02/img) — same API key, model name change only

**No image cost tracking** — Together API doesn't return cost in the response. Calculate manually from known per-MP rates if needed.

### Cost Comparison

| Component | Current | New |
|---|---|---|
| Image audit (Pass 5c) | 24.6¢ (Sonnet 4.6) | ~2.5¢ (Gemini 3.1 FL) |
| Image generation (362 imgs) | $14.12 (Gemini 2.5 Flash Image) | $0.38 (FLUX Schnell) |
| **Total** | **$14.37** | **$0.41** |

97% cost reduction.

## Files to Modify

| File | Change |
|---|---|
| `configs/spanish_buenos_aires.yaml` | Add `image_tag` per character, change image model + style |
| `pipeline/image_auditor.py` | Full rewrite: two-step audit (scene review + prompt generation) |
| `pipeline/story_generator.py` | Update `_post_process()` for new tag format + possessive handling |
| `scripts/run_all.py` | Update Pass 5c to call new two-step audit, apply results to chapter JSONs |
| `pipeline/config.py` | Add `image_tag` field to character config model |

## Not In Scope

- Per-chapter outfit variation (single outfit = better recognition with FLUX)
- Image cost tracking (check API manually)
- fal.ai client (only needed if FLUX Schnell quality is insufficient)
- Batch API for Gemini (only relevant if we stay on Gemini for image gen)
