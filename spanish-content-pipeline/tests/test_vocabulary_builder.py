# tests/test_vocabulary_builder.py
from pipeline.models import (
    ChapterWords, SentencePair,
    VocabularyEntry, WordAnnotation,
)
from pipeline.vocabulary_builder import assign_cefr_level, build_vocabulary


# --- Helpers ---

def _word(source, target, lemma, pos, context_note="", similar_words=None):
    return WordAnnotation(
        source=source, target=target, lemma=lemma, pos=pos,
        context_note=context_note, similar_words=similar_words or [],
    )


def _sentence(chapter, index, source, target):
    return SentencePair(chapter=chapter, sentence_index=index, source=source, target=target)


def _chapter(num, sentences, words):
    return ChapterWords(chapter=num, sentences=sentences, words=words)


# --- CEFR assignment (unchanged) ---

def test_assign_cefr_level():
    assert assign_cefr_level(100) == "A1"
    assert assign_cefr_level(500) == "A1"
    assert assign_cefr_level(501) == "A2"
    assert assign_cefr_level(1500) == "A2"
    assert assign_cefr_level(1501) == "B1"
    assert assign_cefr_level(3000) == "B1"
    assert assign_cefr_level(3001) == "B2"
    assert assign_cefr_level(5000) == "B2"
    assert assign_cefr_level(5001) == "C1"
    assert assign_cefr_level(8000) == "C1"
    assert assign_cefr_level(8001) == "C2"
    assert assign_cefr_level(None) is None


# --- Story ordering ---

