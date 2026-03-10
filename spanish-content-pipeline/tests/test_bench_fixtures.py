"""Validate benchmark fixtures are well-formed and internally consistent."""
import json
from pathlib import Path

import pytest
import yaml

from pipeline.config import DeckConfig
from pipeline.models import ChapterScene


FIXTURES = Path(__file__).resolve().parent.parent / "benchmarks" / "fixtures"


def test_test_chapter_yaml_loads_as_deck_config():
    raw = yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text())
    config = DeckConfig(**raw)
    assert config.chapter_count == 1
    assert config.protagonist.name == "Maria"
    assert len(config.secondary_characters) >= 1


def test_poisoned_chapter_loads_as_chapter_scene():
    data = json.loads((FIXTURES / "poisoned_chapter.json").read_text())
    cs = ChapterScene(**data)
    assert cs.chapter == 1
    total_sentences = sum(
        len(shot.sentences)
        for scene in cs.scenes
        for shot in scene.shots
    )
    assert total_sentences >= 15


def test_raw_chapter_loads_as_chapter_scene():
    data = json.loads((FIXTURES / "raw_chapter.json").read_text())
    cs = ChapterScene(**data)
    assert cs.chapter == 1


def test_expected_issues_reference_valid_sentence_indices():
    poisoned = ChapterScene(**json.loads((FIXTURES / "poisoned_chapter.json").read_text()))
    expected = json.loads((FIXTURES / "expected_issues.json").read_text())

    all_indices = set()
    for scene in poisoned.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                all_indices.add(sent.sentence_index)

    for issue in expected["issues"]:
        assert issue["sentence_index"] in all_indices


def test_expected_issues_have_required_fields():
    expected = json.loads((FIXTURES / "expected_issues.json").read_text())
    required = {"sentence_index", "category", "description"}
    for issue in expected["issues"]:
        missing = required - set(issue.keys())
        assert not missing


def test_reference_translations_match_poisoned_chapter():
    poisoned = ChapterScene(**json.loads((FIXTURES / "poisoned_chapter.json").read_text()))
    translations = json.loads((FIXTURES / "reference_translations.json").read_text())

    total = sum(
        len(shot.sentences)
        for scene in poisoned.scenes
        for shot in scene.shots
    )
    assert len(translations["pairs"]) == total


def test_reference_words_have_required_fields():
    words = json.loads((FIXTURES / "reference_words.json").read_text())
    required = {"source", "lemma", "pos"}
    for word in words["words"]:
        missing = required - set(word.keys())
        assert not missing
