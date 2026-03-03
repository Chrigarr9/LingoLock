# Image Generation Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add image prompt generation (Pass 4) and image generation (Pass 5) to the content pipeline, with build-time bundling into the app.

**Architecture:** Pass 4 sends the entire story to Gemini Flash to produce per-sentence image prompts. Pass 5 calls Flux APIs (Kontext Dev for character scenes, Schnell for scene-only) via httpx. build-content.ts reads the image manifest, copies images to assets, and generates a static require() map for offline bundling.

**Tech Stack:** Python 3.12+, Pydantic, httpx, Gemini API, together.ai REST API (Flux), TypeScript (build script), React Native (app)

---

### Task 1: Extend Config with Protagonist Description + Image Generation Settings

**Files:**
- Modify: `spanish-content-pipeline/pipeline/config.py`
- Modify: `spanish-content-pipeline/configs/spanish_buenos_aires.yaml`
- Modify: `spanish-content-pipeline/tests/test_config.py`

**Step 1: Write the failing test**

Add to `tests/test_config.py`:

```python
def test_config_protagonist_description():
    """protagonist.description is optional, defaults to empty string."""
    config_data = {**SAMPLE_CONFIG}
    config_data["protagonist"] = {
        **SAMPLE_CONFIG["protagonist"],
        "description": "mid-20s, light brown hair, warm brown eyes",
    }
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(config_data, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.protagonist.description == "mid-20s, light brown hair, warm brown eyes"


def test_config_protagonist_description_defaults_empty():
    """Existing configs without description still load fine."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(SAMPLE_CONFIG, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.protagonist.description == ""


def test_config_image_generation():
    config_data = {**SAMPLE_CONFIG}
    config_data["image_generation"] = {
        "enabled": True,
        "provider": "together",
        "model": "black-forest-labs/FLUX.1-kontext-dev",
        "cheap_model": "black-forest-labs/FLUX.1-schnell",
        "style": "warm storybook illustration",
        "width": 768,
        "height": 512,
    }
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(config_data, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.image_generation is not None
    assert config.image_generation.provider == "together"
    assert config.image_generation.width == 768


def test_config_image_generation_defaults_none():
    """Existing configs without image_generation still load."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(SAMPLE_CONFIG, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.image_generation is None
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_config.py -v`
Expected: FAIL — `Protagonist` has no `description` field, `DeckConfig` has no `image_generation` field.

**Step 3: Implement config changes**

In `pipeline/config.py`, add `description` to `Protagonist` (optional, defaults to ""), add `ImageGenerationConfig` model, add it as optional to `DeckConfig`:

```python
class Protagonist(BaseModel):
    name: str
    gender: str
    origin_country: str
    origin_city: str
    description: str = ""


class ImageGenerationConfig(BaseModel):
    enabled: bool = True
    provider: str = "together"
    model: str = "black-forest-labs/FLUX.1-kontext-dev"
    cheap_model: str = "black-forest-labs/FLUX.1-schnell"
    style: str = "warm storybook illustration, semi-realistic modern picture book, soft lighting"
    width: int = 768
    height: int = 512


class DeckConfig(BaseModel):
    deck: DeckInfo
    languages: Languages
    protagonist: Protagonist
    destination: Destination
    story: StoryConfig
    llm: LLMConfig
    image_generation: ImageGenerationConfig | None = None
```

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_config.py -v`
Expected: All PASS.

**Step 5: Update the YAML config**

Add to `configs/spanish_buenos_aires.yaml`:

```yaml
protagonist:
  name: "Maria"
  gender: "female"
  origin_country: "Germany"
  origin_city: "Berlin"
  description: "mid-20s, light brown shoulder-length hair, warm brown eyes, slim build"

image_generation:
  enabled: true
  provider: "together"
  model: "black-forest-labs/FLUX.1-kontext-dev"
  cheap_model: "black-forest-labs/FLUX.1-schnell"
  style: "warm storybook illustration, semi-realistic modern picture book, soft lighting, rich colors"
  width: 768
  height: 512
