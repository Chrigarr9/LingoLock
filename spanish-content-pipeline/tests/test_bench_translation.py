"""Tests for bench_translation benchmark."""
from benchmarks.bench_translation import compute_deterministic_metrics


def test_compute_translation_metrics():
    source_sentences = ["Maria abre la puerta.", "Ella sonríe."]
    pairs = [
        {"source": "Maria abre la puerta.", "target": "Maria öffnet die Tür."},
        {"source": "Ella sonríe.", "target": "Sie lächelt."},
    ]
    metrics = compute_deterministic_metrics(source_sentences, pairs)
    assert metrics["source_count"] == 2
    assert metrics["translated_count"] == 2
    assert metrics["missing_translations"] == 0
    assert metrics["avg_token_ratio"] > 0


def test_missing_translation():
    source_sentences = ["Hola.", "Adiós."]
    pairs = [{"source": "Hola.", "target": "Hallo."}]
    metrics = compute_deterministic_metrics(source_sentences, pairs)
    assert metrics["missing_translations"] == 1
