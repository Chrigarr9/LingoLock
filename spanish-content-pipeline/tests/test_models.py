# tests/test_models.py
from pipeline.models import (
    SentencePair,
    WordAnnotation,
    ChapterWords,
    VocabularyEntry,
    CoverageReport,
)


def test_sentence_pair_creation():
    pair = SentencePair(
        chapter=1,
        sentence_index=0,
        source="Charlotte est\u00e1 en su habitaci\u00f3n.",
        target="Charlotte ist in ihrem Zimmer.",
    )
    assert pair.chapter == 1
    assert pair.source == "Charlotte est\u00e1 en su habitaci\u00f3n."
    assert pair.target == "Charlotte ist in ihrem Zimmer."


def test_word_annotation_creation():
    word = WordAnnotation(
        source="est\u00e1",
        target="ist",
        lemma="estar",
        pos="verb",
        context_note="3rd person singular present",
    )
    assert word.lemma == "estar"
    assert word.pos == "verb"


def test_chapter_words_contains_sentence_and_words():
    chapter = ChapterWords(
        chapter=1,
        sentences=[
            SentencePair(
                chapter=1,
                sentence_index=0,
                source="Hola.",
                target="Hallo.",
            )
        ],
        words=[
            WordAnnotation(
                source="Hola",
                target="Hallo",
                lemma="hola",
                pos="interjection",
                context_note="greeting",
            )
        ],
    )
    assert len(chapter.sentences) == 1
    assert len(chapter.words) == 1


def test_vocabulary_entry_multiple_translations():
    entry = VocabularyEntry(
        id="estar",
        source="estar",
        target=["sein", "sich befinden"],
        pos="verb",
        frequency_rank=3,
        cefr_level="A1",
        examples=[],
    )
    assert len(entry.target) == 2
    assert entry.cefr_level == "A1"


def test_vocabulary_entry_optional_fields():
    entry = VocabularyEntry(
        id="obscure_word",
        source="obscure",
        target=["obscure_translation"],
        pos="noun",
        examples=[],
    )
    assert entry.frequency_rank is None
    assert entry.cefr_level is None


def test_coverage_report():
    report = CoverageReport(
        total_vocabulary=150,
        frequency_matched=120,
        top_1000_covered=85,
        top_1000_total=1000,
        coverage_percent=8.5,
        missing_top_100=[],
    )
    assert report.coverage_percent == 8.5