```

**Step 6: Run full test suite to verify nothing broke**

Run: `cd spanish-content-pipeline && python -m pytest -v`
Expected: All existing tests PASS.

**Step 7: Commit**

```bash
git add spanish-content-pipeline/pipeline/config.py spanish-content-pipeline/configs/spanish_buenos_aires.yaml spanish-content-pipeline/tests/test_config.py
git commit -m "feat(pipeline): add protagonist description and image generation config"
```

---

### Task 2: Add Image Prompt and Manifest Models

**Files:**
- Modify: `spanish-content-pipeline/pipeline/models.py`
- Modify: `spanish-content-pipeline/tests/test_models.py`

**Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
from pipeline.models import ImagePrompt, ImageManifest, ImageManifestEntry


def test_image_prompt_character_scene():
    prompt = ImagePrompt(
        chapter=1,
        sentence_index=0,
        source="María está en su habitación.",
        image_type="character_scene",
        characters=["protagonist"],
        prompt="A young woman folding clothes in a cozy bedroom",
        setting="maria_bedroom_berlin",
    )
    assert prompt.image_type == "character_scene"
    assert "protagonist" in prompt.characters


def test_image_prompt_scene_only():
    prompt = ImagePrompt(
        chapter=2,
        sentence_index=3,
        source="Las calles están llenas de gente.",
        image_type="scene_only",
        characters=[],
        prompt="A busy street with colorful buildings",
        setting="buenos_aires_street",
    )
    assert prompt.characters == []


def test_image_manifest_entry():
    entry = ImageManifestEntry(file="images/ch01_s00.webp", status="success")
    assert entry.status == "success"
    assert entry.error is None


def test_image_manifest_entry_failed():
    entry = ImageManifestEntry(file=None, status="failed", error="API timeout")
    assert entry.file is None


def test_image_manifest():
    manifest = ImageManifest(
        reference="references/protagonist.webp",
        model_character="flux-kontext-dev",
        model_scene="flux-schnell",
        images={"ch01_s00": ImageManifestEntry(file="images/ch01_s00.webp", status="success")},
    )
    assert manifest.images["ch01_s00"].status == "success"
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_models.py::test_image_prompt_character_scene -v`
Expected: FAIL — `ImagePrompt` not defined.

**Step 3: Implement models**

Add to `pipeline/models.py`:

```python
class ImagePrompt(BaseModel):
    chapter: int
    sentence_index: int
    source: str  # Original sentence in target language
    image_type: str  # "character_scene" or "scene_only"
    characters: list[str] = []  # e.g. ["protagonist"]
    prompt: str  # English visual description for image generation
    setting: str = ""  # Reusable setting tag (e.g. "maria_bedroom_berlin")


class ImageManifestEntry(BaseModel):
    file: str | None  # Relative path to image, or None if failed
    status: str  # "success" or "failed"
    error: str | None = None


class ImageManifest(BaseModel):
    reference: str  # Path to protagonist reference image
    model_character: str
    model_scene: str
    images: dict[str, ImageManifestEntry]  # Key: "ch{NN}_s{NN}"
```

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_models.py -v`
Expected: All PASS.

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/models.py spanish-content-pipeline/tests/test_models.py
git commit -m "feat(pipeline): add image prompt and manifest data models"
```

---

### Task 3: Implement Image Prompter (Pass 4)

**Files:**
- Create: `spanish-content-pipeline/pipeline/image_prompter.py`
- Create: `spanish-content-pipeline/tests/test_image_prompter.py`

**Step 1: Write the failing test**

Create `tests/test_image_prompter.py`:

```python
"""Tests for Pass 4: Image Prompt Generation."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import yaml

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.image_prompter import ImagePrompter


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
            "description": "mid-20s, light brown hair, warm brown eyes",
        },
        "destination": {
            "country": "Argentina", "city": "Buenos Aires",
            "landmarks": ["Plaza de Mayo"],
        },
        "story": {
            "cefr_level": "A1-A2",
            "sentences_per_chapter": [8, 12],
            "chapters": [
                {"title": "Preparation", "context": "Packing bags", "vocab_focus": ["clothing"]},
            ],
        },
        "llm": {
            "provider": "google", "model": "gemini-2.5-flash-lite",
            "fallback_model": "gemini-2.5-flash", "temperature": 0.7, "max_retries": 3,
        },
        "image_generation": {
            "enabled": True, "provider": "together",
            "model": "flux-kontext-dev", "cheap_model": "flux-schnell",
            "style": "warm storybook illustration", "width": 768, "height": 512,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


MOCK_LLM_RESPONSE = {
    "protagonist_prompt": "Portrait of Charlotte, a young German woman, mid-20s, light brown hair",
    "sentences": [
        {
            "chapter": 1, "sentence_index": 0,
            "source": "Charlotte está en su habitación.",
            "image_type": "character_scene",
            "characters": ["protagonist"],
            "prompt": "A young woman in a cozy bedroom packing a suitcase",
            "setting": "bedroom_berlin",
        },
        {
            "chapter": 1, "sentence_index": 1,
            "source": "La maleta es muy grande.",
            "image_type": "scene_only",
            "characters": [],
            "prompt": "A large open suitcase on a bed with clothes around it",
            "setting": "bedroom_berlin",
        },
    ],
}


def test_generate_prompts_calls_llm(tmp_path):
    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_LLM_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=200, total_tokens=700),
        parsed=MOCK_LLM_RESPONSE,
    )

    stories = {0: "Charlotte está en su habitación. La maleta es muy grande."}
    translations = {0: [
        {"chapter": 1, "sentence_index": 0, "source": "Charlotte está en su habitación.", "target": "Charlotte ist in ihrem Zimmer."},
        {"chapter": 1, "sentence_index": 1, "source": "La maleta es muy grande.", "target": "Der Koffer ist sehr groß."},
    ]}

    prompter = ImagePrompter(config, mock_llm, output_base=tmp_path)
    result = prompter.generate_prompts(stories, translations)

    assert result.protagonist_prompt is not None
    assert len(result.sentences) == 2
    assert result.sentences[0].image_type == "character_scene"
    assert result.sentences[1].image_type == "scene_only"
    mock_llm.complete_json.assert_called_once()


def test_generate_prompts_saves_to_file(tmp_path):
    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_LLM_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=200, total_tokens=700),
        parsed=MOCK_LLM_RESPONSE,
    )

    stories = {0: "Charlotte está en su habitación."}
    translations = {0: [
        {"chapter": 1, "sentence_index": 0, "source": "Charlotte está en su habitación.", "target": "Charlotte ist in ihrem Zimmer."},
    ]}

    prompter = ImagePrompter(config, mock_llm, output_base=tmp_path)
    prompter.generate_prompts(stories, translations)

    output_path = tmp_path / "test-deck" / "image_prompts.json"
    assert output_path.exists()
    data = json.loads(output_path.read_text())
    assert "protagonist_prompt" in data
    assert len(data["sentences"]) == 2


def test_generate_prompts_skips_if_exists(tmp_path):
    config = make_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-create the output file
    output_dir = tmp_path / "test-deck"
    output_dir.mkdir(parents=True)
    existing = {"protagonist_prompt": "existing", "style": "test", "sentences": []}
    (output_dir / "image_prompts.json").write_text(json.dumps(existing))

    prompter = ImagePrompter(config, mock_llm, output_base=tmp_path)
    result = prompter.generate_prompts({}, {})

    assert result.protagonist_prompt == "existing"
    mock_llm.complete_json.assert_not_called()


def test_prompt_includes_protagonist_info(tmp_path):
    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_LLM_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=200, total_tokens=700),
        parsed=MOCK_LLM_RESPONSE,
    )

    stories = {0: "Charlotte está en su habitación."}
    translations = {0: []}

    prompter = ImagePrompter(config, mock_llm, output_base=tmp_path)
    prompter.generate_prompts(stories, translations)

    call_args = mock_llm.complete_json.call_args
    prompt = call_args.kwargs.get("prompt", call_args.args[0])
    assert "Charlotte" in prompt
    assert "light brown hair" in prompt
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_image_prompter.py -v`
Expected: FAIL — `image_prompter` module does not exist.

**Step 3: Implement ImagePrompter**

Create `pipeline/image_prompter.py`:

```python
"""Pass 4: Generate image prompts for each sentence using the full story context."""

import json
from dataclasses import dataclass
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.models import ImagePrompt


SYSTEM_PROMPT = """\
You are a visual scene designer for a language learning app. Given a story and its \
sentences, create a vivid image prompt for EVERY sentence that will help learners \
remember the vocabulary through visual association.

You categorize each sentence as either:
- "character_scene": The protagonist is visible in the image. Use when the protagonist \
is performing an action, speaking, or present in the scene.
- "scene_only": The protagonist is NOT in the frame. Use for establishing shots, \
object close-ups, or environmental scenes.

Write prompts in English. Be specific about visual details: actions, expressions, \
environment, lighting. Do NOT include text or words in the images."""


@dataclass
class ImagePromptResult:
    protagonist_prompt: str
    style: str
    sentences: list[ImagePrompt]


class ImagePrompter:
    def __init__(self, config: DeckConfig, llm, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _output_path(self) -> Path:
        return self._output_base / self._config.deck.id / "image_prompts.json"

    def generate_prompts(
        self,
        stories: dict[int, str],
        translations: dict[int, list[dict]],
    ) -> ImagePromptResult:
        path = self._output_path()

        # Skip if already generated
        if path.exists():
            data = json.loads(path.read_text())
            return ImagePromptResult(
                protagonist_prompt=data["protagonist_prompt"],
                style=data.get("style", ""),
                sentences=[ImagePrompt(**s) for s in data["sentences"]],
            )

        prompt = self._build_prompt(stories, translations)
        result = self._llm.complete_json(prompt, system=SYSTEM_PROMPT)
        parsed = result.parsed

        # Parse into typed models
        sentences = [ImagePrompt(**s) for s in parsed["sentences"]]
        style = self._config.image_generation.style if self._config.image_generation else ""

        output = ImagePromptResult(
            protagonist_prompt=parsed["protagonist_prompt"],
            style=style,
            sentences=sentences,
        )

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        save_data = {
            "protagonist_prompt": output.protagonist_prompt,
            "style": output.style,
            "sentences": [s.model_dump() for s in sentences],
        }
        path.write_text(json.dumps(save_data, ensure_ascii=False, indent=2))

        return output

    def _build_prompt(
        self,
        stories: dict[int, str],
        translations: dict[int, list[dict]],
    ) -> str:
        p = self._config.protagonist
        style = self._config.image_generation.style if self._config.image_generation else ""

        # Build chapter context section
        chapter_sections = []
        for i in sorted(stories.keys()):
            ch = self._config.story.chapters[i]
            story_text = stories[i]

            trans_lines = []
            for t in translations.get(i, []):
                trans_lines.append(f'  [{t["sentence_index"]}] {t["source"]} → {t["target"]}')
            trans_block = "\n".join(trans_lines) if trans_lines else "  (no translations available)"

            chapter_sections.append(
                f"### Chapter {i + 1}: {ch.title}\n"
                f"Context: {ch.context}\n\n"
                f"Story:\n{story_text}\n\n"
                f"Sentences:\n{trans_block}"
            )

        chapters_text = "\n\n".join(chapter_sections)

        return f"""Create image prompts for a language learning story.

## Protagonist
Name: {p.name}
Gender: {p.gender}
Origin: {p.origin_city}, {p.origin_country}
Visual description: {p.description}

## Art Style
{style}

## Story
{chapters_text}

## Instructions
Return a JSON object with:
- "protagonist_prompt": A portrait description of {p.name} for generating a character reference image. Include their visual description and a neutral pose.
- "sentences": An array with one entry per sentence (in order). Each entry has:
  - "chapter": chapter number (1-indexed)
  - "sentence_index": sentence index within chapter (0-indexed)
  - "source": the original sentence
  - "image_type": "character_scene" or "scene_only"
  - "characters": list of characters visible (use "protagonist" for {p.name}, or descriptive names for secondary characters)
  - "prompt": English visual description for image generation. Be specific about actions, expressions, environment. Do NOT include any text/words in the image.
  - "setting": a short snake_case tag for the location (reuse same tag for recurring locations)

IMPORTANT: Generate a prompt for EVERY sentence. No skipping."""
```

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_image_prompter.py -v`
Expected: All PASS.

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/image_prompter.py spanish-content-pipeline/tests/test_image_prompter.py
git commit -m "feat(pipeline): add image prompter (Pass 4)"
```

