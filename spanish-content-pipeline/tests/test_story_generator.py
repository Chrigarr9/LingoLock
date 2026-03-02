# tests/test_story_generator.py
import json
from pathlib import Path
from unittest.mock import MagicMock

from pipeline.config import DeckConfig, load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.story_generator import StoryGenerator


def make_mock_config(tmp_path: Path) -> DeckConfig:
    """Create a minimal config for testing."""
    import yaml

    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
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
            "landmarks": ["Plaza de Mayo"],
        },
        "story": {
            "cefr_level": "A1-A2",
            "sentences_per_chapter": [8, 12],
            "chapters": [
                {
                    "title": "Preparation",
                    "context": "Packing bags",
                    "vocab_focus": ["clothing"],
                },
                {
                    "title": "To the Airport",
                    "context": "Taking a taxi",
                    "vocab_focus": ["traffic"],
                },
            ],
        },
        "llm": {
            "provider": "openrouter",
            "model": "test/model",
            "fallback_model": "test/fallback",
            "temperature": 0.7,
            "max_retries": 3,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def test_generate_chapter_calls_llm(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete.return_value = LLMResponse(
        content="Charlotte está en su habitación. Ella tiene una maleta grande.",
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    story_text = gen.generate_chapter(0)

    assert "Charlotte" in story_text
    mock_llm.complete.assert_called_once()


def test_generate_chapter_saves_to_file(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete.return_value = LLMResponse(
        content="Charlotte está nerviosa.",
        usage=Usage(prompt_tokens=100, completion_tokens=20, total_tokens=120),
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    story_file = tmp_path / "test-deck" / "stories" / "chapter_01.txt"
    assert story_file.exists()
    assert "nerviosa" in story_file.read_text()


def test_generate_chapter_skips_if_already_exists(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-create the output file
    story_dir = tmp_path / "test-deck" / "stories"
    story_dir.mkdir(parents=True)
    (story_dir / "chapter_01.txt").write_text("Already generated.")

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    story_text = gen.generate_chapter(0)

    assert story_text == "Already generated."
    mock_llm.complete.assert_not_called()


def test_prompt_includes_config_details(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete.return_value = LLMResponse(
        content="Story text",
        usage=Usage(prompt_tokens=100, completion_tokens=20, total_tokens=120),
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    call_args = mock_llm.complete.call_args
    prompt = call_args.kwargs.get("prompt", call_args.args[0] if call_args.args else "")
    assert "Charlotte" in prompt
    assert "Buenos Aires" in prompt
    assert "A1-A2" in prompt
