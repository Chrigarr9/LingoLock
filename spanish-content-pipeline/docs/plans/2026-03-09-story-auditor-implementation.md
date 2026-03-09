# Story Auditor & Pipeline Reorder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a story audit pass that catches semantic errors using a reasoning model, and reorder the pipeline so translation happens once at the end on clean text.

**Architecture:** New `story_auditor.py` makes a single LLM call with the full story + character context. Pipeline reordered: generate → simplify → grammar gaps → vocab gaps → insert → audit → translate → extract words. Gap fillers simplified to source-only output.

**Tech Stack:** Python, Pydantic models, existing LLM clients (Google Gemini + OpenRouter)

**Design doc:** `docs/plans/2026-03-09-story-auditor-design.md`

---

### Task 1: Add AuditConfig to config.py

**Files:**
- Modify: `pipeline/config.py`
- Modify: `configs/spanish_buenos_aires.yaml`

**Step 1: Add AuditConfig model to config.py**

After `AudioGenerationConfig`, add:

```python
class AuditConfig(BaseModel):
    enabled: bool = False
    provider: str = "google"
    model: str = "gemini-2.5-flash"
    temperature: float = 0.3  # Low temp for analytical task
```

Add to `DeckConfig`:
```python
story_audit: AuditConfig | None = None
```

**Step 2: Add story_audit section to YAML config**

```yaml
story_audit:
  enabled: true
  provider: "google"
  model: "gemini-2.5-flash"
```

**Step 3: Run existing tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -x -q`
Expected: All pass (config is backwards-compatible with optional field)

**Step 4: Commit**

```
feat(config): add AuditConfig for story auditor
```

---

### Task 2: Create story_auditor.py

**Files:**
- Create: `pipeline/story_auditor.py`
- Create: `tests/test_story_auditor.py`

**Step 1: Write the test**

```python
"""Tests for story_auditor module."""
import json
from unittest.mock import MagicMock

from pipeline.story_auditor import audit_story, AuditFix


def _make_llm_response(fixes: list[dict]) -> MagicMock:
    resp = MagicMock()
    resp.parsed = {"fixes": fixes}
    return resp


def test_audit_finds_verb_collocation_error():
    """The auditor should flag 'camina' used for a car."""
    chapters = {
        1: ["Maria mira la calle.", "El coche rojo camina despacio."],
    }
    characters = [
        {"name": "Maria", "role": "protagonist"},
    ]
    chapter_configs = [
        {"title": "Drive to Airport", "cefr_level": "A1", "context": "Maria drives to the airport."},
    ]

    fix = {
        "chapter": 1,
        "sentence_index": 1,
        "original": "El coche rojo camina despacio.",
        "fixed": "El coche rojo va despacio.",
        "reason": "Cars don't walk (caminar). Use ir/avanzar.",
    }

    llm = MagicMock()
    llm.complete_json.return_value = _make_llm_response([fix])

    result = audit_story(
        chapters=chapters,
        characters=characters,
        chapter_configs=chapter_configs,
        llm=llm,
    )

    assert len(result) == 1
    assert result[0].chapter == 1
    assert result[0].sentence_index == 1
    assert "va despacio" in result[0].fixed


def test_audit_returns_empty_when_no_errors():
    chapters = {1: ["Maria mira la calle.", "Ella sonríe."]}
    characters = [{"name": "Maria", "role": "protagonist"}]
    chapter_configs = [{"title": "Ch1", "cefr_level": "A1", "context": "Maria walks."}]

    llm = MagicMock()
    llm.complete_json.return_value = _make_llm_response([])

    result = audit_story(
        chapters=chapters, characters=characters,
        chapter_configs=chapter_configs, llm=llm,
    )
    assert result == []


def test_audit_fix_model():
    fix = AuditFix(
        chapter=1, sentence_index=2,
        original="Las amigas hablan.", fixed="Maria y su madre hablan.",
        reason="Ingrid is her mother",
    )
    assert fix.chapter == 1
    assert fix.original == "Las amigas hablan."
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_story_auditor.py -v`
Expected: FAIL — `ImportError: cannot import name 'audit_story'`

**Step 3: Implement story_auditor.py**

```python
"""Pass 5: Audit the complete story for semantic errors.

Single LLM call with the full story text, character list, and chapter
configs. Returns a list of fixes that are auto-applied to stories/.
"""

import json
from pathlib import Path

from pydantic import BaseModel


class AuditFix(BaseModel):
    chapter: int
    sentence_index: int
    original: str
    fixed: str
    reason: str


