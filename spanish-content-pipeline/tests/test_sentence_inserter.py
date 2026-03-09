# test_sentence_inserter.py
"""Tests for sentence insertion into ChapterScene structures."""

from pipeline.models import (
    ChapterScene, GapSentence, GrammarGapSentence, Scene, Shot, ShotSentence,
)
from pipeline.sentence_inserter import insert_into_chapter_scene


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