---

### Task 4: Implement Image Generator (Pass 5)

**Files:**
- Create: `spanish-content-pipeline/pipeline/image_generator.py`
- Create: `spanish-content-pipeline/tests/test_image_generator.py`

**Step 1: Write the failing test**

Create `tests/test_image_generator.py`:

```python
"""Tests for Pass 5: Image Generation via Flux APIs."""
import base64
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import yaml

from pipeline.config import load_config
from pipeline.image_generator import ImageGenerator
from pipeline.image_prompter import ImagePromptResult
from pipeline.models import ImagePrompt


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
            "enabled": True, "provider": "together",
            "model": "black-forest-labs/FLUX.1-kontext-dev",
            "cheap_model": "black-forest-labs/FLUX.1-schnell",
            "style": "warm storybook illustration", "width": 768, "height": 512,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def make_prompts():
    return ImagePromptResult(
        protagonist_prompt="Portrait of Charlotte, mid-20s, light brown hair",
        style="warm storybook illustration",
        sentences=[
            ImagePrompt(
                chapter=1, sentence_index=0,
                source="Charlotte está en su habitación.",
                image_type="character_scene", characters=["protagonist"],
                prompt="A young woman packing in a bedroom", setting="bedroom",
            ),
            ImagePrompt(
                chapter=1, sentence_index=1,
                source="La maleta es grande.",
                image_type="scene_only", characters=[],
                prompt="A large open suitcase on a bed", setting="bedroom",
            ),
        ],
    )


# Small 1x1 white pixel in WebP format (base64)
TINY_WEBP_B64 = "UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoBAAEAAkA4JZQCdAEO/hepgAAA/v5MOf/PSN3RNHZ1PvRZvZnQSfzddVH/6LAAAA=="


def fake_together_response(*args, **kwargs):
    """Mock httpx.Client.post for together.ai API."""
    return httpx.Response(
        200,
        json={"data": [{"b64_json": TINY_WEBP_B64}]},
        request=httpx.Request("POST", "https://api.together.xyz/v1/images/generations"),
    )


def test_generate_reference_image(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)
    ref_path = gen.generate_reference(prompts.protagonist_prompt, prompts.style)

    assert ref_path.exists()
    assert ref_path.suffix == ".webp"


def test_generate_sentence_image_character_scene(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)

    # First generate reference (needed for character scenes)
    ref_path = gen.generate_reference(prompts.protagonist_prompt, prompts.style)

    result = gen.generate_sentence_image(prompts.sentences[0], prompts.style, ref_path)
    assert result.status == "success"
    assert result.file is not None
    assert (tmp_path / config.deck.id / result.file).exists()


def test_generate_sentence_image_scene_only(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)

    result = gen.generate_sentence_image(prompts.sentences[1], prompts.style, None)
    assert result.status == "success"
    assert result.file is not None


def test_generate_all_writes_manifest(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)
    manifest = gen.generate_all(prompts)

    assert manifest.reference is not None
    assert len(manifest.images) == 2

    manifest_path = tmp_path / config.deck.id / "image_manifest.json"
    assert manifest_path.exists()


def test_generate_all_skips_existing(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    # Pre-create manifest with one image already done
    output_dir = tmp_path / config.deck.id
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True)
    (images_dir / "ch01_s00.webp").write_bytes(b"fake")

    existing_manifest = {
        "reference": "references/protagonist.webp",
        "model_character": "flux-kontext-dev",
        "model_scene": "flux-schnell",
        "images": {
            "ch01_s00": {"file": "images/ch01_s00.webp", "status": "success"},
        },
    }
    (output_dir / "image_manifest.json").write_text(json.dumps(existing_manifest))

    # Also create the reference
    refs_dir = output_dir / "references"
    refs_dir.mkdir(parents=True)
    (refs_dir / "protagonist.webp").write_bytes(b"fake-ref")

    call_count = 0
    def counting_response(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return fake_together_response(*args, **kwargs)

    transport = httpx.MockTransport(counting_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)
    manifest = gen.generate_all(prompts)

    # Should only generate ch01_s01 (ch01_s00 already exists)
    assert call_count == 1
    assert len(manifest.images) == 2
    assert manifest.images["ch01_s01"].status == "success"
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_image_generator.py -v`
Expected: FAIL — `image_generator` module does not exist.

