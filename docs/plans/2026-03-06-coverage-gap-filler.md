# Coverage Gap Filler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add LLM-powered frequency lemmatization (Pass 0) and gap-filling sentence generation (Pass 3b) to close coverage gaps in the vocabulary deck, replacing the hardcoded SPANISH_VERB_FORMS lookup table with a cached, language-agnostic solution.

**Architecture:** Two new pipeline components — `frequency_lemmatizer.py` (Pass 0, cached) batch-lemmatizes the frequency file via LLM and classifies words as appropriate for the deck domain, producing `frequency_lemmas.json`. Then `gap_filler.py` (Pass 3b) uses that file to identify genuinely missing high-frequency words, makes one LLM call to assign all missing words to chapters (cached as `gap_word_assignment.json`, distributed roughly evenly unless topical fit is strong), then one LLM call per chapter to generate sentences covering all assigned words (max 3 new words per sentence, as many sentences as needed), using the existing chapter sentences for style context. The vocabulary builder is updated to merge gap sentences into the deck as new word entries.

**Tech Stack:** Python 3.12, Pydantic, pytest; existing `LLMClient`/`GeminiClient` from `pipeline/llm.py`; frequency file `data/frequency/es_50k.txt` (FrequencyWords format).

---

## Context: What Exists

- `pipeline/coverage_checker.py`: `check_coverage()` accepts `inflection_to_lemma` from word extractor. Falls back to `SPANISH_VERB_FORMS` (250-line hardcoded table). Already has `SPANISH_FUNCTION_WORDS` filter.
- `pipeline/vocabulary_builder.py`: `build_vocabulary()` takes `list[ChapterWords]`, produces `OrderedDeck`.
- `scripts/run_all.py`: `--stage text|media|all`. Text stage runs passes 1–3 + vocab + coverage report.
- `output/<deck-id>/vocabulary.json`: full deck, already on disk after text stage.
- `output/<deck-id>/coverage_report.json`: saved after text stage.
- Tests use `pytest` with `tmp_path` fixture; no network calls (mock LLM via `httpx.MockTransport`).

## New Output Files

```
output/<deck-id>/
  frequency_lemmas.json          # Pass 0 output (cached)
  gap_word_assignment.json       # Pass 3b: LLM word→chapter mapping (cached)
  gap_sentences/
    chapter_01.json              # Pass 3b: generated sentences per chapter (cached)
    chapter_02.json
    ...
  vocabulary.json                # Rebuilt after gap merge
```

## Data Shapes

**`frequency_lemmas.json`** — flat dict:
```json
{
  "voy": {"lemma": "ir", "appropriate": true},
  "disparar": {"lemma": "disparar", "appropriate": false},
  "fuck": {"lemma": "fuck", "appropriate": false}
}
```

**`gap_sentences/chapter_05.json`** — list:
```json
[
  {
    "source": "Vamos a un restaurante argentino para cenar.",
    "target": "Wir gehen in ein argentinisches Restaurant zum Abendessen.",
    "covers": ["restaurante", "argentino", "cenar"],
    "word_annotations": {
      "restaurante": {"target": "Restaurant", "pos": "noun"},
      "argentino": {"target": "argentinisch", "pos": "adjective"},
      "cenar": {"target": "zu Abend essen", "pos": "verb"}
    }
  }
]
```

---

## Task 1: Add Models

**Files:**
- Modify: `spanish-content-pipeline/pipeline/models.py`

**Step 1: Add the two new models at the bottom of models.py**

```python
class FrequencyLemmaEntry(BaseModel):
    lemma: str        # Dictionary/base form
    appropriate: bool # True if relevant to deck domain (no violence, slang, junk)


class GapWordAnnotation(BaseModel):
    target: str       # Translation in native language
    pos: str          # Part of speech


class GapSentence(BaseModel):
    source: str                              # Spanish sentence
    target: str                              # German translation
    covers: list[str]                        # Lemmas this sentence is intended to cover
    word_annotations: dict[str, GapWordAnnotation] = {}  # New words introduced
```

**Step 2: Run tests to make sure nothing broke**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_models.py -v
```
Expected: all PASS

**Step 3: Commit**

```bash
git add spanish-content-pipeline/pipeline/models.py
git commit -m "feat(pipeline): add FrequencyLemmaEntry and GapSentence models"
```

---

## Task 2: FrequencyLemmatizer

**Files:**
- Create: `spanish-content-pipeline/pipeline/frequency_lemmatizer.py`
- Create: `spanish-content-pipeline/tests/test_frequency_lemmatizer.py`

### Background

The LLM is called in batches of 100 words. Each batch gets a prompt asking it to lemmatize and classify appropriateness. The output is cached to disk — if `frequency_lemmas.json` already exists, the file is returned immediately without any LLM calls. This means the lemmatizer is safe to re-run.

**Step 1: Write the failing test**

Create `tests/test_frequency_lemmatizer.py`:

```python
"""Tests for frequency_lemmatizer.py."""
import json
from unittest.mock import MagicMock

from pipeline.frequency_lemmatizer import FrequencyLemmatizer
from pipeline.models import FrequencyLemmaEntry


def _make_mock_llm(batch_responses: list[dict]) -> MagicMock:
    """Returns a mock LLMClient whose complete_json cycles through responses."""
    llm = MagicMock()
    responses = iter(batch_responses)

    def side_effect(prompt, system=None):
        r = MagicMock()
        r.parsed = next(responses)
        return r

    llm.complete_json.side_effect = side_effect
    return llm


def test_lemmatize_batch(tmp_path):
    """Lemmatizes a small word list via mock LLM."""
    words = ["voy", "fue", "restaurante", "disparar"]
    llm_response = {
        "voy": {"lemma": "ir", "appropriate": True},
        "fue": {"lemma": "ir", "appropriate": True},
        "restaurante": {"lemma": "restaurante", "appropriate": True},
        "disparar": {"lemma": "disparar", "appropriate": False},
    }
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm,
        output_dir=tmp_path,
        target_language="Spanish",
        domain="travel Spanish, Buenos Aires",
        batch_size=100,
    )
    result = lem.lemmatize(words)

    assert result["voy"] == FrequencyLemmaEntry(lemma="ir", appropriate=True)
    assert result["disparar"] == FrequencyLemmaEntry(lemma="disparar", appropriate=False)
    assert (tmp_path / "frequency_lemmas.json").exists()


