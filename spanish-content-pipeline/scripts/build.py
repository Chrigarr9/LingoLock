"""Run BUILD step: Merge word annotations into vocabulary database."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.coverage_checker import load_frequency_data
from pipeline.models import ChapterWords
from pipeline.vocabulary_builder import build_vocabulary
from scripts.run_all import parse_chapter_range


def main():
    parser = argparse.ArgumentParser(description="Build vocabulary database from extracted words")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--chapters", default=None, help="Chapter range (e.g. '1-3' or '1')")
    parser.add_argument("--frequency-file", default=None, help="Path to FrequencyWords file")
    args = parser.parse_args()

    config = load_config(Path(args.config))
    chapter_range = (
        parse_chapter_range(args.chapters, config.chapter_count)
        if args.chapters
        else range(config.chapter_count)
    )

    output_base = Path("output")

    # Load chapter words from disk
    all_chapters = []
    for i in chapter_range:
        words_path = output_base / config.deck.id / "words" / f"chapter_{i+1:02d}.json"
        if not words_path.exists():
            print(f"  Chapter {i+1}: SKIPPED (words not extracted yet)")
            continue
        all_chapters.append(ChapterWords(**json.loads(words_path.read_text())))

    # Load frequency data
    frequency_data = {}
    if args.frequency_file:
        freq_path = Path(args.frequency_file)
        if freq_path.exists():
            frequency_data = load_frequency_data(freq_path)
            print(f"  Loaded {len(frequency_data)} frequency entries")

    print("=== Building Vocabulary Database ===")
    vocab = build_vocabulary(all_chapters, frequency_data)
    vocab_path = output_base / config.deck.id / "vocabulary.json"
    vocab_path.parent.mkdir(parents=True, exist_ok=True)
    vocab_path.write_text(
        json.dumps([v.model_dump() for v in vocab], ensure_ascii=False, indent=2)
    )
    print(f"  {len(vocab)} unique vocabulary entries saved to {vocab_path}")


if __name__ == "__main__":
    main()
