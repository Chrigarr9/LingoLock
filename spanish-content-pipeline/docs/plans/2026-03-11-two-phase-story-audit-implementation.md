# Two-Phase Story Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-pass story auditor with a find→fix loop (Sonnet finds issues, Gemini Flash fixes them in parallel), iterable up to N times, followed by an image prompt audit pass.

**Architecture:** Pass 5a uses a "reviewer" model to scan the full story and return issues with severity + suggested fixes (no applied changes). Pass 5b spawns one "fixer" LLM call per critical issue in parallel via ThreadPoolExecutor, each getting only the surrounding context. The loop repeats up to `audit_max_iterations` times or until 0 critical issues. Pass 5c applies the same pattern to image prompts.

**Tech Stack:** Python, Pydantic, concurrent.futures.ThreadPoolExecutor, existing LLMClient/GeminiClient

---

### Task 1: Update Config — Add New Model Keys and Story Params

**Files:**
- Modify: `pipeline/config.py:66-76` (ModelsConfig)
- Modify: `pipeline/config.py:48-55` (StoryConfig)
- Modify: `configs/spanish_buenos_aires.yaml:549-553` (replace story_audit)

**Step 1: Write the failing test**

In `tests/test_config.py` (or create if not exists), add:

```python
"""Tests for config loading with new audit fields."""
import yaml
from pipeline.config import load_config, DeckConfig, ModelsConfig, StoryConfig
from pathlib import Path
import tempfile


def test_config_loads_story_review_and_fix_models():
    """ModelsConfig must accept story_review and story_fix instead of story_audit."""
    config = load_config(Path("configs/spanish_buenos_aires.yaml"))
    assert hasattr(config.models, "story_review")
    assert hasattr(config.models, "story_fix")
    assert config.models.story_review.model == "anthropic/claude-sonnet-4-6"
    assert "flash" in config.models.story_fix.model.lower()


def test_config_loads_image_review_and_fix_models():
    """ModelsConfig must accept image_review and image_fix."""
    config = load_config(Path("configs/spanish_buenos_aires.yaml"))
    assert hasattr(config.models, "image_review")
    assert hasattr(config.models, "image_fix")


def test_config_loads_audit_max_iterations():
    """StoryConfig must have audit_max_iterations with default 1."""
    config = load_config(Path("configs/spanish_buenos_aires.yaml"))
    assert config.story.audit_max_iterations >= 1


def test_audit_max_iterations_defaults_to_1():
    """When audit_max_iterations is not in YAML, it defaults to 1."""
    m = StoryConfig(
        cefr_level="A1",
        sentences_per_chapter=[25, 35],
        chapters=[],
    )
    assert m.audit_max_iterations == 1
```

**Step 2: Run test to verify it fails**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_config.py -v`
Expected: FAIL — `story_review` not found on ModelsConfig, `audit_max_iterations` not on StoryConfig.

**Step 3: Update `pipeline/config.py`**

In `ModelsConfig` (line 66), replace `story_audit: ModelConfig` with:

```python
class ModelsConfig(BaseModel):
    """Per-step model configuration. Each pipeline pass uses its own model."""
    story_generation: ModelConfig
    cefr_simplification: ModelConfig
    grammar: ModelConfig
    gap_filling: ModelConfig
    chapter_audit: ModelConfig
    story_review: ModelConfig      # Pass 5a: find issues (e.g. Sonnet)
    story_fix: ModelConfig         # Pass 5b: fix issues in parallel (e.g. Gemini Flash)
    image_review: ModelConfig      # Pass 5c: review image prompts
    image_fix: ModelConfig         # Pass 5c: fix image prompts in parallel
    translation: ModelConfig
    word_extraction: ModelConfig
    lemmatization: ModelConfig | None = None
```

In `StoryConfig` (line 48), add:

```python
class StoryConfig(BaseModel):
    cefr_level: str
    sentences_per_chapter: list[int]
    chapters: list[ChapterDef]
    grammar_targets: dict[str, list[str]] = {}
    coverage_top_n: int = 1000
    frequency_file: str | None = None
    narration_style: str = "third-person"
    audit_max_iterations: int = 1  # Max find→fix cycles in story audit
```

**Step 4: Update `configs/spanish_buenos_aires.yaml`**

Replace the `story_audit:` block (lines 549-553) with:

```yaml
  # Pass 5a: Story review — Sonnet 4.6 (finds issues across chapters)
  story_review:
    provider: "openrouter"
    model: "anthropic/claude-sonnet-4-6"
    temperature: 0.3

  # Pass 5b: Story fix — Gemini 3.1 FL (cheap, applies fixes in parallel)
  story_fix:
    provider: "openrouter"
    model: "google/gemini-3.1-flash-lite-preview"
    temperature: 0.3

  # Pass 5c: Image prompt review — Sonnet 4.6
  image_review:
    provider: "openrouter"
    model: "anthropic/claude-sonnet-4-6"
    temperature: 0.3

  # Pass 5c: Image prompt fix — Gemini 3.1 FL
  image_fix:
    provider: "openrouter"
    model: "google/gemini-3.1-flash-lite-preview"
    temperature: 0.3
```

Add under `story:` section (after `narration_style`):

```yaml
  audit_max_iterations: 1
```

**Step 5: Run tests to verify they pass**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_config.py -v`
Expected: all 4 PASS

**Step 6: Commit**

```bash
git add pipeline/config.py configs/spanish_buenos_aires.yaml tests/test_config.py
git commit -m "feat: add story_review/story_fix/image_review/image_fix model config keys, audit_max_iterations"
```

