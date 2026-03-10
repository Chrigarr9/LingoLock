"""Benchmark: Grammar Audit + Gap Fill (Pass 2).

Runs grammar audit on test chapter text, then grammar gap filler for missing targets.
"""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing
from pipeline.config import DeckConfig
from pipeline.grammar_auditor import GrammarAuditReport, audit_grammar
from pipeline.grammar_gap_filler import GrammarGapFiller
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from pipeline.story_generator import extract_flat_text
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_grammar_audit_metrics(report: GrammarAuditReport) -> dict:
    """Compute metrics from grammar audit report."""
    total = 0
    detected = 0
    for level_report in report.levels.values():
        for t in level_report.targets:
            total += 1
            if t.present:
                detected += 1
    return {
        "targets_total": total,
        "targets_detected": detected,
        "targets_missing": total - detected,
        "coverage": round(detected / max(1, total), 3),
    }


def run_grammar_benchmark(bench_config_path: Path | None = None):
    """Run grammar audit + gap fill benchmark."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))

    # Load the raw chapter to get sentences for grammar audit
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    flat_text = extract_flat_text(raw_chapter)
    cefr = fixture_config.story.chapters[0].cefr_level or fixture_config.story.cefr_level

    chapters_by_cefr = {cefr: flat_text.split("\n")}

    models = bench_config["models"].get("grammar", [])
    if not models:
        print("No grammar models in bench_config.yaml")
        return

    print(f"=== Benchmark: Grammar Audit + Gap Fill ({len(models)} models) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        try:
            # Grammar audit
            (report, audit_duration) = run_with_timing(
                lambda: audit_grammar(chapters_by_cefr, fixture_config.story.grammar_targets, llm=llm)
            )
            audit_metrics = compute_grammar_audit_metrics(report)

            # Grammar gap fill
            with tempfile.TemporaryDirectory() as tmp:
                filler = GrammarGapFiller(
                    llm=llm,
                    output_dir=Path(tmp),
                    config_chapters=[{
                        "title": ch.title, "context": ch.context,
                        "vocab_focus": ch.vocab_focus,
                        "cefr_level": ch.cefr_level or fixture_config.story.cefr_level,
                    } for ch in fixture_config.story.chapters],
                    target_language=fixture_config.languages.target,
                    native_language=fixture_config.languages.native,
                    dialect=fixture_config.languages.dialect or "",
                )
                (gap_sentences, fill_duration) = run_with_timing(
                    lambda: filler.fill_gaps(report)
                )

            total_duration = audit_duration + fill_duration
            metrics = {
                **audit_metrics,
                "gap_sentences_generated": len(gap_sentences),
                "audit_duration": round(audit_duration, 2),
                "fill_duration": round(fill_duration, 2),
            }

            result = BenchmarkResult(
                task="grammar",
                model=model_name,
                provider=provider,
                temperature=temperature,
                input_fixture="raw_chapter.json",
                duration_seconds=round(total_duration, 2),
                usage={},
                raw_output=json.dumps({
                    "audit": report.model_dump(),
                    "gap_sentences": [s.model_dump() for s in gap_sentences],
                }),
                parsed_output={
                    "audit": report.model_dump(),
                    "gap_sentences": [s.model_dump() for s in gap_sentences],
                },
                deterministic_metrics=metrics,
            )
            print(f"    {audit_metrics['targets_detected']}/{audit_metrics['targets_total']} detected, "
                  f"{len(gap_sentences)} gaps filled, {total_duration:.1f}s")
        except Exception as e:
            result = BenchmarkResult(
                task="grammar", model=model_name, provider=provider,
                temperature=temperature, input_fixture="raw_chapter.json",
                duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                deterministic_metrics={}, error=str(e),
            )
            print(f"    ERROR: {e}")

        save_result(result, RESULTS)


if __name__ == "__main__":
    run_grammar_benchmark()
