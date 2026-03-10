"""Tests for story_auditor module."""
import json
from unittest.mock import MagicMock

from pipeline.story_auditor import audit_story, AuditFix


def _make_llm_response(fixes: list[dict]) -> MagicMock:
    resp = MagicMock()
    resp.parsed = {"fixes": fixes}
    return resp


def test_audit_finds_verb_collocation_error():
    """The auditor should flag 'camina' used for a car."""
    chapters = {
        1: ["Maria mira la calle.", "El coche rojo camina despacio."],
    }
    characters = [
        {"name": "Maria", "role": "protagonist"},
    ]
    chapter_configs = [
        {"title": "Drive to Airport", "cefr_level": "A1", "context": "Maria drives to the airport."},
    ]

    fix = {
        "chapter": 1,
        "sentence_index": 1,
        "original": "El coche rojo camina despacio.",
        "fixed": "El coche rojo va despacio.",
        "reason": "Cars don't walk (caminar). Use ir/avanzar.",
    }

    llm = MagicMock()
    llm.complete_json.return_value = _make_llm_response([fix])

    (fixes, unnamed), _ = audit_story(
        chapters=chapters,
        characters=characters,
        chapter_configs=chapter_configs,
        llm=llm,
    )

    assert len(fixes) == 1
    assert fixes[0].chapter == 1
    assert fixes[0].sentence_index == 1
    assert "va despacio" in fixes[0].fixed


def test_audit_returns_empty_when_no_errors():
    chapters = {1: ["Maria mira la calle.", "Ella sonríe."]}
    characters = [{"name": "Maria", "role": "protagonist"}]
    chapter_configs = [{"title": "Ch1", "cefr_level": "A1", "context": "Maria walks."}]

    llm = MagicMock()
    llm.complete_json.return_value = _make_llm_response([])

    (fixes, unnamed), _ = audit_story(
        chapters=chapters, characters=characters,
        chapter_configs=chapter_configs, llm=llm,
    )
    assert fixes == []


def test_audit_fix_model():
    fix = AuditFix(
        chapter=1, sentence_index=2,
        original="Las amigas hablan.", fixed="Maria y su madre hablan.",
        reason="Ingrid is her mother",
    )
    assert fix.chapter == 1
    assert fix.original == "Las amigas hablan."
