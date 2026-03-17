# Benchmark v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand benchmark system with tiered model configs (cheap/thinking/premium), fix word extraction bug, and add multilingual translation benchmark using FLORES+ ground truth for 10 languages.

**Architecture:** Three config files select model tiers. New `bench_translation_multilingual.py` loads FLORES+ fixture sentences and tests each model on all 10 language pairs. Runner gets `--tier` flag.

**Tech Stack:** Python 3.12+, pydantic, pytest, existing pipeline classes, FLORES+ dataset (CC BY-SA 4.0)

---

### Task 1: Fix Word Extraction Integer Overflow Bug

**Files:**
- Modify: `pipeline/llm.py`
- Test: `tests/test_llm.py` (or inline verification)

**Step 1: Write the fix**

In `pipeline/llm.py`, find the `complete_json` method in `LLMClient` class. The `json.loads()` call can fail with `ValueError` when a model returns a huge integer. Add a guard:

```python
# At the top of llm.py, add:
import sys

# At module level, before class definitions:
sys.set_int_max_str_digits(0)  # Allow arbitrarily large integers from LLM JSON
```

**Step 2: Run existing tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v --tb=short`
Expected: 213 tests PASS

**Step 3: Commit**

```bash
git add pipeline/llm.py
git commit -m "fix(llm): allow large integers in JSON responses from models"
```

---

### Task 2: Create Tiered Benchmark Configs

**Files:**
- Create: `benchmarks/bench_config_cheap.yaml`
- Create: `benchmarks/bench_config_thinking.yaml`
- Create: `benchmarks/bench_config_premium.yaml`

**Step 1: Create cheap tier config**

```yaml
# benchmarks/bench_config_cheap.yaml
models:
  story_generation:
    - { provider: openrouter, model: "openai/gpt-5-nano", temperature: 0.8 }
    - { provider: openrouter, model: "bytedance-seed/seed-1.6-flash", temperature: 0.8 }
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.8 }
    - { provider: openrouter, model: "qwen/qwen3.5-flash-02-23", temperature: 0.8 }
    - { provider: openrouter, model: "bytedance-seed/seed-2.0-mini", temperature: 0.8 }
    - { provider: openrouter, model: "meta-llama/llama-3.3-70b-instruct", temperature: 0.8 }
    - { provider: openrouter, model: "google/gemini-3.1-flash-lite-preview", temperature: 0.8 }
  cefr_simplification:
    - { provider: openrouter, model: "openai/gpt-5-nano", temperature: 0.3 }
    - { provider: openrouter, model: "bytedance-seed/seed-1.6-flash", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3.5-flash-02-23", temperature: 0.3 }
    - { provider: openrouter, model: "bytedance-seed/seed-2.0-mini", temperature: 0.3 }
    - { provider: openrouter, model: "meta-llama/llama-3.3-70b-instruct", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-flash-lite-preview", temperature: 0.3 }
  grammar:
    - { provider: openrouter, model: "openai/gpt-5-nano", temperature: 0.3 }
    - { provider: openrouter, model: "bytedance-seed/seed-1.6-flash", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3.5-flash-02-23", temperature: 0.3 }
    - { provider: openrouter, model: "bytedance-seed/seed-2.0-mini", temperature: 0.3 }
    - { provider: openrouter, model: "meta-llama/llama-3.3-70b-instruct", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-flash-lite-preview", temperature: 0.3 }
  gap_filling:
    - { provider: openrouter, model: "openai/gpt-5-nano", temperature: 0.7 }
    - { provider: openrouter, model: "bytedance-seed/seed-1.6-flash", temperature: 0.7 }
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.7 }
    - { provider: openrouter, model: "qwen/qwen3.5-flash-02-23", temperature: 0.7 }
    - { provider: openrouter, model: "bytedance-seed/seed-2.0-mini", temperature: 0.7 }
    - { provider: openrouter, model: "meta-llama/llama-3.3-70b-instruct", temperature: 0.7 }
    - { provider: openrouter, model: "google/gemini-3.1-flash-lite-preview", temperature: 0.7 }
  translation:
    - { provider: openrouter, model: "openai/gpt-5-nano", temperature: 0.3 }
    - { provider: openrouter, model: "bytedance-seed/seed-1.6-flash", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3.5-flash-02-23", temperature: 0.3 }
    - { provider: openrouter, model: "bytedance-seed/seed-2.0-mini", temperature: 0.3 }
    - { provider: openrouter, model: "meta-llama/llama-3.3-70b-instruct", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-flash-lite-preview", temperature: 0.3 }
  word_extraction:
    - { provider: openrouter, model: "openai/gpt-5-nano", temperature: 0.3 }
    - { provider: openrouter, model: "bytedance-seed/seed-1.6-flash", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3.5-flash-02-23", temperature: 0.3 }
    - { provider: openrouter, model: "bytedance-seed/seed-2.0-mini", temperature: 0.3 }
    - { provider: openrouter, model: "meta-llama/llama-3.3-70b-instruct", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-flash-lite-preview", temperature: 0.3 }
```

**Step 2: Create thinking tier config**

```yaml
# benchmarks/bench_config_thinking.yaml
models:
  chapter_audit:
    - { provider: openrouter, model: "qwen/qwen3.5-plus-02-15", temperature: 0.3 }
    - { provider: openrouter, model: "minimax/minimax-m2.5", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3.5-397b-a17b", temperature: 0.3 }
    - { provider: openrouter, model: "deepseek/deepseek-v3.2-speciale", temperature: 0.3 }
    - { provider: openrouter, model: "moonshotai/kimi-k2.5", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3-max-thinking", temperature: 0.3 }
  story_audit:
    - { provider: openrouter, model: "qwen/qwen3.5-plus-02-15", temperature: 0.3 }
    - { provider: openrouter, model: "minimax/minimax-m2.5", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3.5-397b-a17b", temperature: 0.3 }
    - { provider: openrouter, model: "deepseek/deepseek-v3.2-speciale", temperature: 0.3 }
    - { provider: openrouter, model: "moonshotai/kimi-k2.5", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3-max-thinking", temperature: 0.3 }
```

**Step 3: Create premium tier config**

```yaml
# benchmarks/bench_config_premium.yaml
models:
  story_generation:
    - { provider: openrouter, model: "openai/gpt-5", temperature: 0.8 }
    - { provider: openrouter, model: "anthropic/claude-sonnet-4-6", temperature: 0.8 }
    - { provider: openrouter, model: "google/gemini-3.1-pro-preview", temperature: 0.8 }
  cefr_simplification:
    - { provider: openrouter, model: "openai/gpt-5", temperature: 0.3 }
    - { provider: openrouter, model: "anthropic/claude-sonnet-4-6", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-pro-preview", temperature: 0.3 }
  grammar:
    - { provider: openrouter, model: "openai/gpt-5", temperature: 0.3 }
    - { provider: openrouter, model: "anthropic/claude-sonnet-4-6", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-pro-preview", temperature: 0.3 }
  gap_filling:
    - { provider: openrouter, model: "openai/gpt-5", temperature: 0.7 }
    - { provider: openrouter, model: "anthropic/claude-sonnet-4-6", temperature: 0.7 }
    - { provider: openrouter, model: "google/gemini-3.1-pro-preview", temperature: 0.7 }
  chapter_audit:
    - { provider: openrouter, model: "openai/gpt-5", temperature: 0.3 }
    - { provider: openrouter, model: "anthropic/claude-sonnet-4-6", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-pro-preview", temperature: 0.3 }
  story_audit:
    - { provider: openrouter, model: "openai/gpt-5", temperature: 0.3 }
    - { provider: openrouter, model: "anthropic/claude-sonnet-4-6", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-pro-preview", temperature: 0.3 }
  translation:
    - { provider: openrouter, model: "openai/gpt-5", temperature: 0.3 }
    - { provider: openrouter, model: "anthropic/claude-sonnet-4-6", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-pro-preview", temperature: 0.3 }
  word_extraction:
    - { provider: openrouter, model: "openai/gpt-5", temperature: 0.3 }
    - { provider: openrouter, model: "anthropic/claude-sonnet-4-6", temperature: 0.3 }
    - { provider: openrouter, model: "google/gemini-3.1-pro-preview", temperature: 0.3 }
```

**Step 4: Commit**

```bash
git add benchmarks/bench_config_cheap.yaml benchmarks/bench_config_thinking.yaml benchmarks/bench_config_premium.yaml
git commit -m "feat(benchmarks): add tiered config files — cheap, thinking, premium"
```

---

### Task 3: Create FLORES+ Fixture

**Files:**
- Create: `benchmarks/fixtures/flores_30.json`
- Create: `scripts/fetch_flores.py` (helper to download & extract 30 sentences)
- Test: `tests/test_bench_flores_fixture.py`

**Step 1: Write the FLORES+ download script**

```python
# scripts/fetch_flores.py
"""Download 30 FLORES+ devtest sentences for benchmark languages.

Usage: uv run python scripts/fetch_flores.py
Output: benchmarks/fixtures/flores_30.json
"""

import json
from pathlib import Path

from datasets import load_dataset

LANGUAGES = {
    "eng_Latn": "English",
    "spa_Latn": "Spanish",
    "deu_Latn": "German",
    "swh_Latn": "Swahili",
    "hau_Latn": "Hausa",
    "urd_Arab": "Urdu",
    "prs_Arab": "Dari",
    "som_Latn": "Somali",
    "amh_Ethi": "Amharic",
    "pbt_Arab": "Pashto",
    "tir_Ethi": "Tigrinya",
    "fuv_Latn": "Fula",
}

NUM_SENTENCES = 30
OUTPUT = Path(__file__).resolve().parent.parent / "benchmarks" / "fixtures" / "flores_30.json"


def main():
    ds = load_dataset("openlanguagedata/flores_plus", split="devtest")

    sentences = []
    for i in range(NUM_SENTENCES):
        row = ds[i]
        entry = {"index": i}
        for code, name in LANGUAGES.items():
            entry[code] = row[code]
        sentences.append(entry)

    OUTPUT.write_text(json.dumps({"languages": LANGUAGES, "sentences": sentences}, ensure_ascii=False, indent=2))
    print(f"Wrote {NUM_SENTENCES} sentences to {OUTPUT}")


if __name__ == "__main__":
    main()
```

**Step 2: Install datasets dependency and run**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv add datasets && uv run python scripts/fetch_flores.py`

**Step 3: Write fixture validation test**

```python
# tests/test_bench_flores_fixture.py
"""Validate FLORES+ fixture is well-formed."""
import json
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent.parent / "benchmarks" / "fixtures"

EXPECTED_LANG_CODES = [
    "eng_Latn", "spa_Latn", "deu_Latn", "swh_Latn", "hau_Latn",
    "urd_Arab", "prs_Arab", "som_Latn", "amh_Ethi", "pbt_Arab",
    "tir_Ethi", "fuv_Latn",
]


def test_flores_30_has_all_languages():
    data = json.loads((FIXTURES / "flores_30.json").read_text())
    for sent in data["sentences"]:
        for code in EXPECTED_LANG_CODES:
            assert code in sent, f"Missing {code} in sentence {sent['index']}"
            assert len(sent[code]) > 0, f"Empty {code} in sentence {sent['index']}"


def test_flores_30_has_30_sentences():
    data = json.loads((FIXTURES / "flores_30.json").read_text())
    assert len(data["sentences"]) == 30


def test_flores_30_languages_dict():
    data = json.loads((FIXTURES / "flores_30.json").read_text())
    assert "English" in data["languages"].values()
    assert "Somali" in data["languages"].values()
    assert len(data["languages"]) == len(EXPECTED_LANG_CODES)
```

**Step 4: Run test**

Run: `uv run pytest tests/test_bench_flores_fixture.py -v`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add benchmarks/fixtures/flores_30.json scripts/fetch_flores.py tests/test_bench_flores_fixture.py
git commit -m "feat(benchmarks): add FLORES+ fixture — 30 sentences × 12 languages"
```

---

### Task 4: Multilingual Translation Benchmark Script

**Files:**
- Create: `benchmarks/bench_translation_multilingual.py`
- Test: `tests/test_bench_translation_multilingual.py`

**Step 1: Write the test**

```python
# tests/test_bench_translation_multilingual.py
"""Tests for multilingual translation benchmark."""
from benchmarks.bench_translation_multilingual import compute_multilingual_metrics


def test_compute_multilingual_metrics_perfect():
    reference = ["Hallo Welt.", "Guten Morgen."]
    translated = ["Hallo Welt.", "Guten Morgen."]
    metrics = compute_multilingual_metrics(reference, translated)
    assert metrics["sentence_count"] == 2
    assert metrics["translated_count"] == 2
    assert metrics["missing_count"] == 0
    assert metrics["empty_count"] == 0


def test_compute_multilingual_metrics_missing():
    reference = ["Hallo.", "Welt."]
    translated = ["Hallo."]
    metrics = compute_multilingual_metrics(reference, translated)
    assert metrics["missing_count"] == 1


def test_compute_multilingual_metrics_empty():
    reference = ["Hallo.", "Welt."]
    translated = ["Hallo.", ""]
    metrics = compute_multilingual_metrics(reference, translated)
    assert metrics["empty_count"] == 1
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_bench_translation_multilingual.py -v`
Expected: FAIL — module not found

**Step 3: Implement**

```python
# benchmarks/bench_translation_multilingual.py
"""Benchmark: Multilingual Translation using FLORES+ ground truth.

Tests how well each model translates from English/Spanish to low-resource languages.
Uses FLORES+ professionally translated sentences as reference.
"""

import json
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing
from pipeline.llm import create_client
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"

# Target languages to benchmark (FLORES+ codes → human names)
TARGET_LANGUAGES = {
    "deu_Latn": ("German", "de"),
    "swh_Latn": ("Swahili", "sw"),
    "hau_Latn": ("Hausa", "ha"),
    "urd_Arab": ("Urdu", "ur"),
    "prs_Arab": ("Dari", "prs"),
    "som_Latn": ("Somali", "so"),
    "amh_Ethi": ("Amharic", "am"),
    "pbt_Arab": ("Pashto", "ps"),
    "tir_Ethi": ("Tigrinya", "ti"),
    "fuv_Latn": ("Fula", "ff"),
}

SOURCE_LANG_CODE = "eng_Latn"  # Translate FROM English


def compute_multilingual_metrics(reference: list[str], translated: list[str]) -> dict:
    """Compare translated sentences against FLORES+ reference."""
    translated_padded = translated + [""] * max(0, len(reference) - len(translated))
    empty_count = sum(1 for t in translated_padded[:len(reference)] if not t.strip())
    missing_count = max(0, len(reference) - len(translated))

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
        "avg_length_ratio": round(sum(ratios) / max(1, len(ratios)), 2) if ratios else 0,
    }


def _build_translation_prompt(source_sentences: list[str], target_lang_name: str) -> str:
    numbered = "\n".join(f"{i+1}. {s}" for i, s in enumerate(source_sentences))
    return f"""Translate each English sentence to {target_lang_name}.
Return a JSON object with a "translations" array containing the translated sentences in order.
Do NOT include the original English. Only the {target_lang_name} translations.

Sentences:
{numbered}

Return ONLY valid JSON. No markdown fences, no extra text."""


def run_multilingual_translation_benchmark(bench_config_path: Path | None = None):
    """Run multilingual translation benchmark across all models and languages."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    flores = json.loads((FIXTURES / "flores_30.json").read_text())

    source_sentences = [s[SOURCE_LANG_CODE] for s in flores["sentences"]]

    models = bench_config["models"].get("translation", [])
    if not models:
        print("No translation models in config")
        return

    print(f"=== Benchmark: Multilingual Translation ({len(models)} models × {len(TARGET_LANGUAGES)} languages) ===")

    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        print(f"\n  Model: {model_name}")
        for flores_code, (lang_name, lang_iso) in TARGET_LANGUAGES.items():
            reference = [s[flores_code] for s in flores["sentences"]]

            try:
                prompt = _build_translation_prompt(source_sentences, lang_name)
                (response, duration) = run_with_timing(
                    lambda: llm.complete_json(prompt, system="You are a professional translator. Return valid JSON only.")
                )
                raw_translations = response.parsed.get("translations", [])
                metrics = compute_multilingual_metrics(reference, raw_translations)

                result = BenchmarkResult(
                    task=f"translation_{lang_iso}",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="flores_30.json",
                    duration_seconds=round(duration, 2),
                    usage={},
                    raw_output=json.dumps(raw_translations, ensure_ascii=False),
                    parsed_output={"translations": raw_translations, "reference": reference},
                    deterministic_metrics=metrics,
                )
                status = "OK" if metrics["missing_count"] == 0 and metrics["empty_count"] == 0 else "GAPS"
                print(f"    {lang_name:12s}: {metrics['translated_count']}/{metrics['sentence_count']} "
                      f"ratio={metrics['avg_length_ratio']} [{status}] {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task=f"translation_{lang_iso}", model=model_name, provider=provider,
                    temperature=temperature, input_fixture="flores_30.json",
                    duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                    deterministic_metrics={}, error=str(e),
                )
                print(f"    {lang_name:12s}: ERROR — {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_multilingual_translation_benchmark()
```

**Step 4: Run test**

Run: `uv run pytest tests/test_bench_translation_multilingual.py -v`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add benchmarks/bench_translation_multilingual.py tests/test_bench_translation_multilingual.py
git commit -m "feat(benchmarks): add multilingual translation benchmark — FLORES+ × 10 languages"
```

---

### Task 5: Update Runner with --tier Flag

**Files:**
- Modify: `benchmarks/run_benchmarks.py`

**Step 1: Update runner**

Replace the entire file:

```python
# benchmarks/run_benchmarks.py
"""Run all or selected benchmark tasks."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.bench_story_gen import run_story_gen_benchmark
from benchmarks.bench_simplification import run_simplification_benchmark
from benchmarks.bench_grammar import run_grammar_benchmark
from benchmarks.bench_gap_filler import run_gap_filler_benchmark
from benchmarks.bench_chapter_audit import run_chapter_audit_benchmark
from benchmarks.bench_audit import run_audit_benchmark
from benchmarks.bench_translation import run_translation_benchmark
from benchmarks.bench_word_extraction import run_word_extraction_benchmark
from benchmarks.bench_translation_multilingual import run_multilingual_translation_benchmark

ALL_TASKS = {
    "story_gen": run_story_gen_benchmark,
    "simplification": run_simplification_benchmark,
    "grammar": run_grammar_benchmark,
    "gap_filler": run_gap_filler_benchmark,
    "chapter_audit": run_chapter_audit_benchmark,
    "audit": run_audit_benchmark,
    "translation": run_translation_benchmark,
    "translation_multilingual": run_multilingual_translation_benchmark,
    "word_extraction": run_word_extraction_benchmark,
}

TIER_CONFIGS = {
    "cheap": "bench_config_cheap.yaml",
    "thinking": "bench_config_thinking.yaml",
    "premium": "bench_config_premium.yaml",
}

TIER_TASKS = {
    "cheap": ["story_gen", "simplification", "grammar", "gap_filler", "translation",
              "translation_multilingual", "word_extraction"],
    "thinking": ["chapter_audit", "audit"],
    "premium": list(ALL_TASKS.keys()),
}


def main():
    parser = argparse.ArgumentParser(description="Run benchmark tasks")
    parser.add_argument(
        "--tasks", default=None,
        help=f"Comma-separated task names. Available: {','.join(ALL_TASKS.keys())}. Default: all.",
    )
    parser.add_argument(
        "--tier", default=None, choices=["cheap", "thinking", "premium"],
        help="Select model tier config. Overrides --config and limits tasks to tier-appropriate ones.",
    )
    parser.add_argument(
        "--config", default=None,
        help="Path to bench_config.yaml. Default: benchmarks/bench_config.yaml",
    )
    args = parser.parse_args()

    bench_dir = Path(__file__).resolve().parent

    if args.tier:
        config_path = bench_dir / TIER_CONFIGS[args.tier]
        task_names = args.tasks.split(",") if args.tasks else TIER_TASKS[args.tier]
    else:
        config_path = Path(args.config) if args.config else None
        task_names = args.tasks.split(",") if args.tasks else list(ALL_TASKS.keys())

    for name in task_names:
        name = name.strip()
        if name not in ALL_TASKS:
            print(f"Unknown task: {name}. Available: {', '.join(ALL_TASKS.keys())}")
            sys.exit(1)

    print(f"Running {len(task_names)} benchmark(s): {', '.join(task_names)}")
    if args.tier:
        print(f"Tier: {args.tier} (config: {config_path.name})")
    print()

    for name in task_names:
        ALL_TASKS[name.strip()](config_path)
        print()

    print("All benchmarks complete. Results in benchmarks/results/")


if __name__ == "__main__":
    main()
```

**Step 2: Run full test suite**

Run: `uv run pytest tests/ -v --tb=short`
Expected: All tests PASS (213 + new ones)

**Step 3: Commit**

```bash
git add benchmarks/run_benchmarks.py
git commit -m "feat(benchmarks): add --tier flag to runner — cheap, thinking, premium"
```

---

### Task 6: Final Verification + Memory Update

**Step 1: Run full test suite**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v`
Expected: All tests PASS

**Step 2: Verify tiered runner works**

Run: `uv run python benchmarks/run_benchmarks.py --tier cheap --tasks translation_multilingual`
(This will make real API calls — test with just one task to verify)

**Step 3: Update MEMORY.md** with new benchmark v2 information

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "feat(benchmarks): benchmark v2 complete — tiered models + multilingual FLORES+"
```
