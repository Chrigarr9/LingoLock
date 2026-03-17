# Benchmark v3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real API cost tracking to all benchmarks, consolidate translation benchmarks with chrF scoring, parallelize model execution, and drop slow models.

**Architecture:** Pipeline classes return `(result, LLMResponse)` tuples to expose usage/cost data. A single translation benchmark uses `SentenceTranslator` with FLORES+ fixture across 10 curated language pairs, scored with chrF. The runner parallelizes models within each task via `ThreadPoolExecutor`.

**Tech Stack:** Python, sacrebleu (chrF), concurrent.futures, existing pipeline classes + LLMClient

---

### Task 1: Add sacrebleu dependency

**Files:**
- Modify: `spanish-content-pipeline/pyproject.toml`

**Step 1: Add sacrebleu to dependencies**

In `pyproject.toml`, add `"sacrebleu>=2.0"` to the `dependencies` list.

**Step 2: Install**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv sync`

**Step 3: Verify**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run python -c "import sacrebleu; print(sacrebleu.__version__)"`

**Step 4: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "chore: add sacrebleu dependency for chrF translation scoring"
```

---

### Task 2: Return LLMResponse from pipeline classes

All 8 pipeline classes that call LLM need to return `(result, LLMResponse)` tuples. The key challenge: `GapFiller` makes 2 LLM calls (assignment + generation), so it returns a list. `GrammarGapFiller` also makes 1 call.

The approach: each pipeline method stores the `LLMResponse` from `self._llm.complete_json()` and returns it alongside the domain object. When cached results are returned (file already exists), return `None` for the response.

**Files:**
- Modify: `pipeline/sentence_translator.py:40-66` — `translate_chapter()` returns `tuple[list[SentencePair], LLMResponse | None]`
- Modify: `pipeline/story_generator.py:343-382` — `generate_chapter()` returns `tuple[ChapterScene, LLMResponse | None]`
- Modify: `pipeline/cefr_simplifier.py:161-214` — `simplify_chapter()` returns `tuple[ChapterScene, LLMResponse | None]`
- Modify: `pipeline/grammar_auditor.py:26-102` — `audit_grammar()` returns `tuple[GrammarAuditReport, list[LLMResponse]]`
- Modify: `pipeline/word_extractor.py:67-137` — `extract_chapter()` returns `tuple[ChapterWords, LLMResponse | None]`
- Modify: `pipeline/gap_filler.py:72-128` — `fill_gaps()` returns `tuple[dict[int, list[GapShot]], list[LLMResponse]]`
- Modify: `pipeline/chapter_auditor.py:125-149` — `audit_chapter()` returns `tuple[list[ChapterAuditAction], LLMResponse | None]`
- Modify: `pipeline/story_auditor.py:126-154` — `audit_story()` returns `tuple[tuple[list[AuditFix], list[UnnamedCharacter]], LLMResponse | None]`
- Modify: `pipeline/grammar_gap_filler.py:49-76` — `fill_gaps()` returns `tuple[list[GrammarGapSentence], LLMResponse | None]`
- Modify: `scripts/run_all.py` — unpack all calls with `result, _ = ...`
- Test: `tests/test_pipeline_usage.py` — verify pipeline classes return usage tuples

**Step 1: Write tests for pipeline usage returns**

Create `tests/test_pipeline_usage.py`:

```python
"""Verify pipeline classes return (result, LLMResponse | None) tuples."""
import json
from dataclasses import dataclass
from unittest.mock import MagicMock
from pipeline.llm import LLMResponse, Usage


def _make_response(parsed: dict | list) -> LLMResponse:
    """Create a mock LLMResponse with usage data."""
    return LLMResponse(
        content=json.dumps(parsed),
        usage=Usage(
            prompt_tokens=100, completion_tokens=50, total_tokens=150,
            cost_usd=0.001, generation_id="gen-test-123",
        ),
        parsed=parsed,
    )


