"""Tests for grammar_auditor.py."""
from unittest.mock import MagicMock

from pipeline.grammar_auditor import audit_grammar, GrammarAuditReport


def test_audit_grammar_returns_report():
    """Grammar audit returns a structured report with present/missing targets."""
    chapters_by_cefr = {
        "A1": ["Maria abre la maleta.", "Ella tiene miedo."],
        "A2": ["Ayer fuimos al mercado.", "Maria compró un vestido."],
    }
    grammar_targets = {
        "A1": ["simple present tense"],
        "A2": ["pretérito indefinido"],
    }

    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = MagicMock(
        parsed={
            "targets": [
                {"target": "simple present tense", "present": True, "example": "Maria abre la maleta."},
            ]
        }
    )

    report, _ = audit_grammar(
        chapters_by_cefr=chapters_by_cefr,
        grammar_targets=grammar_targets,
        llm=mock_llm,
    )

    assert isinstance(report, GrammarAuditReport)
    assert len(report.levels) > 0


def test_audit_grammar_skips_if_no_targets():
    """If grammar_targets is empty, returns empty report without LLM calls."""
    mock_llm = MagicMock()

    report, _ = audit_grammar(
        chapters_by_cefr={},
        grammar_targets={},
        llm=mock_llm,
    )

    assert report.levels == {}
    mock_llm.complete_json.assert_not_called()
