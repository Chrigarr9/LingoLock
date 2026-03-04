# tests/test_models.py
from pipeline.models import (
    SentencePair,
    WordAnnotation,
    ChapterWords,
    VocabularyEntry,
    CoverageReport,
    DeckChapter,
    OrderedDeck,
    ImagePrompt,
    ImageManifestEntry,
    ImageManifest,
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


def test_word_annotation_with_similar_words():
    word = WordAnnotation(
        source="perro",
        target="Hund",
        lemma="perro",
        pos="noun",
        context_note="masculine singular",
        similar_words=["gato", "vaca", "pollo", "caballo", "pájaro", "pez"],
    )
    assert len(word.similar_words) == 6
    assert "gato" in word.similar_words


def test_word_annotation_similar_words_defaults_empty():
    word = WordAnnotation(
        source="está",
        target="ist",
        lemma="estar",
        pos="verb",
        context_note="3rd person",
    )
    assert word.similar_words == []


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


def test_vocabulary_entry_with_ordering_fields():
    entry = VocabularyEntry(
        id="maleta",
        source="maleta",
        target=["Koffer"],
        pos="noun",
        frequency_rank=4231,
        cefr_level="B2",
        first_chapter=1,
        order=1,
        examples=[],
        similar_words=["bolsa", "mochila", "equipaje"],
    )
    assert entry.first_chapter == 1
    assert entry.order == 1
    assert len(entry.similar_words) == 3


def test_vocabulary_entry_ordering_fields_default():
    entry = VocabularyEntry(
        id="test",
        source="test",
        target=["Test"],
        pos="noun",
        examples=[],
    )
    assert entry.first_chapter == 0
    assert entry.order == 0
    assert entry.similar_words == []


def test_deck_chapter():
    chapter = DeckChapter(
        chapter=1,
        title="Preparation",
        words=[
            VocabularyEntry(
                id="maleta", source="maleta", target=["Koffer"],
                pos="noun", first_chapter=1, order=1, examples=[], similar_words=[],
            )
        ],
    )
    assert chapter.chapter == 1
    assert len(chapter.words) == 1


def test_ordered_deck():
    deck = OrderedDeck(
        deck_id="es-de-buenos-aires",
        deck_name="Spanish with Charlotte",
        total_words=1,
        chapters=[
            DeckChapter(
                chapter=1,
                title="Preparation",
                words=[
                    VocabularyEntry(
                        id="maleta", source="maleta", target=["Koffer"],
                        pos="noun", first_chapter=1, order=1, examples=[], similar_words=[],
                    )
                ],
            )
        ],
    )
    assert deck.total_words == 1
    assert deck.chapters[0].title == "Preparation"


def test_image_prompt_character_scene():
    prompt = ImagePrompt(
        chapter=1,
        sentence_index=0,
        source="María está en su habitación.",
        image_type="character_scene",
        characters=["protagonist"],
        prompt="A young woman folding clothes in a cozy bedroom",
        setting="maria_bedroom_berlin",
    )
    assert prompt.image_type == "character_scene"
    assert "protagonist" in prompt.characters


def test_image_prompt_scene_only():
    prompt = ImagePrompt(
        chapter=2,
        sentence_index=3,
        source="Las calles están llenas de gente.",
        image_type="scene_only",
        characters=[],
        prompt="A busy street with colorful buildings",
        setting="buenos_aires_street",
    )
    assert prompt.characters == []


def test_image_manifest_entry():
    entry = ImageManifestEntry(file="images/ch01_s00.webp", status="success")
    assert entry.status == "success"
    assert entry.error is None


def test_image_manifest_entry_failed():
    entry = ImageManifestEntry(file=None, status="failed", error="API timeout")
    assert entry.file is None


def test_image_manifest():
    manifest = ImageManifest(
        reference="references/protagonist.webp",
        model_character="flux-kontext-dev",
        model_scene="flux-schnell",
        images={"ch01_s00": ImageManifestEntry(file="images/ch01_s00.webp", status="success")},
    )
    assert manifest.images["ch01_s00"].status == "success"


# --- Scene hierarchy models ---

from pipeline.models import (
    ShotSentence, Shot, Scene, ChapterScene, ImagePromptResult,
)


def test_chapter_scene_round_trip():
    """ChapterScene can be constructed and serialized."""
    chapter = ChapterScene(
        chapter=1,
        scenes=[
            Scene(
                setting="maria_bedroom_berlin",
                description="A cozy bedroom with warm lamp light",
                shots=[
                    Shot(
                        focus="open suitcase on bed",
                        image_prompt="A cozy bedroom with a large open suitcase on the bed, clothes spilling out",
                        sentences=[
                            ShotSentence(source="María está en su habitación.", sentence_index=0),
                            ShotSentence(source="Ella tiene una maleta grande.", sentence_index=1),
                        ],
                    ),
                    Shot(
                        focus="travel guide on nightstand",
                        image_prompt="A nightstand with a brightly colored travel guide book prominently placed",
                        sentences=[
                            ShotSentence(source="Hay una guía de Buenos Aires.", sentence_index=2),
                        ],
                    ),
                ],
            ),
        ],
    )
    data = chapter.model_dump()
    assert data["chapter"] == 1
    assert len(data["scenes"]) == 1
    assert len(data["scenes"][0]["shots"]) == 2
    assert data["scenes"][0]["shots"][0]["sentences"][0]["source"] == "María está en su habitación."

    # Round-trip
    restored = ChapterScene(**data)
    assert restored == chapter


def test_image_prompt_result_in_models():
    """ImagePromptResult is importable from models and works as Pydantic model."""
    result = ImagePromptResult(
        style="warm storybook illustration",
        sentences=[
            ImagePrompt(
                chapter=1, sentence_index=0,
                source="Test.", image_type="scene_only",
                prompt="A test scene", setting="test",
            ),
        ],
    )
    assert result.style == "warm storybook illustration"
    assert result.protagonist_prompt == ""
    assert len(result.sentences) == 1
