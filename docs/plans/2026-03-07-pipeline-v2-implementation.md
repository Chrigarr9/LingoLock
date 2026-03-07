# Pipeline V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix image prompt consistency, cross-chapter continuity, vocabulary coverage, and grammar tracking so the pipeline produces production-ready decks for any language pair.

**Architecture:** Five independent fixes applied to the existing pipeline. Each fix modifies 1-3 files. All changes are backward-compatible with existing cached outputs. Test-driven: every change gets a failing test first.

**Tech Stack:** Python 3.12, Pydantic 2.x, pytest, mock LLM clients. No new dependencies.

**Working directory for all commands:** `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline`

**Run tests:** `uv run pytest tests/ -v`

**Design doc:** `docs/plans/2026-03-07-pipeline-v2-design.md`

---

## Task 1: Secondary Character Placeholder Strategy (Image Prompts)

**Files:**
- Modify: `pipeline/scene_story_generator.py` (system prompt + `_post_process()`)
- Test: `tests/test_scene_story_generator.py`

### Step 1: Write failing tests for secondary character tag replacement

Add these tests to `tests/test_scene_story_generator.py`:

```python
def test_post_process_replaces_secondary_character_placeholders(tmp_path):
    """Secondary character names in CAPS are replaced with their visual_tag."""
    from pipeline.scene_story_generator import _post_process
    from pipeline.models import ChapterScene, Scene, Shot, ShotSentence

    config = make_config(tmp_path)
    chapter = ChapterScene(
        chapter=2,
        scenes=[Scene(
            setting="street",
            description="A street",
            shots=[Shot(
                focus="taxi",
                image_prompt="Close-up of TAXI DRIVER standing by a yellow taxi",
                sentences=[ShotSentence(source="El taxista espera.", sentence_index=0)],
            )],
        )],
    )

    result = _post_process(chapter, config)
    prompt = result.scenes[0].shots[0].image_prompt

    # Should contain the full visual_tag from config
    assert "a stocky man with a gray flat cap" in prompt
    # Should NOT contain the CAPS placeholder
    assert "TAXI DRIVER" not in prompt


def test_post_process_secondary_character_safety_net(tmp_path):
    """If LLM writes character name in mixed case (not CAPS), still inject tag."""
    from pipeline.scene_story_generator import _post_process
    from pipeline.models import ChapterScene, Scene, Shot, ShotSentence

    config = make_config(tmp_path)
    chapter = ChapterScene(
        chapter=2,
        scenes=[Scene(
            setting="street",
            description="A street",
            shots=[Shot(
                focus="taxi",
                image_prompt="Close-up of Taxi Driver waving from a car",
                sentences=[ShotSentence(source="El taxista saluda.", sentence_index=0)],
            )],
        )],
    )

    result = _post_process(chapter, config)
    prompt = result.scenes[0].shots[0].image_prompt

    assert "a stocky man with a gray flat cap" in prompt
```

### Step 2: Run tests to verify they fail

```bash
uv run pytest tests/test_scene_story_generator.py::test_post_process_replaces_secondary_character_placeholders tests/test_scene_story_generator.py::test_post_process_secondary_character_safety_net -v
```

Expected: FAIL — `_post_process` doesn't handle secondary characters.

### Step 3: Update system prompt for secondary character placeholders

In `pipeline/scene_story_generator.py`, add to `_SYSTEM_PROMPT_TEMPLATE` after the protagonist consistency section (after line 111):

```python
## Secondary character consistency
When any named secondary character appears in a shot's image_prompt, write their \
name in ALL CAPS (e.g. SOFIA, LUCAS, ROBERTO). Do NOT describe their appearance — \
post-processing will replace the name with the canonical visual tag. Example:
  image_prompt: "Close-up of PROTAGONIST and SOFIA sharing mate on a park bench."
If a secondary character is NOT in the shot, do not mention them.
```

### Step 4: Update `_post_process()` to replace secondary character placeholders

In `pipeline/scene_story_generator.py`, modify `_post_process()`. After the protagonist replacement block (after line 173), add:

```python
# Replace secondary character placeholders with canonical visual_tags
for sc in config.secondary_characters:
    name_upper = sc.name.upper()
    if name_upper in raw:
        raw = raw.replace(name_upper, sc.visual_tag)
    elif sc.name in raw and sc.visual_tag not in raw:
        # Safety net: mixed-case name without tag
        raw = raw.replace(sc.name, f"{sc.name} ({sc.visual_tag})", 1)
```

### Step 5: Run tests to verify they pass

```bash
uv run pytest tests/test_scene_story_generator.py -v
```

Expected: ALL PASS (including all existing tests).

### Step 6: Commit

```bash
git add pipeline/scene_story_generator.py tests/test_scene_story_generator.py
git commit -m "feat(pipeline): extend placeholder strategy to secondary characters in image prompts"
```

---

## Task 2: Cross-Chapter Continuity via Auto-Summaries

**Files:**
- Modify: `pipeline/scene_story_generator.py` (`generate_chapter`, `generate_all`, new `_build_chapter_prompt` param)
- Test: `tests/test_scene_story_generator.py`

### Step 1: Write failing tests

Add to `tests/test_scene_story_generator.py`:

