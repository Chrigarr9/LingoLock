# Subtitle Deck: Word-Centric Redesign

**Date:** 2026-05-14
**Branch:** screen-time-api (or new branch)
**Deck affected:** himym-s01-es (and all future subtitle decks)

---

## Problem

The current subtitle pipeline is sentence-centric: one card per subtitle sentence, with a scene-based AI image. This doesn't work for two reasons:

1. **App incompatibility** — `build-subtitle-content.ts` emits `kind: "cloze"` cards with `front`/`back` fields, but the `ClozeCard` component reads `sentence`, `wordInContext`, `lemma`, etc. The deck would crash at `card.sentence.split('_____')`.
2. **Scene images don't work for dialogue** — HIMYM is dialogue-heavy. A scene image of Ted talking doesn't reinforce vocabulary. A photo of an actual husband reinforces "marido".

---

## Decision

Restructure the subtitle pipeline to be **word-centric**, matching the Buenos Aires pipeline architecture:

- One `ClozeCard` per unique lemma taught across the season
- The best HIMYM subtitle sentence becomes the cloze context
- One per-word image (photorealistic, `fal-ai/z-image/turbo`)
- Full MC/scramble/text challenge modes — no app changes needed

---

## Card Structure

Each card is a proper `ClozeCard`:

```json
{
  "id": "marido-ch01-s00",
  "lemma": "marido",
  "word_in_context": "marido",
  "sentence": "...creo que sería un buen _____, porque éstas son las cosas que haría bien.",
  "sentence_translation": "...ich glaube, ich wäre ein guter Ehemann...",
  "german_hint": "Ehemann",
  "english_gloss": "husband",
  "pos": "noun",
  "context_note": "masculine singular",
  "cefr_level": "A2",
  "distractors": ["padre", "amigo", "hombre"],
  "image": "marido",
  "audio": "ch01_s00",
  "episode": 1
}
```

- `id` format `{lemma}-ch{ep}-s{idx}` matches `cardSelector.ts` ID parsing — no app changes needed
- `image` key = lemma slug (e.g. `marido.webp`)
- `audio` key = sentence file_key (e.g. `ch01_s00.mp3`) — unchanged from current pipeline

---

## Pipeline Changes

### New file: `pipeline/subtitle_word_extractor.py`

Replaces `subtitle_image_prompter.py`. Runs after sentence selection and translation.

**Word explosion:**
- Iterates over each `ProcessedSentence`'s `teaches_lemmas`
- Uses spaCy token data (already computed in Pass 1) to find the surface form of each lemma in the sentence
- Inserts `_____` to create the cloze blank mechanically — no LLM call needed

**Deduplication:**
- One card per unique lemma across the season
- If a lemma appears in multiple sentences, use the sentence with the highest `ProcessedSentence.score`

**Enrichment LLM call** (one per unique lemma):
```json
{
  "german_hint": "Ehemann",
  "english_gloss": "husband",
  "context_note": "masculine singular noun",
  "cefr_level": "A2"
}
```
- `pos` comes from spaCy (no LLM call)
- Batched per lemma alongside the enrichment call — no separate round-trip

**Distractors:**
- Sampled from other lemmas in the same season with matching POS
- Same approach as Buenos Aires pipeline

**Image prompt:**
```
"husband, photorealistic, cinematic, warm natural light, clean simple background, no text"
```
Uses `english_gloss` from enrichment. Provider: `fal`, model: `fal-ai/z-image/turbo`. Style matches Buenos Aires config.

Image output: `output/<deck-id>/images/<lemma>.webp` — resume-safe (skip if file exists).

### Modified: `pipeline/subtitle_processor.py`

Minor change: expose the token→surface-form mapping so `subtitle_word_extractor.py` can locate the exact surface form of each lemma in the sentence text for cloze blank insertion.

### Modified: `scripts/run_subtitle.py`

Updated pass order:
1. Fetch + tokenise subtitles (unchanged)
2. Sentence selection (unchanged)
3. Translation — full sentence → German (unchanged)
4. Word extraction + enrichment (new, replaces image prompting)
5. Image generation — per lemma via fal (updated)
6. Audio generation — per sentence (unchanged)

Output file changes: `subtitle_cards.json` → `word_cards.json`

### Modified: `configs/himym_s01_es.yaml`

- Remove `image_prompting` model block
- Add `enrichment` model block (provider: openrouter, e.g. gemini-flash-lite)
- Add optional `prior_decks` list (see Cross-Season Deduplication)
- Update `image_generation` to use fal provider + `fal-ai/z-image/turbo`

### Rewritten: `scripts/build-subtitle-content.ts`

Reads `word_cards.json` instead of `subtitle_cards.json`. Emits proper `ClozeCard` fields:

- `cardImages` map keyed by lemma slug
- `cardAudios` map keyed by sentence file_key
- Chapters grouped by episode number (unchanged)

### Deleted: `pipeline/subtitle_image_prompter.py`

Functionality absorbed into `subtitle_word_extractor.py`.

---

## Cross-Season Deduplication

Config field `prior_decks` (optional list of deck IDs):

```yaml
# himym_s02_es.yaml
prior_decks:
  - himym-s01-es
```

At pipeline startup, `run_subtitle.py` loads `output/<prior_deck_id>/word_cards.json` for each prior deck and seeds `seen_lemmas` before sentence selection. This prevents generating cards for lemmas already taught in a prior season. Sentences that teach a mix of old and new lemmas still get selected — only the already-known lemmas are skipped during word explosion.

---

## What Stays the Same

- Sentence selection algorithm (TF-IDF, two-pool, novelty scoring) — unchanged
- Audio generation — one file per sentence, `gpt-4o-mini-tts` — unchanged
- App code — no changes needed. `cardSelector.ts`, `ClozeCard.tsx`, challenge screen all work as-is
- Chapter grouping by episode number — unchanged

---

## Adding Future Seasons

1. Create `configs/himym_s0N_es.yaml` with the new episode list and `prior_decks` referencing all previous seasons
2. Run `uv run python scripts/run_subtitle.py --config configs/himym_s0N_es.yaml`
3. Run `npx tsx scripts/build-subtitle-content.ts himym-s0N-es`

No code changes required.

---

## Files Summary

| File | Action |
|------|--------|
| `pipeline/subtitle_word_extractor.py` | Create (new) |
| `pipeline/subtitle_image_prompter.py` | Delete |
| `pipeline/subtitle_processor.py` | Modify (expose token surface-form map) |
| `scripts/run_subtitle.py` | Modify (pass order + output filename) |
| `scripts/build-subtitle-content.ts` | Rewrite (word_cards.json → ClozeCard) |
| `configs/himym_s01_es.yaml` | Modify (model config + prior_decks field) |
