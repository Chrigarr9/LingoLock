"""Run the full content pipeline end-to-end."""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Add parent dir to path so pipeline package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import DeckConfig, load_config
from pipeline.coverage_checker import check_coverage, load_frequency_data
from pipeline.llm import create_client
from pipeline.sentence_translator import SentenceTranslator
from pipeline.story_generator import StoryGenerator
from pipeline.vocabulary_builder import build_vocabulary
from pipeline.word_extractor import WordExtractor


def parse_chapter_range(spec: str, max_chapters: int) -> range:
    """Parse '1-3' or '1' into a range. Chapters are 1-indexed in the CLI."""
    if "-" in spec:
        start, end = spec.split("-", 1)
        return range(int(start) - 1, int(end))
    else:
        idx = int(spec) - 1
        return range(idx, idx + 1)


def get_api_key(config: DeckConfig) -> str:
    """Get the right API key based on provider in config."""
    if config.llm.provider == "google":
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            print("Error: GEMINI_API_KEY not set in environment or .env file")
            sys.exit(1)
        return key
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("Error: OPENROUTER_API_KEY not set in environment or .env file")
        sys.exit(1)
    return key


def main():
    parser = argparse.ArgumentParser(description="Run the full content pipeline")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--chapters", default=None, help="Chapter range (e.g. '1-3' or '1'). Defaults to all.")
    parser.add_argument("--frequency-file", default=None, help="Path to FrequencyWords file (e.g. data/frequency/es_50k.txt)")
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

    output_base = Path("output")
    print(f"Pipeline: {config.deck.name}")
    print(f"Chapters: {chapter_range.start + 1}-{chapter_range.stop}")
    print(f"Model: {config.llm.model}")
    print()

    # Pass 1: Story Generation
    print("=== Pass 1: Story Generation ===")
    story_gen = StoryGenerator(config, llm, output_base=output_base)
    stories = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        stories[i] = story_gen.generate_chapter(i)
        print("done")

    # Pass 2: Sentence Translation
    print("\n=== Pass 2: Sentence Translation ===")
    translator = SentenceTranslator(config, llm, output_base=output_base)
    all_pairs = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        all_pairs[i] = translator.translate_chapter(i, stories[i])
        print(f"done ({len(all_pairs[i])} sentences)")

    # Pass 3: Word Extraction
    print("\n=== Pass 3: Word Extraction ===")
    extractor = WordExtractor(config, llm, output_base=output_base)
    all_chapters = []
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        chapter_words = extractor.extract_chapter(i, all_pairs[i])
        all_chapters.append(chapter_words)
        print(f"done ({len(chapter_words.words)} words)")

    # BUILD: Vocabulary Database
    print("\n=== Building Vocabulary Database ===")
    frequency_data = {}
    if args.frequency_file:
        freq_path = Path(args.frequency_file)
        if freq_path.exists():
            frequency_data = load_frequency_data(freq_path)
            print(f"  Loaded {len(frequency_data)} frequency entries")

    chapter_titles = {
        i + 1: config.story.chapters[i].title
        for i in chapter_range
    }

    deck = build_vocabulary(
        all_chapters,
        frequency_data=frequency_data,
        chapter_titles=chapter_titles,
        deck_id=config.deck.id,
        deck_name=config.deck.name,
    )
    vocab_path = output_base / config.deck.id / "vocabulary.json"
    vocab_path.parent.mkdir(parents=True, exist_ok=True)
    vocab_path.write_text(
        json.dumps(deck.model_dump(), ensure_ascii=False, indent=2)
    )
    print(f"  {deck.total_words} unique vocabulary entries saved to {vocab_path}")

    # REPORT: Coverage Analysis
    if frequency_data:
        print("\n=== Coverage Report ===")
        report = check_coverage(deck, frequency_data, top_n=1000)
        report_path = output_base / config.deck.id / "coverage_report.json"
        report_path.write_text(
            json.dumps(report.model_dump(), ensure_ascii=False, indent=2)
        )
        print(f"  Total vocabulary: {report.total_vocabulary}")
        print(f"  With frequency data: {report.frequency_matched}")
        print(f"  Top 1000 coverage: {report.top_1000_covered}/{report.top_1000_total} ({report.coverage_percent}%)")
        print(f"  Report saved to {report_path}")

    print("\nPipeline complete!")


if __name__ == "__main__":
    main()
