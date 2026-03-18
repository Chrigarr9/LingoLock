"""Tests for Pass 6: Audio Generation via TTS APIs."""
import json
from pathlib import Path
from unittest.mock import Mock, patch

import yaml

from pipeline.audio_generator import AudioGenerator
from pipeline.config import load_config
from pipeline.models import SentencePair


def make_config(tmp_path: Path):
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "neutral",
        },
        "protagonist": {
            "name": "Maria", "gender": "female",
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
        "audio_generation": {
            "enabled": True, "provider": "google",
            "voice_gender": "male", "speaking_rate": 1.0,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def make_sentences():
    return [
        SentencePair(
            chapter=1, sentence_index=0,
            source="Hola, me llamo Maria.",
            target="Hello, my name is Maria.",
        ),
        SentencePair(
            chapter=1, sentence_index=1,
            source="Voy a Buenos Aires.",
            target="I'm going to Buenos Aires.",
        ),
    ]


def test_generate_sentence_audio_google_success(tmp_path):
    config = make_config(tmp_path)
    sentences = make_sentences()

    # Mock Google TTS client
    mock_response = Mock()
    mock_response.audio_content = b"fake-mp3-bytes"

    gen = AudioGenerator(config, api_key="test-key", output_base=tmp_path)

    with patch.object(gen, '_get_google_client') as mock_client_getter:
        mock_client = Mock()
        mock_client.synthesize_speech.return_value = mock_response
        mock_client_getter.return_value = mock_client

        result = gen.generate_sentence_audio(sentences[0])

        assert result.status == "success"
        assert result.file == "audio/ch01_s00.mp3"
        assert result.content_hash is not None

        audio_path = tmp_path / config.deck.id / result.file
        assert audio_path.exists()
        assert audio_path.read_bytes() == b"fake-mp3-bytes"


def test_generate_sentence_audio_openai_success(tmp_path):
    config_data = make_config(tmp_path)
    # Override provider to openai
    config_path = tmp_path / "config_openai.yaml"
    config_dict = yaml.safe_load((tmp_path / "config.yaml").read_text())
    config_dict["audio_generation"]["provider"] = "openai"
    config_path.write_text(yaml.dump(config_dict))
    config = load_config(config_path)

    sentences = make_sentences()

    # Mock OpenAI client
    mock_response = Mock()
    mock_response.iter_bytes.return_value = [b"fake-", b"openai-", b"mp3"]

    gen = AudioGenerator(config, api_key="test-key", output_base=tmp_path)

    with patch.object(gen, '_get_openai_client') as mock_client_getter:
        mock_client = Mock()
        mock_client.audio.speech.create.return_value = mock_response
        mock_client_getter.return_value = mock_client

        result = gen.generate_sentence_audio(sentences[0])

        assert result.status == "success"
        assert result.file == "audio/ch01_s00.mp3"
        assert result.content_hash is not None

        audio_path = tmp_path / config.deck.id / result.file
        assert audio_path.exists()
        assert audio_path.read_bytes() == b"fake-openai-mp3"


def test_generate_sentence_audio_failure(tmp_path):
    config = make_config(tmp_path)
    sentences = make_sentences()

    gen = AudioGenerator(config, api_key="test-key", output_base=tmp_path, max_retries=1)

    # Mock Google TTS client to raise exception
    with patch.object(gen, '_get_google_client') as mock_client_getter:
        mock_client = Mock()
        mock_client.synthesize_speech.side_effect = Exception("API error")
        mock_client_getter.return_value = mock_client

        result = gen.generate_sentence_audio(sentences[0])

        assert result.status == "failed"
        assert result.file is None
        assert "API error" in result.error
        assert result.content_hash is not None


def test_generate_all_writes_manifest(tmp_path):
    config = make_config(tmp_path)
    sentences = make_sentences()

    # Mock Google TTS client
    mock_response = Mock()
    mock_response.audio_content = b"fake-mp3-bytes"

    gen = AudioGenerator(config, api_key="test-key", output_base=tmp_path)

    with patch.object(gen, '_get_google_client') as mock_client_getter:
        mock_client = Mock()
        mock_client.synthesize_speech.return_value = mock_response
        mock_client_getter.return_value = mock_client

        manifest = gen.generate_all(sentences)

        assert manifest.provider == "google"
        assert manifest.language == "es"
        assert len(manifest.audio) == 2
        assert "ch01_s00" in manifest.audio
        assert "ch01_s01" in manifest.audio

        manifest_path = tmp_path / config.deck.id / "audio_manifest.json"
        assert manifest_path.exists()

        # Verify manifest content
        data = json.loads(manifest_path.read_text())
        assert data["provider"] == "google"
        assert data["language"] == "es"
        assert len(data["audio"]) == 2


def test_generate_all_skips_existing_unchanged(tmp_path):
    config = make_config(tmp_path)
    sentences = make_sentences()

    # Pre-create manifest with one audio already done
    output_dir = tmp_path / config.deck.id
    audio_dir = output_dir / "audio"
    audio_dir.mkdir(parents=True)
    (audio_dir / "ch01_s00.mp3").write_bytes(b"fake-existing")

    # Calculate the correct content hash
    gen_temp = AudioGenerator(config, api_key="test-key", output_base=tmp_path)
    content_hash_0 = gen_temp._content_hash(sentences[0].source)

    existing_manifest = {
        "provider": "google",
        "language": "es",
        "audio": {
            "ch01_s00": {
                "file": "audio/ch01_s00.mp3",
                "status": "success",
                "error": None,
                "content_hash": content_hash_0,
            },
        },
    }
    (output_dir / "audio_manifest.json").write_text(json.dumps(existing_manifest))

    # Mock Google TTS client
    mock_response = Mock()
    mock_response.audio_content = b"fake-mp3-bytes"

    call_count = 0

    def counting_synthesize(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return mock_response

    gen = AudioGenerator(config, api_key="test-key", output_base=tmp_path)

    with patch.object(gen, '_get_google_client') as mock_client_getter:
        mock_client = Mock()
        mock_client.synthesize_speech.side_effect = counting_synthesize
        mock_client_getter.return_value = mock_client

        manifest = gen.generate_all(sentences)

        # Should only generate ch01_s01 (ch01_s00 already exists with same content hash)
        assert call_count == 1
        assert len(manifest.audio) == 2
        assert manifest.audio["ch01_s00"].file == "audio/ch01_s00.mp3"
        assert manifest.audio["ch01_s01"].status == "success"


def test_generate_all_regenerates_changed_sentence(tmp_path):
    config = make_config(tmp_path)
    sentences = make_sentences()

    # Pre-create manifest with different content hash (simulating changed sentence)
    output_dir = tmp_path / config.deck.id
    audio_dir = output_dir / "audio"
    audio_dir.mkdir(parents=True)
    (audio_dir / "ch01_s00.mp3").write_bytes(b"fake-old")

    existing_manifest = {
        "provider": "google",
        "language": "es",
        "audio": {
            "ch01_s00": {
                "file": "audio/ch01_s00.mp3",
                "status": "success",
                "error": None,
                "content_hash": "old-hash-different",
            },
        },
    }
    (output_dir / "audio_manifest.json").write_text(json.dumps(existing_manifest))

    # Mock Google TTS client
    mock_response = Mock()
    mock_response.audio_content = b"fake-new-mp3"

    gen = AudioGenerator(config, api_key="test-key", output_base=tmp_path)

    with patch.object(gen, '_get_google_client') as mock_client_getter:
        mock_client = Mock()
        mock_client.synthesize_speech.return_value = mock_response
        mock_client_getter.return_value = mock_client

        manifest = gen.generate_all(sentences)

        # Should regenerate both (ch01_s00 has different hash, ch01_s01 is new)
        assert len(manifest.audio) == 2
        assert manifest.audio["ch01_s00"].status == "success"
        assert manifest.audio["ch01_s01"].status == "success"

        # Verify ch01_s00 was regenerated
        audio_path = audio_dir / "ch01_s00.mp3"
        assert audio_path.read_bytes() == b"fake-new-mp3"


def test_content_hash_deterministic():
    config = make_config(Path("/tmp"))
    gen = AudioGenerator(config, api_key="test-key")

    text = "Hola, me llamo Maria."
    hash1 = gen._content_hash(text)
    hash2 = gen._content_hash(text)

    assert hash1 == hash2
    assert len(hash1) == 16  # First 16 chars of SHA-256


def test_sentence_key_format():
    config = make_config(Path("/tmp"))
    gen = AudioGenerator(config, api_key="test-key")

    key = gen._sentence_key(1, 5)
    assert key == "ch01_s05"

    key = gen._sentence_key(12, 99)
    assert key == "ch12_s99"
