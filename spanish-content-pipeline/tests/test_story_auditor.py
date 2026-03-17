"""Tests for two-phase story auditor."""
import json
from unittest.mock import MagicMock

from pipeline.story_auditor import (
    find_issues, fix_issue, fix_issues_parallel, apply_fixes,
    AuditIssue, AuditFix, UnnamedCharacter,
    _reindex_sentences, dedup_consecutive_sentences,
)


def _make_find_response(issues: list[dict], unnamed: list[dict] | None = None) -> MagicMock:
    resp = MagicMock()
    resp.parsed = {"issues": issues, "unnamed_characters": unnamed or []}
    return resp


# ── Pass 5a: find_issues ────────────────────────────────────────────────

def test_find_issues_returns_audit_issues():
    """find_issues should parse LLM response into AuditIssue objects."""
    issue = {
        "chapter": 1,
        "sentence_index": 5,
        "category": "scene_logic",
        "severity": "critical",
        "original": "El coche rojo camina despacio.",
        "description": "Cars don't walk.",
        "suggested_fix": "Change 'camina' to 'va'.",
        "action": "rewrite",
    }

    llm = MagicMock()
    llm.complete_json.return_value = _make_find_response([issue])

    (issues, unnamed), _ = find_issues(
        chapters={1: ["Maria mira.", "El coche rojo camina despacio."]},
        characters=[{"name": "Maria", "role": "protagonist"}],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": "Driving."}],
        llm=llm,
    )

    assert len(issues) == 1
    assert issues[0].category == "scene_logic"
    assert issues[0].severity == "critical"
    assert issues[0].suggested_fix == "Change 'camina' to 'va'."


def test_find_issues_filters_by_severity():
    """Only critical issues should be in the critical subset."""
    issues_raw = [
        {"chapter": 1, "sentence_index": 0, "category": "redundancy",
         "severity": "minor", "original": "A.", "description": "minor",
         "suggested_fix": "x", "action": "rewrite"},
        {"chapter": 1, "sentence_index": 1, "category": "contradiction",
         "severity": "critical", "original": "B.", "description": "critical",
         "suggested_fix": "y", "action": "rewrite"},
    ]

    llm = MagicMock()
    llm.complete_json.return_value = _make_find_response(issues_raw)

    (issues, _), _ = find_issues(
        chapters={1: ["A.", "B."]},
        characters=[],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=llm,
    )

    assert len(issues) == 2
    critical = [i for i in issues if i.severity == "critical"]
    minor = [i for i in issues if i.severity == "minor"]
    assert len(critical) == 1
    assert len(minor) == 1


def test_find_issues_returns_empty_on_clean_story():
    llm = MagicMock()
    llm.complete_json.return_value = _make_find_response([])

    (issues, _), _ = find_issues(
        chapters={1: ["Maria mira."]},
        characters=[],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=llm,
    )
    assert issues == []


def test_find_issues_handles_remove_action():
    issue = {
        "chapter": 1, "sentence_index": 2, "category": "dangling_reference",
        "severity": "critical", "original": "¿Vas a ver a tu padre?",
        "description": "No father in character list.",
        "suggested_fix": "Remove this sentence entirely.",
        "action": "remove",
    }

    llm = MagicMock()
    llm.complete_json.return_value = _make_find_response([issue])

    (issues, _), _ = find_issues(
        chapters={1: ["A.", "B.", "¿Vas a ver a tu padre?"]},
        characters=[],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=llm,
    )

    assert issues[0].action == "remove"


def test_audit_issue_model_defaults():
    """AuditIssue should have sensible defaults."""
    issue = AuditIssue(
        chapter=1, sentence_index=0, category="tense",
        severity="critical", original="Test.",
        description="Tense error.", suggested_fix="Fix it.",
    )
    assert issue.action == "rewrite"


# ── Pass 5b: fix_issue / fix_issues_parallel ────────────────────────────

def test_fix_issue_remove_needs_no_llm():
    """Remove actions should return immediately without calling the LLM."""
    issue = AuditIssue(
        chapter=1, sentence_index=2, category="dangling_reference",
        severity="critical", original="¿Vas a ver a tu padre?",
        description="No father.", suggested_fix="Remove.",
        action="remove",
    )

    fix = fix_issue(issue, chapters={1: ["A.", "B.", "¿Vas a ver a tu padre?"]},
                    chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}])
    assert fix.action == "remove"
    assert fix.fixed == ""


def test_fix_issue_rewrite_calls_llm():
    """Rewrite actions should call the LLM with surrounding context."""
    issue = AuditIssue(
        chapter=1, sentence_index=1, category="scene_logic",
        severity="critical", original="El coche camina.",
        description="Cars don't walk.",
        suggested_fix="Change camina to va.",
    )

    llm = MagicMock()
    resp = MagicMock()
    resp.parsed = {"fixed": "El coche va.", "action": "rewrite"}
    llm.complete_json.return_value = resp

    fix = fix_issue(
        issue,
        chapters={1: ["Maria mira.", "El coche camina.", "Ella sonríe."]},
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": "Driving."}],
        llm=llm,
    )

    assert fix.fixed == "El coche va."
    assert fix.action == "rewrite"
    llm.complete_json.assert_called_once()


