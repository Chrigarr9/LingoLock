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


# --- Extraction helper tests ---

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

    # 3 shots = 3 image prompts (one per shot, keyed to first sentence)
    assert len(prompts) == 3

    assert prompts[0].chapter == 1
    assert prompts[0].sentence_index == 0  # first sentence in shot 1
    assert prompts[0].image_type == "scene_only"
    assert "suitcase" in prompts[0].prompt
    assert prompts[0].setting == "bedroom_berlin"

    assert prompts[1].sentence_index == 2  # first sentence in shot 2
    assert "travel guide" in prompts[1].prompt

    assert prompts[2].sentence_index == 3  # first sentence in shot 3 (different scene)
    assert prompts[2].setting == "kitchen_berlin"


def test_expand_manifest_for_shared_shots():
    """Sentences sharing a shot get alias entries in the manifest."""
    from pipeline.scene_story_generator import expand_manifest_for_shared_shots
    from pipeline.models import ImageManifest, ImageManifestEntry

    chapter = make_chapter_scene()
    manifest = ImageManifest(
        reference="",
        model_character="test",
        model_scene="test",
        images={
            "ch01_s00": ImageManifestEntry(file="images/ch01_s00.webp", status="success"),
            "ch01_s02": ImageManifestEntry(file="images/ch01_s02.webp", status="success"),
            "ch01_s03": ImageManifestEntry(file="images/ch01_s03.webp", status="success"),
        },
    )

    expand_manifest_for_shared_shots(manifest, {0: chapter})

    # Sentence 1 shares shot with sentence 0 → alias added
    assert "ch01_s01" in manifest.images
    assert manifest.images["ch01_s01"].file == "images/ch01_s00.webp"
    # Original entries unchanged
    assert manifest.images["ch01_s00"].file == "images/ch01_s00.webp"
    assert manifest.images["ch01_s02"].file == "images/ch01_s02.webp"
