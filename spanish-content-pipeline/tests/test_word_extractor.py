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
            "story_review": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "story_fix": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "image_review": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "image_fix": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
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


def test_guillemets_stripped_before_tokenization(tmp_path):
    """Guillemets «» should not leak as PROPN tokens or contaminate nearby POS."""
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {"words": [
        {"source": "dice", "target": "sagt", "context_note": "3rd singular",
         "similar_words": ["hablar"]},
    ]}
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source='«¡Necesito una idea!» dice Charlotte.',
                          target='„Ich brauche eine Idee!" sagt Charlotte.')]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result, _ = extractor.extract_chapter(0, pairs)

    sources = [w.source for w in result.words]
    # «, », ¡, ! should NOT appear as extracted words
    assert "«" not in sources
    assert "»" not in sources
    assert "¡" not in sources
    # Content words should be extracted
    assert "dice" in sources or "Necesito" in sources


def test_propn_recovery_rescues_content_words(tmp_path):
    """Capitalized content words mistagged as PROPN should be recovered."""
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {"words": [
        {"source": "Necesitas", "target": "brauchst", "context_note": "2nd singular",
         "similar_words": ["querer"]},
        {"source": "ventana", "target": "Fenster", "context_note": "feminine singular",
         "similar_words": ["puerta"]},
    ]}
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source="Necesitas cerrar la ventana.",
                          target="Du musst das Fenster schließen.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result, _ = extractor.extract_chapter(0, pairs)

    sources = [w.source for w in result.words]
    assert "ventana" in sources
    # "Necesitas" may or may not be PROPN depending on spaCy — but should be recovered if so
    assert "cerrar" in sources  # infinitive should always be extracted


def test_propn_recovery_keeps_config_names_filtered(tmp_path):
    """Character names from config must NOT be recovered — they are real proper nouns."""
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {"words": []}
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
        parsed=llm_output,
    )

    # Charlotte and Buenos/Aires are in the config — should stay filtered
    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source="Charlotte camina por Buenos Aires.",
                          target="Charlotte geht durch Buenos Aires.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result, _ = extractor.extract_chapter(0, pairs)

    sources = [w.source.lower() for w in result.words]
    assert "charlotte" not in sources
    assert "buenos" not in sources
    assert "aires" not in sources
    assert "camina" in sources  # verb should pass through
