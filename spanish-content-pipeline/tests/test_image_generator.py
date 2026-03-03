"""Tests for Pass 5: Image Generation via Flux APIs."""
import base64
import json
from pathlib import Path

import httpx
import yaml

from pipeline.config import load_config
from pipeline.image_generator import ImageGenerator
from pipeline.image_prompter import ImagePromptResult
from pipeline.models import ImagePrompt, ImageManifestEntry


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
        "llm": {
            "provider": "google", "model": "gemini-2.5-flash-lite",
            "fallback_model": "gemini-2.5-flash", "temperature": 0.7, "max_retries": 3,
        },
        "image_generation": {
            "enabled": True, "provider": "together",
            "model": "black-forest-labs/FLUX.1-kontext-dev",
            "cheap_model": "black-forest-labs/FLUX.1-schnell",
            "style": "warm storybook illustration", "width": 768, "height": 512,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def make_prompts():
    return ImagePromptResult(
        protagonist_prompt="Portrait of Charlotte, mid-20s, light brown hair",
        style="warm storybook illustration",
        sentences=[
            ImagePrompt(
                chapter=1, sentence_index=0,
                source="Charlotte está en su habitación.",
                image_type="character_scene", characters=["protagonist"],
                prompt="A young woman packing in a bedroom", setting="bedroom",
            ),
            ImagePrompt(
                chapter=1, sentence_index=1,
                source="La maleta es grande.",
                image_type="scene_only", characters=[],
                prompt="A large open suitcase on a bed", setting="bedroom",
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


def test_generate_reference_image(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)
    ref_path = gen.generate_reference(prompts.protagonist_prompt, prompts.style)

    assert ref_path.exists()
    assert ref_path.suffix == ".webp"


def test_generate_sentence_image_character_scene(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)

    # First generate reference (needed for character scenes)
    ref_path = gen.generate_reference(prompts.protagonist_prompt, prompts.style)

    result = gen.generate_sentence_image(prompts.sentences[0], prompts.style, ref_path)
    assert result.status == "success"
    assert result.file is not None
    assert (tmp_path / config.deck.id / result.file).exists()


def test_generate_sentence_image_scene_only(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)

    result = gen.generate_sentence_image(prompts.sentences[1], prompts.style, None)
    assert result.status == "success"
    assert result.file is not None


def test_generate_all_writes_manifest(tmp_path):
    config = make_config(tmp_path)
    prompts = make_prompts()

    transport = httpx.MockTransport(fake_together_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)
    manifest = gen.generate_all(prompts)

    assert manifest.reference is not None
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
        "reference": "references/protagonist.webp",
        "model_character": "black-forest-labs/FLUX.1-kontext-dev",
        "model_scene": "black-forest-labs/FLUX.1-schnell",
        "images": {
            "ch01_s00": {"file": "images/ch01_s00.webp", "status": "success"},
        },
    }
    (output_dir / "image_manifest.json").write_text(json.dumps(existing_manifest))

    # Also create the reference
    refs_dir = output_dir / "references"
    refs_dir.mkdir(parents=True)
    (refs_dir / "protagonist.webp").write_bytes(b"fake-ref")

    call_count = 0
    original_handler = fake_together_response

    def counting_response(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return original_handler(request)

    transport = httpx.MockTransport(counting_response)
    gen = ImageGenerator(config, api_key="test-key", output_base=tmp_path, transport=transport)
    manifest = gen.generate_all(prompts)

    # Should only generate ch01_s01 (ch01_s00 already exists, reference already exists)
    assert call_count == 1
    assert len(manifest.images) == 2
    assert manifest.images["ch01_s01"].status == "success"
