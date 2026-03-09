# Story Auditor & Pipeline Reorder Design

**Date:** 2026-03-09
**Status:** Approved

## Problem

The pipeline produces semantic errors that cheap generation models miss:
- Verb collocations: "camina" (walks) used for cars and planes
- Character confusion: "amigas" (friends) for mother-daughter relationship
- Scene logic: actions impossible in the setting (street greeting from bedroom)
- Cross-chapter continuity: details that should carry over but don't

These require a reasoning model to catch — the generation model makes these errors because it lacks semantic depth.

## Solution

1. **Add a story auditor pass** — single LLM call with the full story, using a better model
2. **Reorder the pipeline** — move translation to the end so it happens once on clean text
3. **Simplify gap fillers** — they no longer need to produce translations

## Pipeline Order (new)

```
Pass 0: Story Generation          → stories_raw/  (source only)
Pass 1: CEFR Simplification       → stories/      (source only)
Pass 2: Grammar Audit + Gap Fill  → gap sentences  (source + insert_after)
Pass 3: Vocab Gap Fill            → gap sentences  (source + insert_after)
Pass 4: Insert gap sentences      → stories/      (final source text)
Pass 5: Story Audit               → stories/      (fixes applied to source)
Pass 6: Translation               → translations/ (one clean pass on final text)
Pass 7: Word Extraction           → words/        (uses translations)
```

**Key insight:** Everything before Pass 6 works on source (Spanish) text only. Translation happens exactly once on the final, audited, complete story. No duplicate translations, no post-hoc translation fixes.

## Story Auditor Design

### Input
- Full story: all chapters, all sentences (including inserted gap sentences)
- Character list with roles (from config: secondary_characters + protagonist)
- Chapter settings and CEFR levels (from config)

### LLM Call
Single call (~11K tokens input for 27 chapters). The model receives:
- System prompt defining the audit task
- Character reference (name, role, which chapters they appear in)
- All sentences labeled by chapter and index
- Checklist of what to look for

### What It Checks
1. **Verb collocations** — subjects use appropriate verbs for their type
2. **Character consistency** — relationships, names, presence per chapter
3. **Cross-chapter continuity** — recurring objects, details, plot threads
4. **CEFR level violations** — sentences too complex for target level
5. **Scene logic** — actions must fit the setting

### Output
JSON array of fixes:
```json
[
  {
    "chapter": 1,
    "sentence_index": 16,
    "original": "Las dos amigas se abrazan.",
    "fixed": "Maria y su madre se abrazan.",
    "reason": "Ingrid is Maria's mother, not her friend"
  }
]
```

### Auto-Apply
Fixes are applied to `stories/chapter_XX.json` source sentences. Translation hasn't happened yet, so no translation fixes needed.

## Config Changes

### New audit section in YAML
```yaml
story_audit:
  enabled: true
  provider: "google"           # or "openrouter"
  model: "gemini-2.5-flash"
```

### New AuditConfig in config.py
```python
class AuditConfig(BaseModel):
    enabled: bool = False
    provider: str = "google"
    model: str = "gemini-2.5-flash"
```

The audit uses a **separate LLM client** — the main generation stays on the cheap model, the audit uses a reasoning model.

## Gap Filler Simplification

Gap fillers currently produce `source + target + word_annotations`. With translation moved to the end:
- Gap fillers produce **source + covers + insert_after** only
- Remove `target` from gap filler prompts and output
- Remove `word_annotations` from gap filler output (word extractor handles this)
- `GapSentence.target` and `GapWordAnnotation` become optional/removed

## Cost

Story audit (27 chapters, single call):
- Gemini 2.5 Flash: $0.007
- DeepSeek V3.2: $0.003

## Files to Change

- `pipeline/story_auditor.py` — NEW: audit logic
- `pipeline/config.py` — add AuditConfig
- `pipeline/gap_filler.py` — remove target/translation from prompt and output
- `pipeline/grammar_gap_filler.py` — remove target/translation from prompt and output
- `pipeline/models.py` — make GapSentence.target optional, GrammarGapSentence.target optional
- `scripts/run_all.py` — reorder passes, add audit step, support separate audit LLM client
- `configs/spanish_buenos_aires.yaml` — add story_audit section
