"""Run all or selected benchmark tasks."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.bench_story_gen import run_story_gen_benchmark
from benchmarks.bench_simplification import run_simplification_benchmark
from benchmarks.bench_grammar import run_grammar_benchmark
from benchmarks.bench_gap_filler import run_gap_filler_benchmark
from benchmarks.bench_chapter_audit import run_chapter_audit_benchmark
from benchmarks.bench_audit import run_audit_benchmark
from benchmarks.bench_translation import run_translation_benchmark
from benchmarks.bench_word_extraction import run_word_extraction_benchmark

ALL_TASKS = {
    "story_gen": run_story_gen_benchmark,
    "simplification": run_simplification_benchmark,
    "grammar": run_grammar_benchmark,
    "gap_filler": run_gap_filler_benchmark,
    "chapter_audit": run_chapter_audit_benchmark,
    "audit": run_audit_benchmark,
    "translation": run_translation_benchmark,
    "word_extraction": run_word_extraction_benchmark,
}


def main():
    parser = argparse.ArgumentParser(description="Run benchmark tasks")
    parser.add_argument(
        "--tasks",
        default=None,
        help=f"Comma-separated task names. Available: {','.join(ALL_TASKS.keys())}. Default: all.",
    )
    parser.add_argument(
        "--config",
        default=None,
        help="Path to bench_config.yaml. Default: benchmarks/bench_config.yaml",
    )
    args = parser.parse_args()

    config_path = Path(args.config) if args.config else None

    if args.tasks:
        task_names = [t.strip() for t in args.tasks.split(",")]
        for name in task_names:
            if name not in ALL_TASKS:
                print(f"Unknown task: {name}. Available: {', '.join(ALL_TASKS.keys())}")
                sys.exit(1)
    else:
        task_names = list(ALL_TASKS.keys())

    print(f"Running {len(task_names)} benchmark(s): {', '.join(task_names)}\n")
    for name in task_names:
        ALL_TASKS[name](config_path)
        print()

    print("All benchmarks complete. Results in benchmarks/results/")


if __name__ == "__main__":
    main()