**Step 3: Implement ImageGenerator**

Create `pipeline/image_generator.py`:

```python
"""Pass 5: Generate images via Flux APIs (together.ai)."""

import base64
import json
import time
from pathlib import Path

import httpx

from pipeline.config import DeckConfig
from pipeline.image_prompter import ImagePromptResult
from pipeline.models import ImageManifest, ImageManifestEntry, ImagePrompt

TOGETHER_API_URL = "https://api.together.xyz/v1/images/generations"


class ImageGenerator:
    def __init__(
        self,
        config: DeckConfig,
        api_key: str,
        output_base: Path | None = None,
        transport: httpx.BaseTransport | None = None,
        max_retries: int = 3,
    ):
        self._config = config
        self._api_key = api_key
        self._output_base = output_base or Path("output")
        self._max_retries = max_retries
        self._img_config = config.image_generation

        client_kwargs = {"timeout": 120.0}
        if transport:
            client_kwargs["transport"] = transport
        self._client = httpx.Client(**client_kwargs)

    def _deck_dir(self) -> Path:
        return self._output_base / self._config.deck.id

    def _call_api(self, model: str, prompt: str, image_url: str | None = None) -> bytes:
        """Call together.ai image generation API. Returns raw image bytes."""
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
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(TOGETHER_API_URL, json=payload, headers=headers)
            if response.status_code < 500:
                response.raise_for_status()
                break
            last_error = response
            if attempt < self._max_retries - 1:
                time.sleep(2 * (attempt + 1))
        else:
            if last_error:
                last_error.raise_for_status()

        data = response.json()
        b64_data = data["data"][0]["b64_json"]
        return base64.b64decode(b64_data)

    def generate_reference(self, protagonist_prompt: str, style: str) -> Path:
        """Generate the protagonist reference image. Returns path to saved image."""
        refs_dir = self._deck_dir() / "references"
        ref_path = refs_dir / "protagonist.webp"

        if ref_path.exists():
            return ref_path

        full_prompt = f"{protagonist_prompt}. Style: {style}"
        image_bytes = self._call_api(self._img_config.cheap_model, full_prompt)

        refs_dir.mkdir(parents=True, exist_ok=True)
        ref_path.write_bytes(image_bytes)
        return ref_path

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
        rel_path = f"images/{key}.webp"
        abs_path = self._deck_dir() / rel_path

        full_prompt = f"{prompt.prompt}. Style: {style}"

        try:
            image_url = None
            if prompt.image_type == "character_scene" and reference_path and reference_path.exists():
                # Encode reference as data URI for Kontext
                ref_bytes = reference_path.read_bytes()
                ref_b64 = base64.b64encode(ref_bytes).decode()
                image_url = f"data:image/webp;base64,{ref_b64}"
                model = self._img_config.model
            else:
                model = self._img_config.cheap_model

            image_bytes = self._call_api(model, full_prompt, image_url=image_url)

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
        existing_reference = None
        if manifest_path.exists():
            data = json.loads(manifest_path.read_text())
            existing_reference = data.get("reference")
            for key, entry_data in data.get("images", {}).items():
                entry = ImageManifestEntry(**entry_data)
                # Only keep successful entries
                if entry.status == "success" and entry.file:
                    abs_path = self._deck_dir() / entry.file
                    if abs_path.exists():
                        existing_images[key] = entry

        # Step A: Generate reference
        ref_path = self.generate_reference(prompts.protagonist_prompt, prompts.style)

        # Step B: Generate sentence images
        all_images = dict(existing_images)
        for prompt in prompts.sentences:
            key = self._sentence_key(prompt)
            if key in existing_images:
                continue  # Already generated

            print(f"    Generating {key} ({prompt.image_type})...", end=" ", flush=True)
            entry = self.generate_sentence_image(prompt, prompts.style, ref_path)
            all_images[key] = entry
            print(entry.status)

        # Step C: Write manifest
        manifest = ImageManifest(
            reference=str(ref_path.relative_to(self._deck_dir())),
            model_character=self._img_config.model,
            model_scene=self._img_config.cheap_model,
            images=all_images,
        )
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2)
        )

        return manifest
```

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && python -m pytest tests/test_image_generator.py -v`
Expected: All PASS.

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/image_generator.py spanish-content-pipeline/tests/test_image_generator.py
git commit -m "feat(pipeline): add image generator (Pass 5) with Flux API"
```

