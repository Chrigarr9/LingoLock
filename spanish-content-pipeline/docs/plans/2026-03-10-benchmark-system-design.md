# Benchmark System Design

**Date:** 2026-03-10
**Phase:** 6 of Pipeline Improvements

## Goal

Compare LLM models across all pipeline tasks to find the best cost/quality tradeoff, and catch quality regressions when prompts or pipeline logic change.

## Architecture

Two decoupled phases:

1. **Generate** (online, paid) — Benchmark scripts run N models through fixed inputs, store all raw outputs to disk as JSON.
2. **Evaluate** (local, free) — An agentic tool (Claude Code, OpenCode, etc.) reads stored results, scores them, and produces comparison tables.

The benchmark scripts we build are the generation + storage layer only.

## Directory Structure

```
benchmarks/
  bench_config.yaml              # Models to compare per task
  fixtures/
    test_chapter.yaml            # Mini 1-chapter DeckConfig
    poisoned_chapter.json        # ChapterScene with seeded issues
    expected_issues.json         # Ground truth: issue type, location, description
    reference_words.json         # Expected word extraction output
    reference_translations.json  # Expected translation pairs
  bench_story_gen.py
  bench_simplification.py
  bench_grammar.py
  bench_gap_filler.py
  bench_chapter_audit.py
  bench_audit.py
  bench_translation.py
  bench_word_extraction.py
  run_benchmarks.py              # Run all or selected benchmarks
  results/                       # Generated, gitignored
    story_gen/
      deepseek--deepseek-v3.2/
        run_2026-03-10T14-30.json
      qwen--qwen3-235b-a22b/
        run_2026-03-10T14-30.json
    ...
```

## Benchmark Config

`bench_config.yaml` lists candidate models per task:

```yaml
models:
  story_generation:
    - { provider: openrouter, model: "deepseek/deepseek-v3.2", temperature: 0.8 }
    - { provider: openrouter, model: "qwen/qwen3-235b-a22b-thinking-2507", temperature: 0.8 }
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.8 }
  cefr_simplification:
    - ...
  grammar:
    - ...
  gap_filling:
    - ...
  chapter_audit:
    - ...
  story_audit:
    - ...
  translation:
    - ...
  word_extraction:
    - ...
```

## Test Fixtures

### `test_chapter.yaml`

A minimal `DeckConfig` with 1 chapter (~15-20 sentences worth). Uses the same schema as `spanish_buenos_aires.yaml` but stripped to essentials:

- 1 chapter with a clear context, 2-3 vocab focus areas
- Protagonist (Maria) + 1 secondary character
- Grammar targets for the chapter's CEFR level
- Enough to exercise story gen, simplification, translation, word extraction

### `poisoned_chapter.json`

A `ChapterScene` JSON that looks like real pipeline output but has ~15-20 planted issues:

| Category | Example Issues |
|---|---|
| Wrong CEFR grammar | B2 subjunctive in an A2 chapter |
| Tense inconsistency | Present tense mid-chapter when rest uses preterite |
| Wrong character | Diego appears in chapter where only Maria + Sofia allowed |
| Character description mismatch | "pelo rubio" when established as "pelo castaño claro" |
| Setting violation | Beach scene in a cafe chapter |
| Continuity error | Object referenced before introduction |
| Unnamed recurring character | "el vendedor" appears but isn't in character list |
| Sentences too complex | 25-word sentence in A1 chapter |

### `expected_issues.json`

Ground truth for the poisoned chapter:

```json
{
  "issues": [
    {
      "sentence_index": 3,
      "category": "cefr_violation",
      "description": "B2 subjunctive 'hubiera' in A2 chapter",
      "severity": "high"
    },
    ...
  ]
}
```

### `reference_words.json` / `reference_translations.json`

Expected outputs for word extraction and translation benchmarks, hand-verified.

## Benchmark Scripts

### Common Pattern

