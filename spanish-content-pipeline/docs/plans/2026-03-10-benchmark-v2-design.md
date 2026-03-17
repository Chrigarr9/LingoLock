# Benchmark v2 Design — Expanded Model Tiers + Multilingual Translation

## Goals

1. **Fix** word extraction integer overflow bug
2. **Cheap tier benchmark** — compare 7 budget models on simple tasks (simplification, grammar, translation, word extraction, story gen)
3. **Thinking tier benchmark** — compare 6 reasoning models on audit tasks (chapter_audit, story_audit)
4. **Premium tier** — 2 frontier models as quality reference baselines
5. **Multilingual translation benchmark** — test all tiers on 10 languages (African + Central Asian) using FLORES+ ground truth

---

## Model Tiers

### Cheap Tier (simple tasks: story_gen, simplification, grammar, translation, word_extraction)

| Model ID | In $/Mtok | Out $/Mtok | Notes |
|----------|-----------|------------|-------|
| `openai/gpt-5-nano` | $0.05 | $0.40 | Cheapest, successor to 4.1-nano |
| `bytedance-seed/seed-1.6-flash` | $0.075 | $0.30 | Very cheap, multimodal |
| `qwen/qwen3-30b-a3b` | $0.08 | $0.28 | Current pipeline model |
| `qwen/qwen3.5-flash-02-23` | $0.10 | $0.40 | Newer Qwen, 1M context |
| `bytedance-seed/seed-2.0-mini` | $0.10 | $0.40 | Fast, cost-sensitive |
| `meta-llama/llama-3.3-70b-instruct` | $0.10 | $0.32 | Strong multilingual |
| `google/gemini-3.1-flash-lite-preview` | $0.25 | $1.50 | Google's cheapest, thinking levels |

### Thinking Tier (audit tasks: chapter_audit, story_audit)

| Model ID | In $/Mtok | Out $/Mtok | Notes |
|----------|-----------|------------|-------|
| `qwen/qwen3.5-plus-02-15` | $0.26 | $1.56 | Budget reasoning |
| `minimax/minimax-m2.5` | $0.295 | $1.20 | Newest MiniMax, reasoning |
| `qwen/qwen3.5-397b-a17b` | $0.39 | $2.34 | 397B MoE, reasoning |
| `deepseek/deepseek-v3.2-speciale` | $0.40 | $1.20 | V3.2 reasoning variant |
| `moonshotai/kimi-k2.5` | $0.50 | $2.20 | Multimodal reasoning |
| `qwen/qwen3-max-thinking` | $0.78 | $3.90 | Qwen flagship reasoning |

### Premium Tier (reference baselines — all tasks)

| Model ID | In $/Mtok | Out $/Mtok | Notes |
|----------|-----------|------------|-------|
| `openai/gpt-5` | $1.25 | $10.00 | Frontier |
| `anthropic/claude-sonnet-4-6` | $3.00 | $15.00 | Frontier |
| `google/gemini-3.1-pro-preview` | $2.00 | $12.00 | Frontier |

---

## Multilingual Translation Benchmark

### Data Source

**FLORES+** (openlanguagedata/flores_plus on HuggingFace)
- 1,012 professionally translated sentences aligned across 200+ languages
- CC BY-SA 4.0 license
- Pick 30 sentences from devtest split → ground truth for all language pairs

### Languages

| Language | FLORES+ code | Difficulty | Region |
|----------|-------------|------------|--------|
| German | `deu_Latn` | Easy (control) | Europe |
| Swahili | `swh_Latn` | Medium | East Africa |
| Hausa | `hau_Latn` | Medium | West Africa |
| Urdu | `urd_Arab` | Medium | South Asia |
| Dari | `prs_Arab` | Medium | Central Asia |
| Somali | `som_Latn` | Hard | East Africa |
| Amharic | `amh_Ethi` | Hard | East Africa |
| Pashto | `pbt_Arab` | Hard | Central Asia |
| Tigrinya | `tir_Ethi` | Very hard | East Africa |
| Fula (Nigerian) | `fuv_Latn` | Very hard | West Africa |

### Translation Direction

Stories are always generated in a **high-resource language** (Spanish/English). Translation is FROM high-resource TO the low-resource language. The benchmark tests: English → each target language (using FLORES+ English source sentences).

### Evaluation Metrics

1. **FLORES+ reference comparison** — compare model output against professional FLORES+ translations using back-translation similarity (translate output back to English, compare to original)
2. **Completeness** — did the model translate all 30 sentences?
3. **Token ratio** — sanity check (output vs input word counts)
4. **Failure detection** — did the model refuse, output wrong language, or produce garbage?

---

## Codebase Changes

### Bug fix
- `pipeline/llm.py`: catch `ValueError` from `json.loads` integer overflow, re-raise as parse error

### New fixtures
- `benchmarks/fixtures/flores_30.json` — 30 FLORES+ sentences with translations for all 10 languages

### New/updated config
- `benchmarks/bench_config_cheap.yaml` — 7 cheap models for simple tasks
- `benchmarks/bench_config_thinking.yaml` — 6 thinking models for audit tasks
- `benchmarks/bench_config_premium.yaml` — 3 premium models as baselines (all tasks)

### New benchmark script
- `benchmarks/bench_translation_multilingual.py` — iterates over language pairs from flores_30.json, runs each model, computes metrics per language

### Updated runner
- `benchmarks/run_benchmarks.py` — add `--tier cheap|thinking|premium|all` flag that selects the right config

### Tests
- `tests/test_bench_translation_multilingual.py` — test metrics computation
- Update existing tests as needed
