"""Tests for CEFR simplifier (Pass 1)."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import yaml

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


def make_config(tmp_path: Path, cefr_level: str = "A1-A2", chapter_cefr: str | None = None):
    chapter_def = {"title": "Preparation", "context": "Packing bags", "vocab_focus": ["clothing"]}
    if chapter_cefr:
        chapter_def["cefr_level"] = chapter_cefr
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "Rioplatense",
        },
        "protagonist": {
            "name": "Maria", "gender": "female",
            "origin_country": "Germany",
            "visual_tag": "a young woman with light-brown hair",
        },
        "destination": {"country": "Argentina", "city": "Buenos Aires"},
        "story": {
            "cefr_level": cefr_level,
            "sentences_per_chapter": [8, 12],
            "narration_style": "third-person",
            "chapters": [chapter_def],
        },
        "models": {
            "story_generation": {"provider": "openrouter", "model": "test/model", "temperature": 0.7},
            "cefr_simplification": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "grammar": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "gap_filling": {"provider": "openrouter", "model": "test/model", "temperature": 0.7},
            "chapter_audit": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "story_audit": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "translation": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
            "word_extraction": {"provider": "openrouter", "model": "test/model", "temperature": 0.3},
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def make_raw_chapter() -> ChapterScene:
    """A raw (unconstrained) chapter with complex sentences and image prompts."""
    return ChapterScene(
        chapter=1,
        scenes=[
            Scene(
                setting="maria_bedroom_berlin",
                description="A cozy bedroom with warm lamp light",
                shots=[
                    Shot(
                        focus="open suitcase",
                        image_prompt="RAW: A huge red suitcase on the bed",
                        sentences=[
                            ShotSentence(source="Maria está preparando su maleta enorme en la habitación.", sentence_index=0),
                            ShotSentence(source="Ella siente una mezcla de emoción y nerviosismo.", sentence_index=1),
                        ],
                    ),
                    Shot(
                        focus="travel guide",
                        image_prompt="RAW: A colorful travel guide on nightstand",
                        sentences=[
                            ShotSentence(source="Hay una guía de Buenos Aires sobre la mesa de noche.", sentence_index=2),
                        ],
                    ),
                ],
            ),
        ],
    )


# LLM returns simplified sentences but with DIFFERENT image prompts (should be ignored)
MOCK_SIMPLIFIED_RESPONSE = {
    "scenes": [
        {
            "setting": "llm_changed_setting",
            "description": "LLM changed this description",
            "shots": [
                {
                    "focus": "llm changed focus",
                    "image_prompt": "LLM: This should NOT appear in output",
                    "sentences": [
                        {"source": "Maria prepara la maleta.", "sentence_index": 0},
                        {"source": "Ella tiene miedo.", "sentence_index": 1},
                    ],
                },
                {
                    "focus": "llm changed focus 2",
                    "image_prompt": "LLM: This should also NOT appear",
                    "sentences": [
                        {"source": "Hay una guía.", "sentence_index": 2},
                    ],
                },
            ],
        },
    ],
}

# LLM splits one sentence into two
MOCK_SPLIT_RESPONSE = {
    "scenes": [
        {
            "setting": "maria_bedroom_berlin",
            "description": "A cozy bedroom",
            "shots": [
                {
                    "focus": "open suitcase",
                    "image_prompt": "ignored",
                    "sentences": [
                        {"source": "Maria prepara la maleta.", "sentence_index": 0},
                        {"source": "La maleta es roja.", "sentence_index": 1},
                        {"source": "Ella tiene miedo.", "sentence_index": 2},
                    ],
                },
                {
                    "focus": "travel guide",
                    "image_prompt": "ignored",
                    "sentences": [
                        {"source": "Hay una guía.", "sentence_index": 3},
                    ],
                },
            ],
        },
    ],
}


def _mock_llm(response_data: dict) -> MagicMock:
    mock = MagicMock()
    mock.complete_json.return_value = LLMResponse(
        content=json.dumps(response_data),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=response_data,
    )
    return mock


def test_simplify_chapter_returns_chapter_scene(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = _mock_llm(MOCK_SIMPLIFIED_RESPONSE)

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    result = simplifier.simplify_chapter(0, make_raw_chapter())

    assert isinstance(result, ChapterScene)
    assert result.chapter == 1
    assert len(result.scenes) == 1
    assert len(result.scenes[0].shots) == 2
    # Simplified sentences
    assert result.scenes[0].shots[0].sentences[0].source == "Maria prepara la maleta."
    assert result.scenes[0].shots[0].sentences[1].source == "Ella tiene miedo."
    mock_llm.complete_json.assert_called_once()


def test_preserves_image_prompts(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = _mock_llm(MOCK_SIMPLIFIED_RESPONSE)

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    raw = make_raw_chapter()
    result = simplifier.simplify_chapter(0, raw)

    # Image prompts must come from RAW, not LLM
    assert result.scenes[0].shots[0].image_prompt == "RAW: A huge red suitcase on the bed"
    assert result.scenes[0].shots[1].image_prompt == "RAW: A colorful travel guide on nightstand"
    assert "LLM" not in result.scenes[0].shots[0].image_prompt

    # Focus must come from RAW
    assert result.scenes[0].shots[0].focus == "open suitcase"
    assert result.scenes[0].shots[1].focus == "travel guide"

    # Setting and description must come from RAW
    assert result.scenes[0].setting == "maria_bedroom_berlin"
    assert result.scenes[0].description == "A cozy bedroom with warm lamp light"


def test_saves_to_stories_directory(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = _mock_llm(MOCK_SIMPLIFIED_RESPONSE)

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    simplifier.simplify_chapter(0, make_raw_chapter())

    # Must be in stories/, NOT stories_raw/
    story_file = tmp_path / "test-deck" / "stories" / "chapter_01.json"
    assert story_file.exists()
    data = json.loads(story_file.read_text())
    assert data["chapter"] == 1
    assert "scenes" in data

    # Verify stories_raw/ does NOT exist (simplifier doesn't write there)
    assert not (tmp_path / "test-deck" / "stories_raw").exists()


def test_skips_if_cached(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-create cached file
    story_dir = tmp_path / "test-deck" / "stories"
    story_dir.mkdir(parents=True)
    cached = {"chapter": 1, "scenes": []}
    (story_dir / "chapter_01.json").write_text(json.dumps(cached))

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    result = simplifier.simplify_chapter(0, make_raw_chapter())

    assert result.chapter == 1
    assert result.scenes == []
    mock_llm.complete_json.assert_not_called()


def test_prompt_includes_cefr_level(tmp_path):
    from pipeline.cefr_simplifier import _build_system_prompt, _build_user_prompt

    system = _build_system_prompt("A1", "third-person", "Rioplatense")
    assert "A1" in system
    assert "Max 12 words" in system
    assert "Simple present tense" in system
    assert "Rioplatense" in system

    system_b1 = _build_system_prompt("B1", "third-person", "Rioplatense")
    assert "B1" in system_b1
    assert "Up to 18 words" in system_b1

    # User prompt includes level
    raw = make_raw_chapter()
    user = _build_user_prompt(raw, "A2")
    assert "A2" in user

    # Chapter-level override: if chapter has cefr_level, it should be used
    config = make_config(tmp_path, chapter_cefr="B1")
    chapter_def = config.story.chapters[0]
    effective = chapter_def.cefr_level or config.story.cefr_level
    assert effective == "B1"


def test_handles_sentence_splitting(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = _mock_llm(MOCK_SPLIT_RESPONSE)

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    raw = make_raw_chapter()
    result = simplifier.simplify_chapter(0, raw)

    # Shot 1 had 2 raw sentences, LLM split into 3 — should be accepted
    shot1_sentences = result.scenes[0].shots[0].sentences
    assert len(shot1_sentences) == 3

    # Sentence indices must be re-numbered sequentially from 0
    all_indices = []
    for scene in result.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                all_indices.append(sent.sentence_index)
    assert all_indices == [0, 1, 2, 3]

    # Image prompts still from raw
    assert result.scenes[0].shots[0].image_prompt == "RAW: A huge red suitcase on the bed"


def test_compound_cefr_level_resolved(tmp_path):
    """Compound levels like A1-A2 resolve to the higher level for constraints."""
    from pipeline.cefr_simplifier import _build_system_prompt

    system = _build_system_prompt("A1-A2", "third-person", "neutral")
    # Should use A2 constraints (the higher level)
    assert "Max 12 words" in system
    assert "imperfecto" in system


def test_first_person_narration_style(tmp_path):
    from pipeline.cefr_simplifier import _build_system_prompt

    system = _build_system_prompt("A1", "first-person", "Rioplatense")
    assert "first-person" in system