def _build_audit_prompt(
    chapters: dict[int, list[str]],
    characters: list[dict],
    chapter_configs: list[dict],
) -> tuple[str, str]:
    """Build system prompt and user prompt for the audit call."""

    # Character reference
    char_lines = []
    for c in characters:
        role = c.get("role", "character")
        chapters_in = c.get("chapters", [])
        ch_note = f" (chapters {chapters_in})" if chapters_in else ""
        char_lines.append(f"  - {c['name']}: {role}{ch_note}")
    char_block = "\n".join(char_lines)

    # Full story text
    story_lines = []
    for ch_num in sorted(chapters.keys()):
        cfg = chapter_configs[ch_num - 1] if ch_num <= len(chapter_configs) else {}
        title = cfg.get("title", f"Chapter {ch_num}")
        cefr = cfg.get("cefr_level", "?")
        story_lines.append(f"\n--- Chapter {ch_num}: \"{title}\" [{cefr}] ---")
        for idx, sentence in enumerate(chapters[ch_num]):
            story_lines.append(f"  [{ch_num}:{idx}] {sentence}")
    story_block = "\n".join(story_lines)

    system = (
        "You are an expert Spanish language editor reviewing a graded reader story "
        "for language learners. You check for semantic errors, not style preferences. "
        "Only flag clear mistakes. Return valid JSON."
    )

    prompt = (
        f"Review this complete story for errors.\n\n"
        f"CHARACTERS:\n{char_block}\n\n"
        f"STORY:\n{story_block}\n\n"
        f"Check for:\n"
        f"1. VERB COLLOCATIONS — subjects must use appropriate verbs "
        f"(cars/planes don't 'caminar', people don't 'volar')\n"
        f"2. CHARACTER CONSISTENCY — names, relationships, who appears where "
        f"(check character list above)\n"
        f"3. CROSS-CHAPTER CONTINUITY — objects/details that should carry over\n"
        f"4. CEFR LEVEL VIOLATIONS — sentences too complex for the chapter's level\n"
        f"5. SCENE LOGIC — actions must fit the setting\n\n"
        f"Return ONLY a JSON object with a 'fixes' array. Each fix:\n"
        f'{{\n'
        f'  "fixes": [\n'
        f'    {{\n'
        f'      "chapter": 1,\n'
        f'      "sentence_index": 5,\n'
        f'      "original": "exact original sentence",\n'
        f'      "fixed": "corrected sentence",\n'
        f'      "reason": "brief explanation"\n'
        f'    }}\n'
        f'  ]\n'
        f'}}\n\n'
        f"If no errors found, return {{\"fixes\": []}}."
    )

    return system, prompt


def audit_story(
    chapters: dict[int, list[str]],
    characters: list[dict],
    chapter_configs: list[dict],
    llm=None,
) -> list[AuditFix]:
    """Audit the full story and return a list of fixes."""
    if not chapters or llm is None:
        return []

    system, prompt = _build_audit_prompt(chapters, characters, chapter_configs)
    response = llm.complete_json(prompt, system=system)
    raw_fixes = response.parsed.get("fixes", [])

    fixes = []
    for f in raw_fixes:
        try:
            fixes.append(AuditFix(**f))
        except Exception:
            continue  # Skip malformed fixes

    return fixes


def apply_fixes(
    fixes: list[AuditFix],
    stories_dir: Path,
) -> int:
    """Apply audit fixes to story JSON files. Returns count of applied fixes."""
    applied = 0

    # Group by chapter
    by_chapter: dict[int, list[AuditFix]] = {}
    for fix in fixes:
        by_chapter.setdefault(fix.chapter, []).append(fix)

    for ch_num, ch_fixes in by_chapter.items():
        path = stories_dir / f"chapter_{ch_num:02d}.json"
        if not path.exists():
            continue

        data = json.loads(path.read_text())
        modified = False

        for scene in data.get("scenes", []):
            for shot in scene.get("shots", []):
                for sentence in shot.get("sentences", []):
                    for fix in ch_fixes:
                        if (sentence.get("sentence_index") == fix.sentence_index
                                and sentence.get("source") == fix.original):
                            sentence["source"] = fix.fixed
                            modified = True
                            applied += 1

        if modified:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    return applied
