"""Tests for Pass 5: Image Generation via multi-provider (Together.ai + Google)."""
import base64
import json
from pathlib import Path

import httpx
import yaml

from pipeline.config import load_config
from pipeline.image_generator import ImageGenerator
from pipeline.models import ImageManifestEntry, ImagePrompt, ImagePromptResult


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
            "description": "mid-20s, light brown hair",
        },
        "destination": {"country": "Argentina", "city": "Buenos Aires", "landmarks": []},
        "story": {
            "cefr_level": "A1-A2", "sentences_per_chapter": [8, 12],
            "chapters": [{"title": "Preparation", "context": "Packing", "vocab_focus": ["clothing"]}],
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
        "image_generation": {
            "enabled": True, "provider": "together",
            "model": "black-forest-labs/FLUX.1-schnell",
            "cheap_model": "black-forest-labs/FLUX.1-schnell",
            "style": "warm storybook illustration", "width": 768, "height": 512,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def make_prompts():
    return ImagePromptResult(
        style="warm storybook illustration",
        sentences=[
            ImagePrompt(
                chapter=1, sentence_index=0,
                source="Charlotte está en su habitación.",
                image_type="scene_only", characters=[],
                prompt="warm storybook illustration. A young woman packing in a bedroom. no text, no writing, no letters.",
                setting="bedroom",
            ),
            ImagePrompt(
                chapter=1, sentence_index=1,
                source="La maleta es grande.",
                image_type="scene_only", characters=[],
                prompt="warm storybook illustration. A large open suitcase on a bed. no text, no writing, no letters.",
                setting="bedroom",
            ),
        ],
    )


# Small valid base64 payload (doesn't need to be a real image for tests)
TINY_IMAGE_B64 = base64.b64encode(b"fake-image-bytes").decode()


def fake_together_response(request: httpx.Request) -> httpx.Response:
    """Mock httpx transport handler for together.ai API."""
    return httpx.Response(
        200,
        json={"data": [{"b64_json": TINY_IMAGE_B64}]},
    )


def test_generate_sentence_image(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)

    result = gen.generate_sentence_image(prompts.sentences[0], prompts.style, None)
    assert result.status == "success"
    assert result.file is not None
    assert (tmp_path / config.deck.id / result.file).exists()


def test_generate_all_writes_manifest(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)
    manifest = gen.generate_all(prompts)

    assert len(manifest.images) == 2

    manifest_path = tmp_path / config.deck.id / "image_manifest.json"
    assert manifest_path.exists()


def test_generate_all_skips_existing(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    # Pre-create manifest with one image already done
    output_dir = tmp_path / config.deck.id
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True)
    (images_dir / "ch01_s00.webp").write_bytes(b"fake")

    existing_manifest = {
        "reference": "",
        "model_character": "black-forest-labs/FLUX.1-schnell",
        "model_scene": "black-forest-labs/FLUX.1-schnell",
        "images": {
            "ch01_s00": {"file": "images/ch01_s00.webp", "status": "success"},
        },
    }
    (output_dir / "image_manifest.json").write_text(json.dumps(existing_manifest))

    call_count = 0
    original_handler = fake_together_response

    def counting_response(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return original_handler(request)

    transport = httpx.MockTransport(counting_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)
    manifest = gen.generate_all(prompts)

    # Should only generate ch01_s01 (ch01_s00 already exists)
    assert call_count == 1
    assert len(manifest.images) == 2
    assert manifest.images["ch01_s01"].status == "success"


# --- Google AI Studio provider tests ---

TINY_PNG_B64 = base64.b64encode(b"\x89PNG\r\n\x1a\nfake-png-data").decode()


def fake_gemini_image_response(request: httpx.Request) -> httpx.Response:
    """Mock Gemini generateContent response with image output."""
    return httpx.Response(
        200,
        json={
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "inline_data": {
                                    "mime_type": "image/png",
                                    "data": TINY_PNG_B64,
                                }
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 10,
                "candidatesTokenCount": 0,
                "totalTokenCount": 10,
            },
        },
    )


def make_gemini_config(tmp_path):
    """Config using a Gemini image model."""
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "neutral",
        },
        "protagonist": {
            "name": "Charlotte", "gender": "female",
            "origin_country": "Germany", "origin_city": "Berlin",
        },
        "destination": {"country": "Argentina", "city": "Buenos Aires", "landmarks": []},
        "story": {
            "cefr_level": "A1-A2", "sentences_per_chapter": [8, 12],
            "chapters": [{"title": "Preparation", "context": "Packing", "vocab_focus": ["clothing"]}],
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
        "image_generation": {
            "enabled": True,
            "model": "gemini-2.5-flash-image",
            "cheap_model": "gemini-2.5-flash-image",
            "style": "cartoon illustration",
            "width": 768, "height": 512,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def test_google_provider_generates_image(tmp_path):
    config = make_gemini_config(tmp_path)
    transport = httpx.MockTransport(fake_gemini_image_response)

    gen = ImageGenerator(
        config,
        together_api_key=None,
        gemini_api_key="test-gemini-key",
        output_base=tmp_path,
        transport=transport,
    )

    prompt = ImagePrompt(
        chapter=1, sentence_index=0,
        source="Test.", image_type="scene_only",
        prompt="A bedroom scene", setting="bedroom",
    )
    entry = gen.generate_sentence_image(prompt, "cartoon", None)
    assert entry.status == "success"
    assert entry.file is not None


def test_provider_routing_by_model_name(tmp_path):
    from pipeline.image_generator import detect_provider

    assert detect_provider("black-forest-labs/FLUX.1-schnell") == "together"
    assert detect_provider("FLUX.2-dev") == "together"
    assert detect_provider("gemini-2.5-flash-image") == "google"
    assert detect_provider("gemini-3.1-flash-image-preview") == "google"
