# tests/test_lemmatizer.py
import pytest
from pipeline.lemmatizer import lemmatize_text, lemmatize_word, is_function_word, TokenInfo


def test_lemmatize_word_verb():
    assert lemmatize_word("mira", "es") == "mirar"


def test_lemmatize_word_noun_unchanged():
    assert lemmatize_word("casa", "es") == "casa"


def test_lemmatize_word_irregular_verb():
    assert lemmatize_word("es", "es") == "ser"


def test_lemmatize_text_returns_tokens():
    tokens = lemmatize_text("Maria mira las luces.", "es")
    assert len(tokens) > 0
    assert all(isinstance(t, TokenInfo) for t in tokens)


def test_lemmatize_text_correct_lemmas():
    tokens = lemmatize_text("Maria mira las luces.", "es")
    lemmas = {t.lemma for t in tokens}
    assert "mirar" in lemmas
    assert "luz" in lemmas


def test_lemmatize_text_includes_pos():
    tokens = lemmatize_text("Maria camina.", "es")
    verb = next(t for t in tokens if t.lemma == "caminar")
    assert verb.pos == "VERB"


def test_lemmatize_text_filters_punctuation():
    tokens = lemmatize_text("¡Hola!", "es")
    assert all(t.pos != "PUNCT" for t in tokens)


def test_is_function_word_det():
    """Articles are function words."""
    tokens = lemmatize_text("la casa", "es")
    la = next(t for t in tokens if t.text == "la")
    assert is_function_word(la) is True


def test_is_function_word_personal_pronoun():
    """Personal pronouns (yo, me, se) are function words."""
    tokens = lemmatize_text("Yo quiero.", "es")
    yo = next(t for t in tokens if t.text.lower() == "yo")
    assert is_function_word(yo) is True


def test_is_function_word_indefinite_pronoun_is_content():
    """Indefinite pronouns (algo, nada) are content words."""
    tokens = lemmatize_text("Algo está aquí.", "es")
    algo = next(t for t in tokens if t.lemma == "algo")
    assert is_function_word(algo) is False


def test_is_function_word_content_word():
    """Nouns, verbs, adjectives are content words."""
    tokens = lemmatize_text("Maria camina.", "es")
    camina = next(t for t in tokens if t.lemma == "caminar")
    assert is_function_word(camina) is False