```python
def test_generate_all_passes_summaries_to_later_chapters(tmp_path):
    """Chapter 2's prompt includes a summary of chapter 1."""
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()

    # Both chapters return the same mock response
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_all(chapter_range=range(2))

    # The second call (chapter 2) should include "Story so far" in prompt
    assert mock_llm.complete_json.call_count == 2
    second_call_args = mock_llm.complete_json.call_args_list[1]
    prompt = second_call_args.kwargs.get("prompt") or second_call_args.args[0]
    assert "Story so far" in prompt


def test_chapter_summary_saved_to_disk(tmp_path):
    """After generating a chapter, a summary file is created."""
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_all(chapter_range=range(1))

    summary_file = tmp_path / "test-deck" / "stories" / "summary_01.txt"
    assert summary_file.exists()
    content = summary_file.read_text()
    assert len(content) > 0


def test_generate_all_loads_cached_summaries(tmp_path):
    """When chapter 1 is cached, its summary is still loaded for chapter 2."""
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-cache chapter 1 and its summary
    story_dir = tmp_path / "test-deck" / "stories"
    story_dir.mkdir(parents=True)
    cached = {"chapter": 1, "scenes": [{"setting": "room", "description": "A room", "shots": [
        {"focus": "bed", "image_prompt": "a bed", "sentences": [
            {"source": "Charlotte duerme.", "sentence_index": 0}
        ]}
    ]}]}
    (story_dir / "chapter_01.json").write_text(json.dumps(cached))
    (story_dir / "summary_01.txt").write_text("Chapter 1: Charlotte sleeps in Berlin.")

    # Chapter 2 needs LLM
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_all(chapter_range=range(2))

    # Only 1 LLM call (chapter 2 — chapter 1 was cached)
    assert mock_llm.complete_json.call_count == 1
    prompt = mock_llm.complete_json.call_args.kwargs.get("prompt") or mock_llm.complete_json.call_args.args[0]
    assert "Charlotte sleeps in Berlin" in prompt
```

### Step 2: Run tests to verify they fail

```bash
uv run pytest tests/test_scene_story_generator.py::test_generate_all_passes_summaries_to_later_chapters tests/test_scene_story_generator.py::test_chapter_summary_saved_to_disk tests/test_scene_story_generator.py::test_generate_all_loads_cached_summaries -v
```

Expected: FAIL

### Step 3: Implement chapter summaries

In `pipeline/scene_story_generator.py`:

**Add summary extraction function** (deterministic, no LLM cost):

```python
def _extract_summary(chapter_data: ChapterScene) -> str:
    """Extract a compact chapter summary from generated scenes (no LLM call)."""
    sentences = []
    characters = set()
    settings = []

    for scene in chapter_data.scenes:
        settings.append(scene.setting.replace("_", " "))
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences.append(sent.source)

    # First and last sentence capture the chapter arc
    summary_parts = []
    if settings:
        summary_parts.append(f"Settings: {', '.join(dict.fromkeys(settings))}")
    if sentences:
        summary_parts.append(f"Opens with: {sentences[0]}")
        if len(sentences) > 1:
            summary_parts.append(f"Ends with: {sentences[-1]}")
        summary_parts.append(f"Total: {len(sentences)} sentences")

    return " | ".join(summary_parts)
```

**Modify `_build_chapter_prompt()`** — add `previous_summaries` parameter:

```python
def _build_chapter_prompt(config: DeckConfig, chapter_index: int, previous_summaries: list[str] | None = None) -> str:
    # ... existing code ...

    story_so_far = ""
    if previous_summaries:
        story_so_far = (
            "\n\nStory so far (maintain consistency with all details — "
            "object colors, character relationships, established facts):\n"
            + "\n".join(previous_summaries)
        )

    return f"""Write Chapter {chapter_index + 1}: "{chapter.title}"
...existing template...{story_so_far}

Return the chapter as a JSON object with a "scenes" array following the format above.
Ensure sentence_index values are sequential starting from 0."""
```

**Modify `generate_all()`** to accumulate and pass summaries:

```python
def generate_all(self, chapter_range: range | None = None) -> list[ChapterScene]:
    if chapter_range is None:
        chapter_range = range(self._config.chapter_count)

    chapters = []
    summaries = []

    for i in chapter_range:
        # Load cached summary for already-generated chapters
        summary_path = self._story_dir() / f"summary_{i + 1:02d}.txt"

        chapter = self.generate_chapter(i, previous_summaries=summaries if summaries else None)
        chapters.append(chapter)

        # Generate and cache summary
        if summary_path.exists():
            summary = summary_path.read_text()
        else:
            summary = _extract_summary(chapter)
            summary_path.parent.mkdir(parents=True, exist_ok=True)
            summary_path.write_text(summary)

        summaries.append(f"Chapter {i + 1}: {summary}")

    return chapters
```

**Update `generate_chapter()` signature** to accept `previous_summaries`:

```python
def generate_chapter(self, chapter_index: int, previous_summaries: list[str] | None = None) -> ChapterScene:
    path = self._chapter_path(chapter_index)
    if path.exists():
        data = json.loads(path.read_text())
        return ChapterScene(**data)

    prompt = _build_chapter_prompt(self._config, chapter_index, previous_summaries=previous_summaries)
    # ... rest unchanged ...
```

### Step 4: Run tests

```bash
uv run pytest tests/test_scene_story_generator.py -v
```

Expected: ALL PASS

### Step 5: Commit

```bash
git add pipeline/scene_story_generator.py tests/test_scene_story_generator.py
git commit -m "feat(pipeline): add cross-chapter continuity via auto-generated summaries"
```

