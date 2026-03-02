"""Run Pass 3: Word Extraction only."""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.llm import LLMClient
from pipeline.models import SentencePair
from pipeline.word_extractor import WordExtractor
from scripts.run_all import parse_chapter_range


def main():
    parser = argparse.ArgumentParser(description="Extract word annotations (Pass 3)")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--chapters", default=None, help="Chapter range (e.g. '1-3' or '1')")
    args = parser.parse_args()

    load_dotenv()
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("Error: OPENROUTER_API_KEY not set")
        sys.exit(1)

    config = load_config(Path(args.config))
    chapter_range = (
        parse_chapter_range(args.chapters, config.chapter_count)
        if args.chapters
        else range(config.chapter_count)
    )

    llm = LLMClient(
        api_key=api_key,
        model=config.llm.model,
        temperature=config.llm.temperature,
        max_retries=config.llm.max_retries,
    )

    print("=== Pass 3: Word Extraction ===")
    extractor = WordExtractor(config, llm)
    for i in chapter_range:
        ch = config.story.chapters[i]
        trans_path = Path("output") / config.deck.id / "translations" / f"chapter_{i+1:02d}.json"
        if not trans_path.exists():
            print(f"  Chapter {i+1}: SKIPPED (translations not generated yet)")
            continue
        pairs = [SentencePair(**p) for p in json.loads(trans_path.read_text())]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        chapter_words = extractor.extract_chapter(i, pairs)
        print(f"done ({len(chapter_words.words)} words)")


if __name__ == "__main__":
    main()