def test_sentence_translator_returns_usage(tmp_path):
    from pipeline.config import DeckConfig
    from pipeline.sentence_translator import SentenceTranslator

    config = _minimal_config()
    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "sentences": [
            {"source": "Hola mundo.", "target": "Hallo Welt."},
        ]
    })

    translator = SentenceTranslator(config, llm, output_base=tmp_path)
    result = translator.translate_chapter(0, "Hola mundo.")
    assert isinstance(result, tuple) and len(result) == 2
    pairs, response = result
    assert len(pairs) == 1
    assert response is not None
    assert response.usage.cost_usd == 0.001


def test_sentence_translator_cached_returns_none(tmp_path):
    """When result is cached, response should be None."""
    from pipeline.config import DeckConfig
    from pipeline.sentence_translator import SentenceTranslator

    config = _minimal_config()
    llm = MagicMock()

    # Pre-create cached file
    trans_dir = tmp_path / config.deck.id / "translations"
    trans_dir.mkdir(parents=True)
    (trans_dir / "chapter_01.json").write_text(json.dumps([
        {"chapter": 1, "sentence_index": 0, "source": "Hola.", "target": "Hallo."}
    ]))

    translator = SentenceTranslator(config, llm, output_base=tmp_path)
    pairs, response = translator.translate_chapter(0, "Hola.")
    assert len(pairs) == 1
    assert response is None
    llm.complete_json.assert_not_called()


def test_story_generator_returns_usage(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = _minimal_config()
    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "scenes": [{
            "setting": "airport",
            "description": "A busy airport",
            "shots": [{
                "focus": "suitcase",
                "image_prompt": "A red suitcase",
                "sentences": [{"source": "Hola.", "sentence_index": 0}],
            }],
        }]
    })
    # Also mock generate_summary's complete call
    llm.complete.return_value = LLMResponse(
        content="Chapter summary.",
        usage=Usage(prompt_tokens=10, completion_tokens=5, total_tokens=15),
    )

    gen = StoryGenerator(config, llm, output_base=tmp_path)
    result = gen.generate_chapter(0)
    assert isinstance(result, tuple) and len(result) == 2
    chapter, response = result
    assert chapter.chapter == 1
    assert response is not None
    assert response.usage.prompt_tokens == 100


def test_grammar_auditor_returns_usage():
    from pipeline.grammar_auditor import audit_grammar

    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "targets": [{"target": "present tense", "present": True, "example": "Yo soy."}]
    })

    result = audit_grammar(
        chapters_by_cefr={"A1": ["Yo soy Maria."]},
        grammar_targets={"A1": ["present tense"]},
        llm=llm,
    )
    assert isinstance(result, tuple) and len(result) == 2
    report, responses = result
    assert len(responses) == 1
    assert responses[0].usage.cost_usd == 0.001


def test_chapter_auditor_returns_usage():
    from pipeline.chapter_auditor import audit_chapter
    from pipeline.models import ChapterScene, Scene, Shot, ShotSentence

    llm = MagicMock()
    llm.complete_json.return_value = _make_response({"actions": []})

    chapter = ChapterScene(chapter=1, scenes=[
        Scene(setting="test", description="test", shots=[
            Shot(focus="test", image_prompt="test", sentences=[
                ShotSentence(source="Hola.", sentence_index=0),
            ]),
        ]),
    ])
    result = audit_chapter(chapter, {"title": "Test"}, [{"name": "Maria"}], llm=llm)
    assert isinstance(result, tuple) and len(result) == 2
    actions, response = result
    assert response is not None


def test_story_auditor_returns_usage():
    from pipeline.story_auditor import audit_story

    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "fixes": [], "unnamed_characters": []
    })

    result = audit_story(
        chapters={1: ["Hola."]},
        characters=[{"name": "Maria"}],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": "test"}],
        llm=llm,
    )
    assert isinstance(result, tuple) and len(result) == 2
    (fixes, unnamed), response = result
    assert response is not None