---

## Task 3: Character Presence Enforcement

**Files:**
- Modify: `pipeline/scene_story_generator.py` (`_build_chapter_prompt`)
- Test: `tests/test_scene_story_generator.py`

### Step 1: Write failing test

```python
def test_chapter_prompt_enforces_mandatory_characters(tmp_path):
    """Secondary characters listed for a chapter get a MANDATORY instruction."""
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    # Chapter 2 (index 1) has Taxi Driver
    gen.generate_chapter(1)

    call_args = mock_llm.complete_json.call_args
    prompt = call_args.kwargs.get("prompt") or call_args.args[0]
    assert "MUST appear" in prompt or "MANDATORY" in prompt
```

### Step 2: Run test, verify failure

```bash
uv run pytest tests/test_scene_story_generator.py::test_chapter_prompt_enforces_mandatory_characters -v
```

### Step 3: Modify `_build_chapter_prompt()` for enforcement

In `pipeline/scene_story_generator.py`, replace the secondary character section (lines 130-136):

```python
# Secondary characters for this chapter (1-indexed) — MANDATORY presence
secondary_section = ""
for sc in config.secondary_characters:
    if (chapter_index + 1) in sc.chapters:
        secondary_section += f"\n- {sc.name}: MUST appear in at least one scene and speak at least one line of dialogue. Visual tag: {sc.visual_tag}"
if secondary_section:
    secondary_section = (
        "\n\nMANDATORY characters in this chapter "
        "(each MUST appear in at least one shot and speak at least once):"
        + secondary_section
    )
```

### Step 4: Run all tests

```bash
uv run pytest tests/test_scene_story_generator.py -v
```

Expected: ALL PASS. Note: `test_secondary_characters_in_prompt_for_relevant_chapter` still passes because it checks for "Taxi Driver" and "gray flat cap" which are still present.

### Step 5: Commit

```bash
git add pipeline/scene_story_generator.py tests/test_scene_story_generator.py
git commit -m "feat(pipeline): enforce mandatory character presence in chapter prompts"
```

---

## Task 4: Fix Coverage Checker to Return Lemmas (not inflected forms)

**Files:**
- Modify: `pipeline/coverage_checker.py`
- Test: `tests/test_coverage_checker.py`

### Step 1: Write failing test

Add to `tests/test_coverage_checker.py`:

```python
def test_missing_words_are_deduplicated_at_lemma_level():
    """Inflected forms that resolve to covered lemmas should NOT appear as missing."""
    vocab = [
        VocabularyEntry(id="creer", source="creer", target=["glauben"], pos="verb",
                        frequency_rank=50, cefr_level="A1", examples=[]),
    ]
    # "creo" and "crees" are inflected forms of "creer" which we already have
    frequency_data = {"creo": 1, "crees": 2, "creer": 3, "restaurante": 4}
    frequency_lemmas = {
        "creo": FrequencyLemmaEntry(lemma="creer", appropriate=True),
        "crees": FrequencyLemmaEntry(lemma="creer", appropriate=True),
        "creer": FrequencyLemmaEntry(lemma="creer", appropriate=True),
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
    }

    report = check_coverage(vocab, frequency_data, top_n=10,
                            frequency_lemmas=frequency_lemmas)

    # creo, crees, creer all resolve to "creer" which is covered
    # Only "restaurante" should be missing
    assert "creo" not in report.missing_words
    assert "crees" not in report.missing_words
    assert "restaurante" in report.missing_words
    assert len(report.missing_words) == 1
```

### Step 2: Run test, verify failure

```bash
uv run pytest tests/test_coverage_checker.py::test_missing_words_are_deduplicated_at_lemma_level -v
```

Expected: FAIL — current code returns inflected forms as missing.

### Step 3: Fix `check_coverage()` to resolve at lemma level

In `pipeline/coverage_checker.py`, replace the missing-words computation (around line 338):

```python
# OLD:
# missing = {w for w in top_words if not is_covered(w) and w not in inappropriate_lemmas}

# NEW: Resolve to lemmas, then check coverage — avoids counting inflected forms of covered lemmas
missing_lemmas: set[str] = set()
for w in top_words:
    if is_covered(w):
        continue
    # Resolve to lemma
    lemma = merged_map.get(w, w)
    # Skip if lemma is covered or inappropriate
    if lemma in our_lemmas or lemma in inappropriate_lemmas:
        continue
    # Skip the raw form too if it's inappropriate
    if w in inappropriate_lemmas:
        continue
    missing_lemmas.add(lemma)

missing_sorted = sorted(missing_lemmas, key=lambda w: content_freq.get(w, 999999))
```

### Step 4: Run all coverage tests

```bash
uv run pytest tests/test_coverage_checker.py -v
```

Expected: ALL PASS. Existing tests still pass because they don't test inflected-form dedup.

### Step 5: Commit

```bash
git add pipeline/coverage_checker.py tests/test_coverage_checker.py
git commit -m "fix(pipeline): coverage checker returns missing lemmas, not inflected forms"
```

---

## Task 5: Remove Pronoun Filter from Vocabulary Builder

**Files:**
- Modify: `pipeline/vocabulary_builder.py`
- Modify: `tests/test_vocabulary_builder.py`

### Step 1: Update the pronoun test to expect pronouns ARE kept

