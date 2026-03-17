# NLLB-200 Benchmark Integration — Design & Implementation Plan

## Goal

Add Meta's NLLB-200-distilled-600M as a **local translation model** in the existing benchmark system. It runs as `provider: "nllb"` alongside LLM models in `bench_config_*.yaml`, producing directly comparable chrF scores against the same FLORES+ references.

## Why

- Purpose-built translation model for 200 languages, especially low-resource
- Free ($0 per call) — useful cost baseline
- Uses the same FLORES-200 language codes our benchmark already uses
- Expected to outperform general LLMs on low-resource pairs (Tigrinya, Hausa, Fula, Amharic)
- Runs locally on CPU with AVX512 (no GPU needed, ~1GB RAM with INT8 quantization)

## Model Choice

| Variant | Size (INT8) | RAM | Quality | Speed (CPU) |
|---------|-------------|-----|---------|-------------|
| nllb-200-distilled-600M | ~600MB | ~1GB | Good baseline | ~0.3s/sentence |
| nllb-200-distilled-1.3B | ~1.3GB | ~2GB | Better | ~0.8s/sentence |
| nllb-200-3.3B | ~3.3GB | ~5GB | Best | Too slow on CPU |

**Start with 600M.** Pre-converted INT8 model available at `JustFrederik/nllb-200-distilled-600M-ct2-int8` on HuggingFace.

## Architecture

```
bench_config_cheap.yaml
  └── translation:
        ├── { provider: openrouter, model: "google/gemini-3.1-flash-lite-preview", ... }
        ├── { provider: openrouter, model: "meta-llama/llama-3.3-70b-instruct", ... }
        └── { provider: nllb, model: "nllb-200-distilled-600M" }   # ← NEW

bench_translation.py :: _run_single_model()
  ├── provider == "nllb"  → NLLBTranslator.translate_batch()
  └── provider != "nllb"  → SentenceTranslator (LLM API path, unchanged)
```

## Design Decisions

### 1. CTranslate2 over transformers+PyTorch

CTranslate2 + SentencePiece is ~500MB of dependencies. Full PyTorch + transformers would be ~4.5GB. CTranslate2 also leverages AVX512 for fast CPU inference. Clear win.

### 2. Lazy singleton model loading

The NLLB model loads once and is reused across all 10 language pairs. A module-level `_get_nllb_translator()` function caches the loaded model. This avoids reloading 600MB per language pair.

### 3. Sentence-by-sentence translation (not batch prompt)

NLLB is a seq2seq model — it translates one sentence at a time (or small batches). Unlike LLMs, there's no JSON prompt/response. The benchmark feeds 30 sentences, gets 30 translations back. This means:
- No JSON parsing failures possible
- No missing/empty translations (the model always produces output)
- `missing_count` and `empty_count` will always be 0

### 4. Synthetic usage/cost tracking

NLLB has no API cost, but we still populate `BenchmarkResult` fields:
- `cost_estimate_usd`: `0.0`
- `provider`: `"nllb"`
- `usage`: `{"input_tokens": N, "output_tokens": M}` from SentencePiece tokenizer counts
- `duration_seconds`: wall-clock time (meaningful for local inference)

### 5. Model download as a separate script

The CT2 model (~600MB) is downloaded once via `scripts/download_nllb.py`. The benchmark checks for the model at startup and prints a clear error if missing. We do NOT auto-download during benchmark runs.

### 6. FLORES code mapping: none needed

NLLB uses FLORES-200 codes (`deu_Latn`, `swh_Latn`, `tir_Ethi`, etc.) — identical to what `LANGUAGE_PAIRS` in `bench_translation.py` already uses. Zero mapping work.

### 7. Optional dependency group

`ctranslate2` and `sentencepiece` go in `[project.optional-dependencies] nllb = [...]` so they don't bloat the base pipeline install.

## New Files

### `benchmarks/nllb_translator.py`

```python
"""Local NLLB-200 translator using CTranslate2 for benchmark comparison."""

import ctranslate2
import sentencepiece

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEFAULT_MODEL = "nllb-200-distilled-600M"

_cached_translator = None

class NLLBTranslator:
    def __init__(self, model_dir: Path):
        self._translator = ctranslate2.Translator(
            str(model_dir), device="cpu", inter_threads=4
        )
        self._tokenizer = sentencepiece.SentencePieceProcessor()
        self._tokenizer.Load(str(model_dir / "sentencepiece.bpe.model"))

    def translate(self, text: str, src_lang: str, tgt_lang: str) -> str:
        """Translate a single sentence."""
        tokens = self._tokenizer.Encode(text, out_type=str)
        source = [src_lang] + tokens  # NLLB prepends source lang token
        result = self._translator.translate_batch(
            [source], target_prefix=[[tgt_lang]], beam_size=4
        )
        output_tokens = result[0].hypotheses[0][1:]  # skip lang token
        return self._tokenizer.Decode(output_tokens)

    def translate_batch(self, texts: list[str], src_lang: str, tgt_lang: str) -> list[str]:
        """Translate multiple sentences."""
        return [self.translate(t, src_lang, tgt_lang) for t in texts]

    def count_tokens(self, text: str) -> int:
        """Count SentencePiece tokens for usage tracking."""
        return len(self._tokenizer.Encode(text))


def get_nllb_translator(model_name: str = DEFAULT_MODEL) -> NLLBTranslator:
    """Get or create cached NLLBTranslator instance."""
    global _cached_translator
    if _cached_translator is None:
        model_dir = MODELS_DIR / model_name
        if not model_dir.exists():
            raise FileNotFoundError(
                f"NLLB model not found at {model_dir}. "
                f"Run: uv run python scripts/download_nllb.py"
            )
        _cached_translator = NLLBTranslator(model_dir)
    return _cached_translator
```