def test_words_ordered_by_chapter_then_sentence():
    """Words follow story order: chapter 1 before chapter 2, sentence order within."""
    s1 = _sentence(1, 0, "La maleta está lista.", "Der Koffer ist fertig.")
    s2 = _sentence(1, 1, "Charlotte lleva ropa.", "Charlotte trägt Kleidung.")
    s3 = _sentence(2, 0, "Ella toma un taxi.", "Sie nimmt ein Taxi.")

    ch1 = _chapter(1, [s1, s2], [
        _word("maleta", "Koffer", "maleta", "noun"),
        _word("lista", "fertig", "listo", "adjective"),
        _word("ropa", "Kleidung", "ropa", "noun"),
    ])
    ch2 = _chapter(2, [s3], [
        _word("taxi", "Taxi", "taxi", "noun"),
    ])

    chapter_titles = {1: "Preparation", 2: "To the Airport"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    all_words = [w for ch in deck.chapters for w in ch.words]
    ids = [w.id for w in all_words]
    assert ids == ["maleta", "listo", "ropa", "taxi"]
    assert [w.order for w in all_words] == [1, 2, 3, 4]
    assert deck.total_words == 4


# --- Deduplication ---

def test_duplicate_word_assigned_to_first_chapter():
    """When a word appears in chapters 1 and 2, it belongs to chapter 1 only."""
    s1 = _sentence(1, 0, "Está bien.", "Es ist gut.")
    s2 = _sentence(2, 0, "Ella está aquí.", "Sie ist hier.")

    ch1 = _chapter(1, [s1], [
        _word("está", "ist", "estar", "verb"),
        _word("bien", "gut", "bien", "adverb"),
    ])
    ch2 = _chapter(2, [s2], [
        _word("está", "ist", "estar", "verb"),
        _word("aquí", "hier", "aquí", "adverb"),
    ])

    chapter_titles = {1: "Ch1", 2: "Ch2"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    # "estar" should only appear in chapter 1
    ch1_words = deck.chapters[0].words
    ch2_words = deck.chapters[1].words
    assert [w.id for w in ch1_words] == ["estar", "bien"]
    assert [w.id for w in ch2_words] == ["aquí"]


def test_duplicate_word_accumulates_examples():
    """When a word reappears, the new sentence is added to its examples list."""
    s1 = _sentence(1, 0, "Está bien.", "Es ist gut.")
    s2 = _sentence(2, 0, "Ella está aquí.", "Sie ist hier.")

    ch1 = _chapter(1, [s1], [_word("está", "ist", "estar", "verb")])
    ch2 = _chapter(2, [s2], [_word("está", "ist", "estar", "verb")])

    chapter_titles = {1: "Ch1", 2: "Ch2"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    estar = deck.chapters[0].words[0]
    assert len(estar.examples) == 2
    assert estar.examples[0].chapter == 1
    assert estar.examples[1].chapter == 2


def test_duplicate_word_merges_translations():
    """Different translations of the same lemma are merged."""
    s1 = _sentence(1, 0, "Está en casa.", "Er ist zu Hause.")
    s2 = _sentence(2, 0, "Está cansada.", "Sie befindet sich müde.")

    ch1 = _chapter(1, [s1], [_word("está", "ist", "estar", "verb")])
    ch2 = _chapter(2, [s2], [_word("está", "befindet sich", "estar", "verb")])

    chapter_titles = {1: "Ch1", 2: "Ch2"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    estar = deck.chapters[0].words[0]
    assert "ist" in estar.target
    assert "befindet sich" in estar.target


# --- Function word filtering ---

def test_function_words_filtered_out():
    """Articles, prepositions, pronouns, conjunctions are excluded."""
    s1 = _sentence(1, 0, "El perro está en la casa.", "Der Hund ist im Haus.")

    ch1 = _chapter(1, [s1], [
        _word("el", "der", "el", "article"),
        _word("perro", "Hund", "perro", "noun"),
        _word("está", "ist", "estar", "verb"),
        _word("en", "in", "en", "preposition"),
        _word("la", "die", "el", "determiner"),
        _word("casa", "Haus", "casa", "noun"),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    ids = [w.id for w in deck.chapters[0].words]
    assert "perro" in ids
    assert "estar" in ids
    assert "casa" in ids
    assert "el" not in ids
    assert "en" not in ids


def test_pronouns_kept_in_vocabulary():
    """Pronouns are vocabulary that must be taught — they are NOT filtered."""
    s1 = _sentence(1, 0, "Yo tengo un gato.", "Ich habe eine Katze.")

    ch1 = _chapter(1, [s1], [
        _word("yo", "ich", "yo", "pronoun"),
        _word("tengo", "habe", "tener", "verb"),
        _word("gato", "Katze", "gato", "noun"),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    ids = [w.id for w in deck.chapters[0].words]
    assert "yo" in ids  # Pronouns are now kept!
    assert "tener" in ids
    assert "gato" in ids


def test_conjunctions_filtered():
    s1 = _sentence(1, 0, "Perro y gato.", "Hund und Katze.")

    ch1 = _chapter(1, [s1], [
        _word("perro", "Hund", "perro", "noun"),
        _word("y", "und", "y", "conjunction"),
        _word("gato", "Katze", "gato", "noun"),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    ids = [w.id for w in deck.chapters[0].words]
    assert "y" not in ids


# --- Frequency and CEFR ---

def test_frequency_rank_and_cefr_assigned():
    s1 = _sentence(1, 0, "Ella come pan.", "Sie isst Brot.")

    ch1 = _chapter(1, [s1], [
        _word("come", "isst", "comer", "verb"),
        _word("pan", "Brot", "pan", "noun"),
    ])

    freq = {"comer": 400, "pan": 2000}
    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], frequency_data=freq, chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    comer = next(w for w in deck.chapters[0].words if w.id == "comer")
    pan = next(w for w in deck.chapters[0].words if w.id == "pan")
    assert comer.frequency_rank == 400
    assert comer.cefr_level == "A1"
    assert pan.frequency_rank == 2000
    assert pan.cefr_level == "B1"


# --- Similar words ---

def test_similar_words_carried_through():
    s1 = _sentence(1, 0, "El perro corre.", "Der Hund rennt.")

    ch1 = _chapter(1, [s1], [
        _word("perro", "Hund", "perro", "noun", similar_words=["gato", "vaca", "pollo"]),
        _word("corre", "rennt", "correr", "verb", similar_words=["caminar", "saltar"]),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    perro = next(w for w in deck.chapters[0].words if w.id == "perro")
    assert perro.similar_words == ["gato", "vaca", "pollo"]


def test_similar_words_merged_across_chapters():
    """When a word appears in multiple chapters with different similar_words, merge them."""
    s1 = _sentence(1, 0, "El perro.", "Der Hund.")
    s2 = _sentence(2, 0, "Un perro grande.", "Ein großer Hund.")

    ch1 = _chapter(1, [s1], [_word("perro", "Hund", "perro", "noun", similar_words=["gato", "vaca"])])
    ch2 = _chapter(2, [s2], [_word("perro", "Hund", "perro", "noun", similar_words=["caballo", "pájaro"])])

    chapter_titles = {1: "Ch1", 2: "Ch2"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    perro = deck.chapters[0].words[0]
    assert "gato" in perro.similar_words
    assert "vaca" in perro.similar_words
    assert "caballo" in perro.similar_words
    assert "pájaro" in perro.similar_words


# --- Edge cases ---

def test_empty_chapters():
    chapter_titles = {}
    deck = build_vocabulary([], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")
    assert deck.total_words == 0
    assert deck.chapters == []


def test_chapter_with_all_function_words():
    """A chapter where all words are function words produces an empty chapter."""
    s1 = _sentence(1, 0, "El y la.", "Der und die.")

    ch1 = _chapter(1, [s1], [
        _word("el", "der", "el", "article"),
        _word("y", "und", "y", "conjunction"),
        _word("la", "die", "el", "determiner"),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    # Chapter still exists but with no words
    assert len(deck.chapters) == 1
    assert len(deck.chapters[0].words) == 0
    assert deck.total_words == 0