---

### Task 5: Pipeline Integration + Standalone Scripts

**Files:**
- Modify: `spanish-content-pipeline/scripts/run_all.py`
- Create: `spanish-content-pipeline/scripts/generate_image_prompts.py`
- Create: `spanish-content-pipeline/scripts/generate_images.py`
- Modify: `spanish-content-pipeline/tests/test_cli.py`

**Step 1: Read test_cli.py to understand existing CLI test patterns**

Run: Read `tests/test_cli.py` before writing tests.

**Step 2: Write the failing test**

Add to `tests/test_cli.py` (or create new test file if test_cli.py tests something else):

```python
def test_run_all_with_image_generation(tmp_path, monkeypatch):
    """Smoke test: run_all doesn't crash when image_generation is configured."""
    # This test validates the import and wiring — actual API calls are mocked
    from scripts.run_all import main
    # (details depend on existing test_cli.py patterns)
```

Note: The exact test depends on how test_cli.py is structured. The key tests are already covered by the unit tests in Tasks 3 and 4. This task focuses on wiring.

**Step 3: Add image passes to run_all.py**

After the REPORT section in `scripts/run_all.py`, add:

```python
# At top, add imports:
from pipeline.image_prompter import ImagePrompter
from pipeline.image_generator import ImageGenerator

# After BUILD section, before REPORT:

    # Pass 4: Image Prompt Generation
    if config.image_generation and config.image_generation.enabled:
        print("\n=== Pass 4: Image Prompt Generation ===")
        prompter = ImagePrompter(config, llm, output_base=output_base)

        # Collect all stories and translations for full-context prompting
        all_stories = {}
        all_translations = {}
        for i in chapter_range:
            all_stories[i] = stories[i]
            # Load translations from disk (they were saved by Pass 2)
            trans_path = output_base / config.deck.id / "translations" / f"chapter_{i + 1:02d}.json"
            if trans_path.exists():
                all_translations[i] = json.loads(trans_path.read_text())

        image_prompts = prompter.generate_prompts(all_stories, all_translations)
        print(f"  {len(image_prompts.sentences)} image prompts generated")

        # Pass 5: Image Generation
        print("\n=== Pass 5: Image Generation ===")
        image_api_key = os.environ.get("TOGETHER_API_KEY")
        if not image_api_key:
            print("  WARNING: TOGETHER_API_KEY not set — skipping image generation")
        else:
            generator = ImageGenerator(config, api_key=image_api_key, output_base=output_base)
            manifest = generator.generate_all(image_prompts)
            success = sum(1 for e in manifest.images.values() if e.status == "success")
            failed = sum(1 for e in manifest.images.values() if e.status == "failed")
            print(f"  {success} images generated, {failed} failed")
```

**Step 4: Create standalone scripts**

Create `scripts/generate_image_prompts.py`:

```python
"""Standalone: Run just Pass 4 (image prompt generation)."""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.image_prompter import ImagePrompter
from pipeline.llm import create_client


def main():
    parser = argparse.ArgumentParser(description="Generate image prompts for all sentences")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    args = parser.parse_args()

    load_dotenv()
    config = load_config(Path(args.config))

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set")
        sys.exit(1)

    llm = create_client(
        provider=config.llm.provider, api_key=api_key,
        model=config.llm.model, temperature=config.llm.temperature,
        max_retries=config.llm.max_retries,
    )

    output_base = Path("output")

    # Load existing stories and translations
    stories = {}
    translations = {}
    for i in range(config.chapter_count):
        story_path = output_base / config.deck.id / "stories" / f"chapter_{i + 1:02d}.txt"
        if story_path.exists():
            stories[i] = story_path.read_text()

        trans_path = output_base / config.deck.id / "translations" / f"chapter_{i + 1:02d}.json"
        if trans_path.exists():
            translations[i] = json.loads(trans_path.read_text())

    if not stories:
        print("Error: No stories found. Run passes 1-3 first.")
        sys.exit(1)

    prompter = ImagePrompter(config, llm, output_base=output_base)
    result = prompter.generate_prompts(stories, translations)
    print(f"Generated {len(result.sentences)} image prompts")


if __name__ == "__main__":
    main()
```

