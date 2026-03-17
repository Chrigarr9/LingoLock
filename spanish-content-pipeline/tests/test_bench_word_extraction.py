"""Tests for bench_word_extraction benchmark."""
from benchmarks.bench_word_extraction import compute_extraction_metrics


def test_compute_extraction_metrics():
    reference = [
        {"source": "puerta", "lemma": "puerta", "pos": "NOUN"},
        {"source": "café", "lemma": "café", "pos": "NOUN"},
        {"source": "entró", "lemma": "entrar", "pos": "VERB"},
    ]
    extracted = [
        {"source": "puerta", "lemma": "puerta", "pos": "NOUN", "target": "Tür"},
        {"source": "café", "lemma": "café", "pos": "NOUN", "target": "Kaffee"},
        {"source": "grande", "lemma": "grande", "pos": "ADJ", "target": "groß"},
    ]
    metrics = compute_extraction_metrics(reference, extracted)
    assert metrics["reference_count"] == 3
    assert metrics["extracted_count"] == 3
    assert metrics["matched_lemmas"] == 2  # puerta, café (entrar not extracted)
    assert metrics["recall"] > 0
    assert metrics["translation_accuracy"] >= 0
    assert metrics["translation_coverage"] >= 0
    assert metrics["similar_words_ratio"] >= 0
    assert metrics["score"] >= 0