def test_fix_issues_parallel_fixes_all_severities():
    """Both critical and minor issues should be fixed."""
    issues = [
        AuditIssue(chapter=1, sentence_index=0, category="redundancy",
                    severity="minor", original="A.", description="minor",
                    suggested_fix="x", action="remove"),
        AuditIssue(chapter=1, sentence_index=1, category="contradiction",
                    severity="critical", original="B.", description="critical",
                    suggested_fix="y", action="remove"),
    ]

    fixes = fix_issues_parallel(
        issues,
        chapters={1: ["A.", "B."]},
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": ""}],
        llm=None,  # remove doesn't need LLM
    )

    assert len(fixes) == 2


# ── apply_fixes ─────────────────────────────────────────────────────────

def test_apply_fixes_rewrite(tmp_path):
    """apply_fixes should match by sentence_index only, not source text."""
    story = {
        "scenes": [{"setting": "test", "description": "", "shots": [
            {"focus": "test", "image_prompt": "", "sentences": [
                {"source": "Bad sentence.", "sentence_index": 0},
                {"source": "Good sentence.", "sentence_index": 1},
            ]}
        ]}]
    }
    story_path = tmp_path / "chapter_01.json"
    story_path.write_text(json.dumps(story))

    # original doesn't match source text — should still apply by index
    fixes = [AuditFix(chapter=1, sentence_index=0, original="Different text.",
                       fixed="Fixed sentence.", action="rewrite")]

    applied = apply_fixes(fixes, tmp_path)
    assert applied == 1

    result = json.loads(story_path.read_text())
    assert result["scenes"][0]["shots"][0]["sentences"][0]["source"] == "Fixed sentence."
    # Verify reindexing happened
    assert result["scenes"][0]["shots"][0]["sentences"][0]["sentence_index"] == 0
    assert result["scenes"][0]["shots"][0]["sentences"][1]["sentence_index"] == 1


def test_apply_fixes_reindexes_after_remove(tmp_path):
    """After removing a sentence, remaining indices should be sequential."""
    story = {
        "scenes": [{"setting": "test", "description": "", "shots": [
            {"focus": "test", "image_prompt": "", "sentences": [
                {"source": "First.", "sentence_index": 0},
                {"source": "Remove me.", "sentence_index": 1},
                {"source": "Third.", "sentence_index": 2},
            ]}
        ]}]
    }
    story_path = tmp_path / "chapter_01.json"
    story_path.write_text(json.dumps(story))

    fixes = [AuditFix(chapter=1, sentence_index=1, original="Remove me.",
                       fixed="", action="remove")]

    apply_fixes(fixes, tmp_path)
    result = json.loads(story_path.read_text())
    sents = result["scenes"][0]["shots"][0]["sentences"]
    assert len(sents) == 2
    assert sents[0]["sentence_index"] == 0
    assert sents[1]["sentence_index"] == 1  # was 2, now reindexed to 1


def test_apply_fixes_remove(tmp_path):
    """apply_fixes should remove sentences and clean up empty shots."""
    story = {
        "scenes": [{"setting": "test", "description": "", "shots": [
            {"focus": "solo", "image_prompt": "", "sentences": [
                {"source": "Delete me.", "sentence_index": 0},
            ]},
            {"focus": "keep", "image_prompt": "", "sentences": [
                {"source": "Keep me.", "sentence_index": 1},
            ]},
        ]}]
    }
    story_path = tmp_path / "chapter_01.json"
    story_path.write_text(json.dumps(story))

    fixes = [AuditFix(chapter=1, sentence_index=0, original="Delete me.",
                       fixed="", action="remove")]

    applied = apply_fixes(fixes, tmp_path)
    assert applied == 1

    result = json.loads(story_path.read_text())
    # The first shot should be gone (empty after removal)
    assert len(result["scenes"][0]["shots"]) == 1
    assert result["scenes"][0]["shots"][0]["focus"] == "keep"


# ── _reindex_sentences ─────────────────────────────────────────────────

def test_reindex_sentences():
    """_reindex_sentences should assign sequential indices across scenes/shots."""
    data = {
        "scenes": [
            {"shots": [
                {"sentences": [
                    {"source": "A.", "sentence_index": 10},
                    {"source": "B.", "sentence_index": 20},
                ]},
            ]},
            {"shots": [
                {"sentences": [
                    {"source": "C.", "sentence_index": 50},
                ]},
            ]},
        ]
    }

    _reindex_sentences(data)

    all_sents = [
        s for scene in data["scenes"]
        for shot in scene["shots"]
        for s in shot["sentences"]
    ]
    assert [s["sentence_index"] for s in all_sents] == [0, 1, 2]


# ── dedup_consecutive_sentences ────────────────────────────────────────

def test_dedup_consecutive_sentences():
    """Should remove consecutive duplicate sentences."""
    data = {
        "scenes": [{"shots": [
            {"sentences": [
                {"source": "Same.", "sentence_index": 0},
                {"source": "Same.", "sentence_index": 1},
                {"source": "Different.", "sentence_index": 2},
                {"source": "Different.", "sentence_index": 3},
                {"source": "Unique.", "sentence_index": 4},
            ]}
        ]}]
    }

    removed = dedup_consecutive_sentences(data)
    assert removed == 2

    sents = data["scenes"][0]["shots"][0]["sentences"]
    assert len(sents) == 3
    assert [s["source"] for s in sents] == ["Same.", "Different.", "Unique."]


def test_dedup_no_duplicates():
    """Should not remove anything when there are no duplicates."""
    data = {
        "scenes": [{"shots": [
            {"sentences": [
                {"source": "A.", "sentence_index": 0},
                {"source": "B.", "sentence_index": 1},
            ]}
        ]}]
    }

    removed = dedup_consecutive_sentences(data)
    assert removed == 0
    assert len(data["scenes"][0]["shots"][0]["sentences"]) == 2