Each script:
1. Loads `bench_config.yaml` + relevant fixtures
2. Instantiates the pipeline class with each candidate model
3. Runs the pipeline step, captures output + usage
4. Computes deterministic metrics where applicable
5. Stores result JSON in `results/<task>/<model-slug>/run_<timestamp>.json`

### Result JSON Schema

```json
{
  "task": "story_gen",
  "model": "deepseek/deepseek-v3.2",
  "provider": "openrouter",
  "temperature": 0.8,
  "timestamp": "2026-03-10T14:30:00",
  "input_fixture": "test_chapter.yaml",
  "duration_seconds": 12.3,
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 5678,
    "total_tokens": 6912
  },
  "cost_estimate_usd": 0.0042,
  "raw_output": "...",
  "parsed_output": { ... },
  "deterministic_metrics": { ... },
  "error": null
}
```

### Per-Benchmark Details

**bench_story_gen.py**
- Input: `test_chapter.yaml` config
- Calls: `StoryGenerator.generate_all()` with 1-chapter range
- Deterministic metrics: sentence_count, word_count, character_mentions, dialogue_ratio (guillemet usage)
- Agent evaluates: narrative quality, creativity, coherence, image prompt quality

**bench_simplification.py**
- Input: A pre-generated raw `ChapterScene` (from story gen, stored as fixture)
- Calls: `CEFRSimplifier.simplify_chapter()`
- Deterministic metrics: avg sentence length, max sentence length, CEFR vocabulary level (via spaCy)
- Agent evaluates: naturalness, meaning preservation

**bench_grammar.py**
- Input: Chapter sentences + grammar targets from config
- Calls: `audit_grammar()` then `GrammarGapFiller.fill_gaps()`
- Deterministic metrics: detection accuracy (vs known grammar in text), gap sentence grammar match
- Agent evaluates: gap sentence quality, naturalness

**bench_gap_filler.py**
- Input: Stories dict + frequency data + missing words
- Calls: `GapFiller.fill_gaps()`
- Deterministic metrics: covers target words (bool), shot count, CEFR compliance, sentence length
- Agent evaluates: narrative fit, coherence with surrounding story

**bench_chapter_audit.py**
- Input: `poisoned_chapter.json` + `expected_issues.json`
- Calls: `audit_chapter()`
- Deterministic metrics: precision, recall, F1 against expected issues
- Agent evaluates: fix quality, false positive analysis

**bench_audit.py**
- Input: `poisoned_chapter.json` (formatted as multi-chapter dict) + `expected_issues.json`
- Calls: `audit_story()`
- Deterministic metrics: precision, recall, F1 against expected issues, unnamed char detection
- Agent evaluates: fix quality, false positive analysis

**bench_translation.py**
- Input: Source sentences from test chapter
- Calls: `SentenceTranslator.translate_chapter()`
- Deterministic metrics: token count ratio (source/target), missing translations, sentence count match
- Agent evaluates: naturalness, accuracy, tone preservation

**bench_word_extraction.py**
- Input: Sentence pairs from test chapter
- Calls: `WordExtractor.extract_chapter()`
- Deterministic metrics: precision/recall vs `reference_words.json`, POS accuracy
- Agent evaluates: translation quality, similar_words relevance

## CLI Interface

```bash
# Run single benchmark
uv run python benchmarks/bench_story_gen.py

# Run all benchmarks
uv run python benchmarks/run_benchmarks.py

# Run subset
uv run python benchmarks/run_benchmarks.py --tasks story_gen,audit,translation
```

All scripts default to `benchmarks/bench_config.yaml` for model lists.

## Cost Estimation

Each model's cost per 1M tokens (input/output) is available from OpenRouter. The result JSON includes token counts; cost_estimate_usd is computed from known pricing.

## What We Don't Build

- No automated LLM-as-judge scoring in the scripts. Evaluation is done externally by an agentic tool reading the results directory.
- No dashboards or visualization. Results are JSON files readable by agents.
- No CI integration. Benchmarks are run manually when comparing models or after prompt changes.