def _minimal_config():
    """Build a minimal DeckConfig for testing."""
    from pipeline.config import DeckConfig
    return DeckConfig(**{
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de",
            "dialect": "Rioplatense",
        },
        "protagonist": {"name": "Maria", "gender": "female", "origin_country": "Germany"},
        "destination": {"country": "Argentina", "city": "Buenos Aires"},
        "story": {
            "cefr_level": "A1",
            "sentences_per_chapter": [15, 25],
            "chapters": [{"title": "Arrival", "context": "Maria arrives", "vocab_focus": ["airport"]}],
        },
        "models": {
            "story_generation": {"model": "test/model"},
            "cefr_simplification": {"model": "test/model"},
            "grammar": {"model": "test/model"},
            "gap_filling": {"model": "test/model"},
            "chapter_audit": {"model": "test/model"},
            "story_audit": {"model": "test/model"},
            "translation": {"model": "test/model"},
            "word_extraction": {"model": "test/model"},
        },
    })
```

**Step 2: Run tests to verify they fail**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_pipeline_usage.py -v`
Expected: FAIL — pipeline classes don't return tuples yet.

**Step 3: Modify `sentence_translator.py`**

In `SentenceTranslator.translate_chapter()` (line 40):
- When cached (line 43-46): return `(pairs, None)`
- After LLM call (line 49): save `result` and return `(pairs, result)` at the end

```python
def translate_chapter(self, chapter_index: int, story_text: str) -> tuple[list[SentencePair], "LLMResponse | None"]:
    path = self._chapter_path(chapter_index)

    if path.exists():
        data = json.loads(path.read_text())
        return [SentencePair(**item) for item in data], None

    prompt = _build_translation_prompt(self._config, story_text)
    response = self._llm.complete_json(prompt, system=SYSTEM_PROMPT)
    # ... same parsing logic ...
    return pairs, response
```

Add `from pipeline.llm import LLMResponse` import at top. Use `from __future__ import annotations` to avoid circular import issues.

**Step 4: Modify `story_generator.py`**

In `StoryGenerator.generate_chapter()` (line 343):
- When cached (line 347-349): return `(ChapterScene, None)`
- After LLM call: return `(chapter_data, result)`

Also modify `generate_all()` (line 384) to unpack: `chapter, _ = self.generate_chapter(...)`.
Also `_generate_summary` (line 142) is internal and does not need to return usage.

**Step 5: Modify `cefr_simplifier.py`**

In `CEFRSimplifier.simplify_chapter()` (line 161):
- When cached: return `(ChapterScene, None)`
- After LLM call: return `(chapter_data, result)`

**Step 6: Modify `grammar_auditor.py`**

`audit_grammar()` iterates over CEFR levels and makes one LLM call per level. Change to collect responses:
- Return `(GrammarAuditReport, list[LLMResponse])`
- When no targets/chapters: return `(GrammarAuditReport(), [])`

**Step 7: Modify `word_extractor.py`**

`WordExtractor.extract_chapter()`:
- When cached: return `(ChapterWords, None)`
- After LLM call: return `(chapter_words, result)`

**Step 8: Modify `gap_filler.py`**

`GapFiller.fill_gaps()` makes 2 LLM calls (assignment + generation per chapter). Change internals:
- `_assign_via_llm()` returns `(dict, LLMResponse)`
- `_generate_shots()` returns `(list[GapShot], LLMResponse)`
- `fill_gaps()` collects all responses, returns `(dict[int, list[GapShot]], list[LLMResponse])`
- When no missing words: return `({}, [])`

**Step 9: Modify `chapter_auditor.py`**

`audit_chapter()`:
- When llm is None: return `([], None)`
- After LLM call: return `(actions, response)`

**Step 10: Modify `story_auditor.py`**

`audit_story()`:
- When empty/no llm: return `(([], []), None)`
- After LLM call: return `((fixes, unnamed), response)`

**Step 11: Modify `grammar_gap_filler.py`**

