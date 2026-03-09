# tests/test_coverage_checker.py
from pipeline.coverage_checker import load_frequency_data, check_coverage
from pipeline.models import VocabularyEntry, OrderedDeck, DeckChapter


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


def test_check_coverage_basic():
    """Vocabulary entries are matched against frequency words via spaCy lemmatization."""
    vocab = [
        VocabularyEntry(id="estar", source="estar", target=["sein"], pos="verb",
                        frequency_rank=3, cefr_level="A1", examples=[]),
        VocabularyEntry(id="ser", source="ser", target=["sein"], pos="verb",
                        frequency_rank=4, cefr_level="A1", examples=[]),
    ]
    frequency_data = {"de": 1, "la": 2, "estar": 3, "ser": 4, "tener": 5}
    report = check_coverage(vocab, frequency_data, top_n=5, lang="es")

    assert report.total_vocabulary == 2
    assert report.top_1000_covered >= 2  # estar and ser; de/la filtered as function words
    assert "tener" in report.missing_words


def test_check_coverage_resolves_inflections():
    """Frequency words that are inflected forms of vocabulary lemmas are covered."""
    vocab = [
        VocabularyEntry(id="ir", source="ir", target=["gehen"], pos="verb",
                        frequency_rank=10, cefr_level="A1", examples=[]),
    ]
    # "va" lemmatizes to "ir" via spaCy
    frequency_data = {"va": 1, "ir": 2}
    report = check_coverage(vocab, frequency_data, top_n=10, lang="es")

    # Both "va" and "ir" should resolve to "ir" and be covered
    assert report.top_1000_covered >= 2


def test_check_coverage_filters_inappropriate():
    """Words marked inappropriate are excluded from missing list."""
    vocab = []
    frequency_data = {"restaurante": 1, "disparar": 2}
    inappropriate = {"disparar"}
    report = check_coverage(vocab, frequency_data, top_n=10, lang="es",
                            inappropriate_lemmas=inappropriate)

    assert "disparar" not in report.missing_words
    assert "restaurante" in report.missing_words


def test_check_coverage_deduplicates_missing_at_lemma_level():
    """Multiple inflected forms of the same missing lemma produce one entry."""
    vocab = []
    # "mira" and "mirar" both lemmatize to "mirar"
    frequency_data = {"mira": 1, "mirar": 2, "restaurante": 3}
    report = check_coverage(vocab, frequency_data, top_n=10, lang="es")

    # Should have "mirar" once, not "mira" + "mirar"
    mirar_count = sum(1 for w in report.missing_words if w == "mirar")
    assert mirar_count == 1


def test_check_coverage_with_ordered_deck():
    deck = OrderedDeck(
        deck_id="test", deck_name="Test", total_words=1,
        chapters=[DeckChapter(chapter=1, title="Ch1", words=[
            VocabularyEntry(id="caminar", source="caminar", target=["gehen"], pos="verb",
                            frequency_rank=100, cefr_level="A1", first_chapter=1,
                            order=1, examples=[], similar_words=[]),
        ])],
    )
    frequency_data = {"camina": 1, "caminar": 2}
    report = check_coverage(deck, frequency_data, top_n=10, lang="es")
    # Both resolve to "caminar" which is in vocab
    assert report.top_1000_covered >= 2


def test_check_coverage_extra_thresholds():
    vocab = [
        VocabularyEntry(id="casa", source="casa", target=["Haus"], pos="noun",
                        frequency_rank=50, cefr_level="A1", examples=[]),
    ]
    frequency_data = {"casa": 50, "perro": 100, "gato": 1500}
    report = check_coverage(vocab, frequency_data, top_n=1000, lang="es",
                            extra_thresholds=[2000])
    assert "top_2000" in report.thresholds
