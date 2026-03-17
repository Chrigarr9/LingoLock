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
    "models": {
        "story_generation": {"provider": "openrouter", "model": "deepseek/deepseek-v3.2", "temperature": 0.8},
        "cefr_simplification": {"provider": "openrouter", "model": "qwen/qwen3-30b-a3b", "temperature": 0.3},
        "grammar": {"provider": "openrouter", "model": "qwen/qwen3-30b-a3b", "temperature": 0.3},
        "gap_filling": {"provider": "openrouter", "model": "deepseek/deepseek-v3.2", "temperature": 0.7},
        "chapter_audit": {"provider": "openrouter", "model": "qwen/qwen3-235b-a22b-thinking-2507", "temperature": 0.3},
        "story_review": {"provider": "openrouter", "model": "anthropic/claude-sonnet-4-6", "temperature": 0.3},
        "story_fix": {"provider": "openrouter", "model": "google/gemini-3.1-flash-lite-preview", "temperature": 0.3},
        "image_review": {"provider": "openrouter", "model": "anthropic/claude-sonnet-4-6", "temperature": 0.3},
        "image_fix": {"provider": "openrouter", "model": "google/gemini-3.1-flash-lite-preview", "temperature": 0.3},
        "translation": {"provider": "openrouter", "model": "qwen/qwen3-30b-a3b", "temperature": 0.3},
        "word_extraction": {"provider": "openrouter", "model": "qwen/qwen3-30b-a3b", "temperature": 0.3},
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
    assert config.models.story_generation.model == "deepseek/deepseek-v3.2"


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
    from pipeline.config import StoryConfig

    m = StoryConfig(
        cefr_level="A1",
        sentences_per_chapter=[25, 35],
        chapters=[],
    )
    assert m.audit_max_iterations == 1
