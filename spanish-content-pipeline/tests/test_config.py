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
        "origin_city": "Berlin",
    },
    "destination": {
        "country": "Argentina",
        "city": "Buenos Aires",
        "landmarks": ["Plaza de Mayo", "La Boca"],
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
    assert len(config.destination.landmarks) == 2
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