---

### Task 2: Rewrite Story Auditor — Find Phase (5a)

**Files:**
- Modify: `pipeline/story_auditor.py` (rewrite core)
- Modify: `tests/test_story_auditor.py`

**Step 1: Write the failing tests**

Replace `tests/test_story_auditor.py` entirely:

```python
"""Tests for two-phase story auditor."""
import json
from unittest.mock import MagicMock

from pipeline.story_auditor import find_issues, AuditIssue, UnnamedCharacter


def _make_find_response(issues: list[dict], unnamed: list[dict] | None = None) -> MagicMock:
    resp = MagicMock()
    resp.parsed = {"issues": issues, "unnamed_characters": unnamed or []}
    return resp


def test_find_issues_returns_audit_issues():
    """find_issues should parse LLM response into AuditIssue objects."""
    issue = {
        "chapter": 1,
        "sentence_index": 5,
        "category": "scene_logic",
        "severity": "critical",
        "original": "El coche rojo camina despacio.",
        "description": "Cars don't walk.",
        "suggested_fix": "Change 'camina' to 'va'.",
        "action": "rewrite",
    }

    llm = MagicMock()
    llm.complete_json.return_value = _make_find_response([issue])

    (issues, unnamed), _ = find_issues(
        chapters={1: ["Maria mira.", "El coche rojo camina despacio."]},
        characters=[{"name": "Maria", "role": "protagonist"}],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": "Driving."}],
        llm=llm,
    )

    assert len(issues) == 1
    assert issues[0].category == "scene_logic"
    assert issues[0].severity == "critical"
    assert issues[0].suggested_fix == "Change 'camina' to 'va'."


def test_find_issues_filters_by_severity():
    """Only critical issues should be in the critical subset."""
    issues_raw = [
        {"chapter": 1, "sentence_index": 0, "category": "redundancy",
         "severity": "minor", "original": "A.", "description": "minor",
         "suggested_fix": "x", "action": "rewrite"},
        {"chapter": 1, "sentence_index": 1, "category": "contradiction",
         "severity": "critical", "original": "B.", "description": "critical",
         "suggested_fix": "y", "action": "rewrite"},
    ]

    llm = MagicMock()
    llm.complete_json.return_value = _make_find_response(issues_raw)

    (issues, _), _ = find_issues(
        chapters={1: ["A.", "B."]},
        characters=[],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=llm,
    )

    assert len(issues) == 2
    critical = [i for i in issues if i.severity == "critical"]
    minor = [i for i in issues if i.severity == "minor"]
    assert len(critical) == 1
    assert len(minor) == 1


def test_find_issues_returns_empty_on_clean_story():
    llm = MagicMock()
    llm.complete_json.return_value = _make_find_response([])

    (issues, _), _ = find_issues(
        chapters={1: ["Maria mira."]},
        characters=[],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=llm,
    )
    assert issues == []


def test_find_issues_handles_remove_action():
    issue = {
        "chapter": 1, "sentence_index": 2, "category": "dangling_reference",
        "severity": "critical", "original": "¿Vas a ver a tu padre?",
        "description": "No father in character list.",
        "suggested_fix": "Remove this sentence entirely.",
        "action": "remove",
    }

    llm = MagicMock()
    llm.complete_json.return_value = _make_find_response([issue])

    (issues, _), _ = find_issues(
        chapters={1: ["A.", "B.", "¿Vas a ver a tu padre?"]},
        characters=[],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=llm,
    )

    assert issues[0].action == "remove"


def test_audit_issue_model_defaults():
    """AuditIssue should have sensible defaults."""
    issue = AuditIssue(
        chapter=1, sentence_index=0, category="tense",
        severity="critical", original="Test.",
        description="Tense error.", suggested_fix="Fix it.",
    )
    assert issue.action == "rewrite"
```

**Step 2: Run tests to verify they fail**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_story_auditor.py -v`
Expected: FAIL — `find_issues` and `AuditIssue` don't exist.

**Step 3: Rewrite `pipeline/story_auditor.py` — models and find phase**

Replace the entire file with:

```python
"""Pass 5: Two-phase story audit — find issues then fix them.

Phase 5a: Reviewer model scans the full story, returns issues with severity
          and suggested fixes (no changes applied).
Phase 5b: Fixer model resolves each critical issue in parallel, getting only
          the surrounding context it needs.
"""

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Literal

from pydantic import BaseModel


# ── Models ──────────────────────────────────────────────────────────────

class AuditIssue(BaseModel):
    """An issue found by the reviewer (Pass 5a)."""
    chapter: int
    sentence_index: int
    category: str
    severity: Literal["critical", "minor"] = "critical"
    original: str
    description: str
    suggested_fix: str
    action: Literal["rewrite", "remove"] = "rewrite"


class AuditFix(BaseModel):
    """A resolved fix from the fixer (Pass 5b)."""
    chapter: int
    sentence_index: int
    original: str
    fixed: str  # empty string for "remove"
    action: Literal["rewrite", "remove"] = "rewrite"


class UnnamedCharacter(BaseModel):
    role: str
    chapters: list[int]
    suggested_visual_tag: str = ""


# ── Pass 5a: FIND ───────────────────────────────────────────────────────

