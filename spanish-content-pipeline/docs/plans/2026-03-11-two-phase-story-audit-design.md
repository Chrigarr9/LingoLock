# Two-Phase Story Audit Design

**Date:** 2026-03-11
**Branch:** benchmark-v2
**Status:** Approved

## Problem

The current story auditor (Pass 5) uses a single LLM call that both finds and fixes issues. This has three problems:

1. **Competing objectives** — "find thoroughly" vs "fix carefully" fight in one prompt. The model either plays safe (misses issues) or goes aggressive (destroys vocabulary).
2. **Missing categories** — the prompt covers 6 error types but misses config adherence, dangling references, redundancy, and narrative flow. The system prompt says "only flag clear mistakes — not style preferences" which blocks the model from catching structural issues.
3. **No iteration** — issues introduced by fixes (or cascading from them) are never caught.

Tested Sonnet 4.6 on ch1-3: found 12 issues (good catches on CEFR/contradiction) but missed ~14 more (dangling father subplot, duplicate questions, sentence ordering, missing config elements).

## Design

### Pass 5a: FIND (Reviewer)

Single call with full story context. Returns issues with severity but NO applied fixes — only a textual description of how to fix.

**Model:** Configurable (`story_review`), default Sonnet 4.6
**Input:** Full story text, character list, chapter configs
**Output:**

```json
{
  "issues": [
    {
      "chapter": 1,
      "sentence_index": 41,
      "category": "contradiction",
      "severity": "critical",
      "original": "Maria dice que sí.",
      "description": "Contradicts previous sentence where Maria said no.",
      "suggested_fix": "Change 'sí' to 'no' to match her answer.",
      "action": "rewrite"
    }
  ],
  "unnamed_characters": [...]
}
```

**Categories:** tense, character, continuity, cefr, scene_logic, dangling_reference, redundancy, narrative_flow, config_adherence
**Severities:** critical (goes to 5b) / minor (logged only)
**Actions:** rewrite / remove

### Pass 5b: FIX (Parallel Fixers)

One cheap LLM call per critical issue, all in parallel.

**Model:** Configurable (`story_fix`), default Gemini 3.1 Flash Lite
**Input per call:** Issue from 5a + ~10 surrounding sentences + chapter config + vocab preservation rules + reviewer's `suggested_fix`
**Output:** Fixed sentence (or empty string for remove)

### Iteration

After applying fixes, re-run 5a on updated text.
Stop when: 0 critical issues found, OR `audit_max_iterations` reached.
Config: `story.audit_max_iterations` (default 1).

### Pass 5c: IMAGE PROMPT AUDIT

Same two-phase pattern, runs once after text is final.

**Reviewer** checks: image prompts match sentences, shots ≤ 2-3 sentences (current distribution: 71% have 2, only 2 shots have 4), visual consistency with character visual_tags, removed/rewritten sentences still have appropriate prompts.

**Fixers** rewrite image prompts or split oversized shots in parallel.

Models: `image_review` (Sonnet) and `image_fix` (Gemini Flash Lite).

## Config Changes

### ModelsConfig (new keys)

```yaml
story_review:   # replaces story_audit
  provider: "openrouter"
  model: "anthropic/claude-sonnet-4-6"
  temperature: 0.3

story_fix:
  provider: "openrouter"
  model: "google/gemini-3.1-flash-lite-preview"
  temperature: 0.3

image_review:
  provider: "openrouter"
  model: "anthropic/claude-sonnet-4-6"
  temperature: 0.3

image_fix:
  provider: "openrouter"
  model: "google/gemini-3.1-flash-lite-preview"
  temperature: 0.3
```

### StoryConfig (new key)

```yaml
audit_max_iterations: 1
```

### Removed

`story_audit` model key — replaced by `story_review` + `story_fix`.

## Files Changed

| File | Change |
|------|--------|
| `pipeline/config.py` | Add new model keys, `audit_max_iterations`, remove `story_audit` |
| `pipeline/story_auditor.py` | Rewrite: `find_issues()` + `fix_issue()` + iteration; new `AuditIssue` model |
| `pipeline/image_auditor.py` | New file: image prompt review/fix |
| `scripts/run_all.py` | Update Pass 5 loop, add Pass 5c |
| `configs/spanish_buenos_aires.yaml` | Update model config |
| `tests/test_story_auditor.py` | Update for new API |
