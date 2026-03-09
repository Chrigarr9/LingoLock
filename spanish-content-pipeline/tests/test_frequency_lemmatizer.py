"""Tests for frequency_lemmatizer.py — now uses spaCy for lemmas, LLM for appropriateness only."""
import json
from unittest.mock import MagicMock

from pipeline.frequency_lemmatizer import FrequencyLemmatizer
from pipeline.models import FrequencyLemmaEntry


def _make_mock_llm(batch_responses: list[dict]) -> MagicMock:
    """Returns a mock LLMClient whose complete_json cycles through responses."""
    llm = MagicMock()
    responses = iter(batch_responses)

    def side_effect(prompt, system=None):
        r = MagicMock()
        r.parsed = next(responses)
        return r

    llm.complete_json.side_effect = side_effect
    return llm


def test_lemmatize_uses_spacy_for_lemmas(tmp_path):
    """Lemma comes from spaCy, not from LLM."""
    words = ["camina", "restaurante"]
    # LLM only returns appropriateness — no lemma field needed
    llm_response = {
        "caminar": True,
        "restaurante": True,
    }
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel Spanish, Buenos Aires",
    )
    result = lem.lemmatize(words)

    # "camina" should be lemmatized by spaCy to "caminar"
    assert result["camina"].lemma == "caminar"
    assert result["restaurante"].lemma == "restaurante"


def test_appropriateness_from_llm(tmp_path):
    """LLM determines appropriateness."""
    words = ["restaurante", "disparar"]
    llm_response = {
        "restaurante": True,
        "disparar": False,
    }
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel",
    )
    result = lem.lemmatize(words)

    assert result["restaurante"].appropriate is True
    assert result["disparar"].appropriate is False


def test_lemmatize_uses_cache(tmp_path):
    """Second call reads from disk; LLM is never called."""
    cached = {
        "camina": {"lemma": "caminar", "appropriate": True},
    }
    (tmp_path / "frequency_lemmas.json").write_text(json.dumps(cached))

    llm = MagicMock()
    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel",
    )
    result = lem.lemmatize(["camina"])

    llm.complete_json.assert_not_called()
    assert result["camina"].lemma == "caminar"


def test_lemmatize_filters_function_words(tmp_path):
    """Function words (by spaCy POS) are skipped — not sent to LLM."""
    words = ["de", "la", "restaurante"]
    llm_response = {"restaurante": True}
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel",
    )
    result = lem.lemmatize(words)

    # Function words should not be in the result at all
    assert "de" not in result
    assert "la" not in result
    assert "restaurante" in result


def test_lemmatize_deduplicates_by_lemma(tmp_path):
    """Multiple inflections mapping to same lemma are sent as one lemma to LLM."""
    words = ["mira", "mirar", "miraba"]
    # All three → "mirar" via spaCy. LLM sees "mirar" once.
    llm_response = {"mirar": True}
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel",
    )
    result = lem.lemmatize(words)

    # All three words should have the same lemma
    assert result["mira"].lemma == "mirar"
    assert result["mirar"].lemma == "mirar"
    assert result["miraba"].lemma == "mirar"