def _build_find_prompt(
    chapters: dict[int, list[str]],
    characters: list[dict],
    chapter_configs: list[dict],
) -> tuple[str, str]:
    """Build system + user prompt for the reviewer call."""

    # Character reference
    char_lines = []
    for c in characters:
        role = c.get("role", "character")
        chapters_in = c.get("chapters", [])
        ch_note = f" (chapters {chapters_in})" if chapters_in else ""
        vtag = c.get("visual_tag", "")
        vtag_note = f" | appearance: {vtag}" if vtag else ""
        char_lines.append(f"  - {c['name']}: {role}{ch_note}{vtag_note}")
    char_block = "\n".join(char_lines)

    # Full story text
    story_lines = []
    for ch_num in sorted(chapters.keys()):
        cfg = chapter_configs[ch_num - 1] if ch_num <= len(chapter_configs) else {}
        title = cfg.get("title", f"Chapter {ch_num}")
        cefr = cfg.get("cefr_level", "?")
        context = cfg.get("context", "")
        story_lines.append(f"\n--- Chapter {ch_num}: \"{title}\" [{cefr}] ---")
        if context:
            story_lines.append(f"  Context: {context}")
        for idx, sentence in enumerate(chapters[ch_num]):
            story_lines.append(f"  [{ch_num}:{idx}] {sentence}")
    story_block = "\n".join(story_lines)

    system = (
        "You are an expert language editor reviewing a graded reader story "
        "for language learners. You find semantic, grammatical, continuity, "
        "and narrative quality issues. You describe how to fix each issue "
        "but do NOT write the fixed sentence yourself. Return valid JSON."
    )

    prompt = (
        f"Review this complete story and find ALL issues.\n\n"
        f"CHARACTERS:\n{char_block}\n\n"
        f"STORY:\n{story_block}\n\n"
        f"Check for ALL of the following categories:\n\n"
        f"1. TENSE CONSISTENCY\n"
        f"   - Narrative tense must be consistent within each chapter\n"
        f"   - Past events in past tense, not present\n\n"
        f"2. CHARACTER CONSISTENCY\n"
        f"   - Characters must only appear in their assigned chapters\n"
        f"   - Names, relationships, roles must be consistent\n\n"
        f"3. CROSS-CHAPTER CONTINUITY\n"
        f"   - Objects, clothing, possessions consistent across chapters\n"
        f"   - Locations must match the story context\n\n"
        f"4. CEFR LEVEL VIOLATIONS\n"
        f"   - Each chapter has a CEFR level in brackets [A1], [A2], etc.\n"
        f"   - A1: only simple present, ser/estar, hay, basic adjectives, simple questions\n"
        f"   - A1 must NOT have: subjunctive, compound tenses, imperatives with clitics, "
        f"preterite, imperfecto\n"
        f"   - A2 may add: preterite, imperfecto, reflexives, comparatives, modals\n\n"
        f"5. SCENE LOGIC\n"
        f"   - Actions must fit the setting described in the chapter context\n"
        f"   - No contradictions between adjacent sentences\n"
        f"   - Verb collocations must be correct\n\n"
        f"6. DANGLING REFERENCES\n"
        f"   - Sentences introducing people, objects, or subplots NOT in the chapter "
        f"context or character list\n"
        f"   - Example: asking about a father when no father exists in the character list\n"
        f"   - Use action \"remove\" for these\n\n"
        f"7. REDUNDANCY\n"
        f"   - Same question asked twice in the same chapter\n"
        f"   - Same emotion expressed in 3+ consecutive sentences\n"
        f"   - Same key word in adjacent sentences\n\n"
        f"8. NARRATIVE FLOW\n"
        f"   - Events must occur in logical order\n"
        f"   - Non-sequiturs that break conversational flow\n"
        f"   - Example: saying \"hello\" mid-conversation\n\n"
        f"9. CONFIG ADHERENCE\n"
        f"   - The chapter CONTEXT describes the intended plot\n"
        f"   - Flag significant scene beats from the context that are completely absent\n"
        f"   - Only flag important omissions, not minor details\n\n"
        f"SEVERITY GUIDE:\n"
        f"  critical — contradictions, wrong CEFR grammar, dangling references, "
        f"broken logic, missing major plot beats\n"
        f"  minor — slight redundancy, minor word repetition, very small omissions\n\n"
        f"IMPORTANT CONTEXT:\n"
        f"  - This is a language learning app. Every sentence teaches vocabulary.\n"
        f"  - When describing fixes, instruct the fixer to PRESERVE content words "
        f"(nouns, verbs, adjectives). Only grammar/word-order/function-word changes.\n"
        f"  - Exception: \"remove\" actions and dangling references can lose words.\n\n"
        f"10. UNNAMED RECURRING CHARACTERS\n"
        f"   - Unnamed characters appearing in 2+ chapters\n"
        f"   - Report in separate 'unnamed_characters' array\n\n"
        f"Return ONLY this JSON structure:\n"
        f'{{\n'
        f'  "issues": [\n'
        f'    {{\n'
        f'      "chapter": 1,\n'
        f'      "sentence_index": 5,\n'
        f'      "category": "scene_logic",\n'
        f'      "severity": "critical",\n'
        f'      "original": "exact original sentence",\n'
        f'      "description": "What is wrong and why",\n'
        f'      "suggested_fix": "How to fix it (text description, not the fixed sentence)",\n'
        f'      "action": "rewrite"\n'
        f'    }}\n'
        f'  ],\n'
        f'  "unnamed_characters": [\n'
        f'    {{"role": "bus driver", "chapters": [3, 7], '
        f'"suggested_visual_tag": "middle-aged man, grey moustache, blue cap"}}\n'
        f'  ]\n'
        f'}}\n\n'
        f'If no issues found, return {{"issues": [], "unnamed_characters": []}}.'
    )

    return system, prompt


