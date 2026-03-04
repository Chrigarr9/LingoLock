# Scene-First Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the separate story generation + image prompting passes with a single scene-first generator that produces stories as scenes/shots/sentences with integrated image prompts, and add Google AI Studio as an image provider.

**Architecture:** New `scene_story_generator.py` replaces both `story_generator.py` and `image_prompter.py`. It outputs structured JSON (scenes → shots → sentences + image prompts) per chapter. Compatibility helpers extract flat text for the unchanged translator and word extractor passes. `image_generator.py` gains a Gemini native image generation provider alongside Together.ai, routed by model name.

**Tech Stack:** Python 3.12, Pydantic, httpx, pytest, Google Gemini API (generateContent endpoint with responseModalities=IMAGE)

---

### Task 1: Add Scene Data Models + Move ImagePromptResult to models.py

**Files:**
- Modify: `spanish-content-pipeline/pipeline/models.py`
- Test: `spanish-content-pipeline/tests/test_models.py`

**Step 1: Write failing test for scene models**

Add to `tests/test_models.py`:

```python
from pipeline.models import (
    ShotSentence, Shot, Scene, ChapterScene, ImagePromptResult,
)


def test_chapter_scene_round_trip():
    """ChapterScene can be constructed and serialized."""
    chapter = ChapterScene(
        chapter=1,
        scenes=[
            Scene(
                setting="maria_bedroom_berlin",
                description="A cozy bedroom with warm lamp light",
                shots=[
                    Shot(
                        focus="open suitcase on bed",
                        image_prompt="A cozy bedroom with a large open suitcase on the bed, clothes spilling out",
                        sentences=[
                            ShotSentence(source="María está en su habitación.", sentence_index=0),
                            ShotSentence(source="Ella tiene una maleta grande.", sentence_index=1),
                        ],
                    ),
                    Shot(
                        focus="travel guide on nightstand",
                        image_prompt="A nightstand with a brightly colored travel guide book prominently placed",
                        sentences=[
                            ShotSentence(source="Hay una guía de Buenos Aires.", sentence_index=2),
                        ],
                    ),
                ],
            ),
        ],
    )
    data = chapter.model_dump()
    assert data["chapter"] == 1
    assert len(data["scenes"]) == 1
    assert len(data["scenes"][0]["shots"]) == 2
    assert data["scenes"][0]["shots"][0]["sentences"][0]["source"] == "María está en su habitación."

    # Round-trip
    restored = ChapterScene(**data)
    assert restored == chapter


def test_image_prompt_result_in_models():
    """ImagePromptResult is importable from models and works as Pydantic model."""
    from pipeline.models import ImagePrompt

    result = ImagePromptResult(
        style="warm storybook illustration",
        sentences=[
            ImagePrompt(
                chapter=1, sentence_index=0,
                source="Test.", image_type="scene_only",
                prompt="A test scene", setting="test",
            ),
        ],
    )
    assert result.style == "warm storybook illustration"
    assert result.protagonist_prompt == ""
    assert len(result.sentences) == 1
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_models.py -v -k "test_chapter_scene or test_image_prompt_result_in_models"`
Expected: FAIL — `ImportError: cannot import name 'ShotSentence'`

**Step 3: Add models to models.py**

Add to `pipeline/models.py` after the `ImagePrompt` class:

```python
class ShotSentence(BaseModel):
    source: str          # Sentence in target language
    sentence_index: int  # Global index within chapter (0-based)


class Shot(BaseModel):
    focus: str              # What the camera focuses on (vocab-driven)
    image_prompt: str       # English image description (before style/tag injection)
    sentences: list[ShotSentence]


class Scene(BaseModel):
    setting: str         # Reusable location tag (e.g. "maria_bedroom_berlin")
    description: str     # Overall environment description
    shots: list[Shot]


class ChapterScene(BaseModel):
    chapter: int
    scenes: list[Scene]


class ImagePromptResult(BaseModel):
    protagonist_prompt: str = ""  # Optional — empty when no reference image needed
    style: str
    sentences: list[ImagePrompt]
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_models.py -v -k "test_chapter_scene or test_image_prompt_result_in_models"`
Expected: PASS

**Step 5: Update image_generator.py import**

In `pipeline/image_generator.py`, change:
```python
from pipeline.image_prompter import ImagePromptResult
```
to:
```python
from pipeline.models import ImagePromptResult
```

**Step 6: Update test_image_generator.py import**

In `tests/test_image_generator.py`, change:
```python
from pipeline.image_prompter import ImagePromptResult
```
to:
```python
from pipeline.models import ImagePromptResult
```

**Step 7: Run all tests to verify nothing breaks**

