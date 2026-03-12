# Image Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the expensive single-call image audit (Sonnet 4.6, 24.6¢) with a two-step Gemini 3.1 FL pipeline (~2.5¢): chapter-level scene review (split oversized shots, verify focus) + per-chapter prompt generation (short <200-char prompts for FLUX Schnell).

**Architecture:** The image pipeline moves from Pass 5c to Pass 8 (after word extraction), so all text work completes before image work begins. Two sequential steps per chapter: (1) `review_scenes()` restructures shots so each has max 2 sentences, then (2) `generate_prompts()` creates <200-char image prompts for all shots. Character descriptions use new short `image_tag` fields (~60 chars) instead of long `visual_tag` (~120 chars). A shared `finalize_image_prompt()` function handles tag replacement + style injection for both story generation (Pass 0) and the image pipeline (Pass 8).

**New pipeline order:** Pass 0 (story gen) → 1 (simplify) → 2-3 (grammar) → 4 (vocab gaps) → 4b (chapter audit) → 5a/b (story audit) → 6 (translation) → 7 (word extraction) → **8 (image pipeline: scene review + prompt gen)** → media stage (image generation + audio)

**Tech Stack:** Python 3.12, Pydantic, pytest, OpenRouter LLM API (Gemini 3.1 Flash Lite)

**Spec:** `docs/plans/2026-03-12-image-pipeline-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `pipeline/config.py` | Modify | Add `image_tag: str = ""` to `Protagonist` (line 26) and `SecondaryCharacter` (line 36) |
| `configs/spanish_buenos_aires.yaml` | Modify | Add `image_tag` per character, switch `image_review` model to Gemini 3.1 FL, update `image_generation` block (FLUX Schnell + short style) |
| `pipeline/story_generator.py` | Modify | Add `_replace_character()` + `finalize_image_prompt()` (new exported functions); rewrite `_post_process()` to use `image_tag` with first-mention/possessive logic |
| `pipeline/image_auditor.py` | Full rewrite | New models (`ReviewedShot`, `ReviewedScene`, `ShotPrompt`); functions: `review_scenes()`, `apply_scene_review()`, `generate_prompts()`, `apply_prompts()` |
| `scripts/run_all.py` | Modify | Remove old Pass 5c (lines 564-603), add new Pass 8 after word extraction: scene review → apply → prompt gen → apply → finalize |
| `tests/test_story_generator.py` | Modify | Add tests for `_replace_character()` + `finalize_image_prompt()`, update `test_post_process` |
| `tests/test_image_auditor.py` | Full rewrite | Tests for all new models and functions |

---

## Chunk 1: Foundation

### Task 1: Config — Add `image_tag` field

**Files:**
- Modify: `pipeline/config.py:23` (`Protagonist` class)
- Modify: `pipeline/config.py:35` (`SecondaryCharacter` class)

- [ ] **Step 1: Add `image_tag` to `Protagonist`**

In `pipeline/config.py`, add `image_tag: str = ""` after `visual_tag`:

```python
class Protagonist(BaseModel):
    name: str
    gender: str
    origin_country: str
    visual_tag: str = ""
    image_tag: str = ""
```

- [ ] **Step 2: Add `image_tag` to `SecondaryCharacter`**

```python
class SecondaryCharacter(BaseModel):
    name: str
    visual_tag: str
    image_tag: str = ""
    chapters: list[int]
    role: str = ""
```

- [ ] **Step 3: Run existing tests to confirm backward compatibility**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py -v`

Expected: All tests PASS — default `""` means existing configs without `image_tag` still load.

- [ ] **Step 4: Commit**

```bash
git add pipeline/config.py
git commit -m "feat: add image_tag field to Protagonist and SecondaryCharacter config"
```

---

### Task 2: YAML Config — Add image_tags, update models + image generation

**Files:**
- Modify: `configs/spanish_buenos_aires.yaml`

- [ ] **Step 1: Add `image_tag` to protagonist**

After the existing `visual_tag` line (line 16), add:

```yaml
  image_tag: "young woman mid-20s, wavy light-brown hair, teal cardigan, white t-shirt, light blue jeans"
```

- [ ] **Step 2: Add `image_tag` to all secondary characters**

Add `image_tag` line after `visual_tag` for each character. Values from spec:

| Character | image_tag |
|---|---|
| Ingrid | `woman early-50s, short wavy light-brown hair, blue eyes, beige cardigan` |
| Sofia | `young woman mid-20s, curly dark-brown hair, olive skin, colourful oversized t-shirt, wide-leg trousers` |
| Diego | `young man late-20s, dark curly hair, stubble, grey t-shirt, dark jeans, canvas messenger bag` |
| Lucas | `young man late-20s, short black hair, stubble, broad shoulders, navy t-shirt, jeans` |
| Valentina | `young woman mid-20s, long straight dark hair, square glasses, patterned blouse` |
| Roberto | `man 60s, silver combed-back hair, black shirt, elegant posture` |
| Kiosk vendor | `middle-aged man, casual shirt, small counter` |
| Check-in agent | `middle-aged woman, dark hair bun, airline uniform` |
| Shop assistant | `young man, green store apron, short hair` |
| Cashier | `young woman, store uniform, hair tied back` |
| Market vendor | `older man, weathered face, colourful stall` |
| Doctor | `woman 40s, white coat, stethoscope` |
| Pharmacist | `middle-aged man, white pharmacy coat, glasses` |
| Boat captain | `older man, captain's hat, standing at helm` |