In `tests/test_vocabulary_builder.py`, modify `test_pronouns_filtered` (line 155):

```python
def test_pronouns_kept_in_vocabulary():
    """Pronouns are vocabulary that must be taught — they are NOT filtered."""
    s1 = _sentence(1, 0, "Yo tengo un gato.", "Ich habe eine Katze.")

    ch1 = _chapter(1, [s1], [
        _word("yo", "ich", "yo", "pronoun"),
        _word("tengo", "habe", "tener", "verb"),
        _word("gato", "Katze", "gato", "noun"),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    ids = [w.id for w in deck.chapters[0].words]
    assert "yo" in ids  # Pronouns are now kept!
    assert "tener" in ids
    assert "gato" in ids
```

### Step 2: Run test, verify failure

```bash
uv run pytest tests/test_vocabulary_builder.py::test_pronouns_kept_in_vocabulary -v
```

Expected: FAIL — pronouns still filtered.

### Step 3: Remove "pronoun" from FILTERED_POS

In `pipeline/vocabulary_builder.py`, line 8:

```python
# OLD:
FILTERED_POS = {"article", "determiner", "preposition", "pronoun", "conjunction"}

# NEW:
FILTERED_POS = {"article", "determiner", "preposition", "conjunction"}
```

### Step 4: Run all vocabulary builder tests

```bash
uv run pytest tests/test_vocabulary_builder.py -v
```

Expected: ALL PASS. Note: the old `test_pronouns_filtered` must be replaced by `test_pronouns_kept_in_vocabulary` (delete the old test).

### Step 5: Commit

```bash
git add pipeline/vocabulary_builder.py tests/test_vocabulary_builder.py
git commit -m "fix(pipeline): keep pronouns in vocabulary deck — they are teachable words"
```

---

## Task 6: Vocabulary Planner (Must-Include Categories + Teaching Scenes)

**Files:**
- Create: `pipeline/vocabulary_planner.py`
- Create: `tests/test_vocabulary_planner.py`
- Modify: `pipeline/scene_story_generator.py` (accept vocab plan in prompt)
- Modify: `scripts/run_all.py` (call planner before story generation)

### Step 1: Write failing tests for vocabulary planner

Create `tests/test_vocabulary_planner.py`:

```python
"""Tests for vocabulary_planner.py."""
from pipeline.vocabulary_planner import (
    MUST_INCLUDE_CATEGORIES,
    VocabularyPlan,
    plan_vocabulary,
)


def test_must_include_categories_exist():
    """Core categories are defined."""
    assert "days" in MUST_INCLUDE_CATEGORIES
    assert "months" in MUST_INCLUDE_CATEGORIES
    assert "numbers_1_20" in MUST_INCLUDE_CATEGORIES
    assert "pronouns" in MUST_INCLUDE_CATEGORIES
    assert "colors" in MUST_INCLUDE_CATEGORIES


def test_plan_vocabulary_distributes_categories_to_a1_chapters():
    """Must-include A1 categories are assigned to A1 chapters."""
    chapters = [
        {"title": "Ch1", "cefr_level": "A1", "context": "Packing", "vocab_focus": ["clothing"]},
        {"title": "Ch2", "cefr_level": "A1", "context": "At airport", "vocab_focus": ["airport"]},
        {"title": "Ch3", "cefr_level": "A2", "context": "Shopping", "vocab_focus": ["food"]},
    ]

    plans = plan_vocabulary(
        chapters=chapters,
        target_language="Spanish",
    )

    # All A1 categories should be assigned to A1 chapters (1 or 2), not A2
    all_categories_assigned = set()
    for ch_num, plan in plans.items():
        for cat in plan.must_include_categories:
            all_categories_assigned.add(cat)

    # At least days, months, pronouns should be assigned
    assert "days" in all_categories_assigned
    assert "months" in all_categories_assigned
    assert "pronouns" in all_categories_assigned

    # A2 chapter should not get A1 must-include categories
    a2_categories = plans.get(3, VocabularyPlan()).must_include_categories
    for cat_name in a2_categories:
        assert MUST_INCLUDE_CATEGORIES[cat_name]["cefr"] != "A1"


def test_plan_vocabulary_generates_teaching_scenes():
    """Chapters with must-include categories get teaching scene suggestions."""
    chapters = [
        {"title": "Apartment Tour", "cefr_level": "A1", "context": "Looking around the apartment",
         "vocab_focus": ["rooms"]},
    ]

    plans = plan_vocabulary(chapters=chapters, target_language="Spanish")

    # Should have at least one teaching scene
    all_scenes = []
    for plan in plans.values():
        all_scenes.extend(plan.teaching_scenes)

    assert len(all_scenes) > 0
    # Teaching scenes should mention the target language
    assert any("Spanish" in s or "spanish" in s.lower() for s in all_scenes)
```

### Step 2: Run tests, verify failure

```bash
uv run pytest tests/test_vocabulary_planner.py -v
```

Expected: FAIL — module doesn't exist yet.

### Step 3: Create `pipeline/vocabulary_planner.py`