def find_issues(
    chapters: dict[int, list[str]],
    characters: list[dict],
    chapter_configs: list[dict],
    llm=None,
) -> tuple[tuple[list[AuditIssue], list[UnnamedCharacter]], object]:
    """Pass 5a: Find issues in the story. Returns ((issues, unnamed_chars), LLMResponse)."""
    if not chapters or llm is None:
        return ([], []), None

    system, prompt = _build_find_prompt(chapters, characters, chapter_configs)
    response = llm.complete_json(prompt, system=system)

    issues = []
    for raw in response.parsed.get("issues", []):
        try:
            issues.append(AuditIssue(**raw))
        except Exception:
            continue

    unnamed = []
    for u in response.parsed.get("unnamed_characters", []):
        try:
            unnamed.append(UnnamedCharacter(**u))
        except Exception:
            continue

    return (issues, unnamed), response


# ── Pass 5b: FIX ────────────────────────────────────────────────────────

def _build_fix_prompt(
    issue: AuditIssue,
    surrounding: list[str],
    chapter_config: dict,
) -> tuple[str, str]:
    """Build prompt for a single fixer call."""

    context_block = "\n".join(f"  {s}" for s in surrounding)
    ch_context = chapter_config.get("context", "")
    cefr = chapter_config.get("cefr_level", "?")

    system = (
        "You are a language editor fixing one specific issue in a graded reader "
        "for language learners. Apply the suggested fix precisely. "
        "Return valid JSON."
    )

    if issue.action == "remove":
        prompt = (
            f"TASK: Remove this sentence from the story.\n\n"
            f"Chapter {issue.chapter} [{cefr}]\n"
            f"Context: {ch_context}\n\n"
            f"Surrounding sentences:\n{context_block}\n\n"
            f"Sentence to remove:\n  [{issue.chapter}:{issue.sentence_index}] {issue.original}\n\n"
            f"Reason: {issue.description}\n\n"
            f"Return: {{\"fixed\": \"\", \"action\": \"remove\"}}"
        )
    else:
        prompt = (
            f"TASK: Fix this sentence in a graded reader story.\n\n"
            f"Chapter {issue.chapter} [{cefr}]\n"
            f"Context: {ch_context}\n\n"
            f"Surrounding sentences:\n{context_block}\n\n"
            f"Problem sentence:\n  [{issue.chapter}:{issue.sentence_index}] {issue.original}\n\n"
            f"Issue: {issue.description}\n"
            f"How to fix: {issue.suggested_fix}\n\n"
            f"RULES:\n"
            f"  - PRESERVE all content words (nouns, verbs, adjectives, adverbs)\n"
            f"  - Only change grammar, word order, or function words\n"
            f"  - The chapter is [{cefr}] level — the fix must respect this CEFR level\n"
            f"  - Make the MINIMAL change needed\n\n"
            f"Return ONLY: {{\"fixed\": \"the corrected sentence\", \"action\": \"rewrite\"}}"
        )

    return system, prompt


def _get_surrounding(
    chapters: dict[int, list[str]],
    chapter: int,
    sentence_index: int,
    window: int = 5,
) -> list[str]:
    """Get surrounding sentences for context (window sentences before and after)."""
    sentences = chapters.get(chapter, [])
    start = max(0, sentence_index - window)
    end = min(len(sentences), sentence_index + window + 1)
    result = []
    for i in range(start, end):
        marker = " >>>" if i == sentence_index else "    "
        result.append(f"{marker} [{chapter}:{i}] {sentences[i]}")
    return result


def fix_issue(
    issue: AuditIssue,
    chapters: dict[int, list[str]],
    chapter_configs: list[dict],
    llm=None,
) -> AuditFix:
    """Pass 5b: Fix a single issue. Returns an AuditFix."""
    if issue.action == "remove":
        # No LLM call needed for removals
        return AuditFix(
            chapter=issue.chapter,
            sentence_index=issue.sentence_index,
            original=issue.original,
            fixed="",
            action="remove",
        )

    ch_cfg = chapter_configs[issue.chapter - 1] if issue.chapter <= len(chapter_configs) else {}
    surrounding = _get_surrounding(chapters, issue.chapter, issue.sentence_index)

    system, prompt = _build_fix_prompt(issue, surrounding, ch_cfg)
    response = llm.complete_json(prompt, system=system)

    fixed_text = response.parsed.get("fixed", issue.original)
    action = response.parsed.get("action", "rewrite")

    return AuditFix(
        chapter=issue.chapter,
        sentence_index=issue.sentence_index,
        original=issue.original,
        fixed=fixed_text,
        action=action,
    )


def fix_issues_parallel(
    issues: list[AuditIssue],
    chapters: dict[int, list[str]],
    chapter_configs: list[dict],
    llm=None,
    max_workers: int = 4,
) -> tuple[list[AuditFix], list]:
    """Fix all critical issues in parallel. Returns (fixes, responses)."""
    critical = [i for i in issues if i.severity == "critical"]
    if not critical:
        return [], []

    fixes = []
    responses = []

    def _fix_one(issue):
        return fix_issue(issue, chapters, chapter_configs, llm=llm)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {pool.submit(_fix_one, issue): issue for issue in critical}
        for future in as_completed(future_map):
            issue = future_map[future]
            try:
                fix = future.result()
                fixes.append(fix)
            except Exception as e:
                print(f"    ERROR fixing Ch{issue.chapter}[{issue.sentence_index}]: {e}")

    return fixes, responses