def test_lemmatize_uses_cache(tmp_path):
    """Second call reads from disk; LLM is never called."""
    cached = {
        "voy": {"lemma": "ir", "appropriate": True},
    }
    (tmp_path / "frequency_lemmas.json").write_text(json.dumps(cached))

    llm = MagicMock()
    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish", domain="travel"
    )
    result = lem.lemmatize(["voy"])

    llm.complete_json.assert_not_called()
    assert result["voy"].lemma == "ir"


def test_lemmatize_batches_large_list(tmp_path):
    """Words are chunked into batches of batch_size."""
    words = [f"word{i}" for i in range(150)]
    batch1_response = {w: {"lemma": w, "appropriate": True} for w in words[:100]}
    batch2_response = {w: {"lemma": w, "appropriate": True} for w in words[100:]}
    llm = _make_mock_llm([batch1_response, batch2_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        domain="travel", batch_size=100
    )
    result = lem.lemmatize(words)

    assert llm.complete_json.call_count == 2
    assert len(result) == 150


def test_lemmatize_filters_function_words(tmp_path):
    """Function words (articles, prepositions) are skipped — not sent to LLM."""
    from pipeline.coverage_checker import SPANISH_FUNCTION_WORDS
    words = ["de", "la", "restaurante"]  # first two are function words
    llm_response = {"restaurante": {"lemma": "restaurante", "appropriate": True}}
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish", domain="travel"
    )
    result = lem.lemmatize(words)

    # Function words were not sent to LLM
    prompt_text = llm.complete_json.call_args[0][0]
    assert "de" not in prompt_text
    assert "restaurante" in prompt_text
```

**Step 2: Run test to confirm it fails**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_frequency_lemmatizer.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'pipeline.frequency_lemmatizer'`

**Step 3: Implement `pipeline/frequency_lemmatizer.py`**

```python
"""Pass 0: LLM-powered frequency word lemmatization and domain filtering.

Batch-lemmatizes the top-N words from a frequency file and classifies them
as appropriate/inappropriate for the deck domain. Results cached to disk.
"""

import json
from pathlib import Path

from pipeline.coverage_checker import SPANISH_FUNCTION_WORDS
from pipeline.models import FrequencyLemmaEntry


class FrequencyLemmatizer:
    """Lemmatize frequency words via LLM, cached to disk.

    Args:
        llm: LLMClient or GeminiClient instance.
        output_dir: Directory to save/load frequency_lemmas.json.
        target_language: Human-readable language name, e.g. "Spanish".
        domain: Short domain description for appropriateness filtering,
                e.g. "travel Spanish, Buenos Aires".
        batch_size: Number of words per LLM call (default 100).
        function_words: Words to skip (already known, not worth lemmatizing).
    """

    CACHE_FILE = "frequency_lemmas.json"

    def __init__(
        self,
        llm,
        output_dir: Path,
        target_language: str,
        domain: str,
        batch_size: int = 100,
        function_words: frozenset[str] = SPANISH_FUNCTION_WORDS,
    ):
        self._llm = llm
        self._output_dir = output_dir
        self._language = target_language
        self._domain = domain
        self._batch_size = batch_size
        self._function_words = function_words

    @property
    def cache_path(self) -> Path:
        return self._output_dir / self.CACHE_FILE

    def lemmatize(self, words: list[str]) -> dict[str, FrequencyLemmaEntry]:
        """Lemmatize words, using cache if available.

        Returns dict mapping inflected form → FrequencyLemmaEntry.
        """
        if self.cache_path.exists():
            raw = json.loads(self.cache_path.read_text())
            return {k: FrequencyLemmaEntry(**v) for k, v in raw.items()}

        to_process = [w for w in words if w not in self._function_words]
        result: dict[str, FrequencyLemmaEntry] = {}

        for i in range(0, len(to_process), self._batch_size):
            batch = to_process[i : i + self._batch_size]
            batch_result = self._lemmatize_batch(batch)
            result.update(batch_result)

        self._output_dir.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(
            json.dumps(
                {k: v.model_dump() for k, v in result.items()},
                ensure_ascii=False,
                indent=2,
            )
        )
        return result

    def _lemmatize_batch(self, words: list[str]) -> dict[str, FrequencyLemmaEntry]:
        word_list = "\n".join(words)
        system = (
            f"You are a {self._language} linguistics expert helping build a language learning deck "
            f"for the domain: {self._domain}."
        )
        prompt = (
            f"For each {self._language} word below, provide:\n"
            f'1. "lemma": the dictionary/base form (infinitive for verbs, singular masculine '
            f"for adjectives/nouns, exact form for invariable words)\n"
            f'2. "appropriate": true if this word is relevant and appropriate for the domain '
            f'"{self._domain}"; false if it is profanity, extreme violence, pure film/TV slang, '
            f"English proper names, or technical subtitle jargon irrelevant to everyday travel.\n\n"
            f"Words to process:\n{word_list}\n\n"
            f'Return JSON: {{"word1": {{"lemma": "...", "appropriate": true}}, ...}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw: dict = response.parsed

        entries: dict[str, FrequencyLemmaEntry] = {}
        for word in words:
            if word in raw:
                entry = raw[word]
                entries[word] = FrequencyLemmaEntry(
                    lemma=str(entry.get("lemma", word)).lower().strip(),
                    appropriate=bool(entry.get("appropriate", True)),
                )
            else:
                # LLM skipped this word — assume identity + appropriate
                entries[word] = FrequencyLemmaEntry(lemma=word, appropriate=True)
        return entries
```

**Step 4: Run tests to confirm they pass**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_frequency_lemmatizer.py -v
```
Expected: all 4 PASS

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/frequency_lemmatizer.py \
        spanish-content-pipeline/tests/test_frequency_lemmatizer.py
git commit -m "feat(pipeline): add FrequencyLemmatizer (Pass 0) with disk caching"
```

---

## Task 3: Update Coverage Checker to Use frequency_lemmas

**Files:**
- Modify: `spanish-content-pipeline/pipeline/coverage_checker.py`
- Modify: `spanish-content-pipeline/tests/test_coverage_checker.py`

### Background

`check_coverage()` currently has three lemma-resolution steps (word extractor map → hardcoded SPANISH_VERB_FORMS → exact match). We add a fourth: LLM-derived frequency_lemmas. Additionally, words where `appropriate=False` are excluded from the "missing" list so they don't pollute the gap analysis.

The hardcoded `SPANISH_VERB_FORMS` is NOT removed yet — it stays as a safety fallback. But the frequency_lemmas take precedence over it.

**Step 1: Write the new failing tests**

