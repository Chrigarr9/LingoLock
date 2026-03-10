"""Benchmark: Word Extraction (Pass 7)."""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene, SentencePair
from pipeline.story_generator import extract_flat_text
from pipeline.word_extractor import WordExtractor
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_extraction_metrics(reference_words: list[dict], extracted_words: list[dict]) -> dict:
    """Compute precision/recall of word extraction against reference."""
    ref_lemmas = {w["lemma"] for w in reference_words}
    ext_lemmas = {w.get("lemma", w.get("source", "")) for w in extracted_words}

    matched = ref_lemmas & ext_lemmas
    precision = len(matched) / max(1, len(ext_lemmas))
    recall = len(matched) / max(1, len(ref_lemmas))

    # POS accuracy for matched lemmas
    ref_pos = {w["lemma"]: w["pos"] for w in reference_words}
    pos_correct = 0
    for w in extracted_words:
        lemma = w.get("lemma", "")
        if lemma in ref_pos and w.get("pos", "") == ref_pos[lemma]:
            pos_correct += 1

    return {
        "reference_count": len(ref_lemmas),
        "extracted_count": len(ext_lemmas),
        "matched_lemmas": len(matched),
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "pos_accuracy": round(pos_correct / max(1, len(matched)), 3),
    }


def run_word_extraction_benchmark(bench_config_path: Path | None = None):
    """Run word extraction benchmark."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    reference = json.loads((FIXTURES / "reference_words.json").read_text())

    # Build SentencePairs (simulated — source + placeholder target)
    flat_text = extract_flat_text(raw_chapter)
    pairs = [
        SentencePair(chapter=1, sentence_index=i, source=s, target=f"[placeholder {i}]")
        for i, s in enumerate(flat_text.split("\n"))
    ]

    models = bench_config["models"].get("word_extraction", [])
    if not models:
        print("No word_extraction models in bench_config.yaml")
        return

    print(f"=== Benchmark: Word Extraction ({len(models)} models, {len(reference['words'])} ref words) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        with tempfile.TemporaryDirectory() as tmp:
            extractor = WordExtractor(fixture_config, llm, output_base=Path(tmp))

            try:
                (chapter_words, duration) = run_with_timing(
                    lambda: extractor.extract_chapter(0, pairs)
                )
                extracted = [w.model_dump() for w in chapter_words.words]
                metrics = compute_extraction_metrics(reference["words"], extracted)

                result = BenchmarkResult(
                    task="word_extraction",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="raw_chapter.json",
                    duration_seconds=round(duration, 2),
                    usage={},
                    raw_output=json.dumps(extracted, ensure_ascii=False),
                    parsed_output=extracted,
                    deterministic_metrics=metrics,
                )
                print(f"    {metrics['matched_lemmas']}/{metrics['reference_count']} matched, "
                      f"P={metrics['precision']:.2f} R={metrics['recall']:.2f}, {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task="word_extraction", model=model_name, provider=provider,
                    temperature=temperature, input_fixture="raw_chapter.json",
                    duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                    deterministic_metrics={}, error=str(e),
                )
                print(f"    ERROR: {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_word_extraction_benchmark()