`GrammarGapFiller.fill_gaps()`:
- When cached: return `(sentences, None)`
- `_generate()` returns `(list[GrammarGapSentence], LLMResponse)`
- `fill_gaps()` passes through: return `(sentences, response)`

**Step 12: Update `scripts/run_all.py` callers**

Every call site needs to unpack the tuple. Search for these patterns and add `_, response =` or `result, _ =`:

- Line 110: `raw_chapters = story_gen.generate_all(chapter_range=chapter_range)` — `generate_all` returns list, internally unpacks
- Line 127: `chapter_scenes[i] = simplifier.simplify_chapter(i, raw_chapters[idx])` → `chapter_scenes[i], _ = ...`
- Line 145-149: `grammar_report = audit_grammar(...)` → `grammar_report, _ = ...`
- Line 174: `grammar_sentences = grammar_filler.fill_gaps(report)` → `grammar_sentences, _ = ...`
- Line 264-269: `gap_results = filler.fill_gaps(...)` → `gap_results, _ = ...`
- Line 331-337: `actions = audit_chapter(...)` → `actions, _ = ...`
- Line 386-391: `fixes, unnamed_chars = audit_story(...)` → `(fixes, unnamed_chars), _ = ...`
- Line 426: `all_pairs[i] = translator.translate_chapter(i, stories[i])` → `all_pairs[i], _ = ...`
- Line 437: `chapter_words = extractor.extract_chapter(i, all_pairs[i])` → `chapter_words, _ = ...`
- Line 608: `result = lem.lemmatize(top_words)` — no change needed (FrequencyLemmatizer not changed)
- Line 663-668: `gap_results = filler.fill_gaps(...)` → `gap_results, _ = ...`

**Step 13: Run tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_pipeline_usage.py -v`
Expected: PASS

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v`
Expected: All 219+ tests pass (existing tests may need minor updates for tuple unpacking)

**Step 14: Commit**

```bash
git add pipeline/ scripts/run_all.py tests/test_pipeline_usage.py
git commit -m "feat: return LLMResponse from all pipeline classes for cost tracking"
```

---

### Task 3: Update all benchmarks to capture real costs

Now that pipeline classes return `(result, LLMResponse)`, update each benchmark to use `usage_from_llm_response()` and `cost_from_llm_response()` instead of `usage={}`.

**Files:**
- Modify: `benchmarks/bench_story_gen.py:101-121` — unpack tuple, capture usage
- Modify: `benchmarks/bench_simplification.py:83-99` — same
- Modify: `benchmarks/bench_grammar.py:77-128` — collect responses from audit + gap fill
- Modify: `benchmarks/bench_gap_filler.py:107-132` — collect responses from fill_gaps
- Modify: `benchmarks/bench_chapter_audit.py:60-97` — unpack tuple
- Modify: `benchmarks/bench_audit.py:97-127` — unpack tuple
- Modify: `benchmarks/bench_word_extraction.py:88-106` — unpack tuple
- Modify: `benchmarks/bench_translation.py` — will be replaced in Task 4, but update for consistency

**Step 1: Update each benchmark**

Pattern for each: where the benchmark currently does `usage={}`, change to:

```python
# Before:
(chapter, duration) = run_with_timing(lambda: gen.generate_chapter(0))
# ...
usage={},

# After:
((chapter, llm_response), duration) = run_with_timing(lambda: gen.generate_chapter(0))
# ...
usage=usage_from_llm_response(llm_response) if llm_response else {},
cost_estimate_usd=cost_from_llm_response(llm_response) if llm_response else None,
```

For benchmarks that collect multiple responses (grammar, gap_filler):

```python
# Sum usage across responses
def sum_usage(responses: list) -> dict:
    total = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cost_usd": 0.0}
    for r in responses:
        if r is None:
            continue
        u = r.usage
        total["prompt_tokens"] += u.prompt_tokens
        total["completion_tokens"] += u.completion_tokens
        total["total_tokens"] += u.total_tokens
        if u.cost_usd:
            total["cost_usd"] += u.cost_usd
    return total
```

