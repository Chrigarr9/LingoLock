# tests/test_vocabulary_builder.py
from pipeline.models import ChapterWords, SentencePair, WordAnnotation, VocabularyEntry
from pipeline.vocabulary_builder import build_vocabulary, assign_cefr_level


def test_build_vocabulary_deduplicates_by_lemma():
    ch1 = ChapterWords(
        chapter=1,
        sentences=[SentencePair(chapter=1, sentence_index=0, source="Está bien.", target="Es ist gut.")],
        words=[
            WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="3rd person"),
            WordAnnotation(source="bien", target="gut", lemma="bien", pos="adverb", context_note=""),
        ],
    )
    ch2 = ChapterWords(
        chapter=2,
        sentences=[SentencePair(chapter=2, sentence_index=0, source="Ella está aquí.", target="Sie ist hier.")],
        words=[
            WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="3rd person"),
            WordAnnotation(source="aquí", target="hier", lemma="aquí", pos="adverb", context_note=""),
        ],
    )

    vocab = build_vocabulary([ch1, ch2])

    # "estar" appears in both chapters but should be deduplicated
    lemmas = [v.id for v in vocab]
    assert lemmas.count("estar") == 1
    assert len(vocab) == 3  # estar, bien, aquí


def test_build_vocabulary_merges_examples():
    ch1 = ChapterWords(
        chapter=1,
        sentences=[SentencePair(chapter=1, sentence_index=0, source="Está bien.", target="Es ist gut.")],
        words=[WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="")],
    )
    ch2 = ChapterWords(
        chapter=2,
        sentences=[SentencePair(chapter=2, sentence_index=0, source="Ella está aquí.", target="Sie ist hier.")],
        words=[WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="")],
    )

    vocab = build_vocabulary([ch1, ch2])
    estar = next(v for v in vocab if v.id == "estar")

    # Should have examples from both chapters
    assert len(estar.examples) == 2


def test_build_vocabulary_merges_translations():
    ch1 = ChapterWords(
        chapter=1,
        sentences=[SentencePair(chapter=1, sentence_index=0, source="Está en casa.", target="Er ist zu Hause.")],
        words=[WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="")],
    )
    ch2 = ChapterWords(
        chapter=2,
        sentences=[SentencePair(chapter=2, sentence_index=0, source="Está cansada.", target="Sie befindet sich müde.")],
        words=[WordAnnotation(source="está", target="befindet sich", lemma="estar", pos="verb", context_note="")],
    )

    vocab = build_vocabulary([ch1, ch2])
    estar = next(v for v in vocab if v.id == "estar")

    assert "ist" in estar.target
    assert "befindet sich" in estar.target


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
