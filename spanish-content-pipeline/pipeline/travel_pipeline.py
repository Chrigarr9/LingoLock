"""Core logic for the travel quick-deck pipeline.

Three independent passes:
  Pass 1 — generate_phrases()  : LLM generates target + native phrases from English
  Pass 2 — generate_images()   : generate shared images (skips existing ones)
  Pass 3 — generate_audio()    : TTS per phrase, stored per deck

Images are stored in output/travel-base/images/ and shared across all language decks.
Audio is stored in output/<deck-id>/audio/ and is language-specific.
"""

from __future__ import annotations

import base64
import io
import json
import time
import wave
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx

from pipeline.config import AudioGenerationConfig, ImageGenerationConfig, TravelDeckConfig
from pipeline.llm import LLMClient


# ── Shared paths ─────────────────────────────────────────────────────────────

SHARED_IMAGES_DECK_ID = "travel-base"
GEMINI_TTS_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
PCM_SAMPLE_RATE = 24000


def shared_images_dir(output_base: Path) -> Path:
    return output_base / SHARED_IMAGES_DECK_ID / "images"


def audio_dir(output_base: Path, deck_id: str) -> Path:
    return output_base / deck_id / "audio"


# ── Pass 1: Phrase generation ────────────────────────────────────────────────

def generate_phrases(
    sentences: list[dict],
    target_language: str,
    native_language: str,
    llm: LLMClient,
) -> dict[str, dict[str, str]]:
    """Translate all English concepts into a target + native language pair.

    Returns {sentence_id: {"target": str, "native": str}}.
    One LLM call for all sentences — cheap and fast.
    """
    lines = []
    for s in sentences:
        en = s["en"].replace("[language]", target_language)
        lines.append(f'  - id: "{s["id"]}"\n    en: "{en}"')
    sentences_block = "\n".join(lines)

    system = (
        f"You are a professional translator for tourist phrasebooks. "
        f"For each English concept, produce two translations:\n"
        f"  1. A natural, idiomatic phrase in {target_language} (what the tourist says)\n"
        f"  2. A natural, idiomatic phrase in {native_language} (what they already know)\n"
        f"Rules:\n"
        f"  - Use the polite/formal register where culturally appropriate\n"
        f"  - Match the brevity of the English original\n"
        f"  - For [language] in 'I speak a little [language]', use the {target_language} name for {target_language}\n"
        f"  - Return ONLY valid JSON, no markdown fences"
    )

    prompt = (
        f"Translate each English tourist phrase.\n\n"
        f"Phrases:\n{sentences_block}\n\n"
        f"Return a JSON object where each key is the sentence id and the value is an object "
        f"with 'target' ({target_language}) and 'native' ({native_language}) fields.\n"
        f"Example: {{\"hello\": {{\"target\": \"Szia\", \"native\": \"Hallo\"}}}}"
    )

    response = llm.complete_json(prompt, system=system)
    parsed = response.parsed
    if not isinstance(parsed, dict):
        raise ValueError(f"Unexpected phrase generation response: {type(parsed)}")
    return parsed


# ── Pass 2: Image generation ─────────────────────────────────────────────────

def _generate_one_image(
    sentence_id: str,
    prompt: str,
    style: str,
    img_config: ImageGenerationConfig,
    api_keys: dict[str, str | None],
    client: httpx.Client,
) -> tuple[bytes, str]:
    """Generate a single image using the configured provider. Returns (bytes, ext)."""
    provider = img_config.provider
    model = img_config.model
    width = img_config.width
    height = img_config.height
    full_prompt = f"{prompt}, {style}" if style else prompt

    if provider == "fal":
        from pipeline.fal_client import FalImageClient
        c = FalImageClient(api_keys.get("fal"), client=client)
        return c.generate(model=model, prompt=full_prompt, width=width, height=height)
    elif provider == "google":
        from pipeline.gemini_image_client import GeminiImageClient
        c = GeminiImageClient(api_keys.get("google"), client=client)
        return c.generate(model=model, prompt=full_prompt, width=width, height=height)
    elif provider == "together":
        from pipeline.together_client import TogetherImageClient
        c = TogetherImageClient(api_keys.get("together"), client=client)
        return c.generate(model=model, prompt=full_prompt, width=width, height=height)
    elif provider == "modelscope":
        from pipeline.modelscope_client import ModelScopeImageClient
        c = ModelScopeImageClient(api_keys.get("modelscope"), client=client)
        return c.generate(model=model, prompt=full_prompt, width=width, height=height)
    else:
        raise ValueError(f"Unknown image provider: {provider}")


