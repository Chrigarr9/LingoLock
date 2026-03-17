"""Tests for bench_gap_filler benchmark."""
from benchmarks.bench_gap_filler import compute_gap_filler_metrics
from pipeline.models import GapShot


def test_compute_gap_filler_metrics():
    target_words = ["restaurante", "cocinar"]
    shots = [
        GapShot(
            sentences=["Maria entra al restaurante.", "Ella quiere cocinar."],
            image_prompt="test",
            covers=["restaurante", "cocinar"],
            insert_after_shot=0,
        ),
    ]
    metrics = compute_gap_filler_metrics(target_words, shots)
    assert metrics["target_words_total"] == 2
    assert metrics["target_words_covered"] == 2
    assert metrics["shot_count"] == 1
    assert metrics["total_sentences"] == 2
