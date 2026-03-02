# tests/test_word_extractor.py
import json
from pathlib import Path
from unittest.mock import MagicMock

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import SentencePair, WordAnnotation, ChapterWords
from pipeline.word_extractor import WordExtractor


def make_mock_config(tmp_path: Path):
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


def test_extract_words_returns_chapter_words(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "words": [
            {
                "source": "está",
                "target": "ist",
                "lemma": "estar",
                "pos": "verb",
                "context_note": "3rd person singular present",
            },
            {
                "source": "nerviosa",
                "target": "nervös",
                "lemma": "nervioso",
                "pos": "adjective",
                "context_note": "feminine singular",
            },
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=200, completion_tokens=100, total_tokens=300),
        parsed=llm_output,
    )

    pairs = [
        SentencePair(chapter=1, sentence_index=0, source="Charlotte está nerviosa.", target="Charlotte ist nervös."),
    ]

    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    chapter_words = extractor.extract_chapter(0, pairs)

    assert isinstance(chapter_words, ChapterWords)
    assert len(chapter_words.words) == 2
    assert chapter_words.words[0].lemma == "estar"
    assert chapter_words.sentences == pairs


def test_extract_words_saves_json(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "words": [
            {
                "source": "Hola",
                "target": "Hallo",
                "lemma": "hola",
                "pos": "interjection",
                "context_note": "greeting",
            },
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=50, completion_tokens=30, total_tokens=80),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0, source="Hola.", target="Hallo.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    extractor.extract_chapter(0, pairs)

    json_path = tmp_path / "test-deck" / "words" / "chapter_01.json"
    assert json_path.exists()


def test_extract_words_skips_if_exists(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    words_dir = tmp_path / "test-deck" / "words"
    words_dir.mkdir(parents=True)
    existing = {
        "chapter": 1,
        "sentences": [{"chapter": 1, "sentence_index": 0, "source": "Hola.", "target": "Hallo."}],
        "words": [{"source": "Hola", "target": "Hallo", "lemma": "hola", "pos": "interjection", "context_note": "greeting"}],
    }
    (words_dir / "chapter_01.json").write_text(json.dumps(existing))

    pairs = [SentencePair(chapter=1, sentence_index=0, source="Hola.", target="Hallo.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result = extractor.extract_chapter(0, pairs)

    assert len(result.words) == 1
    mock_llm.complete_json.assert_not_called()