Run: `cd spanish-content-pipeline && python -m pytest -v`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add spanish-content-pipeline/pipeline/models.py spanish-content-pipeline/tests/test_models.py spanish-content-pipeline/pipeline/image_generator.py spanish-content-pipeline/tests/test_image_generator.py
git commit -m "feat(models): add scene hierarchy models and move ImagePromptResult to models.py"
```

---

### Task 2: Create SceneStoryGenerator

**Files:**
- Create: `spanish-content-pipeline/pipeline/scene_story_generator.py`
- Create: `spanish-content-pipeline/tests/test_scene_story_generator.py`

**Step 1: Write failing test for chapter generation**

Create `tests/test_scene_story_generator.py`:

```python
"""Tests for scene-first story generator."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import yaml

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import ChapterScene


def make_config(tmp_path: Path):
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "neutral",
        },
        "protagonist": {
            "name": "Charlotte", "gender": "female",
            "origin_country": "Germany", "origin_city": "Berlin",
            "description": "mid-20s, light brown hair",
            "visual_tag": "a slim young woman with light-brown hair, dark-teal cardigan",
        },
        "destination": {
            "country": "Argentina", "city": "Buenos Aires",
            "landmarks": ["Plaza de Mayo", "La Boca"],
        },
        "story": {
            "cefr_level": "A1-A2",
            "sentences_per_chapter": [8, 12],
            "chapters": [
                {"title": "Preparation", "context": "Packing bags", "vocab_focus": ["clothing", "travel"]},
                {"title": "To the Airport", "context": "Taking a taxi", "vocab_focus": ["traffic"]},
            ],
        },
        "llm": {
            "provider": "google", "model": "gemini-2.5-flash-lite",
            "fallback_model": "gemini-2.5-flash", "temperature": 0.7, "max_retries": 3,
        },
        "image_generation": {
            "enabled": True, "provider": "together",
            "model": "black-forest-labs/FLUX.1-schnell",
            "cheap_model": "black-forest-labs/FLUX.1-schnell",
            "style": "modern cartoon illustration, vibrant flat colors",
            "width": 768, "height": 512,
        },
        "secondary_characters": [
            {"name": "Taxi Driver", "visual_tag": "a stocky man with a gray flat cap", "chapters": [2]},
        ],
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


MOCK_CHAPTER_RESPONSE = {
    "scenes": [
        {
            "setting": "charlotte_bedroom_berlin",
            "description": "A cozy bedroom with warm lamp light and posters on the wall",
            "shots": [
                {
                    "focus": "open suitcase on bed",
                    "image_prompt": "A cozy bedroom with a dramatically large open suitcase on the bed, clothes spilling out everywhere",
                    "sentences": [
                        {"source": "Charlotte está en su habitación en Berlín.", "sentence_index": 0},
                        {"source": "Ella tiene una maleta grande.", "sentence_index": 1},
                    ],
                },
                {
                    "focus": "travel guide on nightstand",
                    "image_prompt": "A wooden nightstand with an oversized colorful travel guide book, warm lamp light",
                    "sentences": [
                        {"source": "Hay una guía de Buenos Aires.", "sentence_index": 2},
                    ],
                },
            ],
        },
    ],
}


def test_generate_chapter_calls_llm(tmp_path):
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    chapter_data = gen.generate_chapter(0)

    assert isinstance(chapter_data, ChapterScene)
    assert chapter_data.chapter == 1
    assert len(chapter_data.scenes) == 1
    assert len(chapter_data.scenes[0].shots) == 2
    mock_llm.complete_json.assert_called_once()


def test_generate_chapter_saves_json(tmp_path):
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    story_file = tmp_path / "test-deck" / "stories" / "chapter_01.json"
    assert story_file.exists()
    data = json.loads(story_file.read_text())
    assert data["chapter"] == 1
    assert "scenes" in data


def test_generate_chapter_skips_if_cached(tmp_path):
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-create cached file
    story_dir = tmp_path / "test-deck" / "stories"
    story_dir.mkdir(parents=True)
    cached = {"chapter": 1, "scenes": []}
    (story_dir / "chapter_01.json").write_text(json.dumps(cached))

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    result = gen.generate_chapter(0)

    assert result.chapter == 1
    assert result.scenes == []
    mock_llm.complete_json.assert_not_called()


def test_prompt_includes_config_details(tmp_path):
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    call_args = mock_llm.complete_json.call_args
    prompt = call_args.kwargs.get("prompt") or call_args.args[0]
    assert "Charlotte" in prompt
    assert "Buenos Aires" in prompt
    assert "A1-A2" in prompt
    assert "clothing" in prompt
    assert "travel" in prompt


def test_post_processing_injects_style_and_tags(tmp_path):
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    chapter_data = gen.generate_chapter(0)

    # Every shot's image_prompt should start with style prefix
    style = config.image_generation.style
    for scene in chapter_data.scenes:
        for shot in scene.shots:
            assert shot.image_prompt.startswith(f"{style}. "), (
                f"Expected prompt to start with style prefix, got: {shot.image_prompt[:80]}"
            )
            assert shot.image_prompt.endswith("no text, no writing, no letters.")


def test_secondary_characters_in_prompt_for_relevant_chapter(tmp_path):
    from pipeline.scene_story_generator import SceneStoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = SceneStoryGenerator(config, mock_llm, output_base=tmp_path)
    # Chapter 2 (index 1) has the Taxi Driver secondary character
    gen.generate_chapter(1)

    call_args = mock_llm.complete_json.call_args
    prompt = call_args.kwargs.get("prompt") or call_args.args[0]
    assert "Taxi Driver" in prompt
    assert "gray flat cap" in prompt
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_scene_story_generator.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.scene_story_generator'`

**Step 3: Implement SceneStoryGenerator**

Create `pipeline/scene_story_generator.py`:

```python
"""Pass 1 (scene-first): Generate story chapters as scenes/shots/sentences with image prompts."""

import json
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.llm import LLMClient
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


SYSTEM_PROMPT = """\
You are a film director creating a visual screenplay for a language learning app.
Think VISUALLY FIRST: imagine each scene as a location, then plan camera shots \
that highlight specific vocabulary words, then write sentences describing what's \
visible in each shot.