```python
"""Pass 0b: Plan vocabulary distribution across chapters before story generation.

Distributes must-include structural vocabulary (days, months, numbers, pronouns)
and high-frequency content words across chapters by CEFR level and topical fit.
Generates teaching scene suggestions that get injected into story generation prompts.
"""

from pydantic import BaseModel


MUST_INCLUDE_CATEGORIES: dict[str, dict] = {
    "pronouns": {
        "description": "Personal pronouns (I, you, he, she, we, they, it)",
        "cefr": "A1",
    },
    "days": {
        "description": "Days of the week (Monday through Sunday)",
        "cefr": "A1",
    },
    "months": {
        "description": "Months of the year (January through December)",
        "cefr": "A1",
    },
    "numbers_1_20": {
        "description": "Cardinal numbers 1 through 20",
        "cefr": "A1",
    },
    "colors": {
        "description": "Basic colors (red, blue, green, yellow, black, white, brown, orange, pink, purple)",
        "cefr": "A1",
    },
    "family": {
        "description": "Family members (mother, father, brother, sister, son, daughter, grandmother, grandfather)",
        "cefr": "A1",
    },
    "weather": {
        "description": "Weather terms (sun, rain, cloud, wind, hot, cold, warm)",
        "cefr": "A1",
    },
    "time_expressions": {
        "description": "Time of day, today, tomorrow, yesterday, now, always, never, sometimes, early, late",
        "cefr": "A1",
    },
    "body_parts": {
        "description": "Basic body parts (head, hand, eye, mouth, leg, arm, foot, hair, face)",
        "cefr": "A1",
    },
}


# Templates for teaching scenes. {protagonist} and {companion} are replaced at runtime.
TEACHING_SCENE_TEMPLATES: dict[str, str] = {
    "days": (
        "In one scene, {companion} and {protagonist} plan the week together. "
        "{companion} teaches {protagonist} the {target_language} words for Monday through Sunday "
        "while looking at a calendar or planner on the wall."
    ),
    "months": (
        "{companion} asks {protagonist} about her birthday and favorite season. "
        "They discuss months and seasons, mentioning at least six months by name."
    ),
    "numbers_1_20": (
        "During a shopping or payment scene, {protagonist} counts items or money, "
        "using numbers from 1 to 20 naturally in conversation."
    ),
    "colors": (
        "{companion} points at objects around the room and asks {protagonist} what color each is. "
        "They name at least six colors."
    ),
    "weather": (
        "{protagonist} and {companion} check the weather forecast together "
        "and discuss what to wear, mentioning sun, rain, wind, hot, and cold."
    ),
    "body_parts": (
        "{protagonist} is doing a stretching exercise or pointing at a picture. "
        "{companion} names body parts and {protagonist} repeats them."
    ),
    "family": (
        "{protagonist} shows {companion} photos on her phone and talks about her family — "
        "mother, father, brother, sister. {companion} talks about hers too."
    ),
    "time_expressions": (
        "The characters discuss their daily routines — what time they wake up, "
        "what they do in the morning, afternoon, and evening. "
        "They use words like today, tomorrow, yesterday, always, sometimes, never."
    ),
    "pronouns": None,  # Pronouns are woven naturally — no special scene needed
}


class VocabularyPlan(BaseModel):
    """Per-chapter vocabulary plan."""
    must_include_categories: list[str] = []
    teaching_scenes: list[str] = []
    mandatory_words: list[str] = []  # Specific words the LLM must use


def plan_vocabulary(
    chapters: list[dict],
    target_language: str,
    protagonist_name: str = "the protagonist",
    companion_name: str = "her friend",
) -> dict[int, VocabularyPlan]:
    """Distribute must-include vocabulary categories across chapters by CEFR level.

    Args:
        chapters: List of chapter defs (dict with title, cefr_level, context, vocab_focus).
        target_language: e.g. "Spanish".
        protagonist_name: For teaching scene templates.
        companion_name: For teaching scene templates.

    Returns:
        Dict mapping chapter number (1-indexed) -> VocabularyPlan.
    """
    plans: dict[int, VocabularyPlan] = {}

    # Group chapters by CEFR level
    cefr_chapters: dict[str, list[int]] = {}
    for idx, ch in enumerate(chapters):
        cefr = ch.get("cefr_level", "A1")
        cefr_chapters.setdefault(cefr, []).append(idx + 1)

    # Assign each must-include category to a chapter at the matching CEFR level
    categories_to_assign = list(MUST_INCLUDE_CATEGORIES.items())
    for cat_name, cat_info in categories_to_assign:
        target_cefr = cat_info["cefr"]
        eligible = cefr_chapters.get(target_cefr, [])
        if not eligible:
            # Fall back to any chapter
            eligible = list(range(1, len(chapters) + 1))

        # Pick the chapter with fewest assignments so far (spread evenly)
        best_ch = min(
            eligible,
            key=lambda ch: len(plans.get(ch, VocabularyPlan()).must_include_categories),
        )

        if best_ch not in plans:
            plans[best_ch] = VocabularyPlan()

        plans[best_ch].must_include_categories.append(cat_name)

        # Generate teaching scene if template exists
        template = TEACHING_SCENE_TEMPLATES.get(cat_name)
        if template:
            scene = template.format(
                protagonist=protagonist_name,
                companion=companion_name,
                target_language=target_language,
            )
            plans[best_ch].teaching_scenes.append(scene)

    return plans
```

### Step 4: Run tests

```bash
uv run pytest tests/test_vocabulary_planner.py -v
```

Expected: ALL PASS.

### Step 5: Commit

```bash
git add pipeline/vocabulary_planner.py tests/test_vocabulary_planner.py
git commit -m "feat(pipeline): add vocabulary planner with must-include categories and teaching scenes"
```

