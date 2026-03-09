# test_sentence_inserter.py
"""Tests for sentence insertion and re-indexing."""
import json
from pathlib import Path

from pipeline.models import (
    ChapterScene, GapSentence, GrammarGapSentence, Scene, Shot, ShotSentence, SentencePair,
)
from pipeline.sentence_inserter import (
    insert_into_chapter_scene, insert_sentences, reindex_translations,
)


def test_insert_single_sentence():
    existing = [
        SentencePair(chapter=1, sentence_index=0, source="A.", target="A_de."),
        SentencePair(chapter=1, sentence_index=1, source="B.", target="B_de."),
        SentencePair(chapter=1, sentence_index=2, source="C.", target="C_de."),
    ]
    new = [GapSentence(source="X.", target="X_de.", covers=["x"], insert_after=1)]

    result = insert_sentences(existing, new)
    sources = [s.source for s in result]
    assert sources == ["A.", "B.", "X.", "C."]
    # Re-indexed
    indices = [s.sentence_index for s in result]
    assert indices == [0, 1, 2, 3]


def test_insert_multiple_at_same_position():
    existing = [
        SentencePair(chapter=1, sentence_index=0, source="A.", target="A_de."),
        SentencePair(chapter=1, sentence_index=1, source="B.", target="B_de."),
    ]
    new = [
        GapSentence(source="X.", target="X_de.", covers=["x"], insert_after=0),
        GapSentence(source="Y.", target="Y_de.", covers=["y"], insert_after=0),
    ]

    result = insert_sentences(existing, new)
    sources = [s.source for s in result]
    assert sources == ["A.", "X.", "Y.", "B."]


def test_insert_after_minus_one_appends():
    existing = [
        SentencePair(chapter=1, sentence_index=0, source="A.", target="A_de."),
    ]
    new = [GapSentence(source="Z.", target="Z_de.", covers=["z"], insert_after=-1)]

    result = insert_sentences(existing, new)
    sources = [s.source for s in result]
    assert sources == ["A.", "Z."]


def test_grammar_gap_sentences_also_work():
    existing = [
        SentencePair(chapter=1, sentence_index=0, source="A.", target="A_de."),
        SentencePair(chapter=1, sentence_index=1, source="B.", target="B_de."),
    ]
    new = [GrammarGapSentence(
        source="G.", target="G_de.", grammar_target="subjunctive",
        cefr_level="B1", chapter=1, insert_after=0,
    )]

    result = insert_sentences(existing, new)
    sources = [s.source for s in result]
    assert sources == ["A.", "G.", "B."]


def test_reindex_translations_file(tmp_path):
    trans_dir = tmp_path / "translations"
    trans_dir.mkdir()
    data = [
        {"chapter": 1, "sentence_index": 0, "source": "A.", "target": "A_de."},
        {"chapter": 1, "sentence_index": 1, "source": "NEW.", "target": "NEW_de."},
        {"chapter": 1, "sentence_index": 2, "source": "B.", "target": "B_de."},
    ]
    path = trans_dir / "chapter_01.json"
    path.write_text(json.dumps(data))

    reindex_translations(path)

    result = json.loads(path.read_text())
    indices = [s["sentence_index"] for s in result]
    assert indices == [0, 1, 2]


def _make_chapter_scene(sentences: list[str]) -> ChapterScene:
    """Helper: create a ChapterScene with one scene, one shot, given sentences."""
    return ChapterScene(
        chapter=1,
        scenes=[Scene(
            setting="test_room",
            description="A test room.",
            shots=[Shot(
                focus="test",
                image_prompt="test prompt",
                sentences=[
                    ShotSentence(source=s, sentence_index=i)
                    for i, s in enumerate(sentences)
                ],
            )],
        )],
    )


def test_insert_into_chapter_scene_basic():
    """Gap sentences are inserted into the ChapterScene at the right positions."""
    cs = _make_chapter_scene(["A.", "B.", "C."])
    new = [GrammarGapSentence(
        source="X.", grammar_target="test", cefr_level="A1",
        chapter=1, insert_after=1,
    )]

    result = insert_into_chapter_scene(cs, new)
    sources = [s.source for shot in result.scenes[0].shots for s in shot.sentences]
    assert sources == ["A.", "B.", "X.", "C."]
    # Re-indexed
    indices = [s.sentence_index for shot in result.scenes[0].shots for s in shot.sentences]
    assert indices == [0, 1, 2, 3]


def test_insert_into_chapter_scene_append():
    """insert_after=-1 appends to the last shot."""
    cs = _make_chapter_scene(["A.", "B."])
    new = [GapSentence(source="Z.", covers=["z"], insert_after=-1)]

    result = insert_into_chapter_scene(cs, new)
    sources = [s.source for shot in result.scenes[0].shots for s in shot.sentences]
    assert sources == ["A.", "B.", "Z."]


def test_insert_into_chapter_scene_no_mutation():
    """Original ChapterScene is not modified."""
    cs = _make_chapter_scene(["A.", "B."])
    new = [GapSentence(source="X.", covers=["x"], insert_after=0)]

    result = insert_into_chapter_scene(cs, new)
    # Original unchanged
    orig_sources = [s.source for shot in cs.scenes[0].shots for s in shot.sentences]
    assert orig_sources == ["A.", "B."]
    # Result has insertion
    result_sources = [s.source for shot in result.scenes[0].shots for s in shot.sentences]
    assert result_sources == ["A.", "X.", "B."]


def test_insert_into_chapter_scene_empty_new_returns_same():
    """No new sentences returns the original scene unchanged."""
    cs = _make_chapter_scene(["A."])
    result = insert_into_chapter_scene(cs, [])
    assert result.scenes[0].shots[0].sentences[0].source == "A."
