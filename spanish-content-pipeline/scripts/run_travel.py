"""Travel quick-deck pipeline.

Generates a phrasebook deck from the universal base sentences for any language pair.

Pass 1: Phrase generation  — LLM translates 56 English concepts → target + native phrases
Pass 2: Image generation   — generates shared images (reuses existing ones automatically)
Pass 3: Audio generation   — TTS per phrase, stored per deck
Output: output/<deck-id>/travel_cards.json

Usage:
  uv run python scripts/run_travel.py --config configs/travel_hu_de_quick.yaml
  uv run python scripts/run_travel.py --config configs/travel_hu_de_quick.yaml --skip-audio
  uv run python scripts/run_travel.py --config configs/travel_hu_de_quick.yaml --skip-images
  uv run python scripts/run_travel.py --config configs/travel_hu_de_quick.yaml --phrases-only

Then bundle for the app:
  npx tsx scripts/build-travel-content.ts hu-de-quick
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import yaml

from pipeline.config import load_travel_config
from pipeline.llm import create_client
from pipeline.travel_pipeline import (
    build_cards,
    generate_audio,
    generate_images,
    generate_phrases,
    shared_images_dir,
)

BASE_SENTENCES_PATH = Path(__file__).resolve().parent.parent / "travel" / "base_sentences.yaml"


def load_base_sentences() -> list[dict]:
    with open(BASE_SENTENCES_PATH) as f:
        data = yaml.safe_load(f)
    return data["sentences"]


def get_api_key(provider: str) -> str | None:
    if provider == "google":
        return os.environ.get("GEMINI_API_KEY")
    return os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPEN_ROUTER_API_KEY")


def get_image_api_keys() -> dict[str, str | None]:
    return {
        "fal": os.environ.get("FAL_KEY") or os.environ.get("FAL_AI_API_KEY"),
        "google": os.environ.get("GEMINI_API_KEY"),
        "together": os.environ.get("TOGETHER_API_KEY"),
        "modelscope": os.environ.get("MODEL_SCOPE_API_KEY"),
    }


def main():
    parser = argparse.ArgumentParser(description="Build a travel quick-deck")
    parser.add_argument("--config", required=True, help="Path to travel deck config YAML")
    parser.add_argument("--skip-images", action="store_true", help="Skip image generation")
    parser.add_argument("--skip-audio", action="store_true", help="Skip audio generation")
    parser.add_argument("--phrases-only", action="store_true", help="Run Pass 1 only (no images/audio)")
    parser.add_argument("--regen-phrases", action="store_true",
                        help="Re-run phrase generation even if travel_cards.json exists")
    args = parser.parse_args()

    load_dotenv()
    config = load_travel_config(Path(args.config))

    deck_id = config.deck.id
    output_base = Path("output")
    out_dir = output_base / deck_id
    out_dir.mkdir(parents=True, exist_ok=True)

    cards_path = out_dir / "travel_cards.json"

    print(f"Travel pipeline: {config.deck.name}")
    print(f"Language pair:   {config.languages.native} → {config.languages.target}")
    print(f"Deck ID:         {deck_id}")
    print()

    sentences = load_base_sentences()
    # Resolve [language] placeholder in "I speak a little [language]"
    for s in sentences:
        s["en"] = s["en"].replace("[language]", config.languages.target)

    # ── Pass 1: Phrase generation ────────────────────────────────────────

    existing_phrases: dict[str, dict[str, str]] = {}
    if cards_path.exists() and not args.regen_phrases:
        existing_cards = json.loads(cards_path.read_text())
        for card in existing_cards:
            existing_phrases[card["id"]] = {
                "target": card.get("target", ""),
                "native": card.get("native", ""),
            }
        print(f"Pass 1: Phrases already generated ({len(existing_phrases)} cards) — skipping")
        print("        Use --regen-phrases to re-run")
    else:
        print(f"Pass 1: Generating phrases ({config.languages.native} → {config.languages.target})...")
        model_cfg = config.models.phrase_generation
        api_key = get_api_key(model_cfg.provider)
        if not api_key:
            print(f"Error: no API key for provider '{model_cfg.provider}'")
            sys.exit(1)

        llm = create_client(
            provider=model_cfg.provider,
            api_key=api_key,
            model=model_cfg.model,
            temperature=model_cfg.temperature,
        )
        existing_phrases = generate_phrases(
            sentences,
            target_language=config.languages.target,
            native_language=config.languages.native,
            llm=llm,
        )
        missing = [s["id"] for s in sentences if s["id"] not in existing_phrases]
        if missing:
            print(f"  WARNING: Missing translations for: {missing}")
        print(f"  {len(existing_phrases)} phrases generated")

    if args.phrases_only:
        # Save preliminary cards without images/audio and exit
        cards = build_cards(sentences, existing_phrases, {}, {})
        cards_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2))
        print(f"\nSaved {len(cards)} cards to {cards_path} (phrases only)")
        return

    # ── Pass 2: Image generation ─────────────────────────────────────────

    image_paths: dict[str, str] = {}
    if args.skip_images:
        print("Pass 2: Images — skipped")
        # Still collect existing image paths for card building
        img_dir = shared_images_dir(output_base)
        if img_dir.exists():
            for f in img_dir.iterdir():
                if f.is_file() and not f.name.startswith("."):
                    image_paths[f.stem] = str(f.relative_to(output_base))
    elif config.image_generation and config.image_generation.enabled:
        print("Pass 2: Images (shared — reusing existing)...")
        api_keys = get_image_api_keys()
        image_paths = generate_images(
            sentences,
            img_config=config.image_generation,
            output_base=output_base,
            api_keys=api_keys,
        )
        print(f"  {len(image_paths)} images available")
    else:
        print("Pass 2: Images — disabled in config")

    # ── Pass 3: Audio generation ─────────────────────────────────────────

    audio_paths: dict[str, str] = {}
    cards_for_audio = build_cards(sentences, existing_phrases, image_paths, {})

    if args.skip_audio:
        print("Pass 3: Audio — skipped")
        # Collect existing audio paths
        a_dir = output_base / deck_id / "audio"
        if a_dir.exists():
            for f in a_dir.iterdir():
                if f.is_file() and f.suffix in (".wav", ".mp3"):
                    audio_paths[f.stem] = str(f.relative_to(output_base))
    elif config.audio_generation and config.audio_generation.enabled:
        print(f"Pass 3: Audio ({config.languages.target} TTS)...")
        provider = config.audio_generation.provider
        if provider == "gemini":
            api_key = os.environ.get("GEMINI_API_KEY")
        elif provider == "openai":
            api_key = os.environ.get("OPENAI_API_KEY")
        else:
            api_key = None

        if not api_key:
            print(f"  WARNING: No API key for audio provider '{provider}' — skipping")
        else:
            audio_paths = generate_audio(
                cards_for_audio,
                audio_config=config.audio_generation,
                output_base=output_base,
                deck_id=deck_id,
                api_key=api_key,
            )
            print(f"  {len(audio_paths)} audio files generated")
    else:
        print("Pass 3: Audio — disabled in config")

    # ── Build final cards ────────────────────────────────────────────────

    cards = build_cards(sentences, existing_phrases, image_paths, audio_paths)
    cards_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2))

    with_images = sum(1 for c in cards if "image" in c)
    with_audio = sum(1 for c in cards if "audio" in c)
    print(f"\nDone. {len(cards)} cards — {with_images} with images, {with_audio} with audio")
    print(f"Saved to {cards_path}")
    print(f"\nNext: npx tsx scripts/build-travel-content.ts {deck_id}")


if __name__ == "__main__":
    main()
