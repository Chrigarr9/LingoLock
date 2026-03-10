"""Benchmark: Chapter Audit (Pass 4b) — per-chapter audit with seeded issues."""

import json
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.bench_audit import compute_audit_metrics
from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, usage_from_llm_response, cost_from_llm_response, run_models_parallel
from pipeline.chapter_auditor import audit_chapter
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def _run_single_model(model_entry: dict, poisoned: ChapterScene, ch_config: dict,
                       characters: list[dict], expected: dict):
    """Run chapter audit for a single model."""
    model_name = model_entry["model"]
    provider = model_entry.get("provider", "openrouter")
    temperature = model_entry.get("temperature", 0.3)

    api_key = get_api_key_for_provider(provider)
    llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

    try:
        ((actions, llm_response), duration) = run_with_timing(
            lambda: audit_chapter(
                chapter_scene=poisoned,
                chapter_config=ch_config,
                characters=characters,
                llm=llm,
                gap_words=[],
            )
        )
        found_indices = set()
        for a in actions:
            if a.sentence_index is not None:
                found_indices.add(a.sentence_index)
            if a.shot_index is not None:
                shot_idx = 0
                for scene in poisoned.scenes:
                    for shot in scene.shots:
                        if shot_idx == a.shot_index:
                            for sent in shot.sentences:
                                found_indices.add(sent.sentence_index)
                        shot_idx += 1

        metrics = compute_audit_metrics(expected["issues"], found_indices, total_fixes=len(actions))

        result = BenchmarkResult(
            task="chapter_audit",
            model=model_name,
            provider=provider,
            temperature=temperature,
            input_fixture="poisoned_chapter.json",
            duration_seconds=round(duration, 2),
            usage=usage_from_llm_response(llm_response) if llm_response else {},
            cost_estimate_usd=cost_from_llm_response(llm_response) if llm_response else None,
            raw_output=json.dumps([a.model_dump() for a in actions]),
            parsed_output=[a.model_dump() for a in actions],
            deterministic_metrics=metrics,
        )
        print(f"  [{model_name}] P={metrics['precision']:.2f} R={metrics['recall']:.2f} F1={metrics['f1']:.2f} "
              f"({metrics['true_positives']}tp/{metrics['false_positives']}fp/{metrics['false_negatives']}fn) "
              f"{duration:.1f}s")
    except Exception as e:
        result = BenchmarkResult(
            task="chapter_audit", model=model_name, provider=provider,
            temperature=temperature, input_fixture="poisoned_chapter.json",
            duration_seconds=0, usage={}, raw_output="", parsed_output=None,
            deterministic_metrics={}, error=str(e),
        )
        print(f"  [{model_name}] ERROR: {e}")

    save_result(result, RESULTS)
    return result


def run_chapter_audit_benchmark(bench_config_path: Path | None = None, parallel: bool = False, max_workers: int = 4):
    """Run chapter audit benchmark with poisoned chapter."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    poisoned = ChapterScene(**json.loads((FIXTURES / "poisoned_chapter.json").read_text()))
    expected = json.loads((FIXTURES / "expected_issues.json").read_text())

    ch_config = {
        "title": fixture_config.story.chapters[0].title,
        "cefr_level": fixture_config.story.chapters[0].cefr_level or fixture_config.story.cefr_level,
        "context": fixture_config.story.chapters[0].context,
    }
    characters = [{"name": fixture_config.protagonist.name, "role": "protagonist"}]
    for sc in fixture_config.secondary_characters:
        if 1 in sc.chapters:
            characters.append({"name": sc.name, "role": sc.role or "secondary character"})

    models = bench_config["models"].get("chapter_audit", [])
    if not models:
        print("No chapter_audit models in bench_config.yaml")
        return

    print(f"=== Benchmark: Chapter Audit ({len(models)} models, {len(expected['issues'])} seeded issues{', parallel' if parallel else ''}) ===")

    def run_one(entry):
        return _run_single_model(entry, poisoned, ch_config, characters, expected)

    if parallel:
        run_models_parallel(models, run_one, max_workers=max_workers)
    else:
        for entry in models:
            run_one(entry)


if __name__ == "__main__":
    run_chapter_audit_benchmark()