- [ ] **Step 3: Switch `image_review` model from Sonnet to Gemini 3.1 FL**

Replace the `image_review` config block:

```yaml
  # Pass 5c step 1: Scene review — Gemini 3.1 FL (restructures shots, ~0.5¢ all chapters)
  image_review:
    provider: "openrouter"
    model: "google/gemini-3.1-flash-lite-preview"
    temperature: 0.3

  # Pass 5c step 2: Prompt generation — Gemini 3.1 FL (generates short prompts, ~2¢ all chapters)
  image_fix:
    provider: "openrouter"
    model: "google/gemini-3.1-flash-lite-preview"
    temperature: 0.3
```

- [ ] **Step 4: Update `image_generation` block**

Replace the current `image_generation` section:

```yaml
image_generation:
  enabled: true
  model: "black-forest-labs/FLUX.1-schnell-Free"
  cheap_model: "black-forest-labs/FLUX.1-schnell-Free"
  style: "cartoon, vibrant colors"
  width: 768
  height: 512
```

- [ ] **Step 5: Verify config loads**

Run: `cd spanish-content-pipeline && uv run python -c "from pipeline.config import load_config; from pathlib import Path; c = load_config(Path('configs/spanish_buenos_aires.yaml')); print(f'image_tag: {c.protagonist.image_tag[:50]}'); print(f'Sofia: {c.secondary_characters[1].image_tag[:50]}'); print(f'image model: {c.image_generation.model}'); print(f'review model: {c.models.image_review.model}')"`

Expected: Prints image_tag values, FLUX Schnell model name, and Gemini 3.1 FL review model.

- [ ] **Step 6: Commit**

```bash
git add configs/spanish_buenos_aires.yaml
git commit -m "feat: add image_tag to all characters, switch image pipeline to Gemini 3.1 FL + FLUX Schnell"
```

---

### Task 3: Tag replacement utility + `_post_process()` rewrite

**Files:**
- Modify: `pipeline/story_generator.py` (add functions before `_post_process`, rewrite `_post_process`)
- Modify: `tests/test_story_generator.py` (add tests, update existing)

- [ ] **Step 1: Write failing tests for `_replace_character`**

Add to `tests/test_story_generator.py`:

```python
def test_replace_character_first_non_possessive():
    from pipeline.story_generator import _replace_character

    result = _replace_character(
        "PROTAGONIST walks to the store. PROTAGONIST buys coffee.",
        "PROTAGONIST", "Maria", "young woman, teal cardigan",
    )
    assert result == "Maria (young woman, teal cardigan) walks to the store. Maria buys coffee."


def test_replace_character_possessive_only():
    from pipeline.story_generator import _replace_character

    result = _replace_character(
        "PROTAGONIST's notebook on the desk.",
        "PROTAGONIST", "Maria", "young woman, teal cardigan",
    )
    assert result == "Maria (young woman, teal cardigan)'s notebook on the desk."


def test_replace_character_mixed_possessive_and_non():
    from pipeline.story_generator import _replace_character

    result = _replace_character(
        "Close-up of PROTAGONIST and SOFIA sharing mate. PROTAGONIST's hand holds the cup.",
        "PROTAGONIST", "Maria", "young woman, teal cardigan",
    )
    assert result == (
        "Close-up of Maria (young woman, teal cardigan) and SOFIA sharing mate. "
        "Maria's hand holds the cup."
    )


def test_replace_character_no_matches():
    from pipeline.story_generator import _replace_character

    result = _replace_character(
        "A quiet park scene with trees.",
        "PROTAGONIST", "Maria", "young woman",
    )
    assert result == "A quiet park scene with trees."
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py::test_replace_character_first_non_possessive -v`

Expected: FAIL with `ImportError: cannot import name '_replace_character'`.

- [ ] **Step 3: Implement `_replace_character`**

Add this function to `pipeline/story_generator.py` just BEFORE the `_post_process` function (around line 237):

```python
def _replace_character(raw: str, placeholder: str, name: str, tag: str) -> str:
    """Replace character placeholder with name + tag (first mention) or plain name.

    Rules (from spec):
      1. First non-possessive mention → "Name (tag)"
      2. Subsequent non-possessive mentions → "Name"
      3. Possessive "PLACEHOLDER's" → "Name's" (no tag)
      4. If ONLY possessive mentions exist → first becomes "Name (tag)'s"
    """
    possessive = f"{placeholder}'s"
    has_non_possessive = raw.replace(possessive, "").count(placeholder) > 0

    if has_non_possessive:
        raw = raw.replace(possessive, f"{name}'s")
        raw = raw.replace(placeholder, f"{name} ({tag})", 1)
        raw = raw.replace(placeholder, name)
    elif possessive in raw:
        raw = raw.replace(possessive, f"{name} ({tag})'s", 1)
        raw = raw.replace(possessive, f"{name}'s")

    return raw
```

