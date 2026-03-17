"""Benchmark: Story Audit (Pass 5) — cross-story audit with seeded issues.

Also provides compute_audit_metrics() used by bench_chapter_audit.
"""

import json
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, usage_from_llm_response, cost_from_llm_response, run_models_parallel, filter_new_models
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from pipeline.story_auditor import find_issues
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_audit_metrics(
    expected_issues: list[dict],
    found_indices: set[int],
    total_fixes: int,
) -> dict:
    """Compute precision/recall of audit results against expected issues."""
    expected_indices = {issue["sentence_index"] for issue in expected_issues}
    true_positives = len(found_indices & expected_indices)
    false_positives = len(found_indices - expected_indices)
    false_negatives = len(expected_indices - found_indices)

    precision = true_positives / max(1, true_positives + false_positives)
    recall = true_positives / max(1, len(expected_indices))

    f1 = 2 * precision * recall / max(0.001, precision + recall)

    return {
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1": round(f1, 3),
        "total_expected": len(expected_indices),
        "total_fixes": total_fixes,
    }


def _run_single_model(model_entry: dict, sentences_by_chapter: dict, characters: list[dict],
                       chapter_configs: list[dict], expected: dict):
    """Run story audit for a single model."""
    model_name = model_entry["model"]
    provider = model_entry.get("provider", "openrouter")
    temperature = model_entry.get("temperature", 0.3)

    api_key = get_api_key_for_provider(provider)
    llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

    try:
        (((issues, unnamed), llm_response), duration) = run_with_timing(
            lambda: find_issues(
                chapters=sentences_by_chapter,
                characters=characters,
                chapter_configs=chapter_configs,
                llm=llm,
            )
        )
        found_indices = {i.sentence_index for i in issues}
        metrics = compute_audit_metrics(expected["issues"], found_indices, total_fixes=len(issues))
        metrics["unnamed_characters_found"] = len(unnamed)

        result = BenchmarkResult(
            task="audit",
            model=model_name,
            provider=provider,
            temperature=temperature,
            input_fixture="poisoned_chapter.json",
            duration_seconds=round(duration, 2),
            usage=usage_from_llm_response(llm_response) if llm_response else {},
            cost_estimate_usd=cost_from_llm_response(llm_response) if llm_response else None,
            raw_output=json.dumps({
                "fixes": [f.model_dump() for f in fixes],
                "unnamed": [u.model_dump() for u in unnamed],
            }),
            parsed_output={
                "fixes": [f.model_dump() for f in fixes],
                "unnamed": [u.model_dump() for u in unnamed],
            },
            deterministic_metrics=metrics,
        )
        print(f"  [{model_name}] P={metrics['precision']:.2f} R={metrics['recall']:.2f} F1={metrics['f1']:.2f} "
              f"({metrics['true_positives']}tp/{metrics['false_positives']}fp/{metrics['false_negatives']}fn) "
              f"{duration:.1f}s")
    except Exception as e:
        result = BenchmarkResult(
            task="audit", model=model_name, provider=provider,
            temperature=temperature, input_fixture="poisoned_chapter.json",
            duration_seconds=0, usage={}, raw_output="", parsed_output=None,
            deterministic_metrics={}, error=str(e),
        )
        print(f"  [{model_name}] ERROR: {e}")

    save_result(result, RESULTS)
    return result


def run_audit_benchmark(bench_config_path: Path | None = None, parallel: bool = False, max_workers: int = 4):
    """Run story audit benchmark with poisoned chapter."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    poisoned = ChapterScene(**json.loads((FIXTURES / "poisoned_chapter.json").read_text()))
    expected = json.loads((FIXTURES / "expected_issues.json").read_text())

    sentences_by_chapter: dict[int, list[str]] = {}
    for scene in poisoned.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences_by_chapter.setdefault(1, []).append(sent.source)

    characters = [{"name": fixture_config.protagonist.name, "role": "protagonist",
                   "visual_tag": fixture_config.protagonist.visual_tag or ""}]
    for sc in fixture_config.secondary_characters:
        characters.append({"name": sc.name, "role": sc.role or "secondary character",
                           "chapters": sc.chapters, "visual_tag": sc.visual_tag or ""})

    chapter_configs = [{
        "title": ch.title,
        "cefr_level": ch.cefr_level or fixture_config.story.cefr_level,
        "context": ch.context,
    } for ch in fixture_config.story.chapters]

    models = bench_config["models"].get("story_audit", [])
    models = filter_new_models("audit", models, RESULTS)
    if not models:
        print("No story_audit models in bench_config.yaml")
        return

    print(f"=== Benchmark: Story Audit ({len(models)} models, {len(expected['issues'])} seeded issues{', parallel' if parallel else ''}) ===")

    def run_one(entry):
        return _run_single_model(entry, sentences_by_chapter, characters, chapter_configs, expected)

    if parallel:
        run_models_parallel(models, run_one, max_workers=max_workers)
    else:
        for entry in models:
            run_one(entry)


if __name__ == "__main__":
    run_audit_benchmark()
