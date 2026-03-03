"""Tests for Pass 4: Image Prompt Generation."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import yaml

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.image_prompter import ImagePrompter


def make_config(tmp_path: Path):
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "neutral",
        },
        "protagonist": {
            "name": "Charlotte", "gender": "female",
            "origin_country": "Germany", "origin_city": "Berlin",
            "description": "mid-20s, light brown hair, warm brown eyes",
        },
        "destination": {
            "country": "Argentina", "city": "Buenos Aires",
            "landmarks": ["Plaza de Mayo"],
        },
        "story": {
            "cefr_level": "A1-A2",
            "sentences_per_chapter": [8, 12],
            "chapters": [
                {"title": "Preparation", "context": "Packing bags", "vocab_focus": ["clothing"]},
            ],
        },
        "llm": {
            "provider": "google", "model": "gemini-2.5-flash-lite",
            "fallback_model": "gemini-2.5-flash", "temperature": 0.7, "max_retries": 3,
        },
        "image_generation": {
            "enabled": True, "provider": "together",
            "model": "flux-kontext-dev", "cheap_model": "flux-schnell",
            "style": "warm storybook illustration", "width": 768, "height": 512,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


MOCK_LLM_RESPONSE = {
    "protagonist_prompt": "Portrait of Charlotte, a young German woman, mid-20s, light brown hair",
    "sentences": [
        {
            "chapter": 1, "sentence_index": 0,
            "source": "Charlotte está en su habitación.",
            "image_type": "character_scene",
            "characters": ["protagonist"],
            "prompt": "A young woman in a cozy bedroom packing a suitcase",
            "setting": "bedroom_berlin",
        },
        {
            "chapter": 1, "sentence_index": 1,
            "source": "La maleta es muy grande.",
            "image_type": "scene_only",
            "characters": [],
            "prompt": "A large open suitcase on a bed with clothes around it",
            "setting": "bedroom_berlin",
        },
    ],
}


def test_generate_prompts_calls_llm(tmp_path):
    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_LLM_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=200, total_tokens=700),
        parsed=MOCK_LLM_RESPONSE,
    )

    stories = {0: "Charlotte está en su habitación. La maleta es muy grande."}
    translations = {0: [
        {"chapter": 1, "sentence_index": 0, "source": "Charlotte está en su habitación.", "target": "Charlotte ist in ihrem Zimmer."},
        {"chapter": 1, "sentence_index": 1, "source": "La maleta es muy grande.", "target": "Der Koffer ist sehr groß."},
    ]}

    prompter = ImagePrompter(config, mock_llm, output_base=tmp_path)
    result = prompter.generate_prompts(stories, translations)

    assert result.protagonist_prompt is not None
    assert len(result.sentences) == 2
    assert result.sentences[0].image_type == "character_scene"
    assert result.sentences[1].image_type == "scene_only"
    mock_llm.complete_json.assert_called_once()


def test_generate_prompts_saves_to_file(tmp_path):
    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_LLM_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=200, total_tokens=700),
        parsed=MOCK_LLM_RESPONSE,
    )

    stories = {0: "Charlotte está en su habitación."}
    translations = {0: [
        {"chapter": 1, "sentence_index": 0, "source": "Charlotte está en su habitación.", "target": "Charlotte ist in ihrem Zimmer."},
    ]}

    prompter = ImagePrompter(config, mock_llm, output_base=tmp_path)
    prompter.generate_prompts(stories, translations)

    output_path = tmp_path / "test-deck" / "image_prompts.json"
    assert output_path.exists()
    data = json.loads(output_path.read_text())
    assert "protagonist_prompt" in data
    assert len(data["sentences"]) == 2


def test_generate_prompts_skips_if_exists(tmp_path):
    config = make_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-create the output file
    output_dir = tmp_path / "test-deck"
    output_dir.mkdir(parents=True)
    existing = {"protagonist_prompt": "existing", "style": "test", "sentences": []}
    (output_dir / "image_prompts.json").write_text(json.dumps(existing))

    prompter = ImagePrompter(config, mock_llm, output_base=tmp_path)
    result = prompter.generate_prompts({}, {})

    assert result.protagonist_prompt == "existing"
    mock_llm.complete_json.assert_not_called()


def test_prompt_includes_protagonist_info(tmp_path):
    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_LLM_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=200, total_tokens=700),
        parsed=MOCK_LLM_RESPONSE,
    )

    stories = {0: "Charlotte está en su habitación."}
    translations = {0: []}

    prompter = ImagePrompter(config, mock_llm, output_base=tmp_path)
    prompter.generate_prompts(stories, translations)

    call_args = mock_llm.complete_json.call_args
    prompt = call_args.kwargs.get("prompt") or call_args.args[0]
    assert "Charlotte" in prompt
    assert "light brown hair" in prompt
