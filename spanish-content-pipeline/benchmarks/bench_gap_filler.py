"""Benchmark: Vocabulary Gap Filler (Pass 4)."""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, usage_from_llm_response, cost_from_llm_response, sum_usage
from pipeline.config import DeckConfig
from pipeline.gap_filler import GapFiller
from pipeline.llm import create_client
from pipeline.models import ChapterScene, GapShot
from pipeline.story_generator import extract_flat_text
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_gap_filler_metrics(target_words: list[str], shots: list[GapShot]) -> dict:
    """Compute gap filler quality metrics."""
    covered = set()
    total_sentences = 0
    for shot in shots:
        covered.update(shot.covers)
        total_sentences += len(shot.sentences)

    target_set = set(target_words)
    words_covered = target_set & covered

    return {
        "target_words_total": len(target_set),
        "target_words_covered": len(words_covered),
        "coverage_ratio": round(len(words_covered) / max(1, len(target_set)), 3),
        "shot_count": len(shots),
        "total_sentences": total_sentences,
        "avg_sentences_per_shot": round(total_sentences / max(1, len(shots)), 1),
    }


def run_gap_filler_benchmark(bench_config_path: Path | None = None):
    """Run gap filler benchmark.

    Uses the raw_chapter fixture as existing story context and a small
    set of "missing" words as the gap fill target.
    """
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    flat_text = extract_flat_text(raw_chapter)

    # Simulate missing words — common words not in the fixture
    missing_words = ["restaurante", "cocinar", "plato", "caminar", "dormir",
                     "habitación", "calle", "autobús", "tienda", "dinero"]

    # Build fake frequency data for missing words
    frequency_data = {w: i + 1 for i, w in enumerate(missing_words)}
    stories = {0: flat_text}

    models = bench_config["models"].get("gap_filling", [])
    if not models:
        print("No gap_filling models in bench_config.yaml")
        return

    print(f"=== Benchmark: Gap Filler ({len(models)} models, {len(missing_words)} target words) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.7)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            # Write story context so gap filler can load it
            stories_dir = tmp_path / "stories"
            stories_dir.mkdir(parents=True, exist_ok=True)
            (stories_dir / "chapter_01.json").write_text(
                json.dumps(raw_chapter.model_dump(), ensure_ascii=False, indent=2)
            )

            filler = GapFiller(
                llm=llm,
                output_dir=tmp_path,
                config_chapters=fixture_config.story.chapters,
                target_language=fixture_config.languages.target,
                native_language=fixture_config.languages.native,
                dialect=fixture_config.languages.dialect or "",
                lang_code=fixture_config.languages.target_code,
                chapter_range=range(1),
                protagonist_name=fixture_config.protagonist.name,
                secondary_characters=fixture_config.secondary_characters,
                grammar_targets=fixture_config.story.grammar_targets,
            )

            try:
                ((gap_results, llm_responses), duration) = run_with_timing(
                    lambda: filler.fill_gaps(
                        stories=stories,
                        frequency_data=frequency_data,
                        top_n=len(missing_words),
                    )
                )
                all_shots = [shot for shots in gap_results.values() for shot in shots]
                metrics = compute_gap_filler_metrics(missing_words, all_shots)
                usage = sum_usage(llm_responses)

                result = BenchmarkResult(
                    task="gap_filler",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="raw_chapter.json",
                    duration_seconds=round(duration, 2),
                    usage=usage,
                    cost_estimate_usd=usage["cost_usd"] if usage["cost_usd"] else None,
                    raw_output=json.dumps(
                        {str(k): [s.model_dump() for s in v] for k, v in gap_results.items()},
                        ensure_ascii=False,
                    ),
                    parsed_output={str(k): [s.model_dump() for s in v] for k, v in gap_results.items()},
                    deterministic_metrics=metrics,
                )
                print(f"    {metrics['target_words_covered']}/{metrics['target_words_total']} covered, "
                      f"{metrics['shot_count']} shots, {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task="gap_filler", model=model_name, provider=provider,
                    temperature=temperature, input_fixture="raw_chapter.json",
                    duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                    deterministic_metrics={}, error=str(e),
                )
                print(f"    ERROR: {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_gap_filler_benchmark()
