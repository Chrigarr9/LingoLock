"""Benchmark: Translation (Pass 6)."""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, usage_from_llm_response, cost_from_llm_response
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from pipeline.sentence_translator import SentenceTranslator
from pipeline.story_generator import extract_flat_text
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_deterministic_metrics(source_sentences: list[str], pairs: list[dict]) -> dict:
    """Compute translation quality metrics."""
    translated_sources = {p["source"] for p in pairs}
    missing = [s for s in source_sentences if s not in translated_sources]

    ratios = []
    for p in pairs:
        src_words = len(p["source"].split())
        tgt_words = len(p["target"].split())
        if src_words > 0:
            ratios.append(tgt_words / src_words)

    return {
        "source_count": len(source_sentences),
        "translated_count": len(pairs),
        "missing_translations": len(missing),
        "avg_token_ratio": round(sum(ratios) / max(1, len(ratios)), 2),
    }


def run_translation_benchmark(bench_config_path: Path | None = None):
    """Run translation benchmark."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    flat_text = extract_flat_text(raw_chapter)
    source_sentences = flat_text.split("\n")

    models = bench_config["models"].get("translation", [])
    if not models:
        print("No translation models in bench_config.yaml")
        return

    print(f"=== Benchmark: Translation ({len(models)} models, {len(source_sentences)} sentences) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        with tempfile.TemporaryDirectory() as tmp:
            translator = SentenceTranslator(fixture_config, llm, output_base=Path(tmp))

            try:
                ((pairs, llm_response), duration) = run_with_timing(
                    lambda: translator.translate_chapter(0, flat_text)
                )
                pairs_dicts = [p.model_dump() for p in pairs]
                metrics = compute_deterministic_metrics(source_sentences, pairs_dicts)

                result = BenchmarkResult(
                    task="translation",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="raw_chapter.json",
                    duration_seconds=round(duration, 2),
                    usage=usage_from_llm_response(llm_response) if llm_response else {},
                    cost_estimate_usd=cost_from_llm_response(llm_response) if llm_response else None,
                    raw_output=json.dumps(pairs_dicts, ensure_ascii=False),
                    parsed_output=pairs_dicts,
                    deterministic_metrics=metrics,
                )
                print(f"    {metrics['translated_count']}/{metrics['source_count']} translated, "
                      f"ratio {metrics['avg_token_ratio']}, {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task="translation", model=model_name, provider=provider,
                    temperature=temperature, input_fixture="raw_chapter.json",
                    duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                    deterministic_metrics={}, error=str(e),
                )
                print(f"    ERROR: {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_translation_benchmark()
