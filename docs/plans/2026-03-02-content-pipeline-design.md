# Content Pipeline Design: AI-Generated Vocabulary Decks

**Date:** 2026-03-02
**Status:** Approved
**Scope:** Story generation, sentence translation, word extraction, vocabulary database

---

## Overview

A three-pass pipeline that generates vocabulary decks from AI-written stories. Each deck follows a protagonist preparing to move to a foreign country, learning the language through everyday situations. The pipeline is fully configurable via YAML — swapping the config file produces a deck for any language pair, city, and protagonist.

**First deck:** German speaker learning Spanish, set in Buenos Aires.

---

## Architecture

### Config-Driven Design

Each vocabulary deck is defined by a YAML config file:

```yaml
# configs/spanish_buenos_aires.yaml
deck:
  name: "Spanish with Charlotte - Buenos Aires"
  id: "es-de-buenos-aires"

languages:
  target: "Spanish"
  target_code: "es"
  native: "German"
  native_code: "de"
  dialect: "neutral"   # neutral | argentinian | iberian

protagonist:
  name: "Charlotte"
  gender: "female"     # affects pronoun generation in prompts
  origin_country: "Germany"
  origin_city: "Berlin"

destination:
  country: "Argentina"
  city: "Buenos Aires"
  landmarks:
    - "Plaza de Mayo"
    - "La Boca"
    - "San Telmo market"
    - "Recoleta Cemetery"
    - "Puerto Madero"

story:
  cefr_level: "A1-A2"
  sentences_per_chapter: [8, 20]   # [min, max]
  chapters:
    - title: "Preparation"
      context: "Packing bags at home, saying goodbye to friends, feeling excited and nervous"
      vocab_focus: ["clothing", "travel preparation", "emotions", "farewells"]
    - title: "To the Airport"
      context: "Taking a taxi, conversation with driver, checking the time, city scenery"
      vocab_focus: ["traffic", "time", "emotions", "directions"]
    - title: "At the Airport"
      context: "Check-in counter conversation, security check, waiting at the gate, boarding announcement"
      vocab_focus: ["airport vocabulary", "formalities", "documents", "announcements"]
    # ... additional chapters

llm:
  provider: "openrouter"
  model: "google/gemini-2.5-flash-lite"
  fallback_model: "openai/gpt-4o-mini"
  temperature: 0.7
  max_retries: 3
```

To create a French deck for Paris, create `configs/french_paris.yaml` with `target: "French"`, `city: "Paris"`, landmarks like "Eiffel Tower", etc. The pipeline code is identical.

### Three-Pass LLM Pipeline

Each chapter goes through three sequential LLM calls:

```
Pass 1: Story Generation
  Input:  config (chapter context, protagonist, city, CEFR level)
  Output: raw Spanish text (8-20 sentences with dialogues)
  Saved:  output/{deck_id}/stories/chapter_{N}.txt

Pass 2: Sentence Translation
  Input:  Spanish text from Pass 1
  Output: JSON array of {spanish, german} sentence pairs
  Saved:  output/{deck_id}/translations/chapter_{N}.json

Pass 3: Word Extraction
  Input:  Spanish text + German translations from Pass 2
  Output: JSON array of per-word annotations (lemma, POS, translation)
  Saved:  output/{deck_id}/words/chapter_{N}.json
```

After all chapters are processed, two local-only (no LLM) steps finalize the data:

```
BUILD: Vocabulary Database
  - Deduplicate lemmas across chapters
  - Merge all example sentences per word
  - Match against frequency data (FrequencyWords es_50k.txt)
  - Assign CEFR level from frequency rank
  Saved: output/{deck_id}/vocabulary.json

REPORT: Coverage Analysis
  - Compare vocabulary against top-N frequency list
  - Report coverage %, missing high-frequency words
  Saved: output/{deck_id}/coverage_report.json
```

### Incremental Execution

Each step saves output per-chapter. If a step fails on chapter 5, chapters 1-4 are preserved. Re-running skips already-completed chapters.

---

## Data Models

### SentencePair (Pass 2 output)

```python
class SentencePair:
    chapter: int
    sentence_index: int
    spanish: str
    german: str
```

### WordAnnotation (Pass 3 output)

```python
class WordAnnotation:
    spanish: str          # As it appears in text (conjugated/declined form)
    german: str           # Contextual German translation
    lemma: str            # Base form (infinitive for verbs, singular for nouns)
    pos: str              # noun | verb | adjective | adverb | preposition | ...
    context_note: str     # e.g. "3rd person singular present tense"
```

### VocabularyEntry (BUILD output)

```python
class VocabularyEntry:
    id: str                       # The lemma (unique key)
    spanish: str                  # Lemma in Spanish
    german: list[str]             # All German translations seen across contexts
    pos: str
    frequency_rank: int | None    # From FrequencyWords data
    cefr_level: str | None        # Derived from frequency rank
    examples: list[SentencePair]  # All sentences where this word appeared
```

