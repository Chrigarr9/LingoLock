"""Tests for unconstrained story generator (Pass 0)."""
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


def test_generate_chapter_produces_chapter_scene(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    chapter_data = gen.generate_chapter(0)

    assert isinstance(chapter_data, ChapterScene)
    assert chapter_data.chapter == 1
    assert len(chapter_data.scenes) == 1
    assert len(chapter_data.scenes[0].shots) == 2
    mock_llm.complete_json.assert_called_once()


def test_saves_to_stories_raw_directory(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    # Must be in stories_raw/, NOT stories/
    story_file = tmp_path / "test-deck" / "stories_raw" / "chapter_01.json"
    assert story_file.exists()
    data = json.loads(story_file.read_text())
    assert data["chapter"] == 1
    assert "scenes" in data

    # Verify stories/ does NOT exist
    assert not (tmp_path / "test-deck" / "stories").exists()


def test_system_prompt_has_no_cefr_constraints(tmp_path):
    from pipeline.story_generator import _build_system_prompt

    config = make_config(tmp_path)
    system = _build_system_prompt(config)

    # No CEFR level references
    assert "A1" not in system
    assert "A2" not in system
    assert "B1" not in system
    assert "B2" not in system
    # No word count limits
    assert "Max 8 words" not in system
    assert "Max 12 words" not in system
    assert "Up to 18 words" not in system
    assert "Up to 25 words" not in system
    # No CEFR grammar constraints section
    assert "CEFR grammar constraints" not in system


def test_chapter_prompt_has_no_vocab_focus(tmp_path):
    from pipeline.story_generator import _build_chapter_prompt

    config = make_config(tmp_path)
    prompt = _build_chapter_prompt(config, chapter_index=0)

    assert "Vocabulary focus" not in prompt
    assert "CEFR Level" not in prompt
    assert "A1-A2" not in prompt
    # Should still have the chapter context
    assert "Packing bags" in prompt


def test_skips_if_cached(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-create cached file
    story_dir = tmp_path / "test-deck" / "stories_raw"
    story_dir.mkdir(parents=True)
    cached = {"chapter": 1, "scenes": []}
    (story_dir / "chapter_01.json").write_text(json.dumps(cached))

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    result = gen.generate_chapter(0)

    assert result.chapter == 1
    assert result.scenes == []
    mock_llm.complete_json.assert_not_called()


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

    # Image prompt: PROTAGONIST → visual tag, TAXI DRIVER → visual tag
    assert "a slim young woman with light-brown hair" in shot.image_prompt
    assert "a stocky man with a gray flat cap" in shot.image_prompt
    assert "PROTAGONIST" not in shot.image_prompt
    assert "TAXI DRIVER" not in shot.image_prompt

    # Sentence source: PROTAGONIST → name, TAXI DRIVER → name
    assert shot.sentences[0].source == "Charlotte camina por la calle."
    assert "Taxi Driver" in shot.sentences[1].source
    assert "TAXI DRIVER" not in shot.sentences[1].source
    assert "PROTAGONIST" not in shot.sentences[1].source


def test_generate_all_passes_summaries(tmp_path):
    """Chapter 2's prompt includes 'Story so far' with chapter 1 summary."""
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()

    chapter_response = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )
    mock_llm.complete_json.return_value = chapter_response

    summary_response = LLMResponse(
        content="Charlotte packs her bags in Berlin, feeling excited about her trip.",
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
    )
    mock_llm.complete.return_value = summary_response

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_all(chapter_range=range(2))

    # 2 chapter generation calls + 2 summary calls
    assert mock_llm.complete_json.call_count == 2
    assert mock_llm.complete.call_count == 2
    # The ch2 generation call should include "Story so far"
    ch2_gen_call = mock_llm.complete_json.call_args_list[1]
    prompt = ch2_gen_call.kwargs.get("prompt") or ch2_gen_call.args[0]
    assert "Story so far" in prompt


# --- Extraction helper tests ---

from pipeline.models import Scene, Shot, ShotSentence, ImagePrompt


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
        ],
    )


def test_extract_flat_text():
    from pipeline.story_generator import extract_flat_text

    chapter = make_chapter_scene()
    text = extract_flat_text(chapter)
    lines = text.strip().split("\n")
    assert len(lines) == 3
    assert lines[0] == "Charlotte está en su habitación."
    assert lines[2] == "Hay una guía de viaje."


def test_extract_image_prompts():
    from pipeline.story_generator import extract_image_prompts

    chapter = make_chapter_scene()
    prompts = extract_image_prompts(chapter)

    assert len(prompts) == 2
    assert prompts[0].sentence_index == 0
    assert prompts[0].image_type == "scene_only"
    assert "suitcase" in prompts[0].prompt
    assert prompts[1].sentence_index == 2


def test_expand_manifest_for_shared_shots():
    from pipeline.story_generator import expand_manifest_for_shared_shots
    from pipeline.models import ImageManifest, ImageManifestEntry

    chapter = make_chapter_scene()
    manifest = ImageManifest(
        reference="",
        model_character="test",
        model_scene="test",
        images={
            "ch01_s00": ImageManifestEntry(file="images/ch01_s00.webp", status="success"),
            "ch01_s02": ImageManifestEntry(file="images/ch01_s02.webp", status="success"),
        },
    )

    expand_manifest_for_shared_shots(manifest, {0: chapter})

    assert "ch01_s01" in manifest.images
    assert manifest.images["ch01_s01"].file == "images/ch01_s00.webp"


def test_summary_saved_to_stories_raw(tmp_path):
    """Summary files go into stories_raw/, not stories/."""
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()

    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )
    mock_llm.complete.return_value = LLMResponse(
        content="Charlotte packs her bags in Berlin.",
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_all(chapter_range=range(1))

    summary_file = tmp_path / "test-deck" / "stories_raw" / "summary_01.txt"
    assert summary_file.exists()
    assert len(summary_file.read_text()) > 0