---

## Task 7: Integrate Vocabulary Planner into Story Generation

**Files:**
- Modify: `pipeline/scene_story_generator.py` (`_build_chapter_prompt`)
- Modify: `scripts/run_all.py`
- Test: `tests/test_scene_story_generator.py`

### Step 1: Write failing test

Add to `tests/test_scene_story_generator.py`:

```python
def test_chapter_prompt_includes_vocabulary_plan(tmp_path):
    """When a vocabulary plan is provided, mandatory words and teaching scenes appear in prompt."""
    from pipeline.scene_story_generator import _build_chapter_prompt
    from pipeline.vocabulary_planner import VocabularyPlan

    config = make_config(tmp_path)
    plan = VocabularyPlan(
        must_include_categories=["days"],
        teaching_scenes=["Charlotte and her friend plan the week, naming Monday through Sunday."],
        mandatory_words=["lunes", "martes", "miércoles"],
    )

    prompt = _build_chapter_prompt(config, chapter_index=0, vocabulary_plan=plan)

    assert "lunes" in prompt
    assert "martes" in prompt
    assert "MUST use" in prompt or "mandatory" in prompt.lower()
    assert "Monday through Sunday" in prompt
```

### Step 2: Run test, verify failure

```bash
uv run pytest tests/test_scene_story_generator.py::test_chapter_prompt_includes_vocabulary_plan -v
```

### Step 3: Add `vocabulary_plan` parameter to `_build_chapter_prompt()`

In `pipeline/scene_story_generator.py`, update the function signature and add vocab plan injection:

```python
def _build_chapter_prompt(
    config: DeckConfig,
    chapter_index: int,
    previous_summaries: list[str] | None = None,
    vocabulary_plan=None,  # VocabularyPlan or None
) -> str:
    # ... existing code builds the base prompt ...

    # Vocabulary plan injection
    vocab_plan_section = ""
    if vocabulary_plan:
        if vocabulary_plan.mandatory_words:
            words_str = ", ".join(vocabulary_plan.mandatory_words)
            vocab_plan_section += (
                f"\n\nMANDATORY vocabulary — you MUST use each of these words "
                f"in at least one sentence: {words_str}\n"
                f"These are high-frequency words critical for the learner. "
                f"Weave them naturally into the story."
            )
        if vocabulary_plan.teaching_scenes:
            vocab_plan_section += "\n\nAdditional scene suggestions (incorporate naturally):"
            for scene_desc in vocabulary_plan.teaching_scenes:
                vocab_plan_section += f"\n- {scene_desc}"

    # Include in final prompt
    return f"""Write Chapter {chapter_index + 1}: ...
...{secondary_section}{story_so_far}{vocab_plan_section}

Return the chapter as a JSON object..."""
```

### Step 4: Update `scripts/run_all.py` to call vocabulary planner

In the `run_text_stage()` function, add before story generation:

```python
from pipeline.vocabulary_planner import plan_vocabulary

# Vocabulary planning (optional — only if frequency data available)
vocab_plans = {}
if frequency_file:
    chapter_defs = [
        {"title": ch.title, "cefr_level": ch.cefr_level or config.story.cefr_level,
         "context": ch.context, "vocab_focus": ch.vocab_focus}
        for ch in config.story.chapters
    ]
    companion = config.secondary_characters[0].name if config.secondary_characters else "her friend"
    vocab_plans = plan_vocabulary(
        chapters=chapter_defs,
        target_language=config.languages.target,
        protagonist_name=config.protagonist.name,
        companion_name=companion,
    )
    print(f"  Vocabulary plans for {len(vocab_plans)} chapters")
```

Then pass `vocab_plans.get(i + 1)` to `generate_chapter()`.

### Step 5: Run all tests

```bash
uv run pytest tests/ -v
```

Expected: ALL PASS.

### Step 6: Commit

```bash
git add pipeline/scene_story_generator.py scripts/run_all.py tests/test_scene_story_generator.py
git commit -m "feat(pipeline): integrate vocabulary planner into story generation prompts"
```

---

## Task 8: Grammar Auditor

**Files:**
- Create: `pipeline/grammar_auditor.py`
- Create: `tests/test_grammar_auditor.py`
- Modify: `pipeline/config.py` (add optional `grammar_targets`)
- Modify: `scripts/run_all.py` (add audit pass)

### Step 1: Write failing test

Create `tests/test_grammar_auditor.py`:

```python
"""Tests for grammar_auditor.py."""
from unittest.mock import MagicMock

from pipeline.grammar_auditor import audit_grammar, GrammarAuditReport


def test_audit_grammar_returns_report():
    """Grammar audit returns a structured report with present/missing targets."""
    chapters_by_cefr = {
        "A1": ["Maria abre la maleta.", "Ella tiene miedo."],
        "A2": ["Ayer fuimos al mercado.", "Maria compró un vestido."],
    }
    grammar_targets = {
        "A1": ["simple present tense"],
        "A2": ["pretérito indefinido"],
    }

    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = MagicMock(
        parsed={
            "targets": [
                {"target": "simple present tense", "present": True, "example": "Maria abre la maleta."},
            ]
        }
    )

    report = audit_grammar(
        chapters_by_cefr=chapters_by_cefr,
        grammar_targets=grammar_targets,
        llm=mock_llm,
    )

    assert isinstance(report, GrammarAuditReport)
    assert len(report.levels) > 0


def test_audit_grammar_skips_if_no_targets():
    """If grammar_targets is empty, returns empty report without LLM calls."""
    mock_llm = MagicMock()

    report = audit_grammar(
        chapters_by_cefr={},
        grammar_targets={},
        llm=mock_llm,
    )

    assert report.levels == {}
    mock_llm.complete_json.assert_not_called()
```