# ── Apply fixes ─────────────────────────────────────────────────────────

def apply_fixes(
    fixes: list[AuditFix],
    stories_dir: Path,
) -> int:
    """Apply fixes to story JSON files. Returns count of applied fixes."""
    applied = 0

    by_chapter: dict[int, list[AuditFix]] = {}
    for fix in fixes:
        by_chapter.setdefault(fix.chapter, []).append(fix)

    for ch_num, ch_fixes in by_chapter.items():
        path = stories_dir / f"chapter_{ch_num:02d}.json"
        if not path.exists():
            continue

        data = json.loads(path.read_text())
        modified = False
        remove_indices: set[int] = set()

        for scene in data.get("scenes", []):
            for shot in scene.get("shots", []):
                for sentence in shot.get("sentences", []):
                    for fix in ch_fixes:
                        if (sentence.get("sentence_index") == fix.sentence_index
                                and sentence.get("source") == fix.original):
                            if fix.action == "remove":
                                remove_indices.add(fix.sentence_index)
                            else:
                                sentence["source"] = fix.fixed
                            modified = True
                            applied += 1

        if remove_indices:
            for scene in data.get("scenes", []):
                for shot in scene.get("shots", []):
                    shot["sentences"] = [
                        s for s in shot.get("sentences", [])
                        if s.get("sentence_index") not in remove_indices
                    ]
                scene["shots"] = [s for s in scene.get("shots", []) if s.get("sentences")]
            data["scenes"] = [s for s in data.get("scenes", []) if s.get("shots")]

        if modified:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    return applied
```

**Step 4: Run tests to verify they pass**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_story_auditor.py -v`
Expected: all 5 PASS

**Step 5: Commit**

```bash
git add pipeline/story_auditor.py tests/test_story_auditor.py
git commit -m "feat: rewrite story auditor as two-phase find/fix with parallel fixers"
```

---

### Task 3: Tests for Fix Phase and Apply

**Files:**
- Modify: `tests/test_story_auditor.py` (add fix tests)

**Step 1: Write additional tests**

Append to `tests/test_story_auditor.py`:

```python
from pipeline.story_auditor import fix_issue, fix_issues_parallel, apply_fixes, AuditFix
import tempfile


def test_fix_issue_remove_needs_no_llm():
    """Remove actions should return immediately without calling the LLM."""
    issue = AuditIssue(
        chapter=1, sentence_index=2, category="dangling_reference",
        severity="critical", original="¿Vas a ver a tu padre?",
        description="No father.", suggested_fix="Remove.",
        action="remove",
    )

    fix = fix_issue(issue, chapters={1: ["A.", "B.", "¿Vas a ver a tu padre?"]},
                    chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}])
    assert fix.action == "remove"
    assert fix.fixed == ""


def test_fix_issue_rewrite_calls_llm():
    """Rewrite actions should call the LLM with surrounding context."""
    issue = AuditIssue(
        chapter=1, sentence_index=1, category="scene_logic",
        severity="critical", original="El coche camina.",
        description="Cars don't walk.",
        suggested_fix="Change camina to va.",
    )

    llm = MagicMock()
    resp = MagicMock()
    resp.parsed = {"fixed": "El coche va.", "action": "rewrite"}
    llm.complete_json.return_value = resp

    fix = fix_issue(
        issue,
        chapters={1: ["Maria mira.", "El coche camina.", "Ella sonríe."]},
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": "Driving."}],
        llm=llm,
    )

    assert fix.fixed == "El coche va."
    assert fix.action == "rewrite"
    llm.complete_json.assert_called_once()


def test_fix_issues_parallel_skips_minor():
    """Only critical issues should be fixed."""
    issues = [
        AuditIssue(chapter=1, sentence_index=0, category="redundancy",
                    severity="minor", original="A.", description="minor",
                    suggested_fix="x"),
        AuditIssue(chapter=1, sentence_index=1, category="contradiction",
                    severity="critical", original="B.", description="critical",
                    suggested_fix="y", action="remove"),
    ]

    fixes, _ = fix_issues_parallel(
        issues,
        chapters={1: ["A.", "B."]},
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=None,  # remove doesn't need LLM
    )

    assert len(fixes) == 1
    assert fixes[0].action == "remove"


def test_apply_fixes_rewrite(tmp_path):
    """apply_fixes should rewrite matching sentences in story JSON."""
    story = {
        "scenes": [{"setting": "test", "description": "", "shots": [
            {"focus": "test", "image_prompt": "", "sentences": [
                {"source": "Bad sentence.", "sentence_index": 0},
                {"source": "Good sentence.", "sentence_index": 1},
            ]}
        ]}]
    }
    story_path = tmp_path / "chapter_01.json"
    story_path.write_text(json.dumps(story))

    fixes = [AuditFix(chapter=1, sentence_index=0, original="Bad sentence.",
                       fixed="Fixed sentence.", action="rewrite")]

    applied = apply_fixes(fixes, tmp_path)
    assert applied == 1

    result = json.loads(story_path.read_text())
    assert result["scenes"][0]["shots"][0]["sentences"][0]["source"] == "Fixed sentence."


def test_apply_fixes_remove(tmp_path):
    """apply_fixes should remove sentences and clean up empty shots."""
    story = {
        "scenes": [{"setting": "test", "description": "", "shots": [
            {"focus": "solo", "image_prompt": "", "sentences": [
                {"source": "Delete me.", "sentence_index": 0},
            ]},
            {"focus": "keep", "image_prompt": "", "sentences": [
                {"source": "Keep me.", "sentence_index": 1},
            ]},
        ]}]
    }
    story_path = tmp_path / "chapter_01.json"
    story_path.write_text(json.dumps(story))

    fixes = [AuditFix(chapter=1, sentence_index=0, original="Delete me.",
                       fixed="", action="remove")]

    applied = apply_fixes(fixes, tmp_path)
    assert applied == 1

    result = json.loads(story_path.read_text())
    # The first shot should be gone (empty after removal)
    assert len(result["scenes"][0]["shots"]) == 1
    assert result["scenes"][0]["shots"][0]["focus"] == "keep"
```