Add `sum_usage` helper to `benchmarks/common.py`.

**Step 2: Run all tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v`

**Step 3: Commit**

```bash
git add benchmarks/
git commit -m "feat: capture real API costs in all benchmark tasks"
```

---

### Task 4: Consolidate translation benchmarks with chrF scoring

Replace `bench_translation.py` and `bench_translation_multilingual.py` with a single `bench_translation.py` that:
- Uses `SentenceTranslator` pipeline class
- Tests 10 curated FLORES+ language pairs
- Scores with chrF against FLORES+ reference translations

**Files:**
- Rewrite: `benchmarks/bench_translation.py`
- Delete: `benchmarks/bench_translation_multilingual.py`
- Modify: `benchmarks/run_benchmarks.py:17-42` — remove translation_multilingual
- Modify: `benchmarks/bench_config_cheap.yaml` — rename `translation` key to cover unified bench
- Modify: `benchmarks/bench_config.yaml` — same
- Modify: `benchmarks/bench_config_premium.yaml` — same
- Modify: `benchmarks/bench_config_thinking.yaml` — no change (no translation tasks)
- Rewrite: `tests/test_bench_translation.py` — tests for new chrF-based metrics
- Delete: `tests/test_bench_translation_multilingual.py`

**Step 1: Write tests for chrF metric computation**

Create/rewrite `tests/test_bench_translation.py`:

```python
"""Tests for consolidated translation benchmark with chrF scoring."""
import json
import pytest


def test_compute_chrf_metrics():
    from benchmarks.bench_translation import compute_translation_metrics

    reference = ["Hallo Welt.", "Wie geht es dir?"]
    translated = ["Hallo Welt.", "Wie geht es dir?"]
    metrics = compute_translation_metrics(reference, translated)

    assert metrics["sentence_count"] == 2
    assert metrics["translated_count"] == 2
    assert metrics["missing_count"] == 0
    assert metrics["chrf_score"] > 90  # Perfect match should score very high


def test_compute_chrf_partial_match():
    from benchmarks.bench_translation import compute_translation_metrics

    reference = ["Hallo Welt.", "Wie geht es dir?"]
    translated = ["Hallo Erde.", "Wie geht es Ihnen?"]
    metrics = compute_translation_metrics(reference, translated)

    assert metrics["chrf_score"] > 30  # Partial overlap
    assert metrics["chrf_score"] < 90  # Not perfect


def test_compute_chrf_empty_translations():
    from benchmarks.bench_translation import compute_translation_metrics

    reference = ["Hallo Welt."]
    translated = [""]
    metrics = compute_translation_metrics(reference, translated)

    assert metrics["empty_count"] == 1
    assert metrics["chrf_score"] < 10


def test_compute_chrf_missing_translations():
    from benchmarks.bench_translation import compute_translation_metrics

    reference = ["Hallo.", "Welt."]
    translated = ["Hallo."]
    metrics = compute_translation_metrics(reference, translated)

    assert metrics["missing_count"] == 1


def test_language_pairs_all_in_flores():
    """All configured language pairs must have FLORES+ data."""
    from benchmarks.bench_translation import LANGUAGE_PAIRS
    from pathlib import Path

    flores_path = Path(__file__).resolve().parent.parent / "benchmarks" / "fixtures" / "flores_30.json"
    flores = json.loads(flores_path.read_text())
    available_langs = set(flores["languages"].keys())

    for source_code, target_code, _, _, _ in LANGUAGE_PAIRS:
        assert source_code in available_langs, f"Source {source_code} not in FLORES+"
        assert target_code in available_langs, f"Target {target_code} not in FLORES+"
```

**Step 2: Run tests to verify they fail**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_bench_translation.py -v`

**Step 3: Rewrite `benchmarks/bench_translation.py`**