- [ ] **Step 4: Run `_replace_character` tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py -k "replace_character" -v`

Expected: All 4 tests PASS.

- [ ] **Step 5: Write failing tests for `finalize_image_prompt`**

Add to `tests/test_story_generator.py`:

```python
def test_finalize_image_prompt_with_image_tag(tmp_path):
    from pipeline.story_generator import finalize_image_prompt

    config = make_config(tmp_path)
    config.protagonist.image_tag = "young woman, teal cardigan"
    config.secondary_characters[0].image_tag = "stocky man, gray cap"

    result = finalize_image_prompt(
        "Close-up of PROTAGONIST and TAXI DRIVER at the curb.",
        config,
    )
    assert result.startswith(config.image_generation.style + ", ")
    assert "Charlotte (young woman, teal cardigan)" in result
    assert "Taxi Driver (stocky man, gray cap)" in result
    assert result.endswith("no text, no writing, no letters")
    assert "PROTAGONIST" not in result
    assert "TAXI DRIVER" not in result


def test_finalize_falls_back_to_visual_tag(tmp_path):
    """When image_tag is empty, fall back to visual_tag."""
    from pipeline.story_generator import finalize_image_prompt

    config = make_config(tmp_path)
    # image_tag defaults to "" — should fall back to visual_tag

    result = finalize_image_prompt(
        "PROTAGONIST walks down the street.",
        config,
    )
    assert "a slim young woman with light-brown hair" in result


def test_finalize_handles_plain_name(tmp_path):
    """When LLM writes plain name instead of PROTAGONIST placeholder."""
    from pipeline.story_generator import finalize_image_prompt

    config = make_config(tmp_path)
    config.protagonist.image_tag = "young woman, teal cardigan"

    result = finalize_image_prompt(
        "Charlotte walks down the street.",
        config,
    )
    assert "Charlotte (young woman, teal cardigan)" in result
```

- [ ] **Step 6: Run to verify failure**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py::test_finalize_image_prompt_with_image_tag -v`

Expected: FAIL with `ImportError: cannot import name 'finalize_image_prompt'`.

- [ ] **Step 7: Implement `finalize_image_prompt`**

Add to `pipeline/story_generator.py` right after `_replace_character`:

```python
def finalize_image_prompt(raw: str, config: DeckConfig) -> str:
    """Apply character tag replacement + style/suffix injection to a raw image prompt.

    Exported for use by both _post_process (Pass 0) and image_auditor (Pass 5c).
    """
    p = config.protagonist
    p_tag = p.image_tag or p.visual_tag

    if "PROTAGONIST" in raw:
        raw = _replace_character(raw, "PROTAGONIST", p.name, p_tag)
    elif p.name in raw and p_tag not in raw:
        raw = _replace_character(raw, p.name, p.name, p_tag)

    for sc in config.secondary_characters:
        sc_tag = sc.image_tag or sc.visual_tag
        name_upper = sc.name.upper()
        if name_upper in raw:
            raw = _replace_character(raw, name_upper, sc.name, sc_tag)
        elif sc.name in raw and sc_tag not in raw:
            raw = _replace_character(raw, sc.name, sc.name, sc_tag)

    if raw.endswith("."):
        raw = raw[:-1]

    style = config.image_generation.style if config.image_generation else ""
    suffix = "no text, no writing, no letters"
    return f"{style}, {raw}. {suffix}"
```

- [ ] **Step 8: Run finalize tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py -k "finalize" -v`

Expected: All 3 tests PASS.

- [ ] **Step 9: Rewrite `_post_process` to use `finalize_image_prompt`**

Replace the entire `_post_process` function body in `pipeline/story_generator.py` (currently lines 238-279):

```python
def _post_process(chapter_data: ChapterScene, config: DeckConfig) -> ChapterScene:
    """Replace character placeholders in image prompts and sentence source text."""
    p = config.protagonist

    for scene in chapter_data.scenes:
        for shot in scene.shots:
            # --- Image prompt: replace with image_tag + style/suffix ---
            shot.image_prompt = finalize_image_prompt(shot.image_prompt.strip(), config)

            # --- Sentence source: replace with plain name for learners ---
            known_upper = {p.name.upper(), "PROTAGONIST"} | {
                sc.name.upper() for sc in config.secondary_characters
            }
            for sentence in shot.sentences:
                sentence.source = sentence.source.replace("PROTAGONIST", p.name)
                for sc in config.secondary_characters:
                    sentence.source = sentence.source.replace(sc.name.upper(), sc.name)
                # Replace unknown ALL-CAPS names (LLM-invented characters)
                sentence.source = re.sub(
                    r"\b([A-ZÁÉÍÓÚÑÜ]{3,})\b",
                    lambda m: m.group(1).capitalize()
                    if m.group(1) not in known_upper
                    else m.group(1),
                    sentence.source,
                )

    return chapter_data