Create `scripts/generate_images.py`:

```python
"""Standalone: Run just Pass 5 (image generation via Flux)."""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.image_generator import ImageGenerator
from pipeline.image_prompter import ImagePromptResult
from pipeline.models import ImagePrompt


def main():
    parser = argparse.ArgumentParser(description="Generate images from prompts")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be generated")
    args = parser.parse_args()

    load_dotenv()
    config = load_config(Path(args.config))

    output_base = Path("output")
    prompts_path = output_base / config.deck.id / "image_prompts.json"

    if not prompts_path.exists():
        print("Error: image_prompts.json not found. Run Pass 4 first.")
        sys.exit(1)

    data = json.loads(prompts_path.read_text())
    prompts = ImagePromptResult(
        protagonist_prompt=data["protagonist_prompt"],
        style=data.get("style", ""),
        sentences=[ImagePrompt(**s) for s in data["sentences"]],
    )

    if args.dry_run:
        character_scenes = sum(1 for s in prompts.sentences if s.image_type == "character_scene")
        scene_only = len(prompts.sentences) - character_scenes
        cost = character_scenes * 0.025 + scene_only * 0.003 + 0.003
        print(f"Would generate {len(prompts.sentences)} images:")
        print(f"  Character scenes: {character_scenes} × $0.025 = ${character_scenes * 0.025:.2f}")
        print(f"  Scene-only: {scene_only} × $0.003 = ${scene_only * 0.003:.2f}")
        print(f"  Reference: 1 × $0.003 = $0.003")
        print(f"  Estimated total: ${cost:.2f}")
        return

    api_key = os.environ.get("TOGETHER_API_KEY")
    if not api_key:
        print("Error: TOGETHER_API_KEY not set")
        sys.exit(1)

    generator = ImageGenerator(config, api_key=api_key, output_base=output_base)
    manifest = generator.generate_all(prompts)
    success = sum(1 for e in manifest.images.values() if e.status == "success")
    failed = sum(1 for e in manifest.images.values() if e.status == "failed")
    print(f"\nDone: {success} generated, {failed} failed")


if __name__ == "__main__":
    main()
```

**Step 5: Run full test suite**

Run: `cd spanish-content-pipeline && python -m pytest -v`
Expected: All PASS.

**Step 6: Commit**

```bash
git add spanish-content-pipeline/scripts/run_all.py spanish-content-pipeline/scripts/generate_image_prompts.py spanish-content-pipeline/scripts/generate_images.py
git commit -m "feat(pipeline): integrate image passes into run_all + standalone scripts"
```

---

### Task 6: Build Integration — bundle images into app

**Files:**
- Modify: `scripts/build-content.ts`

**Step 1: Read current build-content.ts** (already read above)

**Step 2: Modify build-content.ts**

After the vocabulary loading section (~line 176), add image manifest loading:

```typescript
// Load image manifest (if available)
const IMAGE_MANIFEST_FILE = path.join(PIPELINE_DIR, 'image_manifest.json');
const IMAGES_SOURCE_DIR = path.join(PIPELINE_DIR);  // images are relative to deck dir
const IMAGES_DEST_DIR = path.join(PROJECT_ROOT, 'assets', 'images', 'cards');

interface ImageManifestEntry {
  file: string | null;
  status: string;
}

interface ImageManifest {
  reference: string;
  model_character: string;
  model_scene: string;
  images: Record<string, ImageManifestEntry>;
}

let imageManifest: ImageManifest | null = null;
if (fs.existsSync(IMAGE_MANIFEST_FILE)) {
  imageManifest = JSON.parse(fs.readFileSync(IMAGE_MANIFEST_FILE, 'utf-8'));
  const successCount = Object.values(imageManifest!.images).filter(e => e.status === 'success').length;
  console.log(`  Loaded image manifest: ${successCount} images available`);

  // Copy successful images to assets directory
  fs.mkdirSync(IMAGES_DEST_DIR, { recursive: true });
  for (const [key, entry] of Object.entries(imageManifest!.images)) {
    if (entry.status === 'success' && entry.file) {
      const src = path.join(IMAGES_SOURCE_DIR, entry.file);
      const dest = path.join(IMAGES_DEST_DIR, `${key}.webp`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }
  }
  console.log(`  Copied images to ${IMAGES_DEST_DIR}`);
}

// Build image key lookup: sentence key (ch01_s00) → available
const imageKeys = new Set<string>();
if (imageManifest) {
  for (const [key, entry] of Object.entries(imageManifest.images)) {
    if (entry.status === 'success') {
      imageKeys.add(key);
    }
  }
}
```

