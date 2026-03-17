"""Tests for chapter_auditor.py."""

from unittest.mock import MagicMock

from pipeline.chapter_auditor import (
    ChapterAuditAction, audit_chapter, apply_chapter_actions,
)
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


def _make_chapter_scene(sentences: list[str], chapter: int = 1) -> ChapterScene:
    """Build a minimal ChapterScene with one scene and one shot per sentence."""
    shots = []
    for i, s in enumerate(sentences):
        shots.append(Shot(
            focus="test",
            image_prompt=f"image for shot {i}",
            sentences=[ShotSentence(source=s, sentence_index=i)],
        ))
    return ChapterScene(
        chapter=chapter,
        scenes=[Scene(setting="test", description="test scene", shots=shots)],
    )


def _make_mock_llm(response: dict) -> MagicMock:
    llm = MagicMock()
    r = MagicMock()
    r.parsed = response
    llm.complete_json.return_value = r
    return llm


def test_audit_chapter_no_issues():
    """Returns empty list when LLM finds no issues."""
    cs = _make_chapter_scene(["María camina.", "Ella sonríe."])
    llm = _make_mock_llm({"actions": []})

    actions, _ = audit_chapter(
        chapter_scene=cs,
        chapter_config={"title": "Test", "cefr_level": "A1", "context": "test"},
        characters=[{"name": "Maria", "role": "protagonist"}],
        llm=llm,
    )
    assert actions == []


def test_audit_chapter_rewrite():
    """Parses rewrite actions from LLM response."""
    cs = _make_chapter_scene(["María camina.", "El padre habla."])
    llm = _make_mock_llm({"actions": [
        {"action": "rewrite", "sentence_index": 1,
         "original": "El padre habla.", "fixed": "Ingrid habla.",
         "reason": "No father character in this chapter"},
    ]})

    actions, _ = audit_chapter(
        chapter_scene=cs,
        chapter_config={"title": "Test", "cefr_level": "A1", "context": "test"},
        characters=[{"name": "Maria", "role": "protagonist"}],
        llm=llm,
    )
    assert len(actions) == 1
    assert actions[0].action == "rewrite"
    assert actions[0].fixed == "Ingrid habla."


def test_audit_chapter_remove_shot():
    """Parses remove_shot actions from LLM response."""
    cs = _make_chapter_scene(["María camina.", "Escena filosófica.", "Ella sonríe."])
    llm = _make_mock_llm({"actions": [
        {"action": "remove_shot", "shot_index": 1,
         "reason": "Philosophical non-sequitur"},
    ]})

    actions, _ = audit_chapter(
        chapter_scene=cs,
        chapter_config={"title": "Test", "cefr_level": "A1", "context": "test"},
        characters=[{"name": "Maria", "role": "protagonist"}],
        llm=llm,
    )
    assert len(actions) == 1
    assert actions[0].action == "remove_shot"
    assert actions[0].shot_index == 1


def test_apply_rewrite():
    """apply_chapter_actions rewrites sentences correctly."""
    cs = _make_chapter_scene(["María camina.", "El padre habla.", "Ella sonríe."])
    actions = [
        ChapterAuditAction(
            action="rewrite", sentence_index=1,
            original="El padre habla.", fixed="Ingrid habla.",
            reason="test",
        ),
    ]

    result = apply_chapter_actions(cs, actions)
    all_sentences = [
        s.source for scene in result.scenes for shot in scene.shots for s in shot.sentences
    ]
    assert all_sentences == ["María camina.", "Ingrid habla.", "Ella sonríe."]


def test_apply_remove_shot():
    """apply_chapter_actions removes shots and re-indexes."""
    cs = _make_chapter_scene(["María camina.", "Bad shot.", "Ella sonríe."])
    actions = [
        ChapterAuditAction(action="remove_shot", shot_index=1, reason="test"),
    ]

    result = apply_chapter_actions(cs, actions)
    all_sentences = [
        s.source for scene in result.scenes for shot in scene.shots for s in shot.sentences
    ]
    assert all_sentences == ["María camina.", "Ella sonríe."]
    # Check re-indexing
    indices = [
        s.sentence_index for scene in result.scenes for shot in scene.shots for s in shot.sentences
    ]
    assert indices == [0, 1]


def test_apply_no_actions_returns_same():
    """Empty actions list returns the original scene."""
    cs = _make_chapter_scene(["María camina."])
    result = apply_chapter_actions(cs, [])
    assert result == cs


