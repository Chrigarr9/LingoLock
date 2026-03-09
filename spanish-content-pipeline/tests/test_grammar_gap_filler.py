"""Tests for grammar_gap_filler.py."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from pipeline.grammar_auditor import GrammarAuditReport, GrammarLevelReport, GrammarTargetResult
from pipeline.grammar_gap_filler import GrammarGapFiller
from pipeline.models import GrammarGapSentence


def _make_audit_report(missing: dict[str, list[str]]) -> GrammarAuditReport:
    """Build a report where specified targets are missing.

    Args:
        missing: {cefr_level: [target_description, ...]}
    """
    levels = {}
    for cefr, targets in missing.items():
        results = [GrammarTargetResult(target=t, present=False) for t in targets]
        levels[cefr] = GrammarLevelReport(cefr=cefr, targets=results, coverage=0.0)
    return GrammarAuditReport(levels=levels)


def _make_mock_llm(responses: list[dict]) -> MagicMock:
    llm = MagicMock()
    it = iter(responses)

    def side_effect(prompt, system=None):
        r = MagicMock()
        r.parsed = next(it)
        return r

    llm.complete_json.side_effect = side_effect
    return llm


def _make_chapter_defs():
    return [
        {"title": "At the Airport", "context": "Maria arrives", "vocab_focus": [], "cefr_level": "A1"},
        {"title": "At the Restaurant", "context": "Ordering food", "vocab_focus": [], "cefr_level": "A2"},
        {"title": "Deep Talk", "context": "Talking about life", "vocab_focus": [], "cefr_level": "B1"},
    ]


def test_no_missing_targets_returns_empty():
    """When all targets are present, no LLM calls and empty result."""
    report = GrammarAuditReport(levels={
        "A1": GrammarLevelReport(cefr="A1", targets=[
            GrammarTargetResult(target="present tense", present=True, example="Ella come."),
        ], coverage=1.0),
    })
    llm = MagicMock()
    filler = GrammarGapFiller(
        llm=llm, output_dir=Path("/tmp/test"),
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)
    assert result == []
    llm.complete_json.assert_not_called()


def test_generates_sentences_for_missing_targets(tmp_path):
    """Generates sentences for each missing grammar target."""
    report = _make_audit_report({"A2": ["pretérito imperfecto"]})

    llm_response = {
        "sentences": [
            {
                "source": "Cuando era niña, vivía en Buenos Aires.",
                "target": "Als sie ein Kind war, lebte sie in Buenos Aires.",
                "grammar_target": "pretérito imperfecto",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="Rioplatense",
    )
    result = filler.fill_gaps(report)

    assert len(result) == 1
    assert result[0].grammar_target == "pretérito imperfecto"
    assert result[0].cefr_level == "A2"
    assert result[0].chapter == 2  # matches A2 chapter
    assert llm.complete_json.call_count == 1


def test_assigns_to_correct_cefr_chapter(tmp_path):
    """B1 grammar targets get assigned to B1 chapters."""
    report = _make_audit_report({"B1": ["subjunctive"]})

    llm_response = {
        "sentences": [
            {
                "source": "Ojalá pueda volver pronto.",
                "target": "Hoffentlich kann ich bald zurückkehren.",
                "grammar_target": "subjunctive",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)

    assert result[0].chapter == 3  # chapter 3 is B1


def test_caches_results_to_disk(tmp_path):
    """Results are cached to grammar_gap_sentences.json."""
    report = _make_audit_report({"A1": ["ser vs estar"]})

    llm_response = {
        "sentences": [
            {
                "source": "Ella es alta pero hoy está cansada.",
                "target": "Sie ist groß, aber heute ist sie müde.",
                "grammar_target": "ser vs estar",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(report)

    cache_path = tmp_path / "grammar_gap_sentences.json"
    assert cache_path.exists()
    cached = json.loads(cache_path.read_text())
    assert len(cached) == 1


def test_uses_cache_on_second_call(tmp_path):
    """If cache exists, no LLM calls are made."""
    cached = [
        {
            "source": "Ella era bonita.",
            "target": "Sie war hübsch.",
            "grammar_target": "imperfecto",
            "cefr_level": "A2",
            "chapter": 2,
        }
    ]
    cache_path = tmp_path / "grammar_gap_sentences.json"
    cache_path.write_text(json.dumps(cached))

    llm = MagicMock()
    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(_make_audit_report({"A2": ["imperfecto"]}))

    assert len(result) == 1
    assert result[0].source == "Ella era bonita."
    llm.complete_json.assert_not_called()


def test_prompt_includes_existing_chapter_sentences(tmp_path):
    """The generation prompt references existing sentences for style context."""
    report = _make_audit_report({"A1": ["hay"]})
    trans_dir = tmp_path / "translations"
    trans_dir.mkdir()
    (trans_dir / "chapter_01.json").write_text(json.dumps([
        {"chapter": 1, "sentence_index": 0,
         "source": "Maria abre la maleta.", "target": "Maria öffnet den Koffer."}
    ]))

    llm = _make_mock_llm([{"sentences": [
        {"source": "Hay una maleta.", "target": "Es gibt einen Koffer.", "grammar_target": "hay"}
    ]}])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(report)

    prompt = llm.complete_json.call_args_list[0][0][0]
    assert "Maria abre la maleta" in prompt


def test_multiple_cefr_levels_batched(tmp_path):
    """Missing targets from multiple CEFR levels are handled in a single LLM call."""
    report = _make_audit_report({
        "A1": ["questions with qué"],
        "A2": ["pretérito imperfecto"],
    })

    llm_response = {
        "sentences": [
            {
                "source": "¿Qué es eso?",
                "target": "Was ist das?",
                "grammar_target": "questions with qué",
            },
            {
                "source": "Cuando era joven, vivía en el campo.",
                "target": "Als er jung war, lebte er auf dem Land.",
                "grammar_target": "pretérito imperfecto",
            },
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)

    assert len(result) == 2
    assert llm.complete_json.call_count == 1


def test_parses_insert_after(tmp_path):
    """insert_after is parsed from LLM response."""
    report = _make_audit_report({"A1": ["hay"]})

    llm_response = {
        "sentences": [
            {
                "source": "Hay una maleta en la habitación.",
                "target": "Es gibt einen Koffer im Zimmer.",
                "grammar_target": "hay",
                "insert_after": 7,
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)

    assert result[0].insert_after == 7


def test_insert_after_defaults_to_minus_one(tmp_path):
    """insert_after defaults to -1 when not provided by LLM."""
    report = _make_audit_report({"A1": ["hay"]})

    llm_response = {
        "sentences": [
            {
                "source": "Hay una maleta.",
                "target": "Es gibt einen Koffer.",
                "grammar_target": "hay",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)

    assert result[0].insert_after == -1


def test_fuzzy_match_cefr_prefix(tmp_path):
    """LLM returns grammar_target with [A2] prefix — CEFR is parsed from it."""
    report = _make_audit_report({"A2": ["pretérito imperfecto"]})

    llm_response = {
        "sentences": [
            {
                "source": "Cuando era niña, vivía acá.",
                "target": "Als sie ein Kind war, lebte sie hier.",
                "grammar_target": "[A2] pretérito imperfecto",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)

    assert result[0].cefr_level == "A2"
    assert result[0].chapter == 2


def test_fuzzy_match_substring(tmp_path):
    """LLM returns shortened grammar_target — substring match finds it."""
    report = _make_audit_report({"B1": ["presente del subjuntivo"]})

    llm_response = {
        "sentences": [
            {
                "source": "Ojalá que llueva.",
                "target": "Hoffentlich regnet es.",
                "grammar_target": "subjuntivo",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)

    assert result[0].cefr_level == "B1"
    assert result[0].chapter == 3


def test_fuzzy_match_no_match_defaults_to_chapter_1(tmp_path):
    """When grammar_target doesn't match anything, defaults to chapter 1."""
    report = _make_audit_report({"A2": ["pretérito imperfecto"]})

    llm_response = {
        "sentences": [
            {
                "source": "Ella come mucho.",
                "target": "Sie isst viel.",
                "grammar_target": "completely unrelated target",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)

    assert result[0].cefr_level == ""
    assert result[0].chapter == 1  # default fallback


def test_prompt_includes_all_sentences_with_indices(tmp_path):
    """Prompt includes ALL existing sentences with sentence_index numbers."""
    report = _make_audit_report({"A1": ["hay"]})

    trans_dir = tmp_path / "translations"
    trans_dir.mkdir()
    sentences = [
        {"chapter": 1, "sentence_index": i,
         "source": f"Sentence {i}.", "target": f"Satz {i}."}
        for i in range(12)
    ]
    (trans_dir / "chapter_01.json").write_text(json.dumps(sentences))

    llm = _make_mock_llm([{"sentences": [
        {"source": "Hay algo.", "target": "Es gibt etwas.", "grammar_target": "hay"}
    ]}])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(report)

    prompt = llm.complete_json.call_args_list[0][0][0]
    # All 12 sentences should appear (no truncation)
    assert "[11]" in prompt
    assert "Sentence 11" in prompt
    # Prompt should ask for insert_after
    assert "insert_after" in prompt