```python
"""Benchmark: Translation — multilingual pipeline evaluation with chrF scoring.

Tests SentenceTranslator pipeline class across 10 curated FLORES+ language pairs.
Scores with chrF against FLORES+ reference translations.
"""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import (
    BenchmarkResult, load_bench_config, save_result, run_with_timing,
    usage_from_llm_response, cost_from_llm_response,
)
from pipeline.config import DeckConfig, DeckInfo, Languages, Protagonist, Destination, StoryConfig, ChapterDef, ModelsConfig, ModelConfig
from pipeline.llm import create_client
from pipeline.sentence_translator import SentenceTranslator
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"

# (source_flores_code, target_flores_code, source_lang_name, target_lang_name, iso_pair_code)
LANGUAGE_PAIRS = [
    ("spa_Latn", "deu_Latn", "Spanish", "German", "es-de"),
    ("spa_Latn", "swh_Latn", "Spanish", "Swahili", "es-sw"),
    ("eng_Latn", "deu_Latn", "English", "German", "en-de"),
    ("eng_Latn", "swh_Latn", "English", "Swahili", "en-sw"),
    ("eng_Latn", "hau_Latn", "English", "Hausa", "en-ha"),
    ("eng_Latn", "amh_Ethi", "English", "Amharic", "en-am"),
    ("eng_Latn", "urd_Arab", "English", "Urdu", "en-ur"),
    ("eng_Latn", "tir_Ethi", "English", "Tigrinya", "en-ti"),
    ("deu_Latn", "swh_Latn", "German", "Swahili", "de-sw"),
    ("deu_Latn", "amh_Ethi", "German", "Amharic", "de-am"),
]


def _make_bench_config(source_lang: str, target_lang: str, model: str) -> DeckConfig:
    """Create a minimal DeckConfig for SentenceTranslator with given language pair."""
    return DeckConfig(
        deck=DeckInfo(name="bench", id="bench-translation"),
        languages=Languages(
            target=source_lang, target_code="xx",
            native=target_lang, native_code="xx",
            dialect="",
        ),
        protagonist=Protagonist(name="Test", gender="female", origin_country="X"),
        destination=Destination(country="X", city="X"),
        story=StoryConfig(
            cefr_level="B1",
            sentences_per_chapter=[10, 30],
            chapters=[ChapterDef(title="Test", context="Test", vocab_focus=["test"])],
        ),
        models=ModelsConfig(
            story_generation=ModelConfig(model=model),
            cefr_simplification=ModelConfig(model=model),
            grammar=ModelConfig(model=model),
            gap_filling=ModelConfig(model=model),
            chapter_audit=ModelConfig(model=model),
            story_audit=ModelConfig(model=model),
            translation=ModelConfig(model=model),
            word_extraction=ModelConfig(model=model),
        ),
    )


def compute_translation_metrics(reference: list[str], translated: list[str]) -> dict:
    """Compute chrF and structural metrics against FLORES+ reference."""
    from sacrebleu.metrics import CHRF

    translated_padded = translated + [""] * max(0, len(reference) - len(translated))
    empty_count = sum(1 for t in translated_padded[:len(reference)] if not t.strip())
    missing_count = max(0, len(reference) - len(translated))

    # chrF++ scoring (with word n-grams)
    chrf = CHRF(word_order=2)
    # Filter out empty translations for chrF (score only translated pairs)
    valid_refs = []
    valid_hyps = []
    for ref, hyp in zip(reference, translated_padded[:len(reference)]):
        if hyp.strip():
            valid_refs.append(ref)
            valid_hyps.append(hyp)

    chrf_score = 0.0
    if valid_hyps:
        result = chrf.corpus_score(valid_hyps, [valid_refs])
        chrf_score = round(result.score, 2)

    # Length ratio
    ratios = []
    for ref, trans in zip(reference, translated_padded):
        if trans.strip():
            ref_words = len(ref.split())
            trans_words = len(trans.split())
            if ref_words > 0:
                ratios.append(trans_words / ref_words)

    return {
        "sentence_count": len(reference),
        "translated_count": len(translated),
        "missing_count": missing_count,
        "empty_count": empty_count,
        "chrf_score": chrf_score,
        "avg_length_ratio": round(sum(ratios) / max(1, len(ratios)), 2) if ratios else 0,
    }


def run_translation_benchmark(bench_config_path: Path | None = None):
    """Run translation benchmark across all models and language pairs."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    flores = json.loads((FIXTURES / "flores_30.json").read_text())

    models = bench_config["models"].get("translation", [])
    if not models:
        print("No translation models in config")
        return

    print(f"=== Benchmark: Translation ({len(models)} models × {len(LANGUAGE_PAIRS)} pairs) ===")

    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        print(f"\n  Model: {model_name}")

        for source_code, target_code, source_lang, target_lang, pair_iso in LANGUAGE_PAIRS:
            source_sentences = [s[source_code] for s in flores["sentences"]]
            reference = [s[target_code] for s in flores["sentences"]]
            story_text = "\n".join(source_sentences)

            bench_config_obj = _make_bench_config(source_lang, target_lang, model_name)

            try:
                with tempfile.TemporaryDirectory() as tmp:
                    translator = SentenceTranslator(bench_config_obj, llm, output_base=Path(tmp))

                    ((pairs, llm_response), duration) = run_with_timing(
                        lambda st=story_text: translator.translate_chapter(0, st)
                    )

                translated = [p.target for p in pairs]
                metrics = compute_translation_metrics(reference, translated)

                result = BenchmarkResult(
                    task=f"translation_{pair_iso}",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="flores_30.json",
                    duration_seconds=round(duration, 2),
                    usage=usage_from_llm_response(llm_response) if llm_response else {},
                    cost_estimate_usd=cost_from_llm_response(llm_response) if llm_response else None,
                    raw_output=json.dumps([p.model_dump() for p in pairs], ensure_ascii=False),
                    parsed_output={"translations": translated, "reference": reference},
                    deterministic_metrics=metrics,
                )
                status = "OK" if metrics["missing_count"] == 0 and metrics["empty_count"] == 0 else "GAPS"
                print(f"    {pair_iso:8s}: chrF={metrics['chrf_score']:5.1f} "
                      f"{metrics['translated_count']}/{metrics['sentence_count']} "
                      f"[{status}] {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task=f"translation_{pair_iso}", model=model_name, provider=provider,
                    temperature=temperature, input_fixture="flores_30.json",
                    duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                    deterministic_metrics={}, error=str(e),
                )
                print(f"    {pair_iso:8s}: ERROR — {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_translation_benchmark()
```

