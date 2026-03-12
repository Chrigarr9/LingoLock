"""Benchmark: Vocabulary Gap Filler (Pass 4)."""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, usage_from_llm_response, cost_from_llm_response, sum_usage, run_models_parallel, filter_new_models
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


# Words verified absent from raw_chapter.json fixture (no exact or lemma overlap).
# "mercado" and "ventana" were in the fixture text; replaced with "hospital" and "paraguas".
MISSING_WORDS = ["restaurante", "cocinar", "hospital", "caminar", "dormir",
                 "biblioteca", "autobús", "tienda", "dinero", "paraguas"]


def _run_single_model(model_entry: dict, fixture_config: DeckConfig, raw_chapter: ChapterScene, flat_text: str):
    """Run gap filler for a single model."""
    model_name = model_entry["model"]
    provider = model_entry.get("provider", "openrouter")
    temperature = model_entry.get("temperature", 0.7)

    api_key = get_api_key_for_provider(provider)
    llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

    frequency_data = {w: i + 1 for i, w in enumerate(MISSING_WORDS)}
    stories = {0: flat_text}

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
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
                    top_n=len(MISSING_WORDS),
                )
            )
            all_shots = [shot for shots in gap_results.values() for shot in shots]
            metrics = compute_gap_filler_metrics(MISSING_WORDS, all_shots)
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
            print(f"  [{model_name}] {metrics['target_words_covered']}/{metrics['target_words_total']} covered, "
                  f"{metrics['shot_count']} shots, {duration:.1f}s")
        except Exception as e:
            result = BenchmarkResult(
                task="gap_filler", model=model_name, provider=provider,
                temperature=temperature, input_fixture="raw_chapter.json",
                duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                deterministic_metrics={}, error=str(e),
            )
            print(f"  [{model_name}] ERROR: {e}")

        save_result(result, RESULTS)
        return result


def run_gap_filler_benchmark(bench_config_path: Path | None = None, parallel: bool = False, max_workers: int = 4):
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

    models = bench_config["models"].get("gap_filling", [])
    models = filter_new_models("gap_filler", models, RESULTS)
    if not models:
        print("No gap_filling models in bench_config.yaml")
        return

    print(f"=== Benchmark: Gap Filler ({len(models)} models, {len(MISSING_WORDS)} target words{', parallel' if parallel else ''}) ===")

    def run_one(entry):
        return _run_single_model(entry, fixture_config, raw_chapter, flat_text)

    if parallel:
        run_models_parallel(models, run_one, max_workers=max_workers)
    else:
        for entry in models:
            run_one(entry)


if __name__ == "__main__":
    run_gap_filler_benchmark()