### `scripts/download_nllb.py`

Downloads the pre-converted CT2 INT8 model from HuggingFace to `models/nllb-200-distilled-600M/`.

Uses `huggingface_hub.snapshot_download()` to fetch `JustFrederik/nllb-200-distilled-600M-ct2-int8`.

### `tests/test_nllb_translator.py`

- Test that `NLLBTranslator.translate()` returns a non-empty string
- Test that `translate_batch()` returns correct count
- Test `count_tokens()` returns positive int
- Test `get_nllb_translator()` raises FileNotFoundError when model missing
- All tests that need the model are `@pytest.mark.skipif(not model_dir.exists(), ...)`

## Modified Files

### `pyproject.toml`

```toml
[project.optional-dependencies]
nllb = ["ctranslate2>=4.0", "sentencepiece>=0.2", "huggingface-hub>=0.20"]
dev = ["pytest>=8.0", "pytest-asyncio>=0.24"]
```

### `bench_translation.py`

Add NLLB code path in `_run_single_model()`:

```python
def _run_single_model(model_entry: dict, flores: dict):
    model_name = model_entry["model"]
    provider = model_entry.get("provider", "openrouter")

    if provider == "nllb":
        return _run_nllb_model(model_entry, flores)

    # ... existing LLM path unchanged ...


def _run_nllb_model(model_entry: dict, flores: dict):
    """Run NLLB local model across all language pairs."""
    from benchmarks.nllb_translator import get_nllb_translator

    model_name = model_entry["model"]
    translator = get_nllb_translator(model_name)
    results = []

    for source_code, target_code, source_lang, target_lang, pair_iso in LANGUAGE_PAIRS:
        source_sentences = [s[source_code] for s in flores["sentences"]]
        reference = [s[target_code] for s in flores["sentences"]]

        (translated, duration) = run_with_timing(
            lambda ss=source_sentences: translator.translate_batch(ss, source_code, target_code)
        )

        metrics = compute_translation_metrics(reference, translated)

        # Token counts for usage tracking
        input_tokens = sum(translator.count_tokens(s) for s in source_sentences)
        output_tokens = sum(translator.count_tokens(t) for t in translated)

        result = BenchmarkResult(
            task=f"translation_{pair_iso}",
            model=model_name,
            provider="nllb",
            temperature=0.0,
            input_fixture="flores_30.json",
            duration_seconds=round(duration, 2),
            usage={"input_tokens": input_tokens, "output_tokens": output_tokens},
            cost_estimate_usd=0.0,
            raw_output=json.dumps(translated, ensure_ascii=False),
            parsed_output={"translations": translated, "reference": reference},
            deterministic_metrics=metrics,
        )
        # ... print + save_result ...
        results.append(result)

    return results
```

### `bench_config_cheap.yaml` (and other tiers)

```yaml
translation:
    # ... existing LLM entries ...
    - { provider: nllb, model: "nllb-200-distilled-600M", temperature: 0.0 }
```

### `.gitignore`

Add `models/` directory (600MB+ model weights should not be committed).

## Task Sequence

| # | Task | Files | Depends on |
|---|------|-------|------------|
| 1 | Add optional `nllb` dependency group to pyproject.toml | `pyproject.toml` | — |
| 2 | Create `scripts/download_nllb.py` + add `models/` to .gitignore | `scripts/download_nllb.py`, `.gitignore` | — |
| 3 | Create `benchmarks/nllb_translator.py` (CTranslate2 wrapper) | `benchmarks/nllb_translator.py` | 1 |
| 4 | Add NLLB code path in `bench_translation.py` | `benchmarks/bench_translation.py` | 3 |
| 5 | Add NLLB entry to all `bench_config_*.yaml` files | `benchmarks/bench_config_*.yaml` | — |
| 6 | Write tests for `NLLBTranslator` | `tests/test_nllb_translator.py` | 3 |
| 7 | Download model and run full translation benchmark | — | 2, 4, 5 |

## Running

```bash
# One-time setup
uv pip install -e ".[nllb]"
uv run python scripts/download_nllb.py

# Run benchmark (NLLB appears alongside LLM models)
uv run python benchmarks/run_benchmarks.py --tier cheap --tasks translation

# Expected output:
# === Benchmark: Translation (5 models x 10 pairs) ===
#   [gemini-3.1-flash-lite-preview] es-de: chrF=62.3 30/30 [OK] 3.2s
#   [nllb-200-distilled-600M]       es-de: chrF=58.1 30/30 [OK] 9.4s
#   [nllb-200-distilled-600M]       en-ti: chrF=41.2 30/30 [OK] 8.7s
#   ...
```

## License Note

NLLB-200 is CC-BY-NC 4.0. Benchmarking is non-commercial research use — fully compliant. If NLLB wins and we want to use it in the production pipeline, that would require a separate licensing assessment.
