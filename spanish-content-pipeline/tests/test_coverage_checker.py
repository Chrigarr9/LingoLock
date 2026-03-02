# tests/test_coverage_checker.py
from pathlib import Path

from pipeline.coverage_checker import load_frequency_data, check_coverage
from pipeline.models import VocabularyEntry


def test_load_frequency_data(tmp_path):
    """FrequencyWords format: 'word count' per line, sorted by frequency."""
    freq_file = tmp_path / "es_50k.txt"
    freq_file.write_text("de 12345678\nla 9876543\nestar 5432100\nser 5000000\ntener 4000000\n")

    data = load_frequency_data(freq_file)

    assert data["de"] == 1
    assert data["la"] == 2
    assert data["estar"] == 3
    assert data["ser"] == 4
    assert data["tener"] == 5


def test_check_coverage():
    vocab = [
        VocabularyEntry(id="estar", source="estar", target=["sein"], pos="verb", frequency_rank=3, cefr_level="A1", examples=[]),
        VocabularyEntry(id="ser", source="ser", target=["sein"], pos="verb", frequency_rank=4, cefr_level="A1", examples=[]),
        VocabularyEntry(id="obscure", source="obscure", target=["obscur"], pos="adjective", examples=[]),
    ]
    frequency_data = {"de": 1, "la": 2, "estar": 3, "ser": 4, "tener": 5}

    report = check_coverage(vocab, frequency_data, top_n=5)

    assert report.total_vocabulary == 3
    assert report.frequency_matched == 2  # estar and ser have ranks
    assert report.top_1000_covered == 2   # estar(3) and ser(4) are in top 5
    assert report.top_1000_total == 5
    assert report.coverage_percent == 40.0  # 2/5 = 40%
    assert "de" in report.missing_top_100
    assert "tener" in report.missing_top_100


def test_check_coverage_empty_vocab():
    report = check_coverage([], {"de": 1, "la": 2}, top_n=1000)
    assert report.total_vocabulary == 0
    assert report.coverage_percent == 0.0