**Step 2: Run tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_story_auditor.py -v`
Expected: all 11 PASS (5 from task 2 + 6 new)

**Step 3: Commit**

```bash
git add tests/test_story_auditor.py
git commit -m "test: add fix phase and apply_fixes tests for story auditor"
```

---

### Task 4: Update run_all.py — Pass 5 Find→Fix Loop

**Files:**
- Modify: `scripts/run_all.py:427-486` (replace Pass 5)

**Step 1: Replace Pass 5 block in `scripts/run_all.py`**

Replace lines 427-486 (the entire Pass 5 section) with:

```python
    # Pass 5: Story Audit — iterative find→fix loop
    cost.begin("Pass 5: Story Audit")
    from pipeline.story_auditor import find_issues, fix_issues_parallel, apply_fixes

    max_iterations = config.story.audit_max_iterations
    llm_review = create_model_client(config.models.story_review)
    llm_fix = create_model_client(config.models.story_fix)

    # Build characters list from config
    characters = [{"name": config.protagonist.name, "role": "protagonist"}]
    for sc in config.secondary_characters:
        characters.append({
            "name": sc.name,
            "role": sc.role or "secondary character",
            "chapters": sc.chapters,
            "visual_tag": sc.visual_tag,
        })

    # Build chapter configs
    chapter_configs = [
        {"title": ch.title, "cefr_level": ch.cefr_level or config.story.cefr_level, "context": ch.context}
        for ch in config.story.chapters
    ]

    all_unnamed = []
    for iteration in range(1, max_iterations + 1):
        print(f"\n=== Pass 5a: Story Review (iteration {iteration}/{max_iterations}) ===")

        # Build chapters dict from current stories
        audit_chapters: dict[int, list[str]] = {}
        for i in chapter_range:
            audit_chapters[i + 1] = stories[i].split("\n")

        (issues, unnamed_chars), review_resp = find_issues(
            chapters=audit_chapters,
            characters=characters,
            chapter_configs=chapter_configs,
            llm=llm_review,
        )
        cost.add(review_resp)

        if unnamed_chars:
            all_unnamed.extend(unnamed_chars)

        critical = [i for i in issues if i.severity == "critical"]
        minor = [i for i in issues if i.severity == "minor"]
        print(f"  Found {len(critical)} critical, {len(minor)} minor issues")

        if not critical:
            print("  No critical issues — story is clean!")
            break

        for issue in issues:
            tag = "CRITICAL" if issue.severity == "critical" else "minor"
            print(f"    [{tag}] Ch{issue.chapter}[{issue.sentence_index}] "
                  f"({issue.category}): {issue.description}")

        # Pass 5b: Fix critical issues in parallel
        print(f"\n=== Pass 5b: Fixing {len(critical)} issues ===")
        fixes, fix_responses = fix_issues_parallel(
            issues,
            chapters=audit_chapters,
            chapter_configs=chapter_configs,
            llm=llm_fix,
            max_workers=4,
        )
        cost.add(fix_responses)

        for fix in fixes:
            if fix.action == "remove":
                print(f"    Ch{fix.chapter}[{fix.sentence_index}]: REMOVE")
            else:
                print(f"    Ch{fix.chapter}[{fix.sentence_index}]: {fix.original}")
                print(f"      → {fix.fixed}")

        stories_dir = output_base / config.deck.id / "stories"
        applied = apply_fixes(fixes, stories_dir)
        print(f"  Applied {applied}/{len(fixes)} fixes")

        # Reload stories from disk
        for i in chapter_range:
            story_path = stories_dir / f"chapter_{i+1:02d}.json"
            if story_path.exists():
                chapter_scenes[i] = ChapterScene(**json.loads(story_path.read_text()))
                stories[i] = extract_flat_text(chapter_scenes[i])

    if all_unnamed:
        print(f"\n  Unnamed recurring characters ({len(all_unnamed)}):")
        for uc in all_unnamed:
            print(f"    {uc.role} (chapters {uc.chapters}): {uc.suggested_visual_tag}")
```

**Step 2: Verify existing tests still pass**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v --timeout=30`
Expected: All tests PASS. No imports of old `audit_story` remain.

**Step 3: Fix any import references to old `audit_story`**

Search for remaining references:

```bash
grep -r "audit_story\|story_audit" pipeline/ scripts/ tests/ --include="*.py" | grep -v __pycache__
```

Update any remaining references. The benchmark file `benchmarks/bench_audit.py` uses the old API — leave it for now (it has its own fixture, separate concern).

**Step 4: Commit**

```bash
git add scripts/run_all.py
git commit -m "feat: replace Pass 5 with iterative find→fix story audit loop"
```

---

