# Deterministic Lemmatization with spaCy

**Date:** 2026-03-09
**Status:** Approved

## Problem

Coverage checking reports wildly different numbers depending on the method:

| Method | Covered | Why it's wrong |
|--------|---------|----------------|
| `check_coverage` (vocabulary.json) | 17.6% | LLM word extractor skips common words |
| `scan_story_coverage` (text tokenizer) | 29.6% | `SPANISH_VERB_FORMS` only covers irregulars |
| **spaCy lemmatization** | **38.6%** | Correct answer |

Root causes:
1. Word extraction is an LLM analysis task — LLMs skip words unpredictably.
2. `SPANISH_VERB_FORMS` is a hand-maintained 252-line table covering only irregular verbs. Regular conjugations like "mira"→"mirar" are missing.
3. `SPANISH_FUNCTION_WORDS` is Spanish-specific, doesn't scale to other languages.
4. Coverage checking depends on `frequency_lemmas.json` (LLM-derived) for lemma resolution.

## Solution

Use spaCy for all analysis (tokenization, lemmatization, POS tagging). Use LLM only for generation (translations, distractors, context notes, appropriateness filtering).

## Architecture

### New module: `pipeline/lemmatizer.py`

Thin wrapper around spaCy:

```python
def lemmatize_text(text: str, lang: str) -> list[TokenInfo]
    # Full sentence context → (text, lemma, pos, sentence_index) per token
    # Used for: story coverage, word extraction

def lemmatize_word(word: str, lang: str) -> str
    # Single word → lemma
    # Used for: frequency file lemma resolution
```

- spaCy model loaded lazily, cached per language code
- Model name convention: `{target_code}_core_news_sm` (e.g. `es_core_news_sm`)
- Override via config if needed (not initially)

### Changes to `coverage_checker.py`

**Delete:**
- `SPANISH_VERB_FORMS` (252 lines) — spaCy replaces this
- `SPANISH_FUNCTION_WORDS` — replaced by spaCy POS filtering

**Rewrite `scan_story_coverage()`:**
- `lemmatize_text()` on story text → story lemma set
- `lemmatize_word()` on frequency words → freq word → lemma map
- Coverage = freq lemma in story lemma set
- Appropriateness filtering uses `appropriate` flag only (ignores old `lemma` field)

**Rewrite `check_coverage()`:**
- Same spaCy-based approach, vocabulary source is `OrderedDeck` lemma set
- Remove `inflection_to_lemma` parameter and `merged_map`

**Function word filtering:** Use spaCy POS tags (`DET`, `ADP`, `CCONJ`, `SCONJ`, `PRON`, `AUX`, etc.) instead of hardcoded word lists.

### Changes to `word_extractor.py`

**Current:** Single LLM call does everything — tokenization, lemmatization, POS, translation, distractors. Misses words.

**New hybrid:**

Step A (deterministic): `lemmatize_text()` on chapter source sentences → all `(token, lemma, pos, sentence_index)` tuples. NOT deduplicated — same lemma in different sentences preserved for contextual translations.

Step B (LLM, generative): Send sentences + extracted word list to LLM. Each word carries its sentence context. LLM returns only creative fields:
- `target`: contextual translation (e.g. "lleva" → "trägt" in one sentence, "bringt" in another)
- `similar_words`: 6-8 distractors
- `context_note`: grammar note

Output format unchanged — `ChapterWords` with `WordAnnotation` entries. `vocabulary_builder.py` merges translations into `target: list[str]` as before.

### Changes to `frequency_lemmatizer.py` → `appropriateness_filter.py`

Rename and simplify. spaCy handles lemmatization; this module only answers "is this lemma appropriate for the deck domain?"

- Input: list of lemmas (spaCy-lemmatized)
- Output: cached `appropriateness.json` — `{lemma: bool}`
- One LLM batch call, cached to disk
- Function words pre-filtered by spaCy POS

### `run_all.py` orchestrator

- `--stage lemmatize`: spaCy lemmatizes frequency file → `frequency_lemmas.json` (deterministic). Then appropriateness filter runs → `appropriateness.json` (LLM, cached).
- `--stage text`: `scan_story_coverage()` uses spaCy. Word extraction uses hybrid approach.
- Gap filler and vocabulary builder receive same data structures — minor import changes only.

### Models

- `FrequencyLemmaEntry`: keep model, populate `lemma` from spaCy instead of LLM. `appropriate` field stays LLM-derived.

### Dependencies

- Add: `spacy`, `es-core-news-sm` (already added during investigation)
- Remove: `simplemma` (investigation only)

## What stays LLM-powered

- Story generation (passes 0-5) — creative/generative
- Sentence translation (pass 6) — generative
- Word annotation: translations, distractors, context notes (pass 7 step B)
- Appropriateness filtering — domain judgment
- Gap filler — generative

## What becomes deterministic

- Tokenization + lemmatization of stories
- Frequency file lemma resolution
- Coverage checking
- Word extraction (which tokens exist, their lemma and POS)
- Function word identification (POS-based, language-independent)

## Test changes

- `test_coverage_checker.py` — rewrite for spaCy-based logic
- `test_story_coverage_scanner.py` — rewrite for spaCy-based logic
- `test_frequency_lemmatizer.py` → `test_appropriateness_filter.py`
- `test_word_extractor.py` — adapt for hybrid spaCy+LLM approach
- New `test_lemmatizer.py` for spaCy wrapper

## Language independence

spaCy models exist for 24+ languages (es, de, fr, it, pt, nl, ja, zh, ko, ru, pl, etc.). Each ~12MB. The config's `languages.target_code` maps directly to model names. No language-specific code remains after removing `SPANISH_VERB_FORMS` and `SPANISH_FUNCTION_WORDS`.