```

- [ ] **Step 10: Update existing `test_post_process_replaces_protagonist_and_characters`**

The format changed from `{style}. {raw}. {suffix}` to `{style}, {raw}. {suffix}`. Update the test:

```python
def test_post_process_replaces_protagonist_and_characters(tmp_path):
    from pipeline.story_generator import _post_process
    from pipeline.models import ChapterScene, Scene, Shot, ShotSentence

    config = make_config(tmp_path)
    chapter = ChapterScene(chapter=1, scenes=[
        Scene(setting="test", description="test", shots=[
            Shot(
                focus="PROTAGONIST walking",
                image_prompt="PROTAGONIST walks down the street with TAXI DRIVER",
                sentences=[
                    ShotSentence(source="PROTAGONIST camina por la calle.", sentence_index=0),
                    ShotSentence(source="«¡Hola!», dice TAXI DRIVER.", sentence_index=1),
                ],
            )
        ])
    ])

    result = _post_process(chapter, config)
    shot = result.scenes[0].shots[0]

    # Image prompt: uses image_tag (falls back to visual_tag when image_tag="")
    assert "a slim young woman with light-brown hair" in shot.image_prompt
    assert "a stocky man with a gray flat cap" in shot.image_prompt
    assert "PROTAGONIST" not in shot.image_prompt
    assert "TAXI DRIVER" not in shot.image_prompt
    # Style prefix: comma-separated
    assert shot.image_prompt.startswith(config.image_generation.style + ", ")
    assert shot.image_prompt.endswith("no text, no writing, no letters")

    # Sentence source: PROTAGONIST → name, TAXI DRIVER → name (unchanged)
    assert shot.sentences[0].source == "Charlotte camina por la calle."
    assert "Taxi Driver" in shot.sentences[1].source
    assert "TAXI DRIVER" not in shot.sentences[1].source
```

- [ ] **Step 11: Run all story_generator tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py -v`

Expected: All tests PASS.

- [ ] **Step 12: Commit**

```bash
git add pipeline/story_generator.py tests/test_story_generator.py
git commit -m "feat: image_tag replacement with possessive handling in _post_process"
```

---

## Chunk 2: Image Auditor Rewrite

### Task 4: Image Auditor — Scene Review + Apply

**Files:**
- Rewrite: `pipeline/image_auditor.py`
- Rewrite: `tests/test_image_auditor.py`

- [ ] **Step 1: Write failing tests for models and `review_scenes`**

Replace `tests/test_image_auditor.py` entirely:

```python
"""Tests for image auditor (scene review + prompt generation)."""
from unittest.mock import MagicMock

from pipeline.image_auditor import (
    ReviewedShot,
    ReviewedScene,
    ShotPrompt,
    review_scenes,
    apply_scene_review,
    generate_prompts,
    apply_prompts,
)
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


def _make_chapter(shots_config: list[list[int]]) -> ChapterScene:
    """Build a chapter where each inner list is the sentence_indices for one shot."""
    shots = []
    for idx, sent_indices in enumerate(shots_config):
        sents = [
            ShotSentence(source=f"Sentence {i}.", sentence_index=i)
            for i in sent_indices
        ]
        shots.append(Shot(
            focus=f"focus_{idx}",
            image_prompt=f"old prompt {idx}",
            sentences=sents,
        ))
    return ChapterScene(chapter=1, scenes=[
        Scene(setting="test_setting", description="A test scene", shots=shots),
    ])


def test_review_scenes_parses_llm_response():
    """review_scenes returns ReviewedScene list from LLM JSON."""
    llm = MagicMock()
    llm.complete_json.return_value = MagicMock(
        parsed={
            "scenes": [{
                "setting": "test_setting",
                "shots": [
                    {"focus": "suitcase", "sentence_indices": [0, 1]},
                    {"focus": "window", "sentence_indices": [2]},
                    {"focus": "doorway", "sentence_indices": [3, 4]},
                ],
            }],
        },
    )

    chapter = _make_chapter([[0, 1, 2, 3, 4]])
    scenes, resp = review_scenes(chapter, llm)

    assert len(scenes) == 1
    assert len(scenes[0].shots) == 3
    assert scenes[0].shots[0].sentence_indices == [0, 1]
    assert scenes[0].shots[2].focus == "doorway"
    llm.complete_json.assert_called_once()


def test_review_scenes_no_llm_returns_empty():
    scenes, resp = review_scenes(_make_chapter([[0]]), llm=None)
    assert scenes == []
    assert resp is None


def test_apply_scene_review_restructures_shots():
    """Splits a 4-sentence shot into two 2-sentence shots."""
    chapter = _make_chapter([[0, 1, 2, 3]])

    reviewed = [ReviewedScene(
        setting="test_setting",
        shots=[
            ReviewedShot(focus="close-up of hands", sentence_indices=[0, 1]),
            ReviewedShot(focus="wide view of room", sentence_indices=[2, 3]),
        ],
    )]

    result = apply_scene_review(chapter, reviewed)

    assert len(result.scenes[0].shots) == 2
    assert result.scenes[0].shots[0].focus == "close-up of hands"
    assert [s.sentence_index for s in result.scenes[0].shots[0].sentences] == [0, 1]
    assert result.scenes[0].shots[1].focus == "wide view of room"
    assert [s.sentence_index for s in result.scenes[0].shots[1].sentences] == [2, 3]
    # image_prompt cleared — will be filled by generate_prompts
    assert result.scenes[0].shots[0].image_prompt == ""
    # Setting + description preserved from original
    assert result.scenes[0].setting == "test_setting"
    assert result.scenes[0].description == "A test scene"


def test_apply_scene_review_preserves_normal_shots():
    """Shots already ≤2 sentences pass through unchanged in structure."""
    chapter = _make_chapter([[0, 1], [2]])

    reviewed = [ReviewedScene(
        setting="test_setting",
        shots=[
            ReviewedShot(focus="focus_0", sentence_indices=[0, 1]),
            ReviewedShot(focus="focus_1", sentence_indices=[2]),
        ],
    )]

    result = apply_scene_review(chapter, reviewed)
    assert len(result.scenes[0].shots) == 2
    assert [s.sentence_index for s in result.scenes[0].shots[0].sentences] == [0, 1]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_image_auditor.py::test_review_scenes_parses_llm_response -v`

