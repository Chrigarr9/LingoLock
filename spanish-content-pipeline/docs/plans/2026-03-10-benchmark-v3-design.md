# Benchmark Pipeline v3 — Design

## Goals

1. Real API cost tracking for all 9 benchmarks (not just multilingual translation)
2. Consolidate two translation benchmarks into one pipeline-based benchmark with chrF scoring
3. Drop slow/underperforming models from cheap tier
4. Parallelize model execution within tasks

## 1. Cost Tracking: Return Usage from Pipeline Classes

Each pipeline class method that calls the LLM will return `(domain_object, LLMResponse)` instead of just the domain object. This exposes usage/cost data to callers.

Affected classes and their new return types:

| Class | Method | Old Return | New Return |
|-------|--------|-----------|------------|
| SentenceTranslator | translate_chapter() | list[SentencePair] | (list[SentencePair], LLMResponse) |
| StoryGenerator | generate() | ChapterScene | (ChapterScene, LLMResponse) |
| CEFRSimplifier | simplify() | ChapterScene | (ChapterScene, LLMResponse) |
| GrammarAuditor | audit() | GrammarAuditReport | (GrammarAuditReport, LLMResponse) |
| WordExtractor | extract() | ChapterWords | (ChapterWords, LLMResponse) |
| GapFiller | fill() | dict[int, list[GapShot]] | (dict, list[LLMResponse]) |
| ChapterAuditor | audit() | list[Action] | (list[Action], LLMResponse) |
| StoryAuditor | audit() | tuple | (tuple, LLMResponse) |

All existing callers in `scripts/run_all.py` unpack with `result, _ = ...`.

## 2. Translation Benchmark Consolidation

Replace `bench_translation.py` + `bench_translation_multilingual.py` with a single `bench_translation.py`.

### Design
- Uses `SentenceTranslator` pipeline class (tests the real pipeline)
- Input: FLORES+ fixture sentences (30 sentences)
- Scoring: chrF via `sacrebleu` against FLORES+ reference translations
- Creates minimal `DeckConfig` stubs per language pair to drive `SentenceTranslator`

### Language Pairs (10 total)

| Source | Target | Resource Level | Purpose |
|--------|--------|----------------|---------|
| Spanish → German | High | App use case |
| Spanish → Swahili | Low | Direct low-resource from source |
| English → German | High | Baseline |
| English → Swahili | Low | Pivot comparison |
| English → Hausa | Low | Low-resource African |
| English → Amharic | Low | Non-Latin script |
| English → Urdu | Low | Arabic script |
| English → Tigrinya | Very low | Hardest in set |
| German → Swahili | Low | Non-English source |
| German → Amharic | Low | Non-English, non-Latin target |

### Metrics per language pair
- `chrf_score`: chrF++ (0-100) against FLORES+ reference
- `translated_count` / `sentence_count`
- `missing_count`, `empty_count`
- `avg_length_ratio`

## 3. Drop Slow Models

Remove from all tasks in `bench_config_cheap.yaml`:
- `openai/gpt-5-nano` (92-154s, mediocre quality)
- `bytedance-seed/seed-2.0-mini` (234-440s, bottleneck)
- `qwen/qwen3.5-flash-02-23` (up to 800s, JSON errors)

Remaining 4 fast models:
- `google/gemini-3.1-flash-lite-preview`
- `meta-llama/llama-3.3-70b-instruct`
- `bytedance-seed/seed-1.6-flash`
- `qwen/qwen3-30b-a3b`

## 4. Parallelization

Use `concurrent.futures.ThreadPoolExecutor` in the runner.

Refactor: each benchmark function accepts a single model entry (not the full config with model loop). The runner handles the model loop and parallelization.

```python
for task_name in task_names:
    models = config["models"].get(task_key, [])
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(run_task_for_model, task_name, model, ...) for model in models]
        for f in as_completed(futures):
            f.result()
```

## 5. Dependencies

- Add `sacrebleu` for chrF scoring

## 6. Task Changes in Runner

- Remove `translation_multilingual` task
- Update `translation` task to run the new consolidated benchmark
- Update `TIER_TASKS` mappings accordingly
