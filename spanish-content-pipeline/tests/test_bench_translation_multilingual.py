"""Tests for multilingual translation benchmark."""
from benchmarks.bench_translation_multilingual import compute_multilingual_metrics


def test_compute_multilingual_metrics_perfect():
    reference = ["Hallo Welt.", "Guten Morgen."]
    translated = ["Hallo Welt.", "Guten Morgen."]
    metrics = compute_multilingual_metrics(reference, translated)
    assert metrics["sentence_count"] == 2
    assert metrics["translated_count"] == 2
    assert metrics["missing_count"] == 0
    assert metrics["empty_count"] == 0


def test_compute_multilingual_metrics_missing():
    reference = ["Hallo.", "Welt."]
    translated = ["Hallo."]
    metrics = compute_multilingual_metrics(reference, translated)
    assert metrics["missing_count"] == 1


def test_compute_multilingual_metrics_empty():
    reference = ["Hallo.", "Welt."]
    translated = ["Hallo.", ""]
    metrics = compute_multilingual_metrics(reference, translated)
    assert metrics["empty_count"] == 1
