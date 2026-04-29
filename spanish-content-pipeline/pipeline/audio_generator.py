"""Generate sentence audio via TTS APIs (Gemini / Google Cloud TTS / OpenAI)."""

import base64
import hashlib
import io
import json
import time
import wave
from pathlib import Path

import httpx

from pipeline.config import DeckConfig
from pipeline.models import AudioManifest, AudioManifestEntry, SentencePair

GEMINI_TTS_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
PCM_SAMPLE_RATE = 24000  # Gemini TTS outputs 24kHz PCM16 mono


def _pcm_to_wav(pcm_bytes: bytes) -> bytes:
    """Wrap raw PCM16 mono bytes in a WAV container (stdlib wave module)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)         # mono
        w.setsampwidth(2)         # 16-bit
        w.setframerate(PCM_SAMPLE_RATE)
        w.writeframes(pcm_bytes)
    return buf.getvalue()


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


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

        # Gemini TTS uses httpx directly
        self._client = httpx.Client(timeout=60.0)

        # Google Cloud TTS / OpenAI clients initialized lazily
        self._google_client = None
        self._openai_client = None

    def _deck_dir(self) -> Path:
        return self._output_base / self._config.deck.id

    def _sentence_key(self, chapter: int, sentence_index: int) -> str:
        return f"ch{chapter:02d}_s{sentence_index:02d}"

    # --- Provider: Gemini TTS (direct HTTP) ---

    def _call_gemini_tts(self, text: str) -> bytes:
        """Call Gemini TTS generateContent. Returns raw PCM16 bytes."""
        model = self._audio_config.model
        url = f"{GEMINI_TTS_BASE_URL}/{model}:generateContent"
        # Prepend a spoken-style instruction in the text itself.
        # systemInstruction causes 500 errors on the preview TTS model.
        tts_text = f"Say the following out loud, clearly and naturally: {text}"
        payload = {
            "contents": [{"parts": [{"text": tts_text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": self._audio_config.voice_name,
                        }
                    }
                },
            },
        }
        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }

        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                break
            last_error = f"{response.status_code}: {response.text[:300]}"
            if attempt < self._max_retries - 1:
                delay = 2 * (attempt + 1)
                print(f"\n      Retry {attempt + 1}/{self._max_retries} (waiting {delay}s)...", end="", flush=True)
                time.sleep(delay)
        else:
            raise RuntimeError(f"TTS failed after {self._max_retries} attempts: {last_error}")

        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates or not candidates[0].get("content", {}).get("parts"):
            raise RuntimeError(f"Unexpected TTS response: {str(data)[:300]}")
        part = candidates[0]["content"]["parts"][0]
        inline = part.get("inlineData") or part.get("inline_data")
        if not inline:
            raise RuntimeError(f"No audio data in response part: {str(part)[:200]}")
        return base64.b64decode(inline["data"])

    # --- Provider: Google Cloud TTS ---

    def _get_google_client(self):
        """Lazy initialization of Google Cloud TTS client."""
        if self._google_client is None:
            from google.cloud import texttospeech
            self._google_client = texttospeech.TextToSpeechClient()
        return self._google_client

    def _generate_google(self, text: str) -> bytes:
        """Generate audio using Google Cloud TTS."""
        from google.cloud import texttospeech

        client = self._get_google_client()

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

    # --- Provider: OpenAI TTS ---

    def _get_openai_client(self):
        """Lazy initialization of OpenAI client."""
        if self._openai_client is None:
            from openai import OpenAI
            self._openai_client = OpenAI(api_key=self._api_key)
        return self._openai_client

    def _generate_openai(self, text: str) -> bytes:
        """Generate audio using OpenAI TTS."""
        client = self._get_openai_client()

        response = client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice="alloy",
            input=text,
            response_format="mp3",
        )

        audio_bytes = b""
        for chunk in response.iter_bytes():
            audio_bytes += chunk

        return audio_bytes

    # --- Unified generation ---

    def _audio_extension(self) -> str:
        """Return file extension based on provider (Gemini outputs WAV, others MP3)."""
        if self._audio_config.provider == "gemini":
            return "wav"
        return "mp3"

    def generate_sentence_audio(self, sentence: SentencePair) -> AudioManifestEntry:
        """Generate audio for a single sentence. Returns manifest entry."""
        key = self._sentence_key(sentence.chapter, sentence.sentence_index)
        ext = self._audio_extension()
        rel_path = f"audio/{key}.{ext}"
        abs_path = self._deck_dir() / rel_path
        content_hash = _content_hash(sentence.source)

        try:
            last_error = None
            for attempt in range(self._max_retries):
                try:
                    provider = self._audio_config.provider
                    if provider == "gemini":
                        pcm_bytes = self._call_gemini_tts(sentence.source)
                        audio_bytes = _pcm_to_wav(pcm_bytes)
                    elif provider == "google":
                        audio_bytes = self._generate_google(sentence.source)
                    elif provider == "openai":
                        audio_bytes = self._generate_openai(sentence.source)
                    else:
                        raise ValueError(f"Unknown audio provider: {provider}")

                    abs_path.parent.mkdir(parents=True, exist_ok=True)
                    abs_path.write_bytes(audio_bytes)

                    return AudioManifestEntry(
                        file=rel_path,
                        status="success",
                        content_hash=content_hash,
                    )

                except Exception as e:
                    last_error = e
                    if attempt < self._max_retries - 1:
                        delay = 2 * (attempt + 1)
                        print(f"\n      Retry {attempt + 1}/{self._max_retries} after error (waiting {delay}s)...", end="", flush=True)
                        time.sleep(delay)
                        continue
                    raise

            raise last_error if last_error else Exception("Unknown error")

        except Exception as e:
            return AudioManifestEntry(
                file=None,
                status="failed",
                error=str(e),
                content_hash=content_hash,
            )

    def generate_all(self, sentences: list[SentencePair]) -> AudioManifest:
        """Generate audio for all sentences. Resumes from existing manifest."""
        manifest_path = self._deck_dir() / "audio_manifest.json"

        # Load existing manifest for resumability
        existing_audio: dict[str, AudioManifestEntry] = {}
        if manifest_path.exists():
            data = json.loads(manifest_path.read_text())
            for key, entry_data in data.get("audio", {}).items():
                entry = AudioManifestEntry(**entry_data)
                # Only keep successful entries where file actually exists
                if entry.status == "success" and entry.file:
                    if (self._deck_dir() / entry.file).exists():
                        existing_audio[key] = entry

        # Generate audio for each sentence
        all_audio = dict(existing_audio)
        for sentence in sentences:
            key = self._sentence_key(sentence.chapter, sentence.sentence_index)
            content_hash = _content_hash(sentence.source)

            # Skip if already generated and content unchanged
            if key in existing_audio and existing_audio[key].content_hash == content_hash:
                continue

            print(f"    Generating {key}...", end=" ", flush=True)
            entry = self.generate_sentence_audio(sentence)
            all_audio[key] = entry
            print(entry.status)

            # Gemini preview model has low RPM quota — throttle requests
            if self._audio_config.provider == "gemini":
                time.sleep(4)

        # Write updated manifest
        manifest = AudioManifest(
            provider=self._audio_config.provider,
            model=getattr(self._audio_config, "model", ""),
            language=self._config.languages.target_code,
            audio=all_audio,
        )
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2))

        return manifest