## Output Format
Return a JSON object with a "scenes" array. Each scene has:
- "setting": snake_case location tag (e.g. "maria_bedroom_berlin")
- "description": 1-2 sentence description of the environment (lighting, objects, mood)
- "shots": array of camera shots within this scene

Each shot has:
- "focus": what the camera focuses on (should highlight a vocabulary word)
- "image_prompt": English description of what's visible in this shot. Describe:
  - The environment (from the scene description)
  - The specific focal object/action (make it dramatically prominent — oversized, \
brightly lit, central, like a picture book)
  - Any characters present (describe by role and appearance, e.g. "a young woman \
with light-brown hair")
  - Camera angle and framing (mix wide, medium, and close-up across the chapter)
  Do NOT include art style prefixes or "no text" suffixes — these are added later.
  Keep under 200 characters.
- "sentences": array of 1-3 sentences for this shot. Each has:
  - "source": the sentence in the target language
  - "sentence_index": sequential 0-based index across ALL scenes in the chapter

## Rules
1. Every shot MUST visually highlight 1-2 vocabulary words from the focus areas.
2. Consecutive shots MUST focus on different objects/angles for variety.
3. Vary SUBJECT, ANGLE, COLOR PALETTE, and FRAMING across the whole chapter.
4. Characters can be prominent when the scene calls for it.
5. Phone calls: show only the caller's side (their room, the phone).
6. No text, labels, signs, or writing of any kind in the image descriptions.
7. No split/side-by-side/multi-panel compositions. One scene, one viewpoint.
8. Two places mentioned → pick ONE, show it as a single scene.
9. Never use "panoramic", "skyline", "iconic", "bustling" — these go photorealistic.
10. sentence_index must be sequential starting from 0 with no gaps."""


def _build_chapter_prompt(config: DeckConfig, chapter_index: int) -> str:
    chapter = config.story.chapters[chapter_index]
    p = config.protagonist
    d = config.destination
    min_sentences, max_sentences = config.story.sentences_per_chapter

    landmarks_str = ", ".join(d.landmarks[:5])
    vocab_str = ", ".join(chapter.vocab_focus)

    # Secondary characters for this chapter (1-indexed)
    secondary_section = ""
    for sc in config.secondary_characters:
        if (chapter_index + 1) in sc.chapters:
            secondary_section += f"\nSecondary character: {sc.name} — {sc.visual_tag}"
    if secondary_section:
        secondary_section = "\n" + secondary_section

    return f"""Write Chapter {chapter_index + 1}: "{chapter.title}"

Language: {config.languages.target} ({config.languages.dialect} dialect)
CEFR Level: {config.story.cefr_level}
Length: {min_sentences}-{max_sentences} sentences total

Protagonist: {p.name} — {p.description}
Destination: {d.city}, {d.country}
Notable places: {landmarks_str}

Chapter context: {chapter.context}
Vocabulary focus: {vocab_str}{secondary_section}