```

**Step 4: Run tests**

Run: `uv run pytest tests/test_story_auditor.py -v`
Expected: All 3 pass

**Step 5: Commit**

```
feat(pipeline): add story_auditor with full-story audit and auto-fix
```

---

### Task 3: Simplify gap fillers — remove translation from output

**Files:**
- Modify: `pipeline/gap_filler.py` — remove `target` and `word_annotations` from prompt
- Modify: `pipeline/grammar_gap_filler.py` — remove `target` from prompt
- Modify: `pipeline/models.py` — make `GapSentence.target` and `GrammarGapSentence.target` optional (default "")
- Modify: `tests/test_gap_filler.py` — update expected output
- Modify: `tests/test_grammar_gap_filler.py` — update expected output

**Step 1: Make target optional in models.py**

In `GapSentence`:
```python
target: str = ""  # No longer generated by gap filler; translator handles this
```

In `GrammarGapSentence`:
```python
target: str = ""  # No longer generated by gap filler; translator handles this
```

In `GapWordAnnotation`: keep as-is for now (backwards compat), but gap filler won't produce it.

**Step 2: Simplify gap_filler.py prompt**

In `_generate_sentences`, change the JSON template from:
```
"source": "...", "target": "...", "covers": [...], "insert_after": N, "word_annotations": {...}
```
to:
```
"source": "...", "covers": [...], "insert_after": N
```

Remove the `word_annotations` parsing. Set `target=""` on the `GapSentence`.

**Step 3: Simplify grammar_gap_filler.py prompt**

Remove `"4. Provide a {self._native_lang} translation for each sentence.\n"` and the `"target"` field from the JSON template. Set `target=""` on `GrammarGapSentence`.

**Step 4: Update tests**

Remove assertions on `target` values in gap filler tests. Update mock LLM responses to not include `target`.

**Step 5: Run all tests**

Run: `uv run pytest tests/ -x -q`
Expected: All pass

**Step 6: Commit**

```
refactor(pipeline): simplify gap fillers to source-only output

Translation moved to end of pipeline. Gap fillers no longer produce
target translations or word annotations — the translator and word
extractor handle these uniformly.
```

---

### Task 4: Reorder pipeline in run_all.py

**Files:**
- Modify: `scripts/run_all.py`

This is the core rewiring. The new `run_text_stage` order:

```python
# Pass 0: Story Generation → stories_raw/
# Pass 1: CEFR Simplification → stories/
# Pass 2: Grammar Audit + Grammar Gap Fill → gap sentences (source only)
# Pass 3: Vocab Gap Fill → gap sentences (source only)  [if fill-gaps in same stage]
# Pass 4: Insert gap sentences into stories/
# Pass 5: Story Audit → fixes applied to stories/
# Pass 6: Translation → translations/
# Pass 7: Word Extraction → words/ + vocabulary.json
```

**Step 1: Restructure run_text_stage**

Key changes:
- Move grammar audit + gap fill BEFORE translation
- Gap sentences inserted into `stories/` JSON (not translations/)
- Add story audit call between insertion and translation
- Create separate audit LLM client from config
- Translation now operates on final `stories/` files (extracting flat text)

**Step 2: Add audit LLM client creation in main()**

```python
audit_llm = None
if config.story_audit and config.story_audit.enabled:
    audit_key = get_api_key_for_provider(config.story_audit.provider)
    audit_llm = create_client(
        provider=config.story_audit.provider,
        api_key=audit_key,
        model=config.story_audit.model,
        temperature=config.story_audit.temperature,
    )
```

Note: `get_api_key` needs updating to accept a provider parameter (currently it reads from config.llm.provider). Extract a `get_api_key_for_provider(provider: str)` helper.

**Step 3: Wire up story audit in the text stage**

After gap sentence insertion, before translation:
```python
if audit_llm:
    from pipeline.story_auditor import audit_story, apply_fixes
    # Build chapters dict from stories/
    # Build characters list from config
    # Call audit_story()
    # Print fixes
    # Call apply_fixes()
```

**Step 4: Update gap sentence insertion**

Currently gap sentences are inserted into `translations/`. Change to insert into `stories/` JSON files instead — adding new `ShotSentence` entries to the appropriate shots.

This requires a new helper: given a chapter's `ChapterScene` and a list of gap sentences with `insert_after` positions, insert new `ShotSentence` entries at the right spots and re-index.

**Step 5: Run full pipeline on chapters 1-3**

Run: `uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --chapters 1-3 --frequency-file data/frequency/es_50k.txt`

Verify:
- stories/ has gap sentences inserted
- Audit runs and reports fixes (or clean bill of health)
- translations/ has clean translations of the final text
- words/ and vocabulary.json built correctly

**Step 6: Run tests**

Run: `uv run pytest tests/ -x -q`

**Step 7: Commit**

```
feat(pipeline): reorder passes — translate once at end on audited text

Pipeline now: generate → simplify → grammar gaps → vocab gaps →
insert gaps → audit → translate → extract words. Translation happens
once on the final, clean source text.
```

---

### Task 5: Integration test with chapters 1-3

**Step 1: Delete old output to force fresh generation**

```bash
rm -rf output/es-de-buenos-aires/stories/ output/es-de-buenos-aires/translations/ output/es-de-buenos-aires/words/ output/es-de-buenos-aires/vocabulary.json output/es-de-buenos-aires/gap_sentences/
# Keep stories_raw/ to avoid re-generating
```

**Step 2: Run full text pipeline**

```bash
uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --chapters 1-3 --frequency-file data/frequency/es_50k.txt --top-n 250
```

**Step 3: Verify output**

- Check stories/ for gap sentences present
- Check audit output (should print fixes or "no issues")
- Check translations/ has complete translations
- Check coverage report

**Step 4: Commit if clean**

```
test(pipeline): verify reordered pipeline with chapters 1-3
```