Expected: FAIL with `ImportError: cannot import name 'ReviewedShot'`.

- [ ] **Step 3: Implement models + `review_scenes` + `apply_scene_review`**

Rewrite `pipeline/image_auditor.py` completely:

```python
"""Pass 5c: Two-step image pipeline.

Step 1 — Scene Review (one call per chapter):
  Restructures shots so each has max 2 sentences, verifies focus variety.

Step 2 — Prompt Generation (one call per chapter):
  Generates <200-char image prompts for all shots.
"""

from pydantic import BaseModel

from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


# ── Models ──────────────────────────────────────────────────────────────


class ReviewedShot(BaseModel):
    """A shot in the reviewed scene structure."""
    focus: str
    sentence_indices: list[int]


class ReviewedScene(BaseModel):
    """A scene with reviewed shot structure."""
    setting: str
    shots: list[ReviewedShot]


class ShotPrompt(BaseModel):
    """Generated image prompt for a specific shot."""
    scene_index: int
    shot_index: int
    prompt: str


# ── Step 1: Scene Review ────────────────────────────────────────────────


def _build_scene_review_prompt(chapter: ChapterScene) -> tuple[str, str]:
    """Build system + user prompt for scene review."""
    system = (
        "You are a visual editor reviewing shot structure for a graded reader app. "
        "Each shot pairs an illustration with 1-2 sentences. Return valid JSON."
    )

    lines = [f"Review the shot structure for chapter {chapter.chapter}.\n"]
    lines.append("RULES:")
    lines.append("- Each shot MUST have 1-2 sentences (maximum 2)")
    lines.append("- Shots with 3+ sentences MUST be split into separate shots")
    lines.append("- Each shot focuses on ONE clear visual moment")
    lines.append("- Vary focus across consecutive shots — no three close-ups of the same subject")
    lines.append("- Maintain scene boundaries — do NOT move sentences between scenes")
    lines.append("")

    for si, scene in enumerate(chapter.scenes):
        lines.append(f"Scene {si}: {scene.setting}")
        lines.append(f"  {scene.description}")
        for hi, shot in enumerate(scene.shots):
            indices = [s.sentence_index for s in shot.sentences]
            lines.append(
                f"  Shot [{si}:{hi}] focus=\"{shot.focus}\" "
                f"sentences={indices}"
            )
            for sent in shot.sentences:
                lines.append(f"    \"{sent.source}\"")
        lines.append("")

    lines.append("Return:")
    lines.append("{")
    lines.append('  "scenes": [')
    lines.append("    {")
    lines.append('      "setting": "scene_setting",')
    lines.append('      "shots": [')
    lines.append('        {"focus": "descriptive focus", "sentence_indices": [0, 1]},')
    lines.append('        {"focus": "another focus", "sentence_indices": [2]}')
    lines.append("      ]")
    lines.append("    }")
    lines.append("  ]")
    lines.append("}")

    return system, "\n".join(lines)


def review_scenes(
    chapter: ChapterScene,
    llm=None,
) -> tuple[list[ReviewedScene], object]:
    """Review and restructure shots in a chapter. Returns (reviewed_scenes, LLMResponse)."""
    if llm is None:
        return [], None

    system, prompt = _build_scene_review_prompt(chapter)
    response = llm.complete_json(prompt, system=system)
    parsed = response.parsed
    if isinstance(parsed, list):
        parsed = {"scenes": parsed}

    scenes = []
    for raw_scene in parsed.get("scenes", []):
        shots = []
        for raw_shot in raw_scene.get("shots", []):
            shots.append(ReviewedShot(
                focus=raw_shot["focus"],
                sentence_indices=raw_shot["sentence_indices"],
            ))
        scenes.append(ReviewedScene(
            setting=raw_scene.get("setting", ""),
            shots=shots,
        ))

    return scenes, response


def apply_scene_review(
    chapter: ChapterScene,
    reviewed: list[ReviewedScene],
) -> ChapterScene:
    """Rebuild chapter shots according to scene review results."""
    # Build sentence lookup: sentence_index → ShotSentence
    all_sentences: dict[int, ShotSentence] = {}
    for scene in chapter.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                all_sentences[sent.sentence_index] = sent

    new_scenes = []
    for ri, reviewed_scene in enumerate(reviewed):
        original = chapter.scenes[ri] if ri < len(chapter.scenes) else chapter.scenes[-1]
        new_shots = []
        for reviewed_shot in reviewed_scene.shots:
            sentences = [
                all_sentences[idx]
                for idx in reviewed_shot.sentence_indices
                if idx in all_sentences
            ]
            new_shots.append(Shot(
                focus=reviewed_shot.focus,
                image_prompt="",  # filled by generate_prompts
                sentences=sentences,
            ))
        new_scenes.append(Scene(
            setting=original.setting,
            description=original.description,
            shots=new_shots,
        ))

    return ChapterScene(chapter=chapter.chapter, scenes=new_scenes)
```

