"""Tests for audit benchmark precision/recall computation."""
from benchmarks.bench_audit import compute_audit_metrics


def test_perfect_precision_recall():
    """All expected issues found, no false positives."""
    expected = [
        {"sentence_index": 1, "category": "cefr_violation"},
        {"sentence_index": 3, "category": "character_description"},
    ]
    found_indices = {1, 3}
    metrics = compute_audit_metrics(expected, found_indices, total_fixes=2)
    assert metrics["precision"] == 1.0
    assert metrics["recall"] == 1.0


def test_partial_recall():
    """Only 1 of 2 issues found."""
    expected = [
        {"sentence_index": 1, "category": "cefr_violation"},
        {"sentence_index": 3, "category": "character_description"},
    ]
    found_indices = {1}
    metrics = compute_audit_metrics(expected, found_indices, total_fixes=1)
    assert metrics["recall"] == 0.5
    assert metrics["precision"] == 1.0


def test_false_positives():
    """Found issues at indices not in expected list."""
    expected = [
        {"sentence_index": 1, "category": "cefr_violation"},
    ]
    found_indices = {1, 5, 8}
    metrics = compute_audit_metrics(expected, found_indices, total_fixes=3)
    assert metrics["recall"] == 1.0
    assert metrics["precision"] < 1.0
    assert metrics["false_positives"] == 2
