# tests/test_coverage_checker.py
from pathlib import Path

from pipeline.coverage_checker import load_frequency_data, check_coverage
from pipeline.models import FrequencyLemmaEntry, VocabularyEntry, OrderedDeck, DeckChapter


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
    assert report.top_1000_covered == 2   # estar(3) and ser(4) are content words in top 5
    # "de" and "la" are function words and filtered out — only 3 content words remain
    assert report.top_1000_total == 3
    assert report.coverage_percent == round(2 / 3 * 100, 1)  # 66.7%
    assert "de" not in report.missing_words
    assert "tener" in report.missing_words


def test_check_coverage_empty_vocab():
    report = check_coverage([], {"de": 1, "la": 2}, top_n=1000)
    assert report.total_vocabulary == 0
    assert report.coverage_percent == 0.0


def test_check_coverage_with_ordered_deck():
    deck = OrderedDeck(
        deck_id="test",
        deck_name="Test",
        total_words=2,
        chapters=[
            DeckChapter(
                chapter=1,
                title="Ch1",
                words=[
                    VocabularyEntry(id="estar", source="estar", target=["sein"], pos="verb",
                                    frequency_rank=3, cefr_level="A1", first_chapter=1,
                                    order=1, examples=[], similar_words=[]),
                    VocabularyEntry(id="ser", source="ser", target=["sein"], pos="verb",
                                    frequency_rank=4, cefr_level="A1", first_chapter=1,
                                    order=2, examples=[], similar_words=[]),
                ],
            )
        ],
    )
    frequency_data = {"de": 1, "la": 2, "estar": 3, "ser": 4, "tener": 5}

    report = check_coverage(deck, frequency_data, top_n=5)

    assert report.total_vocabulary == 2
    assert report.frequency_matched == 2
    assert report.top_1000_covered == 2
    # "de" and "la" are function words — filtered to 3 content words
    assert report.top_1000_total == 3
    assert report.coverage_percent == round(2 / 3 * 100, 1)  # 66.7%


def test_check_coverage_uses_frequency_lemmas():
    """frequency_lemmas provides lemma resolution for inflected forms."""
    vocab = [
        VocabularyEntry(id="ir", source="ir", target=["gehen"], pos="verb",
                        frequency_rank=10, cefr_level="A1", examples=[]),
    ]
    frequency_data = {"voy": 1, "vas": 2, "ir": 3, "restaurante": 4}
    frequency_lemmas = {
        "voy": FrequencyLemmaEntry(lemma="ir", appropriate=True),
        "vas": FrequencyLemmaEntry(lemma="ir", appropriate=True),
    }

    report = check_coverage(vocab, frequency_data, top_n=10,
                            frequency_lemmas=frequency_lemmas)

    # voy and vas resolve to "ir" which we have — should be covered
    assert report.top_1000_covered == 3  # ir, voy, vas all resolve to "ir"


def test_check_coverage_filters_inappropriate_words():
    """Words marked appropriate=False are excluded from missing list."""
    vocab = []
    frequency_data = {"restaurante": 1, "disparar": 2, "asesino": 3}
    frequency_lemmas = {
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
        "disparar": FrequencyLemmaEntry(lemma="disparar", appropriate=False),
        "asesino": FrequencyLemmaEntry(lemma="asesino", appropriate=False),
    }

    report = check_coverage(vocab, frequency_data, top_n=10,
                            frequency_lemmas=frequency_lemmas)

    # disparar and asesino filtered out; only restaurante is a genuine gap
    assert "disparar" not in report.missing_words
    assert "asesino" not in report.missing_words
    assert "restaurante" in report.missing_words


def test_missing_words_are_deduplicated_at_lemma_level():
    """Missing words should be lemmas, not raw inflected forms. Multiple inflected
    forms of the same missing lemma should produce only one entry."""
    vocab = []  # Empty deck — nothing covered
    # "creo", "crees", "creer" all resolve to lemma "creer"
    # "restaurante" resolves to itself
    frequency_data = {"creo": 1, "crees": 2, "creer": 3, "restaurante": 4}
    frequency_lemmas = {
        "creo": FrequencyLemmaEntry(lemma="creer", appropriate=True),
        "crees": FrequencyLemmaEntry(lemma="creer", appropriate=True),
        "creer": FrequencyLemmaEntry(lemma="creer", appropriate=True),
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
    }

    report = check_coverage(vocab, frequency_data, top_n=10,
                            frequency_lemmas=frequency_lemmas)

    # Should have exactly 2 missing LEMMAS: "creer" and "restaurante"
    # NOT 4 raw forms (creo, crees, creer, restaurante)
    assert "creo" not in report.missing_words  # raw form, not lemma
    assert "crees" not in report.missing_words  # raw form, not lemma
    assert "creer" in report.missing_words  # the lemma
    assert "restaurante" in report.missing_words
    assert len(report.missing_words) == 2
