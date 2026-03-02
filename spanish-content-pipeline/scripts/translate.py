"""Run Pass 2: Sentence Translation only."""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.llm import create_client
from pipeline.sentence_translator import SentenceTranslator
from scripts.run_all import get_api_key, parse_chapter_range


def main():
    parser = argparse.ArgumentParser(description="Translate story sentences (Pass 2)")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--chapters", default=None, help="Chapter range (e.g. '1-3' or '1')")
    args = parser.parse_args()

    load_dotenv()
    config = load_config(Path(args.config))
    api_key = get_api_key(config)

    chapter_range = (
        parse_chapter_range(args.chapters, config.chapter_count)
        if args.chapters
        else range(config.chapter_count)
    )

    llm = create_client(
        provider=config.llm.provider,
        api_key=api_key,
        model=config.llm.model,
        temperature=config.llm.temperature,
        max_retries=config.llm.max_retries,
    )

    print("=== Pass 2: Sentence Translation ===")
    translator = SentenceTranslator(config, llm)
    for i in chapter_range:
        ch = config.story.chapters[i]
        story_path = Path("output") / config.deck.id / "stories" / f"chapter_{i+1:02d}.txt"
        if not story_path.exists():
            print(f"  Chapter {i+1}: SKIPPED (story not generated yet)")
            continue
        story_text = story_path.read_text()
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        pairs = translator.translate_chapter(i, story_text)
        print(f"done ({len(pairs)} sentences)")


if __name__ == "__main__":
    main()
