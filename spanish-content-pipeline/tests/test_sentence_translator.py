# tests/test_sentence_translator.py
import json
from pathlib import Path
from unittest.mock import MagicMock

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import SentencePair
from pipeline.sentence_translator import SentenceTranslator


def make_mock_config(tmp_path: Path):
    """Reuse the same helper pattern from test_story_generator."""
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
                {"title": "Test", "context": "Test context", "vocab_focus": ["test"]},
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


def test_translate_chapter_returns_sentence_pairs(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "sentences": [
            {"source": "Charlotte está nerviosa.", "target": "Charlotte ist nervös."},
            {"source": "Ella tiene una maleta.", "target": "Sie hat einen Koffer."},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
        parsed=llm_output,
    )

    translator = SentenceTranslator(config, mock_llm, output_base=tmp_path)
    story_text = "Charlotte está nerviosa. Ella tiene una maleta."
    pairs = translator.translate_chapter(0, story_text)

    assert len(pairs) == 2
    assert isinstance(pairs[0], SentencePair)
    assert pairs[0].source == "Charlotte está nerviosa."
    assert pairs[0].target == "Charlotte ist nervös."
    assert pairs[0].chapter == 1  # 1-indexed in the model


def test_translate_chapter_saves_json(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "sentences": [
            {"source": "Hola.", "target": "Hallo."},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=50, completion_tokens=20, total_tokens=70),
        parsed=llm_output,
    )

    translator = SentenceTranslator(config, mock_llm, output_base=tmp_path)
    translator.translate_chapter(0, "Hola.")

    json_path = tmp_path / "test-deck" / "translations" / "chapter_01.json"
    assert json_path.exists()
    saved = json.loads(json_path.read_text())
    assert len(saved) == 1


def test_translate_chapter_skips_if_exists(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-create the output file
    trans_dir = tmp_path / "test-deck" / "translations"
    trans_dir.mkdir(parents=True)
    existing = [{"chapter": 1, "sentence_index": 0, "source": "Hola.", "target": "Hallo."}]
    (trans_dir / "chapter_01.json").write_text(json.dumps(existing))

    translator = SentenceTranslator(config, mock_llm, output_base=tmp_path)
    pairs = translator.translate_chapter(0, "Hola.")

    assert len(pairs) == 1
    mock_llm.complete_json.assert_not_called()