### Step 2: Run tests, verify failure

```bash
uv run pytest tests/test_grammar_auditor.py -v
```

### Step 3: Create `pipeline/grammar_auditor.py`

```python
"""Pass 3c: Audit grammar coverage against CEFR targets.

One LLM call per CEFR level — checks whether target grammar structures
appear in the generated sentences. Returns a structured report.
"""

from pydantic import BaseModel


class GrammarTargetResult(BaseModel):
    target: str
    present: bool
    example: str = ""  # Sentence that demonstrates the target (if present)


class GrammarLevelReport(BaseModel):
    cefr: str
    targets: list[GrammarTargetResult]
    coverage: float  # Fraction of targets present (0.0-1.0)


class GrammarAuditReport(BaseModel):
    levels: dict[str, GrammarLevelReport] = {}


def audit_grammar(
    chapters_by_cefr: dict[str, list[str]],
    grammar_targets: dict[str, list[str]],
    llm=None,
) -> GrammarAuditReport:
    """Check which grammar targets appear in generated sentences.

    Args:
        chapters_by_cefr: CEFR level -> list of sentences at that level.
        grammar_targets: CEFR level -> list of grammar structure descriptions.
        llm: LLMClient for analysis calls.

    Returns:
        GrammarAuditReport with per-level results.
    """
    if not grammar_targets or not chapters_by_cefr:
        return GrammarAuditReport()

    report = GrammarAuditReport()

    for cefr, targets in grammar_targets.items():
        if not targets:
            continue

        sentences = chapters_by_cefr.get(cefr, [])
        if not sentences:
            # All targets missing — no sentences at this level
            report.levels[cefr] = GrammarLevelReport(
                cefr=cefr,
                targets=[GrammarTargetResult(target=t, present=False) for t in targets],
                coverage=0.0,
            )
            continue

        targets_text = "\n".join(f"  {i+1}. {t}" for i, t in enumerate(targets))
        sentences_text = "\n".join(f"  - {s}" for s in sentences[:50])  # Cap at 50

        system = "You are a Spanish grammar expert analyzing sentences for specific grammatical structures."
        prompt = (
            f"CEFR Level: {cefr}\n\n"
            f"Grammar targets to check:\n{targets_text}\n\n"
            f"Sentences:\n{sentences_text}\n\n"
            f"For each grammar target, determine if it appears in any sentence above. "
            f"Return JSON:\n"
            f'{{"targets": [\n'
            f'  {{"target": "description", "present": true/false, "example": "sentence that shows it or empty string"}}\n'
            f']}}'
        )

        response = llm.complete_json(prompt, system=system)
        raw_targets = response.parsed.get("targets", [])

        results = []
        for rt in raw_targets:
            results.append(GrammarTargetResult(
                target=rt.get("target", ""),
                present=rt.get("present", False),
                example=rt.get("example", ""),
            ))

        # Fill in any targets the LLM missed
        found_targets = {r.target for r in results}
        for t in targets:
            if t not in found_targets:
                results.append(GrammarTargetResult(target=t, present=False))

        present_count = sum(1 for r in results if r.present)
        coverage = present_count / len(results) if results else 0.0

        report.levels[cefr] = GrammarLevelReport(
            cefr=cefr,
            targets=results,
            coverage=coverage,
        )

    return report
```

### Step 4: Add optional `grammar_targets` to config

In `pipeline/config.py`, add to `StoryConfig`:

```python
class StoryConfig(BaseModel):
    cefr_level: str
    sentences_per_chapter: list[int]
    chapters: list[ChapterDef]
    grammar_targets: dict[str, list[str]] = {}  # Optional: CEFR level -> grammar targets
```

### Step 5: Run all tests

```bash
uv run pytest tests/ -v
```

Expected: ALL PASS.

### Step 6: Commit

```bash
git add pipeline/grammar_auditor.py pipeline/config.py tests/test_grammar_auditor.py
git commit -m "feat(pipeline): add grammar auditor for CEFR target verification"
```

---

## Task 9: Integration — Wire Everything into run_all.py

**Files:**
- Modify: `scripts/run_all.py`

### Step 1: Add vocabulary planner call before story generation

In `run_text_stage()`, after config loading and before Pass 1:

```python
# Pass 0b: Vocabulary Planning
from pipeline.vocabulary_planner import plan_vocabulary
vocab_plans = {}
if frequency_file:
    chapter_defs = [
        {"title": ch.title, "cefr_level": ch.cefr_level or config.story.cefr_level,
         "context": ch.context, "vocab_focus": ch.vocab_focus}
        for ch in config.story.chapters
    ]
    companion = config.secondary_characters[0].name if config.secondary_characters else "a friend"
    vocab_plans = plan_vocabulary(
        chapters=chapter_defs,
        target_language=config.languages.target,
        protagonist_name=config.protagonist.name,
        companion_name=companion,
    )
    if vocab_plans:
        print(f"\n=== Pass 0b: Vocabulary Planning ===")
        for ch_num, plan in sorted(vocab_plans.items()):
            cats = ", ".join(plan.must_include_categories)
            print(f"  Chapter {ch_num}: {cats}")
```

