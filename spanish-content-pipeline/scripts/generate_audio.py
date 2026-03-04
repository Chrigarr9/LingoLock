"""Standalone script: Generate audio for existing pipeline output."""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.audio_generator import AudioGenerator
from pipeline.config import load_config
from pipeline.models import SentencePair


def main():
    parser = argparse.ArgumentParser(description="Generate TTS audio for pipeline sentences")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--chapters", default=None, help="Chapter range (e.g. '1-3' or '1'). Defaults to all.")
    args = parser.parse_args()

    load_dotenv()
    config = load_config(Path(args.config))

    if not config.audio_generation or not config.audio_generation.enabled:
        print("Audio generation disabled in config")
        sys.exit(0)

    # Determine API key
    if config.audio_generation.provider == "google":
        api_key = os.environ.get("GOOGLE_TTS_API_KEY")
        if not api_key:
            print("Error: GOOGLE_TTS_API_KEY not set")
            sys.exit(1)
    elif config.audio_generation.provider == "openai":
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            print("Error: OPENAI_API_KEY not set")
            sys.exit(1)
    else:
        print(f"Error: Unknown audio provider '{config.audio_generation.provider}'")
        sys.exit(1)

    output_base = Path("output")

    # Parse chapter range
    if args.chapters:
        if "-" in args.chapters:
            start, end = args.chapters.split("-", 1)
            chapter_range = range(int(start) - 1, int(end))
        else:
            idx = int(args.chapters) - 1
            chapter_range = range(idx, idx + 1)
    else:
        chapter_range = range(config.chapter_count)

    # Load translations from pipeline output
    all_sentences: list[SentencePair] = []
    for i in chapter_range:
        trans_path = output_base / config.deck.id / "translations" / f"chapter_{i + 1:02d}.json"
        if trans_path.exists():
            pairs = json.loads(trans_path.read_text())
            for p in pairs:
                all_sentences.append(SentencePair(**p))
        else:
            print(f"  WARNING: {trans_path} not found — skipping chapter {i + 1}")

    print(f"Generating audio for {len(all_sentences)} sentences...")
    generator = AudioGenerator(config, api_key=api_key, output_base=output_base)
    manifest = generator.generate_all(all_sentences)
    success = sum(1 for e in manifest.audio.values() if e.status == "success")
    failed = sum(1 for e in manifest.audio.values() if e.status == "failed")
    print(f"Done: {success} generated, {failed} failed")


if __name__ == "__main__":
    main()
