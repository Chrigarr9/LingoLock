# test_sentence_inserter.py
"""Tests for sentence insertion and re-indexing."""
import json
from pathlib import Path

from pipeline.models import GapSentence, GrammarGapSentence, SentencePair
from pipeline.sentence_inserter import insert_sentences, reindex_translations


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
