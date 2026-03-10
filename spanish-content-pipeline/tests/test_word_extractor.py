# tests/test_word_extractor.py
import json
from pathlib import Path
from unittest.mock import MagicMock

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import SentencePair, ChapterWords
from pipeline.word_extractor import WordExtractor


def make_mock_config(tmp_path: Path):
    import yaml
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "neutral",
        },
        "protagonist": {"name": "Charlotte", "gender": "female", "origin_country": "Germany"},
        "destination": {"country": "Argentina", "city": "Buenos Aires"},
        "story": {
            "cefr_level": "A1-A2", "sentences_per_chapter": [8, 12],
            "chapters": [{"title": "Test", "context": "Test context", "vocab_focus": ["test"]}],
        },
        "models": {
            "story_generation": {"provider": "openrouter", "model": "test/model", "temperature": 0.7},
            "cefr_simplification": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "grammar": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "gap_filling": {"provider": "openrouter", "model": "test/model", "temperature": 0.7},
            "chapter_audit": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "story_audit": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "translation": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "word_extraction": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def test_extract_uses_spacy_for_tokenization(tmp_path):
    """spaCy identifies all tokens — LLM only provides translations."""
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    # LLM returns translations for spaCy-identified words
    llm_output = {
        "words": [
            {"source": "está", "target": "ist", "context_note": "3rd person singular",
             "similar_words": ["ser", "parecer"]},
            {"source": "nerviosa", "target": "nervös", "context_note": "feminine singular",
             "similar_words": ["tranquilo", "feliz"]},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=200, completion_tokens=100, total_tokens=300),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source="Charlotte está nerviosa.", target="Charlotte ist nervös.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result, _ = extractor.extract_chapter(0, pairs)

    assert isinstance(result, ChapterWords)
    # spaCy should identify tokens; LLM should be called for annotations
    assert mock_llm.complete_json.called
    assert len(result.words) >= 2


def test_extract_preserves_spacy_lemma_and_pos(tmp_path):
    """Lemma and POS come from spaCy, not from LLM."""
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "words": [
            {"source": "camina", "target": "geht", "context_note": "3rd person",
             "similar_words": ["correr"]},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source="Maria camina.", target="Maria geht.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result, _ = extractor.extract_chapter(0, pairs)

    camina = next((w for w in result.words if w.source == "camina"), None)
    assert camina is not None
    assert camina.lemma == "caminar"  # From spaCy
    assert camina.pos == "VERB"       # From spaCy


def test_extract_skips_if_exists(tmp_path):
    """Cached files are loaded without calling LLM."""
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    words_dir = tmp_path / "test-deck" / "words"
    words_dir.mkdir(parents=True)
    existing = {
        "chapter": 1,
        "sentences": [{"chapter": 1, "sentence_index": 0, "source": "Hola.", "target": "Hallo."}],
        "words": [{"source": "Hola", "target": "Hallo", "lemma": "hola",
                    "pos": "INTJ", "context_note": "greeting"}],
    }
    (words_dir / "chapter_01.json").write_text(json.dumps(existing))

    pairs = [SentencePair(chapter=1, sentence_index=0, source="Hola.", target="Hallo.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result, _ = extractor.extract_chapter(0, pairs)

    assert len(result.words) == 1
    mock_llm.complete_json.assert_not_called()


def test_extract_includes_similar_words(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "words": [
            {"source": "perro", "target": "Hund", "context_note": "masculine singular",
             "similar_words": ["gato", "vaca", "pollo", "caballo", "pájaro", "pez"]},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=200, completion_tokens=100, total_tokens=300),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source="Ella tiene un perro.", target="Sie hat einen Hund.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result, _ = extractor.extract_chapter(0, pairs)

    perro = next((w for w in result.words if w.source == "perro"), None)
    assert perro is not None
    assert len(perro.similar_words) >= 6
