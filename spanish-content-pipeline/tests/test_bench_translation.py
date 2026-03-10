"""Tests for consolidated translation benchmark with chrF scoring."""
import json
from pathlib import Path


def test_compute_chrf_metrics():
    from benchmarks.bench_translation import compute_translation_metrics

    reference = ["Hallo Welt.", "Wie geht es dir?"]
    translated = ["Hallo Welt.", "Wie geht es dir?"]
    metrics = compute_translation_metrics(reference, translated)

    assert metrics["sentence_count"] == 2
    assert metrics["translated_count"] == 2
    assert metrics["missing_count"] == 0
    assert metrics["chrf_score"] > 90


def test_compute_chrf_partial_match():
    from benchmarks.bench_translation import compute_translation_metrics

    reference = ["Hallo Welt.", "Wie geht es dir?"]
    translated = ["Hallo Erde.", "Wie geht es Ihnen?"]
    metrics = compute_translation_metrics(reference, translated)

    assert metrics["chrf_score"] > 30
    assert metrics["chrf_score"] < 90


def test_compute_chrf_empty_translations():
    from benchmarks.bench_translation import compute_translation_metrics

    reference = ["Hallo Welt."]
    translated = [""]
    metrics = compute_translation_metrics(reference, translated)

    assert metrics["empty_count"] == 1
    assert metrics["chrf_score"] < 10


def test_compute_chrf_missing_translations():
    from benchmarks.bench_translation import compute_translation_metrics

    reference = ["Hallo.", "Welt."]
    translated = ["Hallo."]
    metrics = compute_translation_metrics(reference, translated)

    assert metrics["missing_count"] == 1


def test_language_pairs_all_in_flores():
    """All configured language pairs must have FLORES+ data."""
    from benchmarks.bench_translation import LANGUAGE_PAIRS

    flores_path = Path(__file__).resolve().parent.parent / "benchmarks" / "fixtures" / "flores_30.json"
    flores = json.loads(flores_path.read_text())
    available_langs = set(flores["languages"].keys())

    for source_code, target_code, _, _, _ in LANGUAGE_PAIRS:
        assert source_code in available_langs, f"Source {source_code} not in FLORES+"
        assert target_code in available_langs, f"Target {target_code} not in FLORES+"