**Step 4: Delete `bench_translation_multilingual.py` and its test**

```bash
rm benchmarks/bench_translation_multilingual.py
rm tests/test_bench_translation_multilingual.py
```

**Step 5: Update `run_benchmarks.py`**

Remove `translation_multilingual` import and entry from `ALL_TASKS`. Update `TIER_TASKS["cheap"]` to remove it.

**Step 6: Run tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_bench_translation.py -v`
Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v`

**Step 7: Commit**

```bash
git add benchmarks/ tests/
git commit -m "feat: consolidate translation benchmarks — chrF scoring, 10 FLORES+ language pairs via pipeline"
```

---

### Task 5: Drop slow models from cheap tier

**Files:**
- Modify: `benchmarks/bench_config_cheap.yaml`

**Step 1: Remove slow models**

Remove these 3 models from every task in `bench_config_cheap.yaml`:
- `openai/gpt-5-nano`
- `bytedance-seed/seed-2.0-mini`
- `qwen/qwen3.5-flash-02-23`

Each task section should have 4 entries remaining:
- `google/gemini-3.1-flash-lite-preview`
- `meta-llama/llama-3.3-70b-instruct`
- `bytedance-seed/seed-1.6-flash`
- `qwen/qwen3-30b-a3b`

**Step 2: Commit**