Add to `tests/test_coverage_checker.py`:

```python
from pipeline.models import FrequencyLemmaEntry


def test_check_coverage_uses_frequency_lemmas():
    """frequency_lemmas provides lemma resolution for inflected forms."""
    vocab = [
        VocabularyEntry(id="ir", source="ir", target=["gehen"], pos="verb",
                        frequency_rank=10, cefr_level="A1", examples=[]),
    ]
    frequency_data = {"voy": 1, "vas": 2, "ir": 3, "restaurante": 4}
    frequency_lemmas = {
        "voy": FrequencyLemmaEntry(lemma="ir", appropriate=True),
        "vas": FrequencyLemmaEntry(lemma="ir", appropriate=True),
    }

    report = check_coverage(vocab, frequency_data, top_n=10,
                            frequency_lemmas=frequency_lemmas)

    # voy and vas resolve to "ir" which we have — should be covered
    assert report.top_1000_covered == 3  # ir, voy, vas all resolve to "ir"


def test_check_coverage_filters_inappropriate_words():
    """Words marked appropriate=False are excluded from missing list."""
    vocab = []
    frequency_data = {"restaurante": 1, "disparar": 2, "asesino": 3}
    frequency_lemmas = {
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
        "disparar": FrequencyLemmaEntry(lemma="disparar", appropriate=False),
        "asesino": FrequencyLemmaEntry(lemma="asesino", appropriate=False),
    }

    report = check_coverage(vocab, frequency_data, top_n=10,
                            frequency_lemmas=frequency_lemmas)

    # disparar and asesino filtered out; only restaurante is a genuine gap
    assert "disparar" not in report.missing_top_100
    assert "asesino" not in report.missing_top_100
    assert "restaurante" in report.missing_top_100
```

**Step 2: Run tests to confirm they fail**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_coverage_checker.py -v -k "frequency_lemmas or inappropriate"
```
Expected: FAIL (signature mismatch / assertion errors)

**Step 3: Update `check_coverage` signature and logic**

In `coverage_checker.py`, update `check_coverage`:

```python
def check_coverage(
    vocab: OrderedDeck | list[VocabularyEntry],
    frequency_data: dict[str, int],
    top_n: int = 1000,
    extra_thresholds: list[int] | None = None,
    inflection_to_lemma: dict[str, str] | None = None,
    frequency_lemmas: dict | None = None,  # dict[str, FrequencyLemmaEntry]
) -> CoverageReport:
```

Update the lemma resolution logic:

```python
    # Build merged lemma map: frequency_lemmas > inflection_to_lemma > SPANISH_VERB_FORMS
    merged_map: dict[str, str] = {**SPANISH_VERB_FORMS}
    if inflection_to_lemma:
        merged_map.update(inflection_to_lemma)
    if frequency_lemmas:
        for word, entry in frequency_lemmas.items():
            merged_map[word] = entry.lemma
```

Update the inappropriate word filter — before building `top_words`, collect inappropriate lemmas:

```python
    inappropriate_lemmas: set[str] = set()
    if frequency_lemmas:
        inappropriate_lemmas = {
            entry.lemma for entry in frequency_lemmas.values()
            if not entry.appropriate
        }
        # Also exclude the raw inflected forms
        inappropriate_lemmas |= {
            word for word, entry in frequency_lemmas.items()
            if not entry.appropriate
        }
```

Update `missing` computation:

```python
    missing = {w for w in top_words if not is_covered(w) and w not in inappropriate_lemmas}
```

**Step 4: Run all coverage checker tests**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_coverage_checker.py -v
```
Expected: all PASS

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/coverage_checker.py \
        spanish-content-pipeline/tests/test_coverage_checker.py
git commit -m "feat(pipeline): integrate frequency_lemmas into coverage checker"
```

---

## Task 4: GapFiller

**Files:**
- Create: `spanish-content-pipeline/pipeline/gap_filler.py`
- Create: `spanish-content-pipeline/tests/test_gap_filler.py`

### Background

Two LLM calls per run:

**Call A — LLM Assignment (one call, all chapters + all missing words, cached):**
The LLM receives a compact summary of all chapters plus the full missing-word list. It assigns each word to the most appropriate chapter, with a soft instruction to distribute words roughly evenly — only cluster words together when the topical fit is strong (e.g. "restaurante" clearly belongs to the dining chapter). Output cached as `gap_word_assignment.json`.

**Call B — LLM Generation (one call per chapter):**
The LLM receives the existing sentences for that chapter (loaded from `translations/chapter_NN.json`) plus its assigned missing words. It is told to cover **all** assigned words, using **at most 3 new target words per sentence**, generating as many sentences as needed. This lets the LLM write 2 sentences for 5 words or 8 sentences for 20 words without us prescribing a count. Existing sentences provide style/tone/character context. Skips chapters with an existing `gap_sentences/chapter_NN.json` file.

### New Output File

```
output/<deck-id>/
  gap_word_assignment.json       # LLM assignment (cached)
  gap_sentences/
    chapter_01.json              # generation output (cached per chapter)
```

**`gap_word_assignment.json`:**
```json
{"restaurante": 5, "caminar": 3, "metro": 8, "dinero": 2}
```

**Step 1: Write failing tests**

Create `tests/test_gap_filler.py`:

```python
"""Tests for gap_filler.py."""
import json
from pathlib import Path
from unittest.mock import MagicMock, call

import pytest

from pipeline.gap_filler import GapFiller
from pipeline.models import (
    DeckChapter, FrequencyLemmaEntry, GapSentence, GapWordAnnotation,
    OrderedDeck, SentencePair, VocabularyEntry,
)


def _make_deck(words_by_chapter: dict[int, list[str]]) -> OrderedDeck:
    chapters = [
        DeckChapter(
            chapter=ch,
            title=f"Chapter {ch}",
            words=[
                VocabularyEntry(id=w, source=w, target=[w], pos="noun",
                                first_chapter=ch, order=i, examples=[])
                for i, w in enumerate(words)
            ],
        )
        for ch, words in words_by_chapter.items()
    ]
    return OrderedDeck(
        deck_id="test", deck_name="Test",
        total_words=sum(len(w) for w in words_by_chapter.values()),
        chapters=chapters,
    )


def _make_chapter_defs():
    return [
        {"title": "At the Airport", "context": "Maria arrives and takes a taxi",
         "vocab_focus": ["airport", "taxi", "luggage"], "cefr_level": "A1"},
        {"title": "At the Restaurant", "context": "Ordering food at a local restaurant",
         "vocab_focus": ["restaurant", "menu", "food", "order"], "cefr_level": "A2"},
    ]


