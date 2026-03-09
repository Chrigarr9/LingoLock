"""Tests for scan_story_coverage — lightweight coverage check from story text."""
from pipeline.coverage_checker import scan_story_coverage, SPANISH_FUNCTION_WORDS


def test_scan_finds_missing_words():
    """Words in frequency list but not in story text are reported missing."""
    stories = {0: "Maria camina por la calle."}
    frequency_data = {"caminar": 50, "calle": 100, "casa": 150, "la": 10}
    frequency_lemmas = {
        "camina": type("E", (), {"lemma": "caminar", "appropriate": True})(),
    }
    result = scan_story_coverage(stories, frequency_data, frequency_lemmas, top_n=200)
    assert "casa" in result.missing_words
    assert "caminar" not in result.missing_words  # present via lemma
    assert "la" not in result.missing_words  # function word


def test_scan_respects_top_n():
    """Only words within top_n are considered."""
    stories = {0: "Hola mundo."}
    frequency_data = {"hola": 50, "mundo": 100, "casa": 500}
    result = scan_story_coverage(stories, frequency_data, {}, top_n=200)
    assert "casa" not in result.missing_words  # rank 500 > top_n 200


def test_scan_filters_inappropriate():
    """Words marked inappropriate in frequency_lemmas are excluded."""
    stories = {0: "Hola."}
    frequency_data = {"mierda": 50}
    frequency_lemmas = {
        "mierda": type("E", (), {"lemma": "mierda", "appropriate": False})(),
    }
    result = scan_story_coverage(stories, frequency_data, frequency_lemmas, top_n=200)
    assert "mierda" not in result.missing_words


def test_scan_uses_verb_forms():
    """Inflected verb forms are resolved via SPANISH_VERB_FORMS."""
    stories = {0: "Ella tiene un gato."}
    frequency_data = {"tener": 30, "gato": 100}
    result = scan_story_coverage(stories, frequency_data, {}, top_n=200)
    assert "tener" not in result.missing_words  # "tiene" resolves to "tener"
    assert "gato" not in result.missing_words