In the card building loop (~line 254), after setting distractors, set the image key:

```typescript
    // Look up image for this sentence
    const imgKey = `ch${String(chapterNum).padStart(2, '0')}_s${String(matchedSentence.sentence_index).padStart(2, '0')}`;
    const image = imageKeys.has(imgKey) ? imgKey : undefined;

    cards.push({
      id: cardId,
      // ... existing fields ...
      distractors,
      image,
    });
```

In the output generation section, add the image require map before the CHAPTERS export:

```typescript
// Generate cardImages map (static require() calls for Metro bundler)
let imageMapBlock = '';
if (imageManifest && imageKeys.size > 0) {
  const entries = [...imageKeys].sort().map(
    key => `  '${key}': require('../../assets/images/cards/${key}.webp'),`
  ).join('\n');
  imageMapBlock = `
/** Image assets keyed by sentence ID — use cardImages[card.image] as Image source */
export const cardImages: Record<string, number> = {
${entries}
};
`;
}
```

Include `imageMapBlock` in the final output string after the imports.

**Step 3: Run build to verify it works without images**

Run: `npx tsx scripts/build-content.ts`
Expected: Builds successfully. No images copied (manifest doesn't exist yet). Output unchanged.

**Step 4: Commit**

```bash
git add scripts/build-content.ts
git commit -m "feat(build): read image manifest and generate require map in bundle"
```

---

### Task 7: App Integration — ClozeCard uses bundled images

**Files:**
- Modify: `src/components/ClozeCard.tsx`
- Modify: `src/content/bundle.ts` (auto-generated, but document the expected shape)

**Step 1: Update ClozeCard.tsx to use cardImages map**

The current code uses `source={{ uri: card.image }}`. Change to look up from the generated map:

```typescript
// At top of file, add conditional import:
import { cardImages } from '../content/bundle';

// Replace the Image source:
// OLD: source={{ uri: card.image }}
// NEW: source={card.image && cardImages[card.image] ? cardImages[card.image] : { uri: card.image }}
```

This is backwards-compatible: if `card.image` is a key in `cardImages`, use the bundled asset. If it's a URI string (e.g., from a future Anki import), fall back to URI mode. If `cardImages` is undefined (no images generated yet), fall back to URI.

Update the `showImage` condition to handle both cases:

```typescript
const imageSource = card.image
  ? (cardImages?.[card.image] ?? (card.image.startsWith('http') ? { uri: card.image } : null))
  : null;
const showImage = !!imageSource && !imageError;
```

And in the JSX:
```typescript
{showImage && (
  <Image
    source={imageSource!}
    // ... rest unchanged
  />
)}
```

**Step 2: Handle the case where cardImages doesn't exist yet**

In `bundle.ts`, the `cardImages` export might not exist if no images have been generated. The build script adds it conditionally. To avoid import errors, add a fallback:

```typescript
// In bundle.ts (generated), when no images:
export const cardImages: Record<string, number> = {};
```

The build script should always emit this export (empty object if no images).

**Step 3: Test locally**

Run: `npx expo start` and verify cards still render without images (no crash).

**Step 4: Commit**

```bash
git add src/components/ClozeCard.tsx
git commit -m "feat(app): support bundled card images in ClozeCard"
```

---

### Task 8: Update Config YAML + Verify End-to-End

**Step 1: Verify the config is complete**

Confirm `configs/spanish_buenos_aires.yaml` has both `protagonist.description` and `image_generation` sections (done in Task 1).

**Step 2: Run the pipeline dry-run**

```bash
cd spanish-content-pipeline
python scripts/generate_images.py --config configs/spanish_buenos_aires.yaml --dry-run
```

Expected: Shows cost estimate without making API calls.

**Step 3: Run Pass 4 (image prompts) with real API**

```bash
python scripts/generate_image_prompts.py --config configs/spanish_buenos_aires.yaml
```

Expected: Creates `output/es-de-buenos-aires/image_prompts.json` with prompts for all sentences.

**Step 4: Review generated prompts**

Manually review `image_prompts.json` to verify prompt quality, correct categorization, and protagonist detection.

**Step 5: Run Pass 5 (image generation) with real API**

```bash
python scripts/generate_images.py --config configs/spanish_buenos_aires.yaml
```

Expected: Generates images in `output/es-de-buenos-aires/images/` and writes `image_manifest.json`.

**Step 6: Rebuild app content**

```bash
cd .. && npx tsx scripts/build-content.ts
```

Expected: Copies images to `assets/images/cards/`, generates `cardImages` map in `bundle.ts`.

**Step 7: Verify in app**

Run: `npx expo start` and check that cards display images.

**Step 8: Commit any final adjustments**

```bash
git add -A && git commit -m "feat: complete image generation pipeline end-to-end"
```
