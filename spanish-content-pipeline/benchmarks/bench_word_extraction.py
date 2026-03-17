"""Benchmark: Word Extraction (Pass 7)."""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, usage_from_llm_response, cost_from_llm_response, run_models_parallel, filter_new_models
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
    """Compute word extraction quality against reference.

    Since lemma/pos come from spaCy (deterministic), the LLM-differentiating
    metrics are: translation accuracy, translation completeness, and whether
    similar_words are provided.
    """
    ref_lemmas = {w["lemma"] for w in reference_words}
    ext_lemmas = {w.get("lemma", w.get("source", "")) for w in extracted_words}
    matched = ref_lemmas & ext_lemmas
    recall = len(matched) / max(1, len(ref_lemmas))

    # Build source→extracted lookup for translation comparison
    ext_by_source = {w.get("source", ""): w for w in extracted_words}

    # Translation accuracy: case-insensitive exact match against reference targets
    ref_with_target = [w for w in reference_words if w.get("target")]
    translation_matches = 0
    translations_provided = 0
    for rw in ref_with_target:
        ew = ext_by_source.get(rw["source"])
        if not ew:
            continue
        ext_target = (ew.get("target") or "").strip()
        if ext_target:
            translations_provided += 1
        if ext_target.lower() == rw["target"].lower():
            translation_matches += 1

    translation_accuracy = translation_matches / max(1, len(ref_with_target))
    translation_coverage = translations_provided / max(1, len(ref_with_target))

    # Similar words completeness: fraction of extracted words with >=4 similar words
    has_similar = sum(1 for w in extracted_words if len(w.get("similar_words", [])) >= 4)
    similar_ratio = has_similar / max(1, len(extracted_words))

    # Composite score: weighted average (translation most important)
    score = round(0.5 * translation_accuracy + 0.3 * translation_coverage + 0.2 * similar_ratio, 3)

    return {
        "reference_count": len(ref_lemmas),
        "extracted_count": len(ext_lemmas),
        "matched_lemmas": len(matched),
        "recall": round(recall, 3),
        "translation_accuracy": round(translation_accuracy, 3),
        "translation_coverage": round(translation_coverage, 3),
        "similar_words_ratio": round(similar_ratio, 3),
        "score": score,
    }


def _run_single_model(model_entry: dict, fixture_config: DeckConfig, pairs: list[SentencePair], reference: dict):
    """Run word extraction for a single model."""
    model_name = model_entry["model"]
    provider = model_entry.get("provider", "openrouter")
    temperature = model_entry.get("temperature", 0.3)

    api_key = get_api_key_for_provider(provider)
    llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

    with tempfile.TemporaryDirectory() as tmp:
        extractor = WordExtractor(fixture_config, llm, output_base=Path(tmp))

        try:
            ((chapter_words, llm_response), duration) = run_with_timing(
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
                usage=usage_from_llm_response(llm_response) if llm_response else {},
                cost_estimate_usd=cost_from_llm_response(llm_response) if llm_response else None,
                raw_output=json.dumps(extracted, ensure_ascii=False),
                parsed_output=extracted,
                deterministic_metrics=metrics,
            )
            print(f"  [{model_name}] {metrics['matched_lemmas']}/{metrics['reference_count']} lemmas, "
                  f"trans_acc={metrics['translation_accuracy']:.2f} score={metrics['score']:.3f}, {duration:.1f}s")
        except Exception as e:
            result = BenchmarkResult(
                task="word_extraction", model=model_name, provider=provider,
                temperature=temperature, input_fixture="raw_chapter.json",
                duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                deterministic_metrics={}, error=str(e),
            )
            print(f"  [{model_name}] ERROR: {e}")

        save_result(result, RESULTS)
        return result


def run_word_extraction_benchmark(bench_config_path: Path | None = None, parallel: bool = False, max_workers: int = 4):
    """Run word extraction benchmark."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    reference = json.loads((FIXTURES / "reference_words.json").read_text())

    flat_text = extract_flat_text(raw_chapter)
    pairs = [
        SentencePair(chapter=1, sentence_index=i, source=s, target=f"[placeholder {i}]")
        for i, s in enumerate(flat_text.split("\n"))
    ]

    models = bench_config["models"].get("word_extraction", [])
    models = filter_new_models("word_extraction", models, RESULTS)
    if not models:
        print("No word_extraction models in bench_config.yaml")
        return

    print(f"=== Benchmark: Word Extraction ({len(models)} models, {len(reference['words'])} ref words{', parallel' if parallel else ''}) ===")

    def run_one(entry):
        return _run_single_model(entry, fixture_config, pairs, reference)

    if parallel:
        run_models_parallel(models, run_one, max_workers=max_workers)
    else:
        for entry in models:
            run_one(entry)


if __name__ == "__main__":
    run_word_extraction_benchmark()