- [ ] **Step 4: Run scene review tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_image_auditor.py -k "review_scenes or apply_scene" -v`

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/image_auditor.py tests/test_image_auditor.py
git commit -m "feat: image auditor step 1 — review_scenes + apply_scene_review"
```

---

### Task 5: Image Auditor — Prompt Generation + Apply

**Files:**
- Modify: `pipeline/image_auditor.py` (append prompt generation functions)
- Modify: `tests/test_image_auditor.py` (append tests)

- [ ] **Step 1: Write failing tests for `generate_prompts` and `apply_prompts`**

Add to `tests/test_image_auditor.py`:

```python
def test_generate_prompts_parses_llm_response():
    """generate_prompts returns ShotPrompt list from LLM JSON."""
    llm = MagicMock()
    llm.complete_json.return_value = MagicMock(
        parsed={
            "prompts": [
                {"scene_index": 0, "shot_index": 0, "prompt": "Close-up of a red suitcase on a bed"},
                {"scene_index": 0, "shot_index": 1, "prompt": "Medium shot of a woman by window"},
            ],
        },
    )

    chapter = _make_chapter([[0, 1], [2]])
    characters = [
        {"name": "Maria", "role": "protagonist", "image_tag": "young woman, teal cardigan"},
    ]

    prompts, resp = generate_prompts(chapter, characters, llm)

    assert len(prompts) == 2
    assert prompts[0].scene_index == 0
    assert prompts[0].shot_index == 0
    assert "suitcase" in prompts[0].prompt
    llm.complete_json.assert_called_once()


def test_generate_prompts_no_llm_returns_empty():
    prompts, resp = generate_prompts(_make_chapter([[0]]), [], llm=None)
    assert prompts == []
    assert resp is None


def test_apply_prompts_sets_image_prompt():
    """apply_prompts writes prompt string into each shot."""
    chapter = _make_chapter([[0, 1], [2]])
    prompts = [
        ShotPrompt(scene_index=0, shot_index=0, prompt="A red suitcase"),
        ShotPrompt(scene_index=0, shot_index=1, prompt="A window scene"),
    ]

    result = apply_prompts(chapter, prompts)

    assert result.scenes[0].shots[0].image_prompt == "A red suitcase"
    assert result.scenes[0].shots[1].image_prompt == "A window scene"


def test_apply_prompts_skips_missing_shots():
    """If a prompt references a non-existent shot, other shots still get updated."""
    chapter = _make_chapter([[0]])
    prompts = [
        ShotPrompt(scene_index=0, shot_index=0, prompt="Valid prompt"),
        ShotPrompt(scene_index=5, shot_index=9, prompt="Ghost prompt"),
    ]

    result = apply_prompts(chapter, prompts)
    assert result.scenes[0].shots[0].image_prompt == "Valid prompt"


def test_build_prompt_generation_includes_characters():
    """Prompt generation prompt lists characters with their image_tags."""
    from pipeline.image_auditor import _build_prompt_generation_prompt

    chapter = _make_chapter([[0, 1]])
    characters = [
        {"name": "Maria", "role": "protagonist", "image_tag": "young woman, teal cardigan"},
        {"name": "Sofia", "role": "best friend", "image_tag": "curly dark hair, olive skin"},
    ]

    _, prompt = _build_prompt_generation_prompt(chapter, characters)

    assert "PROTAGONIST: Maria" in prompt
    assert "young woman, teal cardigan" in prompt
    assert "SOFIA: Sofia" in prompt
    assert "curly dark hair, olive skin" in prompt
    assert "under 200 characters" in prompt
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_image_auditor.py::test_generate_prompts_parses_llm_response -v`

Expected: FAIL — `generate_prompts` not yet defined.

- [ ] **Step 3: Implement prompt generation functions**

Append to `pipeline/image_auditor.py`:

```python
# ── Step 2: Prompt Generation ───────────────────────────────────────────


def _build_prompt_generation_prompt(
    chapter: ChapterScene,
    characters: list[dict],
) -> tuple[str, str]:
    """Build system + user prompt for image prompt generation."""
    system = (
        "You are an image prompt writer for a language learning storybook. "
        "Write concise, visual descriptions for cartoon illustrations. "
        "Return valid JSON."
    )

    char_lines = []
    for c in characters:
        tag = c.get("image_tag") or c.get("visual_tag", "")
        name = c.get("name", "")
        placeholder = "PROTAGONIST" if c.get("role") == "protagonist" else name.upper()
        if tag:
            char_lines.append(f"  {placeholder}: {name} — {tag}")
    char_block = "\n".join(char_lines) if char_lines else "  (none)"

    lines = [f"Write an image prompt for each shot in chapter {chapter.chapter}.\n"]
    lines.append(f"CHARACTERS (use EXACT placeholder names in ALL CAPS):\n{char_block}\n")

    for si, scene in enumerate(chapter.scenes):
        lines.append(f"Scene {si}: {scene.setting} — {scene.description}")
        for hi, shot in enumerate(scene.shots):
            texts = " | ".join(s.source for s in shot.sentences)
            lines.append(f"  Shot [{si}:{hi}] focus=\"{shot.focus}\"")
            lines.append(f"    Sentences: {texts}")
        lines.append("")

    lines.append("RULES:")
    lines.append("- Describe what is VISIBLE: environment, focal object, character actions")
    lines.append("- Exaggerate focal objects: oversized, vivid colors, bold shapes")
    lines.append("- Use PROTAGONIST for the protagonist, CHARACTER_NAME (ALL CAPS) for others")
    lines.append("- Prefer close-up and medium shots, avoid wide/establishing shots")
    lines.append("- NO text, labels, signs, or writing in the image")
    lines.append("- NO art style prefixes or suffixes — added later")
    lines.append("- Each prompt MUST be under 200 characters")
    lines.append("")
    lines.append("Return:")
    lines.append("{")
    lines.append('  "prompts": [')
    lines.append('    {"scene_index": 0, "shot_index": 0, "prompt": "Close-up of ..."},')
    lines.append('    {"scene_index": 0, "shot_index": 1, "prompt": "Medium shot of ..."}')
    lines.append("  ]")
    lines.append("}")

    return system, "\n".join(lines)


def generate_prompts(
    chapter: ChapterScene,
    characters: list[dict],
    llm=None,
) -> tuple[list[ShotPrompt], object]:
    """Generate image prompts for all shots in a chapter. Returns (prompts, LLMResponse)."""
    if llm is None:
        return [], None

    system, prompt = _build_prompt_generation_prompt(chapter, characters)
    response = llm.complete_json(prompt, system=system)
    parsed = response.parsed
    if isinstance(parsed, list):
        parsed = {"prompts": parsed}

    prompts = []
    for raw in parsed.get("prompts", []):
        try:
            prompts.append(ShotPrompt(**raw))
        except Exception:
            continue

    return prompts, response


def apply_prompts(
    chapter: ChapterScene,
    prompts: list[ShotPrompt],
) -> ChapterScene:
    """Set image_prompt on each shot from generated prompts."""
    prompt_map = {(p.scene_index, p.shot_index): p.prompt for p in prompts}
    for si, scene in enumerate(chapter.scenes):
        for hi, shot in enumerate(scene.shots):
            key = (si, hi)
            if key in prompt_map:
                shot.image_prompt = prompt_map[key]
    return chapter
```

- [ ] **Step 4: Run all image auditor tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_image_auditor.py -v`

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/image_auditor.py tests/test_image_auditor.py
git commit -m "feat: image auditor step 2 — generate_prompts + apply_prompts"
```

---

## Chunk 3: Integration

### Task 6: run_all.py — Move Image Pipeline to Pass 8 (After Word Extraction)

**Why:** All text work (translation, word extraction, vocabulary) completes before image work begins. This prevents wasted image pipeline cost if text stages fail, and keeps story JSONs stable during text reads.

**Files:**
- Modify: `scripts/run_all.py`

- [ ] **Step 1: Update imports at top of file**

In `scripts/run_all.py`, add `finalize_image_prompt` to the story_generator import block (line 53-58):

```python
from pipeline.story_generator import (
    StoryGenerator,
    expand_manifest_for_shared_shots,
    extract_flat_text,
    extract_image_prompts,
    finalize_image_prompt,
)
```

Add image auditor imports after the story_generator imports:

```python
from pipeline.image_auditor import (
    review_scenes,
    apply_scene_review,
    generate_prompts,
    apply_prompts,
)
```

- [ ] **Step 2: Delete the old Pass 5c block**

Delete the entire Pass 5c section (lines 564-603, from `# Pass 5c: Image Prompt Audit` through `audit_log["unnamed_characters"] = ...`). Keep the `audit_log["unnamed_characters"]` line — move it to right after the story audit loop ends (after `if all_unnamed:` block).

- [ ] **Step 3: Add Pass 8 after the coverage report**

After the coverage report section (around line 686, before `cost.finish()`) and after the final print with "Text generation complete", insert the new Pass 8 block:

```python
    # Pass 8: Image Pipeline — Scene Review + Prompt Generation
    # Runs AFTER all text work (translation + word extraction) is complete.
    cost.begin("Pass 8: Image Pipeline")
    print("\n=== Pass 8: Image Pipeline ===")
    llm_img_review = create_model_client(config.models.image_review)
    llm_img_prompt = create_model_client(config.models.image_fix)

    # Build character info with image_tags for prompt generation
    img_characters = [{
        "name": config.protagonist.name,
        "role": "protagonist",
        "image_tag": config.protagonist.image_tag,
        "visual_tag": config.protagonist.visual_tag,
    }]
    for sc in config.secondary_characters:
        img_characters.append({
            "name": sc.name,
            "role": sc.role or "secondary character",
            "image_tag": sc.image_tag,
            "visual_tag": sc.visual_tag,
            "chapters": sc.chapters,
        })

    img_audit_log = []
    for i in chapter_range:
        ch_num = i + 1
        story_path = output_base / config.deck.id / "stories" / f"chapter_{ch_num:02d}.json"
        if not story_path.exists():
            continue

        ch_data = ChapterScene(**json.loads(story_path.read_text()))
        pre_shots = sum(len(s.shots) for s in ch_data.scenes)

        # Step 1: Scene Review — restructure shots (split oversized)
        reviewed, review_resp = review_scenes(ch_data, llm=llm_img_review)
        cost.add(review_resp)

        if reviewed:
            ch_data = apply_scene_review(ch_data, reviewed)
            post_shots = sum(len(s.shots) for s in ch_data.scenes)
            delta = f" ({pre_shots} → {post_shots})" if post_shots != pre_shots else ""
            print(f"  Ch{ch_num}: {post_shots} shots{delta}")
        else:
            post_shots = pre_shots
            print(f"  Ch{ch_num}: {post_shots} shots (review skipped)")

        # Step 2: Prompt Generation — new prompts for all shots
        ch_chars = [c for c in img_characters
                    if c.get("role") == "protagonist"
                    or ch_num in c.get("chapters", [])]
        prompts, prompt_resp = generate_prompts(ch_data, ch_chars, llm=llm_img_prompt)
        cost.add(prompt_resp)

        if prompts:
            ch_data = apply_prompts(ch_data, prompts)
            expected = sum(len(s.shots) for s in ch_data.scenes)
            if len(prompts) < expected:
                print(f"          {len(prompts)}/{expected} prompts (some missing)")
            else:
                print(f"          {len(prompts)} prompts generated")

        # Step 3: Finalize — inject character tags + style/suffix
        for scene in ch_data.scenes:
            for shot in scene.shots:
                if shot.image_prompt:
                    shot.image_prompt = finalize_image_prompt(shot.image_prompt, config)

        # Save updated chapter
        story_path.write_text(json.dumps(ch_data.model_dump(), ensure_ascii=False, indent=2))
        chapter_scenes[i] = ch_data
        stories[i] = extract_flat_text(ch_data)

        img_audit_log.append({
            "chapter": ch_num,
            "pre_shots": pre_shots,
            "post_shots": post_shots,
            "prompts_generated": len(prompts),
        })

    audit_log["image_audit"] = img_audit_log
    audit_log["unnamed_characters"] = [u.model_dump() for u in all_unnamed]
```

- [ ] **Step 4: Remove the old lazy import of `find_image_issues`**

The old lazy import `from pipeline.image_auditor import find_image_issues` inside `run_text_stage` (around line 566) was deleted in step 2. Confirm it's gone.

- [ ] **Step 5: Run full test suite**

Run: `cd spanish-content-pipeline && uv run pytest tests/ -v --tb=short`

Expected: All tests PASS.

- [ ] **Step 6: Verify imports resolve**

Run: `cd spanish-content-pipeline && uv run python -c "from scripts.run_all import run_text_stage; print('imports OK')"`

Expected: Prints `imports OK`.

- [ ] **Step 7: Update the docstring at top of run_all.py**

Update the stage description comment (lines 1-33) to reflect the new pipeline order. Change Pass 5c references to Pass 8 and note it runs after word extraction.

- [ ] **Step 8: Commit**

```bash
git add scripts/run_all.py
git commit -m "feat: add Pass 8 image pipeline (scene review + prompt gen) after word extraction"
```

---

## Post-Implementation Verification

After all tasks are complete:

- [ ] **1. Full test suite**

```bash
cd spanish-content-pipeline && uv run pytest tests/ -v
```

- [ ] **2. Pipeline dry-run on chapters 1-3**

```bash
rm -rf output/es-de-buenos-aires/{stories,stories_raw,translations,words,gap_*}
cd spanish-content-pipeline && uv run python scripts/run_all.py \
  --config configs/spanish_buenos_aires.yaml --chapters 1-3 --stage text
```

Check output for:
- Pass 5c prints shot counts per chapter (and restructuring deltas if any)
- Pass 5c prints prompt generation counts
- No crashes or import errors

- [ ] **3. Verify image prompts in output**

```bash
cd spanish-content-pipeline && uv run python -c "
import json
ch = json.load(open('output/es-de-buenos-aires/stories/chapter_01.json'))
for scene in ch['scenes']:
    for shot in scene['shots']:
        p = shot['image_prompt']
        sents = len(shot['sentences'])
        print(f'[{sents} sent, {len(p)} chars] {p[:100]}...' if len(p) > 100 else f'[{sents} sent, {len(p)} chars] {p}')
"
```

Verify:
- All prompts start with `cartoon, vibrant colors, `
- All prompts end with `no text, no writing, no letters`
- No possessive issues (no `jeans's` or `cardigan's`)
- No shots with 3+ sentences
- Prompt lengths are reasonable (target: 150-250 chars total)

- [ ] **4. Test image generation with FLUX Schnell (chapter 1 only)**

```bash
cd spanish-content-pipeline && uv run python scripts/run_all.py \
  --config configs/spanish_buenos_aires.yaml --chapters 1 --stage media --skip-audio
```

Verify images appear in `output/es-de-buenos-aires/images/` as `.webp` files.
