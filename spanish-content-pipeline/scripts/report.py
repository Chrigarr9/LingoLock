"""Run REPORT step: Analyze vocabulary coverage against frequency data."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.coverage_checker import check_coverage, load_frequency_data
from pipeline.models import VocabularyEntry


def main():
    parser = argparse.ArgumentParser(description="Generate coverage report")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--frequency-file", required=True, help="Path to FrequencyWords file")
    parser.add_argument("--top-n", type=int, default=1000, help="Number of top frequent words to check (default: 1000)")
    args = parser.parse_args()

    config = load_config(Path(args.config))
    output_base = Path("output")

    vocab_path = output_base / config.deck.id / "vocabulary.json"
    if not vocab_path.exists():
        print(f"Error: vocabulary file not found at {vocab_path}")
        print("Run the build step first.")
        sys.exit(1)

    vocab = [VocabularyEntry(**v) for v in json.loads(vocab_path.read_text())]
    frequency_data = load_frequency_data(Path(args.frequency_file))

    print("=== Coverage Report ===")
    report = check_coverage(vocab, frequency_data, top_n=args.top_n)
    report_path = output_base / config.deck.id / "coverage_report.json"
    report_path.write_text(
        json.dumps(report.model_dump(), ensure_ascii=False, indent=2)
    )
    print(f"  Total vocabulary: {report.total_vocabulary}")
    print(f"  With frequency data: {report.frequency_matched}")
    print(f"  Top {args.top_n} coverage: {report.top_1000_covered}/{report.top_1000_total} ({report.coverage_percent}%)")
    if report.missing_words:
        print(f"  Top missing words: {', '.join(report.missing_words[:10])}")
    print(f"  Report saved to {report_path}")


if __name__ == "__main__":
    main()
