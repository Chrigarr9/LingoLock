"""Benchmark: CEFR Simplification (Pass 1).

Runs CEFRSimplifier on the raw_chapter fixture with each candidate model.
"""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, usage_from_llm_response, cost_from_llm_response, run_models_parallel
from pipeline.cefr_simplifier import CEFRSimplifier
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"

# CEFR word limits per level
_WORD_LIMITS = {"A1": 12, "A2": 12, "B1": 18, "B2": 25}


def compute_deterministic_metrics(chapter: ChapterScene, cefr_level: str, lang: str = "es") -> dict:
    """Compute simplification quality metrics."""
    resolved = cefr_level.split("-")[-1] if "-" in cefr_level else cefr_level
    word_limit = _WORD_LIMITS.get(resolved, 12)

    sentences = []
    for scene in chapter.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences.append(sent.source)

    lengths = [len(s.split()) for s in sentences]

    return {
        "sentence_count": len(sentences),
        "avg_sentence_length_words": round(sum(lengths) / max(1, len(lengths)), 1),
        "max_sentence_length_words": max(lengths) if lengths else 0,
        "word_limit_for_level": word_limit,
        "sentences_exceeding_word_limit": sum(1 for l in lengths if l > word_limit),
        "scene_count": len(chapter.scenes),
        "shot_count": sum(len(s.shots) for s in chapter.scenes),
    }


def _run_single_model(model_entry: dict, fixture_config: DeckConfig, raw_chapter: ChapterScene, cefr: str):
    """Run CEFR simplification for a single model."""
    model_name = model_entry["model"]
    provider = model_entry.get("provider", "openrouter")
    temperature = model_entry.get("temperature", 0.3)

    api_key = get_api_key_for_provider(provider)
    llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

    with tempfile.TemporaryDirectory() as tmp:
        simplifier = CEFRSimplifier(fixture_config, llm, output_base=Path(tmp))

        try:
            ((chapter, llm_response), duration) = run_with_timing(
                lambda: simplifier.simplify_chapter(0, raw_chapter)
            )
            metrics = compute_deterministic_metrics(chapter, cefr)
            result = BenchmarkResult(
                task="simplification",
                model=model_name,
                provider=provider,
                temperature=temperature,
                input_fixture="raw_chapter.json",
                duration_seconds=round(duration, 2),
                usage=usage_from_llm_response(llm_response) if llm_response else {},
                cost_estimate_usd=cost_from_llm_response(llm_response) if llm_response else None,
                raw_output=chapter.model_dump_json(),
                parsed_output=chapter.model_dump(),
                deterministic_metrics=metrics,
            )
            exceed = metrics["sentences_exceeding_word_limit"]
            print(f"  [{model_name}] {metrics['sentence_count']} sentences, "
                  f"avg {metrics['avg_sentence_length_words']} words, "
                  f"{exceed} exceeding limit, {duration:.1f}s")
        except Exception as e:
            result = BenchmarkResult(
                task="simplification", model=model_name, provider=provider,
                temperature=temperature, input_fixture="raw_chapter.json",
                duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                deterministic_metrics={}, error=str(e),
            )
            print(f"  [{model_name}] ERROR: {e}")

        save_result(result, RESULTS)
        return result


def run_simplification_benchmark(bench_config_path: Path | None = None, parallel: bool = False, max_workers: int = 4):
    """Run CEFR simplification benchmark across all candidate models."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    cefr = fixture_config.story.chapters[0].cefr_level or fixture_config.story.cefr_level

    models = bench_config["models"].get("cefr_simplification", [])
    if not models:
        print("No cefr_simplification models in bench_config.yaml")
        return

    print(f"=== Benchmark: CEFR Simplification ({len(models)} models, target {cefr}{', parallel' if parallel else ''}) ===")

    def run_one(entry):
        return _run_single_model(entry, fixture_config, raw_chapter, cefr)

    if parallel:
        run_models_parallel(models, run_one, max_workers=max_workers)
    else:
        for entry in models:
            run_one(entry)


if __name__ == "__main__":
    run_simplification_benchmark()
