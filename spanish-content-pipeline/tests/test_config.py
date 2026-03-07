import tempfile
from pathlib import Path

import yaml

from pipeline.config import DeckConfig, load_config


SAMPLE_CONFIG = {
    "deck": {
        "name": "Test Deck",
        "id": "test-deck",
    },
    "languages": {
        "target": "Spanish",
        "target_code": "es",
        "native": "German",
        "native_code": "de",
        "dialect": "neutral",
    },
    "protagonist": {
        "name": "Charlotte",
        "gender": "female",
        "origin_country": "Germany",
    },
    "destination": {
        "country": "Argentina",
        "city": "Buenos Aires",
    },
    "story": {
        "cefr_level": "A1-A2",
        "sentences_per_chapter": [8, 20],
        "chapters": [
            {
                "title": "Preparation",
                "context": "Packing bags",
                "vocab_focus": ["clothing"],
            },
        ],
    },
    "llm": {
        "provider": "openrouter",
        "model": "google/gemini-2.5-flash-lite",
        "fallback_model": "openai/gpt-4o-mini",
        "temperature": 0.7,
        "max_retries": 3,
    },
}


def test_load_config_from_yaml():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(SAMPLE_CONFIG, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.deck.name == "Test Deck"
    assert config.languages.target_code == "es"
    assert config.protagonist.name == "Charlotte"
    assert config.destination.city == "Buenos Aires"
    assert len(config.story.chapters) == 1
    assert config.llm.model == "google/gemini-2.5-flash-lite"


def test_config_chapter_count():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(SAMPLE_CONFIG, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.chapter_count == 1


def test_config_output_dir():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(SAMPLE_CONFIG, f)
        f.flush()
        config = load_config(Path(f.name))

    assert "test-deck" in str(config.output_dir)


def test_config_invalid_file_raises():
    import pytest
    with pytest.raises(FileNotFoundError):
        load_config(Path("/nonexistent/config.yaml"))


def test_config_protagonist_visual_tag():
    """protagonist.visual_tag is optional, defaults to empty string."""
    config_data = {**SAMPLE_CONFIG}
    config_data["protagonist"] = {
        **SAMPLE_CONFIG["protagonist"],
        "visual_tag": "a slim young woman with light-brown hair",
    }
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(config_data, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.protagonist.visual_tag == "a slim young woman with light-brown hair"


def test_config_protagonist_visual_tag_defaults_empty():
    """Existing configs without visual_tag still load fine."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(SAMPLE_CONFIG, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.protagonist.visual_tag == ""


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