### Task 5: Update Test Script for Comparison

**Files:**
- Modify: `scripts/test_story_audit_sonnet.py` (update to use new API)

**Step 1: Update the comparison script**

Update `scripts/test_story_audit_sonnet.py` to use `find_issues` instead of `audit_story`, so it can be used to test the new reviewer. Replace the import and call:

```python
# Old:
from pipeline.story_auditor import audit_story, apply_fixes
# New:
from pipeline.story_auditor import find_issues, fix_issues_parallel, apply_fixes
```

And replace the `audit_story(...)` call with `find_issues(...)`, updating the output format to show issues with severity and categories.

**Step 2: Run manually to verify**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run python scripts/test_story_audit_sonnet.py`
Expected: Output shows categorized issues with severity levels.

**Step 3: Commit**

```bash
git add scripts/test_story_audit_sonnet.py
git commit -m "refactor: update comparison script for two-phase audit API"
```

---

### Task 6: Image Prompt Auditor (Pass 5c)

**Files:**
- Create: `pipeline/image_auditor.py`
- Create: `tests/test_image_auditor.py`
- Modify: `scripts/run_all.py` (add Pass 5c after Pass 5b loop)

**Step 1: Write failing tests**

Create `tests/test_image_auditor.py`:

```python
"""Tests for image prompt auditor."""
import json
from unittest.mock import MagicMock

from pipeline.image_auditor import find_image_issues, ImageIssue


def _make_response(issues: list[dict]) -> MagicMock:
    resp = MagicMock()
    resp.parsed = {"issues": issues}
    return resp


def test_find_flags_oversized_shot():
    """Shots with 4+ sentences should be flagged."""
    issue = {
        "chapter": 1,
        "scene_index": 0,
        "shot_index": 0,
        "category": "oversized_shot",
        "severity": "critical",
        "description": "Shot has 4 sentences, max is 3.",
        "suggested_fix": "Split into two shots of 2 sentences each.",
        "action": "split",
    }

    llm = MagicMock()
    llm.complete_json.return_value = _make_response([issue])

    story_data = {"chapter": 1, "scenes": [{"shots": [
        {"focus": "test", "image_prompt": "prompt", "sentences": [
            {"source": "A.", "sentence_index": 0},
            {"source": "B.", "sentence_index": 1},
            {"source": "C.", "sentence_index": 2},
            {"source": "D.", "sentence_index": 3},
        ]}
    ]}]}

    issues, _ = find_image_issues(
        chapter_data={1: story_data},
        characters=[],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=llm,
    )

    assert len(issues) == 1
    assert issues[0].category == "oversized_shot"


def test_find_returns_empty_when_clean():
    llm = MagicMock()
    llm.complete_json.return_value = _make_response([])

    story_data = {"chapter": 1, "scenes": [{"shots": [
        {"focus": "test", "image_prompt": "prompt", "sentences": [
            {"source": "A.", "sentence_index": 0},
        ]}
    ]}]}

    issues, _ = find_image_issues(
        chapter_data={1: story_data},
        characters=[],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=llm,
    )
    assert issues == []
```

**Step 2: Create `pipeline/image_auditor.py`**

```python
"""Pass 5c: Audit image prompts after text is finalized.

Same two-phase pattern as story audit:
  - Reviewer scans full story JSON (text + image prompts + shot structure)
  - Fixers resolve issues in parallel
"""

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Literal

from pydantic import BaseModel


class ImageIssue(BaseModel):
    """An issue found in image prompts."""
    chapter: int
    scene_index: int
    shot_index: int
    category: str  # oversized_shot, prompt_mismatch, visual_inconsistency, stale_prompt
    severity: Literal["critical", "minor"] = "critical"
    description: str
    suggested_fix: str
    action: Literal["rewrite_prompt", "split_shot", "remove_shot"] = "rewrite_prompt"


class ImageFix(BaseModel):
    """A resolved image prompt fix."""
    chapter: int
    scene_index: int
    shot_index: int
    action: Literal["rewrite_prompt", "split_shot", "remove_shot"]
    new_prompt: str = ""
    split_at: int = 0  # For split_shot: sentence index to split after