### CEFR Assignment (frequency-based)

```
Rank 1-500     → A1
Rank 501-1500  → A2
Rank 1501-3000 → B1
Rank 3001-5000 → B2
Rank 5001-8000 → C1
Rank 8001+     → C2
```

---

## LLM Integration

### Provider: OpenRouter

OpenRouter provides a unified API to access models from multiple providers (Google, OpenAI, Anthropic, etc.) with a single API key.

### Default Model: Gemini 2.5 Flash Lite

- Cost: ~$0.10/$0.40 per million tokens (input/output)
- Full pipeline cost: ~$0.02-$0.05
- Strong multilingual performance
- JSON mode supported
- 1M context window

Fallback: GPT-4o-mini via OpenRouter if Gemini quality is insufficient.

### Prompt Language: English

All prompts are written in English for best instruction-following reliability. Outputs are bilingual (target language + native language).

---

## Project Structure

```
spanish-content-pipeline/
├── pipeline/                       # Shared Python package
│   ├── __init__.py
│   ├── config.py                   # Load & validate YAML config
│   ├── llm.py                      # OpenRouter API client
│   ├── models.py                   # Pydantic data models
│   ├── story_generator.py          # Pass 1: Generate story chapters
│   ├── sentence_translator.py      # Pass 2: Translate sentences
│   ├── word_extractor.py           # Pass 3: Extract vocabulary
│   ├── vocabulary_builder.py       # BUILD: Deduplicate & merge
│   └── coverage_checker.py         # REPORT: Frequency analysis
├── configs/
│   └── spanish_buenos_aires.yaml   # First deck config
├── data/
│   └── frequency/
│       └── es_50k.txt              # FrequencyWords (MIT license)
├── output/                         # Generated per-deck outputs
│   └── es-de-buenos-aires/
│       ├── stories/
│       ├── translations/
│       ├── words/
│       ├── vocabulary.json
│       └── coverage_report.json
├── scripts/
│   ├── generate.py                 # CLI: run Pass 1
│   ├── translate.py                # CLI: run Pass 2
│   ├── extract.py                  # CLI: run Pass 3
│   ├── build.py                    # CLI: build vocabulary DB
│   ├── report.py                   # CLI: coverage report
│   └── run_all.py                  # CLI: full pipeline
├── requirements.txt
└── .env                            # OPENROUTER_API_KEY
```

### CLI Interface

```bash
# Full pipeline for test run (3 chapters)
python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --chapters 1-3

# Individual steps
python scripts/generate.py  --config configs/spanish_buenos_aires.yaml --chapters 1-3
python scripts/translate.py --config configs/spanish_buenos_aires.yaml --chapters 1-3
python scripts/extract.py   --config configs/spanish_buenos_aires.yaml --chapters 1-3
python scripts/build.py     --config configs/spanish_buenos_aires.yaml
python scripts/report.py    --config configs/spanish_buenos_aires.yaml
```

---

## Test Plan

### Phase 1: Proof of Concept (3 chapters)

1. Generate chapters 1-3 (Preparation, To the Airport, At the Airport)
2. Translate all sentences to German
3. Extract vocabulary from all sentences
4. Build vocabulary database
5. Run coverage report

**Success criteria:**
- 100-150 unique vocabulary entries
- Each entry has at least one example sentence pair
- Valid JSON throughout (no parse errors)
- Coverage report runs against FrequencyWords data
- Pipeline completes without manual intervention

### Validation Checks

- All generated Spanish text is at A1-A2 level (no complex grammar)
- German translations are natural (not word-for-word)
- Lemmatization is correct (verbs → infinitive, nouns → singular)
- POS tags are accurate
- No duplicate lemmas in final vocabulary.json
- Frequency ranks match FrequencyWords data

---

## Dependencies

```
pydantic>=2.0        # Data validation and models
pyyaml>=6.0          # Config file loading
httpx>=0.27          # HTTP client for OpenRouter API
python-dotenv>=1.0   # .env file loading
```

No OpenAI/Anthropic SDKs needed — OpenRouter uses a standard OpenAI-compatible API, and httpx is lighter than pulling in the full SDK.

---

## Cost Estimate

For 3-chapter test run (~50-80 sentences, ~100-150 words):

| Pass | Estimated Tokens | Cost (Gemini 2.5 Flash Lite) |
|------|-----------------|------------------------------|
| Story generation | ~3,000 | ~$0.001 |
| Sentence translation | ~4,000 | ~$0.002 |
| Word extraction | ~6,000 | ~$0.003 |
| **Total** | **~13,000** | **~$0.006** |

For full 11-chapter run: ~$0.02-$0.05.

---

## Future Extensions (not in scope for v1)

- Gap-filling pipeline (generate additional scenes for missing high-frequency words)
- Multiple-choice distractor generation (10 distractors per word)
- .apkg (Anki) export
- Audio generation (TTS for Spanish sentences)
- Adaptive story branching based on user vocabulary gaps