### Step 2: Pass vocab plans to `generate_all()` / `generate_chapter()`

Update the story generation loop to pass vocabulary plans:

```python
# Pass 1 now uses generate_all with vocab_plans
scene_gen = SceneStoryGenerator(config, llm, output_base=output_base)
chapter_scenes = {}
stories = {}
for i in chapter_range:
    # ... existing code ...
    # Note: generate_all handles summaries + vocab plans internally
```

Or if keeping per-chapter loop, pass `vocab_plans.get(i + 1)` to each call.

### Step 3: Add grammar audit after word extraction

After Pass 3, before vocabulary building:

```python
# Pass 3c: Grammar Audit (optional)
if config.story.grammar_targets:
    from pipeline.grammar_auditor import audit_grammar

    print("\n=== Pass 3c: Grammar Audit ===")
    # Group sentences by CEFR level
    chapters_by_cefr: dict[str, list[str]] = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        cefr = ch.cefr_level or config.story.cefr_level
        sentences = stories[i].split("\n")
        chapters_by_cefr.setdefault(cefr, []).extend(sentences)

    report = audit_grammar(
        chapters_by_cefr=chapters_by_cefr,
        grammar_targets=config.story.grammar_targets,
        llm=llm,
    )

    for cefr, level_report in sorted(report.levels.items()):
        present = sum(1 for t in level_report.targets if t.present)
        total = len(level_report.targets)
        print(f"  {cefr}: {present}/{total} grammar targets present ({level_report.coverage:.0%})")
        for t in level_report.targets:
            status = "OK" if t.present else "MISSING"
            print(f"    [{status}] {t.target}")
            if t.present and t.example:
                print(f"           Example: {t.example}")
```

### Step 4: Run full test suite

```bash
uv run pytest tests/ -v
```

Expected: ALL PASS.

### Step 5: Commit

```bash
git add scripts/run_all.py
git commit -m "feat(pipeline): wire vocabulary planner and grammar auditor into run_all.py"
```

---

## Task 10: Add Grammar Targets to Spanish Config

**Files:**
- Modify: `configs/spanish_buenos_aires.yaml`

### Step 1: Add grammar_targets section

Add to `story:` section in `configs/spanish_buenos_aires.yaml`:

```yaml
  grammar_targets:
    A1:
      - "simple present tense (indicativo presente)"
      - "ser vs estar"
      - "hay (there is/there are)"
      - "simple questions with qué, dónde, cómo, cuánto"
    A2:
      - "pretérito indefinido (simple past: fui, compré, comí)"
      - "pretérito imperfecto (descriptive past: era, tenía, había)"
      - "pretérito vs imperfecto contrast in same sentence"
      - "reflexive verbs (levantarse, llamarse, sentirse)"
      - "modal verbs (poder, querer, deber)"
      - "porque/cuando subordinate clauses"
    B1:
      - "present subjunctive (ojalá, quizás, es importante que)"
      - "conditional (me gustaría, podría, sería)"
      - "pluscuamperfecto indicative (había + participio)"
      - "si + imperfect subjunctive + conditional (si pudiera... haría)"
      - "relative clauses with que, donde, quien"
      - "duration expressions (llevo dos años, desde hace)"
    B2:
      - "perfect subjunctive (haya + participio)"
      - "pluperfect subjunctive (hubiera + participio)"
      - "conditional perfect (habría + participio)"
      - "si hubiera... habría... (unreal past conditional)"
      - "nuanced connectors (sin embargo, a pesar de, dado que)"
```

### Step 2: Verify config still loads

```bash
uv run python -c "from pipeline.config import load_config; from pathlib import Path; c = load_config(Path('configs/spanish_buenos_aires.yaml')); print(f'Grammar targets: {len(c.story.grammar_targets)} levels')"
```

Expected: `Grammar targets: 4 levels`

### Step 3: Commit

```bash
git add configs/spanish_buenos_aires.yaml
git commit -m "feat(config): add CEFR grammar targets for Spanish Buenos Aires deck"
```

---

## Summary

| Task | Description | Files Changed | Tests |
|------|------------|---------------|-------|
| 1 | Secondary character placeholders in image prompts | scene_story_generator.py | 2 new tests |
| 2 | Cross-chapter continuity via auto-summaries | scene_story_generator.py | 3 new tests |
| 3 | Character presence enforcement | scene_story_generator.py | 1 new test |
| 4 | Coverage checker returns lemmas not inflected forms | coverage_checker.py | 1 new test |
| 5 | Remove pronoun filter from vocabulary builder | vocabulary_builder.py | 1 modified test |
| 6 | Vocabulary planner (must-include + teaching scenes) | vocabulary_planner.py (new) | 3 new tests |
| 7 | Integrate vocab planner into story generation | scene_story_generator.py, run_all.py | 1 new test |
| 8 | Grammar auditor | grammar_auditor.py (new), config.py | 2 new tests |
| 9 | Wire everything into run_all.py | run_all.py | — |
| 10 | Add grammar targets to Spanish config | spanish_buenos_aires.yaml | — |

**Total: 10 tasks, 14 new tests, 10 commits.**

After implementation, delete cached story files and re-run `--stage text` to regenerate with all improvements active.