```bash
git add benchmarks/bench_config_cheap.yaml
git commit -m "chore: drop slow models from cheap tier (GPT-5 Nano, Seed 2.0 Mini, Qwen 3.5 Flash)"
```

---

### Task 6: Parallelize model execution within tasks

**Files:**
- Modify: `benchmarks/run_benchmarks.py` — add ThreadPoolExecutor
- Modify: All 8 benchmark files — refactor to accept single model entry + return result
- Test: `tests/test_bench_runner.py` — verify parallelization logic

**Step 1: Refactor benchmark functions to accept single model**

Each benchmark currently has a loop `for model_entry in models:`. Refactor to:
1. An inner function `_run_single(model_entry, ...) -> BenchmarkResult` that runs ONE model
2. The outer function loads config, gets model list, and calls `_run_single` per model

This is needed so the runner can parallelize the model loop.

Add to each benchmark file a function with signature:
```python
def run_single_model(model_entry: dict, bench_config_path: Path | None = None) -> BenchmarkResult | None:
```

**Step 2: Update runner to use ThreadPoolExecutor**

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def run_task_parallel(task_name: str, models: list[dict], config_path: Path | None, max_workers: int = 4):
    """Run all models for a task in parallel."""
    task_fn = ALL_TASK_SINGLE[task_name]  # Maps to run_single_model variant

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(task_fn, model, config_path): model
            for model in models
        }
        for future in as_completed(futures):
            model = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f"    ERROR for {model['model']}: {e}")
```

The runner's main loop changes from:
```python
for name in task_names:
    ALL_TASKS[name](config_path)
```
To:
```python
for name in task_names:
    models = bench_config["models"].get(TASK_CONFIG_KEY[name], [])
    run_task_parallel(name, models, config_path)
```

**Step 3: Write test for parallel runner**

```python
def test_runner_parallel_invokes_all_models():
    """Verify all models are invoked when running in parallel."""
    from unittest.mock import MagicMock, call
    from benchmarks.run_benchmarks import run_task_parallel

    mock_fn = MagicMock(return_value=None)
    models = [
        {"model": "model-a", "provider": "openrouter"},
        {"model": "model-b", "provider": "openrouter"},
    ]
    run_task_parallel("test", models, None, task_fn=mock_fn, max_workers=2)
    assert mock_fn.call_count == 2
```

**Step 4: Run all tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v`

**Step 5: Commit**

```bash
git add benchmarks/ tests/
git commit -m "feat: parallelize model execution within benchmark tasks"
```

---

### Task 7: Update config keys for consistency

The bench configs use `story_generation` and `cefr_simplification` as keys but the benchmark tasks use `story_gen` and `simplification`. The runner needs a mapping. Also `gap_filling` → `gap_filler`.

**Files:**
- Modify: `benchmarks/run_benchmarks.py` — add `TASK_CONFIG_KEY` mapping

**Step 1: Add mapping**

```python
TASK_CONFIG_KEY = {
    "story_gen": "story_generation",
    "simplification": "cefr_simplification",
    "grammar": "grammar",
    "gap_filler": "gap_filling",
    "chapter_audit": "chapter_audit",
    "audit": "story_audit",
    "translation": "translation",
    "word_extraction": "word_extraction",
}
```

This is used by the parallel runner to look up models from the config for each task.

**Step 2: Commit**

```bash
git add benchmarks/run_benchmarks.py
git commit -m "fix: add task-to-config key mapping for parallel runner"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run all tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v`
Expected: All tests pass.

**Step 2: Smoke test the runner (dry run)**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run python benchmarks/run_benchmarks.py --tier cheap --tasks translation 2>&1 | head -30`
Expected: Starts running 4 models × 10 language pairs in parallel with real cost output.

**Step 3: Update MEMORY.md with new state**

Document the changes: consolidated translation benchmark, chrF scoring, 4 cheap models, parallelization, cost tracking.