def _make_mock_llm(responses: list[dict]) -> MagicMock:
    """Cycles through JSON responses for successive complete_json calls."""
    llm = MagicMock()
    it = iter(responses)

    def side_effect(prompt, system=None):
        r = MagicMock()
        r.parsed = next(it)
        return r

    llm.complete_json.side_effect = side_effect
    return llm


def _write_translations(tmp_path: Path, chapter_num: int, sentences: list[dict]):
    trans_dir = tmp_path / "translations"
    trans_dir.mkdir(exist_ok=True)
    path = trans_dir / f"chapter_{chapter_num:02d}.json"
    path.write_text(json.dumps(sentences))


def test_gap_filler_calls_assignment_then_generation(tmp_path):
    """First LLM call does assignment; second does sentence generation."""
    deck = _make_deck({1: ["avión"], 2: ["comer"]})
    frequency_lemmas = {
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
        "caminar": FrequencyLemmaEntry(lemma="caminar", appropriate=True),
    }
    frequency_data = {"avión": 5, "comer": 10, "restaurante": 15, "caminar": 20}

    # Write existing translations for chapter 2
    _write_translations(tmp_path / "test", 2, [
        {"chapter": 2, "sentence_index": 0,
         "source": "María pide la carta.", "target": "Maria bittet um die Speisekarte."}
    ])

    assignment_response = {"restaurante": 2, "caminar": 1}
    generation_response = {
        "sentences": [
            {"source": "Caminamos por el parque.",
             "target": "Wir gehen durch den Park.",
             "covers": ["caminar"],
             "word_annotations": {"caminar": {"target": "gehen/laufen", "pos": "verb"}}},
        ]
    }
    generation_response_2 = {
        "sentences": [
            {"source": "Vamos al restaurante.",
             "target": "Wir gehen ins Restaurant.",
             "covers": ["restaurante"],
             "word_annotations": {"restaurante": {"target": "Restaurant", "pos": "noun"}}},
        ]
    }
    llm = _make_mock_llm([assignment_response, generation_response, generation_response_2])

    filler = GapFiller(
        llm=llm,
        output_dir=tmp_path / "test",
        config_chapters=_make_chapter_defs(),
        target_language="Spanish",
        native_language="German",
        dialect="Rioplatense (vos, che)",
    )
    results = filler.fill_gaps(
        deck=deck,
        frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas,
        top_n=1000,
    )

    # Assignment call + one generation call per chapter with words
    assert llm.complete_json.call_count == 3
    assert isinstance(results, dict)
    assert any(len(s) > 0 for s in results.values())

    # Assignment cached to disk
    assert (tmp_path / "test" / "gap_word_assignment.json").exists()


def test_gap_filler_uses_cached_assignment(tmp_path):
    """If gap_word_assignment.json exists, assignment LLM call is skipped."""
    deck = _make_deck({2: ["comer"]})
    frequency_lemmas = {
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
    }
    frequency_data = {"comer": 10, "restaurante": 15}

    out_dir = tmp_path / "test"
    out_dir.mkdir()
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"restaurante": 2}))
    _write_translations(out_dir, 2, [])

    generation_response = {"sentences": [
        {"source": "Vamos al restaurante.",
         "target": "Wir gehen ins Restaurant.",
         "covers": ["restaurante"],
         "word_annotations": {"restaurante": {"target": "Restaurant", "pos": "noun"}}}
    ]}
    llm = _make_mock_llm([generation_response])

    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    # Only one call (generation) — assignment was cached
    assert llm.complete_json.call_count == 1


def test_gap_filler_skips_cached_chapter_sentences(tmp_path):
    """Chapters with existing gap_sentences files skip generation."""
    deck = _make_deck({2: ["comer"]})
    frequency_lemmas = {
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
    }
    frequency_data = {"comer": 10, "restaurante": 15}

    out_dir = tmp_path / "test"
    (out_dir / "gap_sentences").mkdir(parents=True)
    (out_dir / "gap_sentences" / "chapter_02.json").write_text("[]")
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"restaurante": 2}))

    llm = MagicMock()
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    llm.complete_json.assert_not_called()


def test_gap_filler_no_gaps(tmp_path):
    """When all top-N words are already covered, returns empty dict immediately."""
    deck = _make_deck({1: ["comer", "ir"]})
    frequency_data = {"comer": 1, "ir": 2}
    frequency_lemmas = {
        "comer": FrequencyLemmaEntry(lemma="comer", appropriate=True),
        "ir": FrequencyLemmaEntry(lemma="ir", appropriate=True),
    }

    llm = MagicMock()
    filler = GapFiller(
        llm=llm, output_dir=tmp_path, config_chapters=[],
        target_language="Spanish", native_language="German", dialect="",
    )
    results = filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=10,
    )

    assert results == {}
    llm.complete_json.assert_not_called()