def test_audit_chapter_none_llm():
    """Returns empty list when llm is None."""
    cs = _make_chapter_scene(["Test."])
    actions, _ = audit_chapter(cs, {}, [], llm=None)
    assert actions == []


def test_prompt_includes_vocab_preservation_rule():
    """Prompt includes vocabulary preservation guidance (replaced gap-word-specific lists)."""
    prompts = []
    llm = MagicMock()

    def fake(prompt, system=None):
        prompts.append(prompt)
        r = MagicMock()
        r.parsed = {"actions": []}
        return r
    llm.complete_json = fake

    cs = _make_chapter_scene(["María camina."])
    audit_chapter(
        chapter_scene=cs,
        chapter_config={"title": "Test", "cefr_level": "A1", "context": "test"},
        characters=[],
        llm=llm,
        gap_words=["caminar", "casa"],
    )
    assert "VOCABULARY PRESERVATION" in prompts[0]
    assert "focus word" in prompts[0]
    assert "caminar, casa" in prompts[0]


def test_prompt_includes_chapter_content():
    """Prompt includes shot image prompts and sentence text."""
    prompts = []
    llm = MagicMock()

    def fake(prompt, system=None):
        prompts.append(prompt)
        r = MagicMock()
        r.parsed = {"actions": []}
        return r
    llm.complete_json = fake

    cs = _make_chapter_scene(["María camina por el parque."])
    audit_chapter(
        chapter_scene=cs,
        chapter_config={"title": "Walk", "cefr_level": "A1", "context": "park scene"},
        characters=[{"name": "Maria", "role": "protagonist"}],
        llm=llm,
    )
    assert "María camina por el parque" in prompts[0]
    assert "image for shot 0" in prompts[0]
    assert "Maria" in prompts[0]


def test_apply_combined_rewrite_and_remove():
    """Both rewrite and remove_shot in the same action set."""
    cs = _make_chapter_scene(["Good.", "Fix me.", "Remove me.", "Keep."])
    actions = [
        ChapterAuditAction(action="rewrite", sentence_index=1,
                           original="Fix me.", fixed="Fixed!", reason="test"),
        ChapterAuditAction(action="remove_shot", shot_index=2, reason="test"),
    ]

    result = apply_chapter_actions(cs, actions)
    all_sentences = [
        s.source for scene in result.scenes for shot in scene.shots for s in shot.sentences
    ]
    assert all_sentences == ["Good.", "Fixed!", "Keep."]
    indices = [
        s.sentence_index for scene in result.scenes for shot in scene.shots for s in shot.sentences
    ]
    assert indices == [0, 1, 2]


def test_apply_move_shot():
    """move_shot relocates a shot to a new position."""
    cs = _make_chapter_scene(["A.", "B.", "C.", "D."])
    # Move shot 3 ("D.") to after shot 0 ("A.")
    actions = [
        ChapterAuditAction(action="move_shot", shot_index=3, move_after=0, reason="test"),
    ]

    result = apply_chapter_actions(cs, actions)
    all_sentences = [
        s.source for scene in result.scenes for shot in scene.shots for s in shot.sentences
    ]
    assert all_sentences == ["A.", "D.", "B.", "C."]
    indices = [
        s.sentence_index for scene in result.scenes for shot in scene.shots for s in shot.sentences
    ]
    assert indices == [0, 1, 2, 3]


def test_apply_move_shot_to_beginning():
    """move_shot with move_after=-1 moves shot to the beginning."""
    cs = _make_chapter_scene(["A.", "B.", "C."])
    actions = [
        ChapterAuditAction(action="move_shot", shot_index=2, move_after=-1, reason="test"),
    ]

    result = apply_chapter_actions(cs, actions)
    all_sentences = [
        s.source for scene in result.scenes for shot in scene.shots for s in shot.sentences
    ]
    assert all_sentences == ["C.", "A.", "B."]


def test_apply_move_and_rewrite_combined():
    """move_shot and rewrite can be applied together."""
    cs = _make_chapter_scene(["A.", "B.", "C.", "D."])
    actions = [
        ChapterAuditAction(action="rewrite", sentence_index=1,
                           original="B.", fixed="B fixed.", reason="test"),
        ChapterAuditAction(action="move_shot", shot_index=3, move_after=0, reason="test"),
    ]

    result = apply_chapter_actions(cs, actions)
    all_sentences = [
        s.source for scene in result.scenes for shot in scene.shots for s in shot.sentences
    ]
    assert all_sentences == ["A.", "D.", "B fixed.", "C."]