def generate_images(
    sentences: list[dict],
    img_config: ImageGenerationConfig,
    output_base: Path,
    api_keys: dict[str, str | None],
    max_workers: int = 4,
) -> dict[str, str]:
    """Generate shared images for all sentences, skipping existing ones.

    Returns {sentence_id: relative_path_from_output_base}.
    Images are stored in output/travel-base/images/<id>.<ext>.
    """
    dest_dir = shared_images_dir(output_base)
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Check which images already exist
    existing: dict[str, str] = {}
    for f in dest_dir.iterdir():
        if f.is_file() and not f.name.startswith("."):
            existing[f.stem] = str(f.relative_to(output_base))

    to_generate = [s for s in sentences if s["id"] not in existing]
    if not to_generate:
        print(f"  All {len(existing)} images already exist — skipping generation")
        return existing

    print(f"  {len(existing)} existing, generating {len(to_generate)} new images...")

    client = httpx.Client(timeout=120.0)
    results = dict(existing)

    def _gen(s: dict) -> tuple[str, str] | None:
        try:
            image_bytes, ext = _generate_one_image(
                s["id"], s["image_prompt"], img_config.style,
                img_config, api_keys, client,
            )
            dest = dest_dir / f"{s['id']}{ext}"
            dest.write_bytes(image_bytes)
            rel = str(dest.relative_to(output_base))
            return s["id"], rel
        except Exception as e:
            print(f"    ERROR {s['id']}: {e}")
            return None

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_gen, s): s for s in to_generate}
        for future in as_completed(futures):
            result = future.result()
            if result:
                sid, path = result
                results[sid] = path
                print(f"    ✓ {sid}")

    return results


# ── Pass 3: Audio generation ─────────────────────────────────────────────────

def _pcm_to_wav(pcm_bytes: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(PCM_SAMPLE_RATE)
        w.writeframes(pcm_bytes)
    return buf.getvalue()


def _gemini_tts(text: str, model: str, voice: str, api_key: str, client: httpx.Client) -> bytes:
    url = f"{GEMINI_TTS_BASE_URL}/{model}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": f"Say the following out loud, clearly and naturally: {text}"}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}

    for attempt in range(3):
        resp = client.post(url, json=payload, headers=headers)
        if resp.status_code == 200:
            break
        if attempt < 2:
            time.sleep(2 * (attempt + 1))
    else:
        raise RuntimeError(f"TTS failed: {resp.status_code} {resp.text[:200]}")

    data = resp.json()
    part = data["candidates"][0]["content"]["parts"][0]
    inline = part.get("inlineData") or part.get("inline_data")
    return base64.b64decode(inline["data"])


def generate_audio(
    cards: list[dict],
    audio_config: AudioGenerationConfig,
    output_base: Path,
    deck_id: str,
    api_key: str,
    max_workers: int = 4,
) -> dict[str, str]:
    """Generate TTS audio for each card's target phrase.

    Returns {sentence_id: relative_path_from_output_base}.
    Skips cards that already have audio on disk.
    """
    dest_dir = audio_dir(output_base, deck_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    ext = "wav" if audio_config.provider == "gemini" else "mp3"

    # Check existing
    existing: dict[str, str] = {}
    for f in dest_dir.iterdir():
        if f.is_file() and f.suffix in (".wav", ".mp3"):
            existing[f.stem] = str(f.relative_to(output_base))

    to_generate = [c for c in cards if c["id"] not in existing]
    if not to_generate:
        print(f"  All {len(existing)} audio files already exist — skipping generation")
        return existing

    print(f"  {len(existing)} existing, generating {len(to_generate)} audio files...")

    client = httpx.Client(timeout=60.0)
    results = dict(existing)

    def _gen(card: dict) -> tuple[str, str] | None:
        text = card["target"]  # speak the target language phrase
        try:
            provider = audio_config.provider
            if provider == "gemini":
                pcm = _gemini_tts(text, audio_config.model, audio_config.voice_name, api_key, client)
                audio_bytes = _pcm_to_wav(pcm)
            else:
                raise ValueError(f"Unsupported audio provider for travel pipeline: {provider}")

            dest = dest_dir / f"{card['id']}.{ext}"
            dest.write_bytes(audio_bytes)
            rel = str(dest.relative_to(output_base))
            return card["id"], rel
        except Exception as e:
            print(f"    ERROR {card['id']}: {e}")
            return None

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_gen, c): c for c in to_generate}
        for future in as_completed(futures):
            result = future.result()
            if result:
                sid, path = result
                results[sid] = path

    return results


# ── Card building ─────────────────────────────────────────────────────────────

def build_cards(
    sentences: list[dict],
    phrases: dict[str, dict[str, str]],
    image_paths: dict[str, str],
    audio_paths: dict[str, str],
) -> list[dict]:
    """Merge all passes into the final travel_cards.json format."""
    cards = []
    for s in sentences:
        sid = s["id"]
        phrase = phrases.get(sid, {})
        target = phrase.get("target", "")
        native = phrase.get("native", "")
        if not target or not native:
            print(f"  SKIP {sid} — missing translation")
            continue
        card: dict = {
            "id": sid,
            "category": s["category"],
            "en": s["en"],
            "native": native,   # front: what the learner already knows
            "target": target,   # back: what they're learning
        }
        if sid in image_paths:
            card["image"] = sid  # key into shared cardImages map
        if sid in audio_paths:
            card["audio"] = sid  # key into per-deck cardAudios map
        cards.append(card)
    return cards
