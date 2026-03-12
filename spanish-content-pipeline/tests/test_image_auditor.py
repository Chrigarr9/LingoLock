"""Tests for image auditor (scene review + prompt generation)."""
from unittest.mock import MagicMock

from pipeline.image_auditor import (
    ReviewedShot,
    ReviewedScene,
    ShotPrompt,
    review_scenes,
    apply_scene_review,
    generate_prompts,
    apply_prompts,
)
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


def _make_chapter(shots_config: list[list[int]]) -> ChapterScene:
    """Build a chapter where each inner list is the sentence_indices for one shot."""
    shots = []
    for idx, sent_indices in enumerate(shots_config):
        sents = [
            ShotSentence(source=f"Sentence {i}.", sentence_index=i)
            for i in sent_indices
        ]
        shots.append(Shot(
            focus=f"focus_{idx}",
            image_prompt=f"old prompt {idx}",
            sentences=sents,
        ))
    return ChapterScene(chapter=1, scenes=[
        Scene(setting="test_setting", description="A test scene", shots=shots),
    ])


def test_review_scenes_parses_llm_response():
    """review_scenes returns ReviewedScene list from LLM JSON."""
    llm = MagicMock()
    llm.complete_json.return_value = MagicMock(
        parsed={
            "scenes": [{
                "setting": "test_setting",
                "shots": [
                    {"focus": "suitcase", "sentence_indices": [0, 1]},
                    {"focus": "window", "sentence_indices": [2]},
                    {"focus": "doorway", "sentence_indices": [3, 4]},
                ],
            }],
        },
    )

    chapter = _make_chapter([[0, 1, 2, 3, 4]])
    scenes, resp = review_scenes(chapter, llm)

    assert len(scenes) == 1
    assert len(scenes[0].shots) == 3
    assert scenes[0].shots[0].sentence_indices == [0, 1]
    assert scenes[0].shots[2].focus == "doorway"
    llm.complete_json.assert_called_once()


def test_review_scenes_no_llm_returns_empty():
    scenes, resp = review_scenes(_make_chapter([[0]]), llm=None)
    assert scenes == []
    assert resp is None


def test_apply_scene_review_restructures_shots():
    """Splits a 4-sentence shot into two 2-sentence shots."""
    chapter = _make_chapter([[0, 1, 2, 3]])

    reviewed = [ReviewedScene(
        setting="test_setting",
        shots=[
            ReviewedShot(focus="close-up of hands", sentence_indices=[0, 1]),
            ReviewedShot(focus="wide view of room", sentence_indices=[2, 3]),
        ],
    )]

    result = apply_scene_review(chapter, reviewed)

    assert len(result.scenes[0].shots) == 2
    assert result.scenes[0].shots[0].focus == "close-up of hands"
    assert [s.sentence_index for s in result.scenes[0].shots[0].sentences] == [0, 1]
    assert result.scenes[0].shots[1].focus == "wide view of room"
    assert [s.sentence_index for s in result.scenes[0].shots[1].sentences] == [2, 3]
    # image_prompt cleared — will be filled by generate_prompts
    assert result.scenes[0].shots[0].image_prompt == ""
    # Setting + description preserved from original
    assert result.scenes[0].setting == "test_setting"
    assert result.scenes[0].description == "A test scene"


def test_apply_scene_review_preserves_normal_shots():
    """Shots already ≤2 sentences pass through unchanged in structure."""
    chapter = _make_chapter([[0, 1], [2]])

    reviewed = [ReviewedScene(
        setting="test_setting",
        shots=[
            ReviewedShot(focus="focus_0", sentence_indices=[0, 1]),
            ReviewedShot(focus="focus_1", sentence_indices=[2]),
        ],
    )]

    result = apply_scene_review(chapter, reviewed)
    assert len(result.scenes[0].shots) == 2
    assert [s.sentence_index for s in result.scenes[0].shots[0].sentences] == [0, 1]


def test_generate_prompts_parses_llm_response():
    """generate_prompts returns ShotPrompt list from LLM JSON."""
    llm = MagicMock()
    llm.complete_json.return_value = MagicMock(
        parsed={
            "prompts": [
                {"scene_index": 0, "shot_index": 0, "prompt": "Close-up of a red suitcase on a bed"},
                {"scene_index": 0, "shot_index": 1, "prompt": "Medium shot of a woman by window"},
            ],
        },
    )

    chapter = _make_chapter([[0, 1], [2]])
    characters = [
        {"name": "Maria", "role": "protagonist", "image_tag": "young woman, teal cardigan"},
    ]

    prompts, resp = generate_prompts(chapter, characters, llm)

    assert len(prompts) == 2
    assert prompts[0].scene_index == 0
    assert prompts[0].shot_index == 0
    assert "suitcase" in prompts[0].prompt
    llm.complete_json.assert_called_once()


def test_generate_prompts_no_llm_returns_empty():
    prompts, resp = generate_prompts(_make_chapter([[0]]), [], llm=None)
    assert prompts == []
    assert resp is None


def test_apply_prompts_sets_image_prompt():
    """apply_prompts writes prompt string into each shot."""
    chapter = _make_chapter([[0, 1], [2]])
    prompts = [
        ShotPrompt(scene_index=0, shot_index=0, prompt="A red suitcase"),
        ShotPrompt(scene_index=0, shot_index=1, prompt="A window scene"),
    ]

    result = apply_prompts(chapter, prompts)

    assert result.scenes[0].shots[0].image_prompt == "A red suitcase"
    assert result.scenes[0].shots[1].image_prompt == "A window scene"


def test_apply_prompts_skips_missing_shots():
    """If a prompt references a non-existent shot, other shots still get updated."""
    chapter = _make_chapter([[0]])
    prompts = [
        ShotPrompt(scene_index=0, shot_index=0, prompt="Valid prompt"),
        ShotPrompt(scene_index=5, shot_index=9, prompt="Ghost prompt"),
    ]

    result = apply_prompts(chapter, prompts)
    assert result.scenes[0].shots[0].image_prompt == "Valid prompt"


def test_build_prompt_generation_includes_characters():
    """Prompt generation prompt lists characters with their image_tags."""
    from pipeline.image_auditor import _build_prompt_generation_prompt

    chapter = _make_chapter([[0, 1]])
    characters = [
        {"name": "Maria", "role": "protagonist", "image_tag": "young woman, teal cardigan"},
        {"name": "Sofia", "role": "best friend", "image_tag": "curly dark hair, olive skin"},
    ]

    _, prompt = _build_prompt_generation_prompt(chapter, characters)

    assert "PROTAGONIST: Maria" in prompt
    assert "young woman, teal cardigan" in prompt
    assert "SOFIA: Sofia" in prompt
    assert "curly dark hair, olive skin" in prompt
    assert "under 200 characters" in prompt
