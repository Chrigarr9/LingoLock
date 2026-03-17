"""Benchmark: Story Generation (Pass 0).

Runs StoryGenerator.generate_chapter() with each candidate model
and stores structured results for later evaluation.
"""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, usage_from_llm_response, cost_from_llm_response, run_models_parallel, model_slug, filter_new_models
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from pipeline.story_generator import StoryGenerator
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_deterministic_metrics(
    chapter: ChapterScene,
    protagonist_name: str = "",
    secondary_characters: list[str] | None = None,
) -> dict:
    """Compute deterministic metrics from a generated chapter."""
    secondary_characters = secondary_characters or []
    sentences = []
    for scene in chapter.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences.append(sent.source)

    sentence_count = len(sentences)
    word_count = sum(len(s.split()) for s in sentences)
    shot_count = sum(len(scene.shots) for scene in chapter.scenes)
    scene_count = len(chapter.scenes)

    # Dialogue: count sentences with guillemets
    dialogue_count = sum(1 for s in sentences if "«" in s)

    # Character mentions
    protagonist_mentions = sum(1 for s in sentences if protagonist_name.lower() in s.lower()) if protagonist_name else 0
    char_mentions = {}
    for name in secondary_characters:
        char_mentions[name] = sum(1 for s in sentences if name.lower() in s.lower())

    return {
        "sentence_count": sentence_count,
        "word_count": word_count,
        "shot_count": shot_count,
        "scene_count": scene_count,
        "dialogue_count": dialogue_count,
        "dialogue_ratio": round(dialogue_count / max(1, sentence_count), 2),
        "avg_sentence_length": round(word_count / max(1, sentence_count), 1),
        "protagonist_mentions": protagonist_mentions,
        "character_mentions": char_mentions,
    }


def _run_single_model(model_entry: dict, fixture_config: DeckConfig, sc_names: list[str]):
    """Run story generation benchmark for a single model."""
    model_name = model_entry["model"]
    provider = model_entry.get("provider", "openrouter")
    temperature = model_entry.get("temperature", 0.8)

    api_key = get_api_key_for_provider(provider)
    llm = create_client(
        provider=provider, api_key=api_key, model=model_name,
        temperature=temperature,
    )

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        gen = StoryGenerator(fixture_config, llm, output_base=tmp_path)

        try:
            ((chapter, llm_response), duration) = run_with_timing(
                lambda: gen.generate_chapter(0)
            )
            metrics = compute_deterministic_metrics(
                chapter,
                protagonist_name=fixture_config.protagonist.name,
                secondary_characters=sc_names,
            )
            result = BenchmarkResult(
                task="story_gen",
                model=model_name,
                provider=provider,
                temperature=temperature,
                input_fixture="test_chapter.yaml",
                duration_seconds=round(duration, 2),
                usage=usage_from_llm_response(llm_response) if llm_response else {},
                cost_estimate_usd=cost_from_llm_response(llm_response) if llm_response else None,
                raw_output=chapter.model_dump_json(),
                parsed_output=chapter.model_dump(),
                deterministic_metrics=metrics,
            )
            print(f"  [{model_name}] {metrics['sentence_count']} sentences, {metrics['scene_count']} scenes, "
                  f"{metrics['dialogue_count']} dialogue, {duration:.1f}s")
        except Exception as e:
            result = BenchmarkResult(
                task="story_gen",
                model=model_name,
                provider=provider,
                temperature=temperature,
                input_fixture="test_chapter.yaml",
                duration_seconds=0,
                usage={},
                raw_output="",
                parsed_output=None,
                deterministic_metrics={},
                error=str(e),
            )
            print(f"  [{model_name}] ERROR: {e}")

        save_result(result, RESULTS)
        return result


def run_story_gen_benchmark(bench_config_path: Path | None = None, parallel: bool = False, max_workers: int = 4):
    """Run story generation benchmark across all candidate models."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))

    models = bench_config["models"].get("story_generation", [])
    models = filter_new_models("story_gen", models, RESULTS)
    if not models:
        print("No story_generation models in bench_config.yaml")
        return

    sc_names = [sc.name for sc in fixture_config.secondary_characters]

    print(f"=== Benchmark: Story Generation ({len(models)} models{', parallel' if parallel else ''}) ===")

    def run_one(entry):
        return _run_single_model(entry, fixture_config, sc_names)

    if parallel:
        run_models_parallel(models, run_one, max_workers=max_workers)
    else:
        for entry in models:
            run_one(entry)


if __name__ == "__main__":
    run_story_gen_benchmark()