def _build_image_find_prompt(
    chapter_data: dict[int, dict],
    characters: list[dict],
    chapter_configs: list[dict],
) -> tuple[str, str]:
    """Build prompt for image prompt reviewer."""

    char_lines = []
    for c in characters:
        vtag = c.get("visual_tag", "")
        if vtag:
            char_lines.append(f"  - {c['name']}: {vtag}")
    char_block = "\n".join(char_lines) if char_lines else "  (none)"

    story_lines = []
    for ch_num in sorted(chapter_data.keys()):
        data = chapter_data[ch_num]
        cfg = chapter_configs[ch_num - 1] if ch_num <= len(chapter_configs) else {}
        title = cfg.get("title", f"Chapter {ch_num}")
        story_lines.append(f"\n--- Chapter {ch_num}: \"{title}\" ---")

        for si, scene in enumerate(data.get("scenes", [])):
            story_lines.append(f"  Scene {si}: {scene.get('setting', '?')}")
            for hi, shot in enumerate(scene.get("shots", [])):
                sents = shot.get("sentences", [])
                sent_text = " | ".join(s.get("source", "") for s in sents)
                story_lines.append(
                    f"    Shot [{ch_num}:{si}:{hi}] ({len(sents)} sentences) "
                    f"focus=\"{shot.get('focus', '?')}\"\n"
                    f"      prompt: {shot.get('image_prompt', '(none)')}\n"
                    f"      text: {sent_text}"
                )
    story_block = "\n".join(story_lines)

    system = (
        "You are a visual editor reviewing image prompts for a graded reader app. "
        "Each shot is one illustration paired with 1-3 sentences. "
        "Return valid JSON."
    )

    prompt = (
        f"Review the image prompts in this story.\n\n"
        f"CHARACTER VISUAL TAGS:\n{char_block}\n\n"
        f"STORY STRUCTURE:\n{story_block}\n\n"
        f"Check for:\n\n"
        f"1. OVERSIZED SHOTS\n"
        f"   - Each shot should have at most 2-3 sentences (ideally 1-2)\n"
        f"   - Shots with 4+ sentences must be split\n"
        f"   - Action: \"split_shot\" — specify where to split\n\n"
        f"2. PROMPT-TEXT MISMATCH\n"
        f"   - The image prompt must depict what the sentences describe\n"
        f"   - If sentences were rewritten/removed by the text audit, the prompt may be stale\n"
        f"   - Action: \"rewrite_prompt\"\n\n"
        f"3. VISUAL CONSISTENCY\n"
        f"   - Character descriptions in prompts must match their visual_tag above\n"
        f"   - Clothing, hair, accessories must be consistent across shots\n"
        f"   - Action: \"rewrite_prompt\"\n\n"
        f"4. STALE PROMPTS\n"
        f"   - Prompts referencing content that was removed from the story\n"
        f"   - Action: \"rewrite_prompt\" or \"remove_shot\" if all sentences are gone\n\n"
        f"Return:\n"
        f'{{\n'
        f'  "issues": [\n'
        f'    {{\n'
        f'      "chapter": 1,\n'
        f'      "scene_index": 0,\n'
        f'      "shot_index": 2,\n'
        f'      "category": "oversized_shot",\n'
        f'      "severity": "critical",\n'
        f'      "description": "Shot has 4 sentences.",\n'
        f'      "suggested_fix": "Split after sentence index 1.",\n'
        f'      "action": "split_shot"\n'
        f'    }}\n'
        f'  ]\n'
        f'}}\n\n'
        f'If no issues: {{"issues": []}}'
    )

    return system, prompt


def find_image_issues(
    chapter_data: dict[int, dict],
    characters: list[dict],
    chapter_configs: list[dict],
    llm=None,
) -> tuple[list[ImageIssue], object]:
    """Find image prompt issues. Returns (issues, LLMResponse)."""
    if not chapter_data or llm is None:
        return [], None

    system, prompt = _build_image_find_prompt(chapter_data, characters, chapter_configs)
    response = llm.complete_json(prompt, system=system)

    issues = []
    for raw in response.parsed.get("issues", []):
        try:
            issues.append(ImageIssue(**raw))
        except Exception:
            continue

    return issues, response
```

**Step 3: Run tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_image_auditor.py -v`
Expected: all PASS

**Step 4: Add Pass 5c to `scripts/run_all.py`**

After the Pass 5 loop (story audit), before Pass 6 (Translation), add:

```python
    # Pass 5c: Image Prompt Audit (after text is finalized)
    cost.begin("Pass 5c: Image Audit")
    from pipeline.image_auditor import find_image_issues

    print("\n=== Pass 5c: Image Prompt Audit ===")
    llm_img_review = create_model_client(config.models.image_review)

    # Load full chapter data (not flat text — need shots + image prompts)
    chapter_data: dict[int, dict] = {}
    for i in chapter_range:
        story_path = output_base / config.deck.id / "stories" / f"chapter_{i+1:02d}.json"
        if story_path.exists():
            chapter_data[i + 1] = json.loads(story_path.read_text())

    img_issues, img_review_resp = find_image_issues(
        chapter_data=chapter_data,
        characters=characters,
        chapter_configs=chapter_configs,
        llm=llm_img_review,
    )
    cost.add(img_review_resp)

    img_critical = [i for i in img_issues if i.severity == "critical"]
    img_minor = [i for i in img_issues if i.severity == "minor"]
    print(f"  Found {len(img_critical)} critical, {len(img_minor)} minor image issues")

    for issue in img_issues:
        tag = "CRITICAL" if issue.severity == "critical" else "minor"
        print(f"    [{tag}] Ch{issue.chapter} scene{issue.scene_index} "
              f"shot{issue.shot_index} ({issue.category}): {issue.description}")

    # TODO: Image fix phase (parallel fixers) — for now, log only
    if img_critical:
        print(f"  Image fixes not yet auto-applied — review issues above manually.")
```

Note: The image fixer (parallel rewrite/split) is logged as TODO. The reviewer is the hard part — the fixer is a straightforward follow-up once we validate the reviewer catches real issues.

**Step 5: Commit**

```bash
git add pipeline/image_auditor.py tests/test_image_auditor.py scripts/run_all.py
git commit -m "feat: add image prompt auditor (Pass 5c) — reviewer phase"
```

---

### Task 7: Run Full Integration Test

**Step 1: Run all unit tests**

```bash
cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v --timeout=30
```

Expected: All tests PASS.

**Step 2: Run the comparison script to verify the new find API works with real Sonnet**

```bash
cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run python scripts/test_story_audit_sonnet.py
```

Expected: Output shows issues with categories, severities, and suggested fixes. Should find the issues Sonnet found before PLUS the new categories (dangling references, redundancy, config adherence).

**Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "test: verify two-phase story audit with live Sonnet 4.6"
```
