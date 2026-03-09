# tests/test_story_coverage_scanner.py
from pipeline.coverage_checker import scan_story_coverage


def test_scan_finds_covered_and_missing():
    """Words in story text are covered; words not in text are missing."""
    stories = {0: "Maria camina por la calle."}
    frequency_data = {"caminar": 50, "calle": 100, "casa": 150}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200)
    assert "casa" in result.missing_words
    # "camina" lemmatizes to "caminar" via spaCy
    assert "caminar" not in result.missing_words


def test_scan_respects_top_n():
    """Only words within top_n are considered."""
    stories = {0: "Hola mundo."}
    frequency_data = {"hola": 50, "mundo": 100, "casa": 500}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200)
    assert "casa" not in result.missing_words  # rank 500 > top_n 200


def test_scan_filters_inappropriate():
    """Words in inappropriate set are excluded from missing."""
    stories = {0: "Hola."}
    frequency_data = {"mierda": 50}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200,
                                 inappropriate_lemmas={"mierda"})
    assert "mierda" not in result.missing_words


def test_scan_resolves_verb_forms():
    """Inflected verb forms are resolved via spaCy."""
    stories = {0: "Ella tiene un gato."}
    frequency_data = {"tener": 30, "gato": 100}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200)
    assert "tener" not in result.missing_words  # "tiene" → "tener" via spaCy
    assert "gato" not in result.missing_words


def test_scan_resolves_regular_verbs():
    """Regular -ar verbs like mira→mirar are resolved (unlike old SPANISH_VERB_FORMS)."""
    stories = {0: "Maria mira las luces."}
    frequency_data = {"mira": 50, "mirar": 100}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200)
    # Both should resolve to "mirar" which is in the text
    assert "mirar" not in result.missing_words
