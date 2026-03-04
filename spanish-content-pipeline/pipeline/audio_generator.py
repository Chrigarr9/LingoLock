"""Pass 6: Generate sentence audio via TTS APIs (Google Cloud TTS / OpenAI)."""

import hashlib
import json
import time
from pathlib import Path

from google.cloud import texttospeech
from openai import OpenAI

from pipeline.config import DeckConfig
from pipeline.models import AudioManifest, AudioManifestEntry, SentencePair


class AudioGenerator:
    def __init__(
        self,
        config: DeckConfig,
        api_key: str,
        output_base: Path | None = None,
        max_retries: int = 3,
    ):
        self._config = config
        self._api_key = api_key
        self._output_base = output_base or Path("output")
        self._max_retries = max_retries
        self._audio_config = config.audio_generation

        # Initialize clients lazily (only when needed, to allow mocking in tests)
        self._google_client = None
        self._openai_client = None

    def _deck_dir(self) -> Path:
        return self._output_base / self._config.deck.id

    def _sentence_key(self, chapter: int, sentence_index: int) -> str:
        return f"ch{chapter:02d}_s{sentence_index:02d}"

    def _content_hash(self, text: str) -> str:
        return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

    def _get_google_client(self):
        """Lazy initialization of Google TTS client."""
        if self._google_client is None:
            self._google_client = texttospeech.TextToSpeechClient()
        return self._google_client

    def _get_openai_client(self):
        """Lazy initialization of OpenAI client."""
        if self._openai_client is None:
            self._openai_client = OpenAI(api_key=self._api_key)
        return self._openai_client

    def _generate_google(self, text: str) -> bytes:
        """Generate audio using Google Cloud TTS."""
        client = self._get_google_client()

        # Map voice gender string to enum
        gender_map = {
            "male": texttospeech.SsmlVoiceGender.MALE,
            "female": texttospeech.SsmlVoiceGender.FEMALE,
        }
        gender = gender_map.get(self._audio_config.voice_gender, texttospeech.SsmlVoiceGender.MALE)

        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code=self._config.languages.target_code,
            ssml_gender=gender,
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=self._audio_config.speaking_rate,
        )

        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )

        return response.audio_content

    def _generate_openai(self, text: str) -> bytes:
        """Generate audio using OpenAI TTS."""
        client = self._get_openai_client()

        response = client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice="alloy",
            input=text,
            response_format="mp3",
        )

        # Collect bytes from streaming response
        audio_bytes = b""
        for chunk in response.iter_bytes():
            audio_bytes += chunk

        return audio_bytes

    def generate_sentence_audio(self, sentence: SentencePair) -> AudioManifestEntry:
        """Generate audio for a single sentence. Returns manifest entry."""
        key = self._sentence_key(sentence.chapter, sentence.sentence_index)
        rel_path = f"audio/{key}.mp3"
        abs_path = self._deck_dir() / rel_path
        content_hash = self._content_hash(sentence.source)

        try:
            # Retry logic for API calls
            last_error = None
            for attempt in range(self._max_retries):
                try:
                    # Call appropriate provider
                    if self._audio_config.provider == "google":
                        audio_bytes = self._generate_google(sentence.source)
                    elif self._audio_config.provider == "openai":
                        audio_bytes = self._generate_openai(sentence.source)
                    else:
                        raise ValueError(f"Unknown provider: {self._audio_config.provider}")

                    # Write to file
                    abs_path.parent.mkdir(parents=True, exist_ok=True)
                    abs_path.write_bytes(audio_bytes)

                    return AudioManifestEntry(
                        file=rel_path,
                        status="success",
                        content_hash=content_hash,
                    )

                except Exception as e:
                    last_error = e
                    # Retry on server errors or transient issues
                    if attempt < self._max_retries - 1:
                        delay = 2 * (attempt + 1)
                        print(f"\n      Retry {attempt + 1}/{self._max_retries} after error (waiting {delay}s)...", end="", flush=True)
                        time.sleep(delay)
                        continue
                    raise

            # Should not reach here, but just in case
            raise last_error if last_error else Exception("Unknown error")

        except Exception as e:
            return AudioManifestEntry(
                file=None,
                status="failed",
                error=str(e),
                content_hash=content_hash,
            )

    def generate_all(self, sentences: list[SentencePair]) -> AudioManifest:
        """Generate all sentence audio. Resumes from existing manifest if present."""
        manifest_path = self._deck_dir() / "audio_manifest.json"

        # Load existing manifest for resumability
        existing_audio: dict[str, AudioManifestEntry] = {}
        if manifest_path.exists():
            data = json.loads(manifest_path.read_text())
            for key, entry_data in data.get("audio", {}).items():
                entry = AudioManifestEntry(**entry_data)
                # Only keep successful entries where file actually exists
                if entry.status == "success" and entry.file:
                    abs_path = self._deck_dir() / entry.file
                    if abs_path.exists():
                        existing_audio[key] = entry

        # Generate audio for each sentence
        all_audio = dict(existing_audio)
        for sentence in sentences:
            key = self._sentence_key(sentence.chapter, sentence.sentence_index)
            content_hash = self._content_hash(sentence.source)

            # Skip if unchanged in manifest
            if key in existing_audio:
                if existing_audio[key].content_hash == content_hash:
                    continue  # Already generated and unchanged

            print(f"    Generating {key}...", end=" ", flush=True)
            entry = self.generate_sentence_audio(sentence)
            all_audio[key] = entry
            print(entry.status)

        # Write updated manifest
        manifest = AudioManifest(
            provider=self._audio_config.provider,
            language=self._config.languages.target_code,
            audio=all_audio,
        )
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2)
        )

        return manifest
