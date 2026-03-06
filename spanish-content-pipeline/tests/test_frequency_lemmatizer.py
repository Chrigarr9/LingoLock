"""Tests for frequency_lemmatizer.py."""
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


def test_lemmatize_batch(tmp_path):
    """Lemmatizes a small word list via mock LLM."""
    words = ["voy", "fue", "restaurante", "disparar"]
    llm_response = {
        "voy": {"lemma": "ir", "appropriate": True},
        "fue": {"lemma": "ir", "appropriate": True},
        "restaurante": {"lemma": "restaurante", "appropriate": True},
        "disparar": {"lemma": "disparar", "appropriate": False},
    }
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm,
        output_dir=tmp_path,
        target_language="Spanish",
        domain="travel Spanish, Buenos Aires",
        batch_size=100,
    )
    result = lem.lemmatize(words)

    assert result["voy"] == FrequencyLemmaEntry(lemma="ir", appropriate=True)
    assert result["disparar"] == FrequencyLemmaEntry(lemma="disparar", appropriate=False)
    assert (tmp_path / "frequency_lemmas.json").exists()


def test_lemmatize_uses_cache(tmp_path):
    """Second call reads from disk; LLM is never called."""
    cached = {
        "voy": {"lemma": "ir", "appropriate": True},
    }
    (tmp_path / "frequency_lemmas.json").write_text(json.dumps(cached))

    llm = MagicMock()
    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish", domain="travel"
    )
    result = lem.lemmatize(["voy"])

    llm.complete_json.assert_not_called()
    assert result["voy"].lemma == "ir"


def test_lemmatize_batches_large_list(tmp_path):
    """Words are chunked into batches of batch_size."""
    words = [f"word{i}" for i in range(150)]
    batch1_response = {w: {"lemma": w, "appropriate": True} for w in words[:100]}
    batch2_response = {w: {"lemma": w, "appropriate": True} for w in words[100:]}
    llm = _make_mock_llm([batch1_response, batch2_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        domain="travel", batch_size=100
    )
    result = lem.lemmatize(words)

    assert llm.complete_json.call_count == 2
    assert len(result) == 150


def test_lemmatize_filters_function_words(tmp_path):
    """Function words (articles, prepositions) are skipped — not sent to LLM."""
    from pipeline.coverage_checker import SPANISH_FUNCTION_WORDS
    words = ["de", "la", "restaurante"]  # first two are function words
    llm_response = {"restaurante": {"lemma": "restaurante", "appropriate": True}}
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish", domain="travel"
    )
    result = lem.lemmatize(words)

    # Function words were not sent to LLM — check the word list section of prompt
    import re
    prompt_text = llm.complete_json.call_args[0][0]
    assert not re.search(r"^de$", prompt_text, re.MULTILINE)
    assert not re.search(r"^la$", prompt_text, re.MULTILINE)
    assert "restaurante" in prompt_text