def test_gap_filler_assignment_prompt_mentions_equal_distribution(tmp_path):
    """Assignment prompt instructs LLM to distribute words across chapters."""
    deck = _make_deck({1: []})
    frequency_lemmas = {
        "palabra": FrequencyLemmaEntry(lemma="palabra", appropriate=True),
    }
    frequency_data = {"palabra": 50}

    llm = _make_mock_llm([{"palabra": 1}, {"sentences": []}])
    filler = GapFiller(
        llm=llm, output_dir=tmp_path, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    assignment_prompt = llm.complete_json.call_args_list[0][0][0]
    assert "equal" in assignment_prompt.lower() or "evenly" in assignment_prompt.lower() or "distribut" in assignment_prompt.lower()


def test_gap_filler_generation_prompt_includes_existing_sentences(tmp_path):
    """Generation prompt includes existing chapter sentences for style context."""
    deck = _make_deck({1: []})
    frequency_lemmas = {
        "caminar": FrequencyLemmaEntry(lemma="caminar", appropriate=True),
    }
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_translations(out_dir, 1, [
        {"chapter": 1, "sentence_index": 0,
         "source": "María llega al aeropuerto.", "target": "Maria kommt am Flughafen an."}
    ])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    llm = _make_mock_llm([{"sentences": []}])
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    generation_prompt = llm.complete_json.call_args_list[0][0][0]
    assert "María llega al aeropuerto" in generation_prompt


def test_gap_filler_generation_prompt_mentions_max_words_per_sentence(tmp_path):
    """Generation prompt specifies max new target words per sentence."""
    deck = _make_deck({1: []})
    frequency_lemmas = {
        "caminar": FrequencyLemmaEntry(lemma="caminar", appropriate=True),
    }
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_translations(out_dir, 1, [])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    llm = _make_mock_llm([{"sentences": []}])
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
        max_new_words_per_sentence=3,
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    generation_prompt = llm.complete_json.call_args_list[0][0][0]
    assert "3" in generation_prompt
```

**Step 2: Run tests to confirm they fail**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_gap_filler.py -v
```
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Implement `pipeline/gap_filler.py`**

```python
"""Pass 3b: Gap-filling sentence generation.

Two LLM calls:
  A) One assignment call: all missing words + all chapter summaries → word→chapter map.
  B) One generation call per chapter: existing sentences + assigned words → new sentences.

Both are cached to disk.
"""

import json
from pathlib import Path

from pipeline.coverage_checker import check_coverage
from pipeline.models import (
    FrequencyLemmaEntry, GapSentence, GapWordAnnotation, OrderedDeck, SentencePair,
)


class GapFiller:
    """Generate gap-filling sentences for missing high-frequency vocabulary.

    Args:
        llm: LLMClient or GeminiClient instance.
        output_dir: Deck output directory (gap_sentences/ and assignment file saved here).
        config_chapters: List of ChapterDef objects or dicts
                         (title, context, vocab_focus, cefr_level).
        target_language: e.g. "Spanish".
        native_language: e.g. "German".
        dialect: e.g. "Rioplatense (vos, che)". Empty string = no dialect note.
        max_new_words_per_sentence: LLM is told to use at most this many new
                                    target words per generated sentence (default 3).
    """

    ASSIGNMENT_FILE = "gap_word_assignment.json"

    def __init__(
        self,
        llm,
        output_dir: Path,
        config_chapters: list,
        target_language: str,
        native_language: str,
        dialect: str,
        max_new_words_per_sentence: int = 3,
    ):
        self._llm = llm
        self._output_dir = output_dir
        self._chapters = config_chapters
        self._target_lang = target_language
        self._native_lang = native_language
        self._dialect = dialect
        self._max_new_words = max_new_words_per_sentence

    @property
    def gap_dir(self) -> Path:
        return self._output_dir / "gap_sentences"

    @property
    def assignment_path(self) -> Path:
        return self._output_dir / self.ASSIGNMENT_FILE

    def fill_gaps(
        self,
        deck: OrderedDeck,
        frequency_data: dict[str, int],
        frequency_lemmas: dict[str, FrequencyLemmaEntry],
        top_n: int = 1000,
    ) -> dict[int, list[GapSentence]]:
        """Assign missing words to chapters and generate gap sentences.

        Returns dict mapping chapter number → list of GapSentence.
        Caches assignment and per-chapter sentences to disk.
        """
        report = check_coverage(
            deck, frequency_data, top_n=top_n, frequency_lemmas=frequency_lemmas
        )
        missing = report.missing_top_100

        if not missing:
            return {}

        # Call A: assign words to chapters (cached)
        assignment = self._get_assignment(missing)

        results: dict[int, list[GapSentence]] = {}
        self.gap_dir.mkdir(parents=True, exist_ok=True)

        for chapter_num, words in sorted(assignment.items()):
            cache_path = self.gap_dir / f"chapter_{chapter_num:02d}.json"
            if cache_path.exists():
                raw = json.loads(cache_path.read_text())
                results[chapter_num] = [GapSentence(**s) for s in raw]
                continue

            # Call B: generate sentences for this chapter
            existing = self._load_existing_sentences(chapter_num)
            ch_def = self._chapters[chapter_num - 1] if chapter_num <= len(self._chapters) else None
            sentences = self._generate_sentences(chapter_num, ch_def, words, existing)
            results[chapter_num] = sentences

            cache_path.write_text(
                json.dumps([s.model_dump() for s in sentences], ensure_ascii=False, indent=2)
            )

        return results

    # ------------------------------------------------------------------ #
    # Call A: Assignment                                                   #
    # ------------------------------------------------------------------ #

    def _get_assignment(self, missing_words: list[str]) -> dict[int, list[str]]:
        """Return word→chapter assignment, using cache if available."""
        if self.assignment_path.exists():
            raw = json.loads(self.assignment_path.read_text())
            # raw is {word: chapter_num}
            assignment: dict[int, list[str]] = {}
            for word, ch in raw.items():
                assignment.setdefault(int(ch), []).append(word)
            return assignment

        raw_assignment = self._assign_via_llm(missing_words)

        self._output_dir.mkdir(parents=True, exist_ok=True)
        self.assignment_path.write_text(
            json.dumps(raw_assignment, ensure_ascii=False, indent=2)
        )

        assignment: dict[int, list[str]] = {}
        for word, ch in raw_assignment.items():
            assignment.setdefault(int(ch), []).append(word)
        return assignment

    def _assign_via_llm(self, missing_words: list[str]) -> dict[str, int]:
        """Single LLM call: assign each missing word to a chapter number."""
        chapter_count = len(self._chapters)
        target_per_chapter = max(1, len(missing_words) // max(1, chapter_count))

        chapter_summaries = []
        for idx, ch in enumerate(self._chapters, start=1):
            if hasattr(ch, "title"):
                title, context, vocab_focus, cefr = ch.title, ch.context, ch.vocab_focus, ch.cefr_level
            else:
                title = ch.get("title", f"Chapter {idx}")
                context = ch.get("context", "")
                vocab_focus = ch.get("vocab_focus", [])
                cefr = ch.get("cefr_level", "")
            chapter_summaries.append(
                f"  {idx}. [{cefr}] \"{title}\" — {context}. Focus: {', '.join(vocab_focus)}"
            )

        chapters_text = "\n".join(chapter_summaries)
        words_text = ", ".join(missing_words)

        system = (
            f"You are a curriculum designer for a {self._target_lang} language learning deck."
        )
        prompt = (
            f"The following {self._target_lang} words are missing from our vocabulary deck "
            f"and need to be introduced in new example sentences.\n\n"
            f"Chapters ({chapter_count} total):\n{chapters_text}\n\n"
            f"Missing words: {words_text}\n\n"
            f"Assign each word to the most appropriate chapter number (1–{chapter_count}).\n\n"
            f"Rules:\n"
            f"1. Distribute words roughly evenly — aim for ~{target_per_chapter} words per chapter.\n"
            f"2. Only cluster multiple words in one chapter when the topical fit is clearly strong "
            f"(e.g. all food words → dining chapter). Otherwise spread them out.\n"
            f"3. Match CEFR level: A1 words → early chapters, B2 words → late chapters.\n\n"
            f'Return JSON: {{"word1": chapter_number, "word2": chapter_number, ...}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw: dict = response.parsed

        # Validate and clamp chapter numbers
        result: dict[str, int] = {}
        for word in missing_words:
            ch_num = raw.get(word, 1)
            result[word] = max(1, min(chapter_count, int(ch_num)))
        return result

    # ------------------------------------------------------------------ #
    # Call B: Generation                                                   #
    # ------------------------------------------------------------------ #

    def _load_existing_sentences(self, chapter_num: int) -> list[SentencePair]:
        """Load existing translations for a chapter from disk (if available)."""
        path = self._output_dir / "translations" / f"chapter_{chapter_num:02d}.json"
        if not path.exists():
            return []
        raw = json.loads(path.read_text())
        return [SentencePair(**p) for p in raw]

    def _generate_sentences(
        self,
        chapter_num: int,
        ch_def,
        words: list[str],
        existing_sentences: list[SentencePair],
    ) -> list[GapSentence]:
        """Generate sentences covering all `words`, using existing sentences for context."""
        if hasattr(ch_def, "title") and ch_def is not None:
            title = ch_def.title
            context = ch_def.context
            cefr_level = ch_def.cefr_level or "A2"
        elif ch_def:
            title = ch_def.get("title", f"Chapter {chapter_num}")
            context = ch_def.get("context", "")
            cefr_level = ch_def.get("cefr_level", "A2")
        else:
            title = f"Chapter {chapter_num}"
            context = ""
            cefr_level = "A2"

        existing_text = ""
        if existing_sentences:
            lines = [f'  "{s.source}"' for s in existing_sentences[:10]]
            existing_text = (
                f"\nExisting chapter sentences (for style/tone reference):\n"
                + "\n".join(lines)
                + "\n"
            )

        dialect_note = f" Use {self._dialect} dialect." if self._dialect else ""
        words_text = ", ".join(words)

        system = (
            f"You are a {self._target_lang} language learning content creator. "
            f"You write natural, authentic sentences at the specified CEFR level."
        )
        prompt = (
            f"Chapter {chapter_num}: \"{title}\"\n"
            f"Context: {context}\n"
            f"CEFR level: {cefr_level}{existing_text}\n"
            f"Words to introduce: {words_text}\n\n"
            f"Generate sentences that cover ALL of the words above. Rules:\n"
            f"1. Use at most {self._max_new_words} of the listed words per sentence.\n"
            f"2. Generate as many sentences as needed until every word is covered.\n"
            f"3. Each sentence must fit the chapter context and CEFR level.\n"
            f"4. Match the tone and style of the existing sentences above.{dialect_note}\n\n"
            f"Return JSON:\n"
            f'{{\n'
            f'  "sentences": [\n'
            f'    {{\n'
            f'      "source": "{self._target_lang} sentence",\n'
            f'      "target": "{self._native_lang} translation",\n'
            f'      "covers": ["lemma1", "lemma2"],\n'
            f'      "word_annotations": {{\n'
            f'        "lemma1": {{"target": "{self._native_lang} translation", "pos": "noun"}}\n'
            f'      }}\n'
            f'    }}\n'
            f'  ]\n'
            f'}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw_sentences: list[dict] = response.parsed.get("sentences", [])

        result = []
        for s in raw_sentences:
            word_annotations = {
                k: GapWordAnnotation(**v)
                for k, v in s.get("word_annotations", {}).items()
            }
            result.append(GapSentence(
                source=s.get("source", ""),
                target=s.get("target", ""),
                covers=s.get("covers", []),
                word_annotations=word_annotations,
            ))
        return result
```

**Step 4: Run tests**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_gap_filler.py -v
```
Expected: all 7 PASS

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/gap_filler.py \
        spanish-content-pipeline/tests/test_gap_filler.py
git commit -m "feat(pipeline): add GapFiller with LLM assignment and sentence generation"
```

---

## Task 5: Update VocabularyBuilder to Merge Gap Sentences

**Files:**
- Modify: `spanish-content-pipeline/pipeline/vocabulary_builder.py`
- Modify: `spanish-content-pipeline/tests/test_vocabulary_builder.py`

### Background

After gap_sentences are generated, we need to merge them into the vocabulary deck. For each GapSentence, we:
1. Look up each word in `covers` against existing vocab entries (by lemma)
2. If the word is already in the deck: add the gap sentence as a new example SentencePair
3. If the word is new (genuinely missing): create a new VocabularyEntry using `word_annotations`

New entries are appended to the chapter they were assigned to (from the gap filler output).

**Step 1: Write failing test**

Add to `tests/test_vocabulary_builder.py`:

```python
from pipeline.vocabulary_builder import merge_gap_sentences
from pipeline.models import GapSentence, GapWordAnnotation


def test_merge_gap_sentences_adds_new_word():
    """New words from gap sentences become new VocabularyEntries."""
    deck = OrderedDeck(
        deck_id="test", deck_name="Test", total_words=1,
        chapters=[
            DeckChapter(chapter=1, title="Ch1", words=[
                VocabularyEntry(id="comer", source="comer", target=["essen"],
                                pos="verb", first_chapter=1, order=1, examples=[])
            ])
        ],
    )
    gap_sentences = {
        1: [
            GapSentence(
                source="Vamos al restaurante.",
                target="Wir gehen ins Restaurant.",
                covers=["restaurante"],
                word_annotations={
                    "restaurante": GapWordAnnotation(target="Restaurant", pos="noun")
                },
            )
        ]
    }

    updated = merge_gap_sentences(deck, gap_sentences)

    ch1_lemmas = {w.id for w in updated.chapters[0].words}
    assert "restaurante" in ch1_lemmas


def test_merge_gap_sentences_adds_example_to_existing_word():
    """If the covered word already exists, the gap sentence is added as an example."""
    from pipeline.models import SentencePair
    existing = SentencePair(chapter=1, sentence_index=0,
                            source="Me gusta comer.", target="Ich esse gern.")
    deck = OrderedDeck(
        deck_id="test", deck_name="Test", total_words=1,
        chapters=[
            DeckChapter(chapter=1, title="Ch1", words=[
                VocabularyEntry(id="comer", source="comer", target=["essen"],
                                pos="verb", first_chapter=1, order=1,
                                examples=[existing])
            ])
        ],
    )
    gap_sentences = {
        1: [
            GapSentence(
                source="Quiero comer algo rico.",
                target="Ich möchte etwas Leckeres essen.",
                covers=["comer"],
                word_annotations={},
            )
        ]
    }

    updated = merge_gap_sentences(deck, gap_sentences)

    comer_entry = next(w for w in updated.chapters[0].words if w.id == "comer")
    assert len(comer_entry.examples) == 2
```

**Step 2: Run tests to confirm they fail**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_vocabulary_builder.py -v -k "gap"
```
Expected: FAIL with `ImportError: cannot import name 'merge_gap_sentences'`

**Step 3: Add `merge_gap_sentences` to `vocabulary_builder.py`**

```python
from pipeline.models import (
    ChapterWords, DeckChapter, GapSentence, OrderedDeck, SentencePair,
    VocabularyEntry, WordAnnotation,
)


def merge_gap_sentences(
    deck: OrderedDeck,
    gap_sentences: dict[int, list[GapSentence]],
    frequency_data: dict[str, int] | None = None,
) -> OrderedDeck:
    """Merge gap-filling sentences into an existing vocabulary deck.

    - Words in `covers` that already exist get the gap sentence appended as example.
    - New words (not yet in the deck) get a new VocabularyEntry created from
      word_annotations and appended to the assigned chapter.

    Returns a new OrderedDeck (does not mutate the input).
    """
    if frequency_data is None:
        frequency_data = {}

    # Build flat lookup: lemma -> VocabularyEntry (mutable copy)
    all_entries: dict[str, VocabularyEntry] = {}
    new_chapters = []
    for ch in deck.chapters:
        new_words = list(ch.words)  # shallow copy of list
        for w in new_words:
            all_entries[w.id] = w
        new_chapters.append(DeckChapter(chapter=ch.chapter, title=ch.title, words=new_words))

    next_order = deck.total_words + 1

    for chapter_num, sentences in gap_sentences.items():
        # Find matching chapter in new_chapters
        ch_idx = next(
            (i for i, c in enumerate(new_chapters) if c.chapter == chapter_num), None
        )
        if ch_idx is None:
            continue

        for gap_sent in sentences:
            # Build a SentencePair to use as example
            example = SentencePair(
                chapter=chapter_num,
                sentence_index=-1,  # Gap sentence marker
                source=gap_sent.source,
                target=gap_sent.target,
            )

            for lemma in gap_sent.covers:
                lemma = lemma.lower().strip()
                if lemma in all_entries:
                    # Add example to existing entry
                    entry = all_entries[lemma]
                    if example not in entry.examples:
                        entry.examples.append(example)
                elif lemma in gap_sent.word_annotations:
                    # Create new entry from annotation
                    ann = gap_sent.word_annotations[lemma]
                    new_entry = VocabularyEntry(
                        id=lemma,
                        source=lemma,
                        target=[ann.target],
                        pos=ann.pos,
                        frequency_rank=frequency_data.get(lemma),
                        cefr_level=assign_cefr_level(frequency_data.get(lemma)),
                        first_chapter=chapter_num,
                        order=next_order,
                        examples=[example],
                    )
                    next_order += 1
                    all_entries[lemma] = new_entry
                    new_chapters[ch_idx].words.append(new_entry)

    return OrderedDeck(
        deck_id=deck.deck_id,
        deck_name=deck.deck_name,
        total_words=next_order - 1,
        chapters=new_chapters,
    )
```

**Step 4: Run all vocabulary builder tests**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_vocabulary_builder.py -v
```
Expected: all PASS

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/vocabulary_builder.py \
        spanish-content-pipeline/tests/test_vocabulary_builder.py
git commit -m "feat(pipeline): add merge_gap_sentences to vocabulary builder"
```

---

## Task 6: Wire Up run_all.py

**Files:**
- Modify: `spanish-content-pipeline/scripts/run_all.py`

### Background

Two new stages added to `--stage`:
- `lemmatize`: runs Pass 0 — lemmatizes the frequency file and saves `frequency_lemmas.json`
- `fill-gaps`: runs Pass 3b — generates gap sentences and rebuilds vocabulary

The `all` stage now also runs `lemmatize` and `fill-gaps` between text and media.

**Step 1: Extend the argparse choices**

Change:
```python
parser.add_argument("--stage", default="text", choices=["text", "media", "all"], ...)
```
To:
```python
parser.add_argument("--stage", default="text",
                    choices=["text", "lemmatize", "fill-gaps", "media", "all"],
                    help=(
                        "text = story/translations/vocab (default); "
                        "lemmatize = Pass 0: LLM lemmatize frequency file; "
                        "fill-gaps = Pass 3b: gap sentences + rebuild vocab; "
                        "media = images/audio; "
                        "all = text + lemmatize + fill-gaps + media"
                    ))
```

**Step 2: Add `run_lemmatize_stage` function**

```python
def run_lemmatize_stage(config, llm, output_base, frequency_file):
    """Pass 0: LLM-lemmatize frequency file. Cached — safe to re-run."""
    from pipeline.frequency_lemmatizer import FrequencyLemmatizer
    from pipeline.coverage_checker import load_frequency_data

    if not frequency_file:
        print("Error: --frequency-file required for lemmatize stage")
        sys.exit(1)

    freq_path = Path(frequency_file)
    if not freq_path.exists():
        print(f"Error: frequency file not found: {freq_path}")
        sys.exit(1)

    out_dir = output_base / config.deck.id
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=== Pass 0: Frequency Lemmatization ===")
    frequency_data = load_frequency_data(freq_path)

    lem = FrequencyLemmatizer(
        llm=llm,
        output_dir=out_dir,
        target_language=config.languages.target,
        domain=f"travel {config.languages.target}, {config.destination.city}",
    )

    top_words = sorted(
        [w for w in frequency_data if frequency_data[w] <= 5000],
        key=lambda w: frequency_data[w],
    )
    result = lem.lemmatize(top_words)
    appropriate = sum(1 for e in result.values() if e.appropriate)
    print(f"  {len(result)} words lemmatized, {appropriate} appropriate for deck")
    print(f"  Saved to {lem.cache_path}")
```

**Step 3: Add `run_fill_gaps_stage` function**

```python
def run_fill_gaps_stage(config, llm, output_base, frequency_file):
    """Pass 3b: Generate gap-filling sentences and rebuild vocabulary."""
    import json
    from pipeline.coverage_checker import load_frequency_data
    from pipeline.gap_filler import GapFiller
    from pipeline.models import FrequencyLemmaEntry, OrderedDeck
    from pipeline.vocabulary_builder import merge_gap_sentences

    out_dir = output_base / config.deck.id
    vocab_path = out_dir / "vocabulary.json"
    lemma_path = out_dir / "frequency_lemmas.json"

    if not vocab_path.exists():
        print("Error: vocabulary.json not found. Run --stage text first.")
        sys.exit(1)
    if not lemma_path.exists():
        print("Error: frequency_lemmas.json not found. Run --stage lemmatize first.")
        sys.exit(1)

    print("=== Pass 3b: Gap Filling ===")
    deck = OrderedDeck(**json.loads(vocab_path.read_text()))
    raw_lemmas = json.loads(lemma_path.read_text())
    frequency_lemmas = {k: FrequencyLemmaEntry(**v) for k, v in raw_lemmas.items()}

    frequency_data = {}
    if frequency_file:
        from pipeline.coverage_checker import load_frequency_data
        freq_path = Path(frequency_file)
        if freq_path.exists():
            frequency_data = load_frequency_data(freq_path)

    filler = GapFiller(
        llm=llm,
        output_dir=out_dir,
        config_chapters=config.story.chapters,
        target_language=config.languages.target,
        native_language=config.languages.native,
        dialect=config.languages.dialect,
    )
    gap_results = filler.fill_gaps(
        deck=deck,
        frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas,
        top_n=1000,
    )

    if not gap_results:
        print("  No gaps to fill.")
        return

    total_sentences = sum(len(s) for s in gap_results.values())
    print(f"  Generated {total_sentences} gap sentences across {len(gap_results)} chapters")

    # Rebuild vocabulary with gap sentences merged
    updated_deck = merge_gap_sentences(deck, gap_results, frequency_data)
    vocab_path.write_text(json.dumps(updated_deck.model_dump(), ensure_ascii=False, indent=2))
    print(f"  Vocabulary rebuilt: {updated_deck.total_words} words (was {deck.total_words})")
```

**Step 4: Update `main()` to route new stages**

In `main()`, update the stage routing:
```python
    if args.stage in ("lemmatize", "all"):
        api_key = get_api_key(config)
        llm = create_client(...)
        run_lemmatize_stage(config, llm, output_base, args.frequency_file)

    if args.stage in ("text", "all"):
        # ... existing text stage ...
        run_text_stage(config, llm, chapter_range, output_base, args.frequency_file, args.config)

    if args.stage in ("fill-gaps", "all"):
        api_key = get_api_key(config)
        llm = create_client(...)
        run_fill_gaps_stage(config, llm, output_base, args.frequency_file)

    if args.stage in ("media", "all"):
        run_media_stage(config, chapter_range, output_base, args.skip_audio)
```

Note: `llm` may already be created by the text stage — avoid creating it twice if stages run together. Refactor: create `llm` once at the top if any text-model stage is active.

**Refactored main() stage guard:**
```python
    needs_llm = args.stage in ("text", "lemmatize", "fill-gaps", "all")
    llm = None
    if needs_llm:
        api_key = get_api_key(config)
        llm = create_client(
            provider=config.llm.provider,
            api_key=api_key,
            model=config.llm.model,
            temperature=config.llm.temperature,
            max_retries=config.llm.max_retries,
        )

    if args.stage in ("lemmatize", "all"):
        run_lemmatize_stage(config, llm, output_base, args.frequency_file)

    if args.stage in ("text", "all"):
        run_text_stage(config, llm, chapter_range, output_base, args.frequency_file, args.config)

    if args.stage in ("fill-gaps", "all"):
        run_fill_gaps_stage(config, llm, output_base, args.frequency_file)

    if args.stage in ("media", "all"):
        run_media_stage(config, chapter_range, output_base, args.skip_audio)
```

**Step 5: Update run_text_stage to use frequency_lemmas in coverage report**

In `run_text_stage`, after building coverage, load frequency_lemmas if available:
```python
    if frequency_data:
        # ... existing inflection_to_lemma build ...

        # Load frequency_lemmas if available (from prior lemmatize pass)
        from pipeline.models import FrequencyLemmaEntry
        frequency_lemmas = None
        lemma_path = output_base / config.deck.id / "frequency_lemmas.json"
        if lemma_path.exists():
            import json as _json
            raw = _json.loads(lemma_path.read_text())
            frequency_lemmas = {k: FrequencyLemmaEntry(**v) for k, v in raw.items()}

        report = check_coverage(
            deck, frequency_data,
            top_n=1000,
            extra_thresholds=[2000, 3000, 4000, 5000],
            inflection_to_lemma=inflection_to_lemma,
            frequency_lemmas=frequency_lemmas,   # NEW
        )
```

**Step 6: Run the CLI test**

```bash
cd spanish-content-pipeline && uv run pytest tests/test_cli.py -v
```
Expected: all PASS (CLI test just checks arg parsing; no real LLM calls)

**Step 7: Run full test suite**

```bash
cd spanish-content-pipeline && uv run pytest -v
```
Expected: all PASS

**Step 8: Commit**

```bash
git add spanish-content-pipeline/scripts/run_all.py
git commit -m "feat(pipeline): add lemmatize + fill-gaps stages to run_all.py"
```

---

## Final: End-to-End Usage

After implementation, the new workflow:

```bash
# One-time: LLM lemmatize top-5000 frequency words (cached)
uv run python scripts/run_all.py \
  --config configs/spanish_buenos_aires.yaml \
  --frequency-file data/frequency/es_50k.txt \
  --stage lemmatize

# Generate text (uses frequency_lemmas in coverage report if present)
uv run python scripts/run_all.py \
  --config configs/spanish_buenos_aires.yaml \
  --frequency-file data/frequency/es_50k.txt \
  --stage text

# Fill gaps (requires vocabulary.json + frequency_lemmas.json)
uv run python scripts/run_all.py \
  --config configs/spanish_buenos_aires.yaml \
  --frequency-file data/frequency/es_50k.txt \
  --stage fill-gaps

# Review gap_sentences/chapter_XX.json files manually if desired

# Generate media as usual
uv run python scripts/run_all.py \
  --config configs/spanish_buenos_aires.yaml \
  --stage media
```

**Expected coverage improvement:** from ~32% top-1000 to ~55–65% (excluding subtitle junk from the "missing" list + ~100–150 genuinely missing words covered by gap sentences).