Return the chapter as a JSON object with a "scenes" array following the format above.
Ensure sentence_index values are sequential starting from 0."""


def _post_process(chapter_data: ChapterScene, config: DeckConfig) -> ChapterScene:
    """Inject style prefix, visual_tags, and 'no text' suffix into image prompts."""
    style = config.image_generation.style if config.image_generation else ""
    suffix = "no text, no writing, no letters."

    for scene in chapter_data.scenes:
        for shot in scene.shots:
            raw = shot.image_prompt.strip()
            # Remove any trailing period to avoid double-period
            if raw.endswith("."):
                raw = raw[:-1]
            shot.image_prompt = f"{style}. {raw}. {suffix}"

    return chapter_data


class SceneStoryGenerator:
    def __init__(self, config: DeckConfig, llm: LLMClient, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _story_dir(self) -> Path:
        return self._output_base / self._config.deck.id / "stories"

    def _chapter_path(self, chapter_index: int) -> Path:
        return self._story_dir() / f"chapter_{chapter_index + 1:02d}.json"

    def generate_chapter(self, chapter_index: int) -> ChapterScene:
        path = self._chapter_path(chapter_index)

        # Skip if already generated (cached)
        if path.exists():
            data = json.loads(path.read_text())
            return ChapterScene(**data)

        prompt = _build_chapter_prompt(self._config, chapter_index)
        result = self._llm.complete_json(prompt, system=SYSTEM_PROMPT)
        parsed = result.parsed

        chapter_data = ChapterScene(
            chapter=chapter_index + 1,
            scenes=[
                Scene(
                    setting=s["setting"],
                    description=s["description"],
                    shots=[
                        Shot(
                            focus=sh["focus"],
                            image_prompt=sh["image_prompt"],
                            sentences=[ShotSentence(**sent) for sent in sh["sentences"]],
                        )
                        for sh in s["shots"]
                    ],
                )
                for s in parsed["scenes"]
            ],
        )

        # Post-process: inject style, visual_tags, suffixes
        chapter_data = _post_process(chapter_data, self._config)

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(chapter_data.model_dump(), ensure_ascii=False, indent=2))

        return chapter_data

    def generate_all(self, chapter_range: range | None = None) -> list[ChapterScene]:
        if chapter_range is None:
            chapter_range = range(self._config.chapter_count)

        chapters = []
        for i in chapter_range:
            chapter = self.generate_chapter(i)
            chapters.append(chapter)
        return chapters
```

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_scene_story_generator.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/scene_story_generator.py spanish-content-pipeline/tests/test_scene_story_generator.py
git commit -m "feat(pipeline): add scene-first story generator with integrated image prompts"
```

---

### Task 3: Compatibility Extraction Helpers

**Files:**
- Modify: `spanish-content-pipeline/pipeline/scene_story_generator.py`
- Modify: `spanish-content-pipeline/tests/test_scene_story_generator.py`

**Step 1: Write failing tests for extraction helpers**

Add to `tests/test_scene_story_generator.py`:

```python
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence, ImagePrompt


def make_chapter_scene() -> ChapterScene:
    """Build a sample ChapterScene for extraction tests."""
    return ChapterScene(
        chapter=1,
        scenes=[
            Scene(
                setting="bedroom_berlin",
                description="A cozy bedroom",
                shots=[
                    Shot(
                        focus="suitcase",
                        image_prompt="style. A bedroom with a large suitcase. no text, no writing, no letters.",
                        sentences=[
                            ShotSentence(source="Charlotte está en su habitación.", sentence_index=0),
                            ShotSentence(source="Ella tiene una maleta grande.", sentence_index=1),
                        ],
                    ),
                    Shot(
                        focus="travel guide",
                        image_prompt="style. A nightstand with a travel guide. no text, no writing, no letters.",
                        sentences=[
                            ShotSentence(source="Hay una guía de viaje.", sentence_index=2),
                        ],
                    ),
                ],
            ),
            Scene(
                setting="kitchen_berlin",
                description="A bright kitchen",
                shots=[
                    Shot(
                        focus="coffee cups",
                        image_prompt="style. Kitchen table with two coffee cups. no text, no writing, no letters.",
                        sentences=[
                            ShotSentence(source="Su madre está en la cocina.", sentence_index=3),
                        ],
                    ),
                ],
            ),
        ],
    )


def test_extract_flat_text():
    from pipeline.scene_story_generator import extract_flat_text

    chapter = make_chapter_scene()
    text = extract_flat_text(chapter)

    lines = text.strip().split("\n")
    assert len(lines) == 4
    assert lines[0] == "Charlotte está en su habitación."
    assert lines[1] == "Ella tiene una maleta grande."
    assert lines[2] == "Hay una guía de viaje."
    assert lines[3] == "Su madre está en la cocina."


def test_extract_image_prompts():
    from pipeline.scene_story_generator import extract_image_prompts

    chapter = make_chapter_scene()
    prompts = extract_image_prompts(chapter)

    # 4 sentences = 4 image prompts (one per sentence, NOT one per shot)
    # This ensures every sentence_index has an image entry in the manifest,
    # which is critical for build-content.ts to find images for every card.
    assert len(prompts) == 4

    # Sentence 0 and 1 share the same shot → same image prompt text
    assert prompts[0].chapter == 1
    assert prompts[0].sentence_index == 0
    assert prompts[0].image_type == "scene_only"
    assert "suitcase" in prompts[0].prompt
    assert prompts[0].setting == "bedroom_berlin"

    assert prompts[1].sentence_index == 1
    assert prompts[1].prompt == prompts[0].prompt  # Same shot → same prompt

    # Sentence 2 is in a different shot
    assert prompts[2].sentence_index == 2
    assert "travel guide" in prompts[2].prompt

    # Sentence 3 is in a different scene
    assert prompts[3].sentence_index == 3
    assert prompts[3].setting == "kitchen_berlin"


def test_extract_image_prompts_dedup_enables_image_reuse():
    """Sentences sharing a shot get identical prompts, so image_generator dedup
    will generate the image once and reuse it for all sentences in the shot."""
    from pipeline.scene_story_generator import extract_image_prompts

    chapter = make_chapter_scene()
    prompts = extract_image_prompts(chapter)

    # Shot 1 has sentences 0 and 1 — both have identical prompt text
    shot1_prompts = [p for p in prompts if p.sentence_index in (0, 1)]
    assert len(shot1_prompts) == 2
    assert shot1_prompts[0].prompt == shot1_prompts[1].prompt

    # Different shots have different prompts
    assert prompts[0].prompt != prompts[2].prompt
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_scene_story_generator.py -v -k "extract"`
Expected: FAIL — `cannot import name 'extract_flat_text'`

**Step 3: Implement extraction helpers**

Add to `pipeline/scene_story_generator.py` (as module-level functions after the imports):

```python
from pipeline.models import ChapterScene, ImagePrompt, Scene, Shot, ShotSentence


def extract_flat_text(chapter: ChapterScene) -> str:
    """Extract all sentences as a flat newline-separated string for the translator."""
    sentences = []
    for scene in chapter.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences.append((sent.sentence_index, sent.source))
    sentences.sort(key=lambda x: x[0])
    return "\n".join(source for _, source in sentences)


def extract_image_prompts(chapter: ChapterScene) -> list[ImagePrompt]:
    """Extract one ImagePrompt per SENTENCE (not per shot).

    Sentences sharing a shot get the same image_prompt text. This ensures
    every sentence_index has an entry in the image manifest, so
    build-content.ts can find an image for every card. The image generator's
    existing dedup logic (prompt_to_entry) will generate the image once and
    reuse the file for all sentences in the same shot.
    """
    prompts = []
    for scene in chapter.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                prompts.append(
                    ImagePrompt(
                        chapter=chapter.chapter,
                        sentence_index=sent.sentence_index,
                        source=sent.source,
                        image_type="scene_only",
                        characters=[],
                        prompt=shot.image_prompt,
                        setting=scene.setting,
                    )
                )
    return prompts
```

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_scene_story_generator.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/scene_story_generator.py spanish-content-pipeline/tests/test_scene_story_generator.py
git commit -m "feat(pipeline): add extraction helpers for flat text and image prompts"
```

---

### Task 4: Add Google AI Studio Image Provider

**Files:**
- Modify: `spanish-content-pipeline/pipeline/image_generator.py`
- Modify: `spanish-content-pipeline/tests/test_image_generator.py`

**Step 1: Write failing test for Google image generation**

Add to `tests/test_image_generator.py`:

```python
import base64

import httpx


# Fake PNG header (minimal valid PNG)
TINY_PNG_B64 = base64.b64encode(b"\x89PNG\r\n\x1a\nfake-png-data").decode()


def fake_gemini_image_response(request: httpx.Request) -> httpx.Response:
    """Mock Gemini generateContent response with image output."""
    return httpx.Response(
        200,
        json={
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "inline_data": {
                                    "mime_type": "image/png",
                                    "data": TINY_PNG_B64,
                                }
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 10,
                "candidatesTokenCount": 0,
                "totalTokenCount": 10,
            },
        },
    )


def make_gemini_config(tmp_path):
    """Config using a Gemini image model."""
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "neutral",
        },
        "protagonist": {
            "name": "Charlotte", "gender": "female",
            "origin_country": "Germany", "origin_city": "Berlin",
        },
        "destination": {"country": "Argentina", "city": "Buenos Aires", "landmarks": []},
        "story": {
            "cefr_level": "A1-A2", "sentences_per_chapter": [8, 12],
            "chapters": [{"title": "Preparation", "context": "Packing", "vocab_focus": ["clothing"]}],
        },
        "llm": {
            "provider": "google", "model": "gemini-2.5-flash-lite",
            "fallback_model": "gemini-2.5-flash", "temperature": 0.7, "max_retries": 3,
        },
        "image_generation": {
            "enabled": True,
            "model": "gemini-2.5-flash-image",
            "cheap_model": "gemini-2.5-flash-image",
            "style": "cartoon illustration",
            "width": 768, "height": 512,
        },
    }
    import yaml
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    from pipeline.config import load_config
    return load_config(config_path)


def test_google_provider_generates_image(tmp_path):
    from pipeline.image_generator import ImageGenerator
    from pipeline.models import ImagePrompt

    config = make_gemini_config(tmp_path)
    transport = httpx.MockTransport(fake_gemini_image_response)

    gen = ImageGenerator(
        config,
        together_api_key=None,
        gemini_api_key="test-gemini-key",
        output_base=tmp_path,
        transport=transport,
    )

    prompt = ImagePrompt(
        chapter=1, sentence_index=0,
        source="Test.", image_type="scene_only",
        prompt="A bedroom scene", setting="bedroom",
    )
    entry = gen.generate_sentence_image(prompt, "cartoon", None)
    assert entry.status == "success"
    assert entry.file is not None


def test_provider_routing_by_model_name(tmp_path):
    from pipeline.image_generator import detect_provider

    assert detect_provider("black-forest-labs/FLUX.1-schnell") == "together"
    assert detect_provider("FLUX.2-dev") == "together"
    assert detect_provider("gemini-2.5-flash-image") == "google"
    assert detect_provider("gemini-3.1-flash-image-preview") == "google"
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_image_generator.py -v -k "google_provider or provider_routing"`
Expected: FAIL — `ImportError` or `TypeError` (constructor signature changed)

**Step 3: Implement multi-provider ImageGenerator**

Rewrite `pipeline/image_generator.py`:

```python
"""Pass 5: Generate images via Together.ai (Flux) or Google AI Studio (Gemini)."""

import base64
import json
import math
import time
from pathlib import Path

import httpx

from pipeline.config import DeckConfig
from pipeline.models import ImageManifest, ImageManifestEntry, ImagePrompt, ImagePromptResult

TOGETHER_API_URL = "https://api.together.xyz/v1/images/generations"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def detect_provider(model: str) -> str:
    """Detect image provider from model name."""
    if model.startswith("gemini-"):
        return "google"
    # Default to Together.ai for FLUX and other models
    return "together"


def _aspect_ratio(width: int, height: int) -> str:
    """Convert pixel dimensions to aspect ratio string (e.g. '3:2')."""
    g = math.gcd(width, height)
    return f"{width // g}:{height // g}"


class ImageGenerator:
    def __init__(
        self,
        config: DeckConfig,
        together_api_key: str | None = None,
        gemini_api_key: str | None = None,
        output_base: Path | None = None,
        transport: httpx.BaseTransport | None = None,
        max_retries: int = 3,
        # Legacy parameter — maps to together_api_key
        api_key: str | None = None,
    ):
        self._config = config
        self._together_api_key = together_api_key or api_key
        self._gemini_api_key = gemini_api_key
        self._output_base = output_base or Path("output")
        self._max_retries = max_retries
        self._img_config = config.image_generation
        self._provider = detect_provider(self._img_config.model)

        client_kwargs = {"timeout": 120.0}
        if transport:
            client_kwargs["transport"] = transport
        self._client = httpx.Client(**client_kwargs)

    def _deck_dir(self) -> Path:
        return self._output_base / self._config.deck.id

    def _call_together(self, model: str, prompt: str, image_url: str | None = None) -> tuple[bytes, str]:
        """Call Together.ai API. Returns (image_bytes, extension)."""
        payload = {
            "model": model,
            "prompt": prompt,
            "width": self._img_config.width,
            "height": self._img_config.height,
            "response_format": "b64_json",
        }
        if image_url:
            payload["image_url"] = image_url

        headers = {
            "Authorization": f"Bearer {self._together_api_key}",
            "Content-Type": "application/json",
        }

        response = self._call_with_retry(TOGETHER_API_URL, payload, headers)
        data = response.json()
        b64_data = data["data"][0]["b64_json"]
        return base64.b64decode(b64_data), ".webp"

    def _call_gemini(self, model: str, prompt: str) -> tuple[bytes, str]:
        """Call Google AI Studio generateContent with image output. Returns (image_bytes, extension)."""
        url = f"{GEMINI_BASE_URL}/{model}:generateContent"
        ratio = _aspect_ratio(self._img_config.width, self._img_config.height)

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {
                    "aspectRatio": ratio,
                },
            },
        }

        headers = {
            "x-goog-api-key": self._gemini_api_key,
            "Content-Type": "application/json",
        }

        response = self._call_with_retry(url, payload, headers)
        data = response.json()
        part = data["candidates"][0]["content"]["parts"][0]
        inline = part["inline_data"]
        image_bytes = base64.b64decode(inline["data"])

        # Determine extension from mime type
        mime = inline.get("mime_type", "image/png")
        ext = ".png" if "png" in mime else ".webp" if "webp" in mime else ".jpg"
        return image_bytes, ext

    def _call_with_retry(self, url: str, payload: dict, headers: dict) -> httpx.Response:
        """HTTP POST with retry on 5xx and 422."""
        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                return response
            if response.status_code >= 500 or response.status_code == 422:
                last_error = response
                if attempt < self._max_retries - 1:
                    delay = 2 * (attempt + 1)
                    print(f"\n      Retry {attempt + 1}/{self._max_retries} after {response.status_code} (waiting {delay}s)...", end="", flush=True)
                    time.sleep(delay)
                continue
            body = response.text[:500]
            raise httpx.HTTPStatusError(
                f"{response.status_code} for {response.url}: {body}",
                request=response.request,
                response=response,
            )
        if last_error:
            body = last_error.text[:500]
            raise httpx.HTTPStatusError(
                f"{last_error.status_code} for {last_error.url} after {self._max_retries} retries: {body}",
                request=last_error.request,
                response=last_error,
            )

    def _generate_image(self, prompt: str) -> tuple[bytes, str]:
        """Generate an image using the configured provider. Returns (bytes, extension)."""
        model = self._img_config.model
        if self._provider == "google":
            return self._call_gemini(model, prompt)
        return self._call_together(model, prompt)

    def _sentence_key(self, prompt: ImagePrompt) -> str:
        ch = str(prompt.chapter).zfill(2)
        si = str(prompt.sentence_index).zfill(2)
        return f"ch{ch}_s{si}"

    def generate_sentence_image(
        self,
        prompt: ImagePrompt,
        style: str,
        reference_path: Path | None,
    ) -> ImageManifestEntry:
        """Generate a single sentence image. Returns manifest entry."""
        key = self._sentence_key(prompt)

        try:
            image_bytes, ext = self._generate_image(prompt.prompt)
            rel_path = f"images/{key}{ext}"
            abs_path = self._deck_dir() / rel_path

            abs_path.parent.mkdir(parents=True, exist_ok=True)
            abs_path.write_bytes(image_bytes)

            return ImageManifestEntry(file=rel_path, status="success")
        except Exception as e:
            return ImageManifestEntry(file=None, status="failed", error=str(e))

    def generate_all(self, prompts: ImagePromptResult) -> ImageManifest:
        """Generate all images. Resumes from existing manifest if present."""
        manifest_path = self._deck_dir() / "image_manifest.json"

        # Load existing manifest for resumability
        existing_images: dict[str, ImageManifestEntry] = {}
        if manifest_path.exists():
            data = json.loads(manifest_path.read_text())
            for key, entry_data in data.get("images", {}).items():
                entry = ImageManifestEntry(**entry_data)
                if entry.status == "success" and entry.file:
                    abs_path = self._deck_dir() / entry.file
                    if abs_path.exists():
                        existing_images[key] = entry

        # Generate sentence images (dedup identical prompts)
        all_images = dict(existing_images)
        prompt_to_entry: dict[str, ImageManifestEntry] = {}
        for prompt in prompts.sentences:
            key = self._sentence_key(prompt)
            if key in existing_images:
                continue

            # Reuse image if an identical prompt was already generated
            if prompt.prompt in prompt_to_entry:
                prev = prompt_to_entry[prompt.prompt]
                all_images[key] = ImageManifestEntry(file=prev.file, status=prev.status)
                print(f"    Reusing for {key} (same scene)")
                continue

            print(f"    Generating {key} ({prompt.image_type})...", end=" ", flush=True)
            entry = self.generate_sentence_image(prompt, prompts.style, None)
            all_images[key] = entry
            if entry.status == "success":
                prompt_to_entry[prompt.prompt] = entry
            print(entry.status)

        # Write manifest
        manifest = ImageManifest(
            reference="",
            model_character=self._img_config.model,
            model_scene=self._img_config.model,
            images=all_images,
        )
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2)
        )

        return manifest
```

**Step 4: Update existing tests for new constructor signature**

Update all existing tests in `test_image_generator.py` that use `api_key=` to continue working via the legacy parameter. The existing `ImageGenerator(config, api_key="test-key", ...)` calls will still work because `api_key` is mapped to `together_api_key` in the constructor.

Verify by running:

Run: `cd spanish-content-pipeline && python -m pytest tests/test_image_generator.py -v`
Expected: All tests PASS (both old and new)

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/image_generator.py spanish-content-pipeline/tests/test_image_generator.py
git commit -m "feat(pipeline): add Google AI Studio image provider alongside Together.ai"
```

---

### Task 5: Wire run_all.py to New Pipeline

**Files:**
- Modify: `spanish-content-pipeline/scripts/run_all.py`

**Step 1: Update imports**

Replace:
```python
from pipeline.image_prompter import ImagePrompter
from pipeline.story_generator import StoryGenerator
```
with:
```python
from pipeline.scene_story_generator import SceneStoryGenerator, extract_flat_text, extract_image_prompts
from pipeline.models import ImagePromptResult
```

**Step 2: Rewrite Pass 1 to use SceneStoryGenerator**

Replace the Pass 1 section:
```python
    # Pass 1: Story Generation
    print("=== Pass 1: Story Generation ===")
    story_gen = StoryGenerator(config, llm, output_base=output_base)
    stories = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        stories[i] = story_gen.generate_chapter(i)
        print("done")
```

with:
```python
    # Pass 1: Scene-First Story Generation (stories + image prompts)
    print("=== Pass 1: Scene-First Story Generation ===")
    scene_gen = SceneStoryGenerator(config, llm, output_base=output_base)
    chapter_scenes = {}
    stories = {}  # Flat text for downstream passes
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        chapter_scenes[i] = scene_gen.generate_chapter(i)
        stories[i] = extract_flat_text(chapter_scenes[i])
        scenes_count = len(chapter_scenes[i].scenes)
        shots_count = sum(len(s.shots) for s in chapter_scenes[i].scenes)
        print(f"done ({scenes_count} scenes, {shots_count} shots)")
```

**Step 3: Replace Pass 4 + Pass 5 with simplified image generation**

Replace the entire Pass 4 + Pass 5 block:
```python
    # Pass 4: Image Prompt Generation
    if config.image_generation and config.image_generation.enabled:
        ...
```

with:
```python
    # Image Generation (prompts already embedded in scene data from Pass 1)
    if config.image_generation and config.image_generation.enabled:
        print("\n=== Image Generation ===")

        # Extract image prompts from scene data
        all_image_prompts = []
        for i in chapter_range:
            all_image_prompts.extend(extract_image_prompts(chapter_scenes[i]))

        style = config.image_generation.style
        image_prompt_result = ImagePromptResult(
            style=style,
            sentences=all_image_prompts,
        )
        print(f"  {len(all_image_prompts)} image prompts from scene data")

        # Also write image_prompts.json for compatibility/inspection
        prompts_path = output_base / config.deck.id / "image_prompts.json"
        prompts_path.parent.mkdir(parents=True, exist_ok=True)
        prompts_data = {
            "protagonist_prompt": "",
            "style": style,
            "sentences": [p.model_dump() for p in all_image_prompts],
        }
        prompts_path.write_text(json.dumps(prompts_data, ensure_ascii=False, indent=2))

        # Determine API keys for image generation
        together_key = os.environ.get("TOGETHER_API_KEY")
        gemini_key = os.environ.get("GEMINI_API_KEY") or api_key  # Reuse LLM key

        generator = ImageGenerator(
            config,
            together_api_key=together_key,
            gemini_api_key=gemini_key,
            output_base=output_base,
        )
        manifest = generator.generate_all(image_prompt_result)
        success = sum(1 for e in manifest.images.values() if e.status == "success")
        failed = sum(1 for e in manifest.images.values() if e.status == "failed")
        print(f"  {success} images generated, {failed} failed")
```

**Step 4: Run the CLI test**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_cli.py -v`
Expected: PASS (or adjust if test_cli.py tests the CLI args directly)

**Step 5: Run all tests**

Run: `cd spanish-content-pipeline && python -m pytest -v`
Expected: Most pass. Tests in `test_story_generator.py` and `test_image_prompter.py` still pass since we haven't deleted the old files yet.

**Step 6: Commit**

```bash
git add spanish-content-pipeline/scripts/run_all.py
git commit -m "feat(pipeline): wire run_all.py to scene-first generator, remove Pass 4"
```

---

### Task 6: Delete Old Files and Clean Up Tests

**Files:**
- Delete: `spanish-content-pipeline/pipeline/story_generator.py`
- Delete: `spanish-content-pipeline/pipeline/image_prompter.py`
- Delete: `spanish-content-pipeline/tests/test_story_generator.py`
- Delete: `spanish-content-pipeline/tests/test_image_prompter.py`

**Step 1: Delete the old pipeline files**

```bash
rm spanish-content-pipeline/pipeline/story_generator.py
rm spanish-content-pipeline/pipeline/image_prompter.py
rm spanish-content-pipeline/tests/test_story_generator.py
rm spanish-content-pipeline/tests/test_image_prompter.py
```

**Step 2: Run all tests to verify nothing references deleted files**

Run: `cd spanish-content-pipeline && python -m pytest -v`
Expected: All PASS. If any test imports from deleted modules, fix the import.

**Step 3: Verify no stale imports remain**

Search the codebase for any remaining references to the deleted modules:
- `from pipeline.story_generator` — should only be in deleted files
- `from pipeline.image_prompter` — should only be in deleted files

If any are found in non-deleted files, update them.

**Step 4: Commit**

```bash
git add -A spanish-content-pipeline/pipeline/story_generator.py spanish-content-pipeline/pipeline/image_prompter.py spanish-content-pipeline/tests/test_story_generator.py spanish-content-pipeline/tests/test_image_prompter.py
git commit -m "chore(pipeline): delete old story_generator.py and image_prompter.py"
```

---

### Task 7: Update Config and E2E Verification

**Files:**
- Modify: `spanish-content-pipeline/configs/spanish_buenos_aires.yaml`

**Step 1: Update config to reflect new pipeline**

In `configs/spanish_buenos_aires.yaml`, update the `image_generation` section. Keep Together.ai for now (user can switch to Gemini later):

```yaml
image_generation:
  enabled: true
  model: "black-forest-labs/FLUX.1-schnell"
  cheap_model: "black-forest-labs/FLUX.1-schnell"
  style: "modern cartoon illustration, crisp outlines, vibrant flat colors, cel-shaded, warm palette"
  width: 768
  height: 512
```

(Note: `provider` field removed — provider is now auto-detected from model name. `cheap_model` kept for backward compatibility but unused.)

**Step 2: Run full test suite**

Run: `cd spanish-content-pipeline && python -m pytest -v`
Expected: All PASS

**Step 3: Commit**

```bash
git add spanish-content-pipeline/configs/spanish_buenos_aires.yaml
git commit -m "chore(config): simplify image_generation config for scene-first pipeline"
```

---

### Task 8: Fix build-content.ts Image Extension Handling

**Files:**
- Modify: `scripts/build-content.ts`

**Context:** The Google AI Studio provider returns PNG images (not WebP). The current `build-content.ts` hardcodes `.webp` extension when copying images. This works for Together.ai but would fail for Google-generated PNG images.

**Step 1: Update image copy logic to use actual file extension from manifest**

In `scripts/build-content.ts`, replace the image copy block (around lines 195-204):

```typescript
for (const [key, entry] of Object.entries(imageManifest!.images)) {
    if (entry.status === 'success' && entry.file) {
      const src = path.join(PIPELINE_DIR, entry.file);
      const dest = path.join(IMAGES_DEST_DIR, `${key}.webp`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        imageKeys.add(key);
      }
    }
  }
```

with:

```typescript
for (const [key, entry] of Object.entries(imageManifest!.images)) {
    if (entry.status === 'success' && entry.file) {
      const src = path.join(PIPELINE_DIR, entry.file);
      const ext = path.extname(entry.file) || '.webp';
      const dest = path.join(IMAGES_DEST_DIR, `${key}${ext}`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        imageKeys.set(key, ext);
      }
    }
  }
```

Also change `imageKeys` from `Set<string>` to `Map<string, string>` (key → extension):

```typescript
const imageKeys = new Map<string, string>();
```

And update the require() generation to use the correct extension:

```typescript
if (imageKeys.size > 0) {
  const entries = [...imageKeys.entries()].sort(([a], [b]) => a.localeCompare(b)).map(
    ([key, ext]) => `  '${key}': require('../../assets/images/cards/${key}${ext}'),`
  ).join('\n');
```

And update the image key lookup:

```typescript
const image = imageKeys.has(imgKey) ? imgKey : undefined;
```

This line stays the same since `Map.has()` works the same as `Set.has()`.

**Step 2: Run build-content to verify**

Run: `npx tsx scripts/build-content.ts`
Expected: Builds successfully, images copied with correct extensions

**Step 3: Commit**

```bash
git add scripts/build-content.ts
git commit -m "fix(build): use actual image extension from manifest instead of hardcoding .webp"
```

---

### Important: Image-to-Sentence Mapping Fix

The old pipeline had a bug where chapter title sentences (e.g., "Capítulo 1: Preparación") were assigned `sentence_index: 0` by the translator but filtered out by `image_prompter.py`. This caused an off-by-one shift in image-to-sentence mapping.

The new scene-first pipeline fixes this in two ways:

1. **No chapter titles in sentence list** — `SceneStoryGenerator` only produces dialogue/narration sentences, never chapter titles. `sentence_index` starts at 0 for the first real sentence.

2. **One image prompt per sentence** — `extract_image_prompts()` creates an entry for every sentence, not just one per shot. Sentences sharing a shot get identical `image_prompt` text, and the image generator's dedup (`prompt_to_entry`) generates the image file once and reuses it. This guarantees every `sentence_index` has a corresponding image in the manifest, so `build-content.ts` can always find an image for every card.

---

## Summary of Changes

| File | Action |
|------|--------|
| `pipeline/models.py` | Add ShotSentence, Shot, Scene, ChapterScene, ImagePromptResult |
| `pipeline/scene_story_generator.py` | **NEW** — scene-first story + image prompt generator |
| `pipeline/image_generator.py` | Rewrite — multi-provider (Together + Google), no reference images |
| `scripts/run_all.py` | Update — use SceneStoryGenerator, remove Pass 4 |
| `pipeline/story_generator.py` | **DELETE** |
| `pipeline/image_prompter.py` | **DELETE** |
| `tests/test_scene_story_generator.py` | **NEW** — tests for scene generator + helpers |
| `tests/test_image_generator.py` | Update — add Google provider tests, update imports |
| `tests/test_models.py` | Update — add scene model tests |
| `tests/test_story_generator.py` | **DELETE** |
| `tests/test_image_prompter.py` | **DELETE** |
| `configs/spanish_buenos_aires.yaml` | Simplify image_generation section |
| `scripts/build-content.ts` | Fix hardcoded .webp extension, support .png from Google provider |
