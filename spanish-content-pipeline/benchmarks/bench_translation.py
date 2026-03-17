"""Benchmark: Translation — multilingual pipeline evaluation with chrF scoring.

Tests SentenceTranslator pipeline class across 10 curated FLORES+ language pairs.
Scores with chrF against FLORES+ reference translations.
"""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import (
    BenchmarkResult, load_bench_config, save_result, run_with_timing,
    usage_from_llm_response, cost_from_llm_response, run_models_parallel,
    has_result,
)
from pipeline.config import DeckConfig, DeckInfo, Languages, Protagonist, Destination, StoryConfig, ChapterDef, ModelsConfig, ModelConfig
from pipeline.llm import create_client
from pipeline.sentence_translator import SentenceTranslator
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"

# (source_flores_code, target_flores_code, source_lang_name, target_lang_name, iso_pair_code)
LANGUAGE_PAIRS = [
    ("spa_Latn", "deu_Latn", "Spanish", "German", "es-de"),
    ("spa_Latn", "swh_Latn", "Spanish", "Swahili", "es-sw"),
    ("eng_Latn", "deu_Latn", "English", "German", "en-de"),
    ("eng_Latn", "swh_Latn", "English", "Swahili", "en-sw"),
    ("eng_Latn", "hau_Latn", "English", "Hausa", "en-ha"),
    ("eng_Latn", "amh_Ethi", "English", "Amharic", "en-am"),
    ("eng_Latn", "urd_Arab", "English", "Urdu", "en-ur"),
    ("eng_Latn", "tir_Ethi", "English", "Tigrinya", "en-ti"),
    ("deu_Latn", "swh_Latn", "German", "Swahili", "de-sw"),
    ("deu_Latn", "amh_Ethi", "German", "Amharic", "de-am"),
]


def _make_bench_config(source_lang: str, target_lang: str, model: str) -> DeckConfig:
    """Create a minimal DeckConfig for SentenceTranslator with given language pair."""
    return DeckConfig(
        deck=DeckInfo(name="bench", id="bench-translation"),
        languages=Languages(
            target=source_lang, target_code="xx",
            native=target_lang, native_code="xx",
            dialect="",
        ),
        protagonist=Protagonist(name="Test", gender="female", origin_country="X"),
        destination=Destination(country="X", city="X"),
        story=StoryConfig(
            cefr_level="B1",
            sentences_per_chapter=[10, 30],
            chapters=[ChapterDef(title="Test", context="Test", vocab_focus=["test"])],
        ),
        models=ModelsConfig(
            story_generation=ModelConfig(model=model),
            cefr_simplification=ModelConfig(model=model),
            grammar=ModelConfig(model=model),
            gap_filling=ModelConfig(model=model),
            chapter_audit=ModelConfig(model=model),
            story_review=ModelConfig(model=model),
            story_fix=ModelConfig(model=model),
            image_review=ModelConfig(model=model),
            image_fix=ModelConfig(model=model),
            translation=ModelConfig(model=model),
            word_extraction=ModelConfig(model=model),
        ),
    )


def compute_translation_metrics(reference: list[str], translated: list[str]) -> dict:
    """Compute chrF and structural metrics against FLORES+ reference."""
    from sacrebleu.metrics import CHRF

    translated_padded = translated + [""] * max(0, len(reference) - len(translated))
    empty_count = sum(1 for t in translated_padded[:len(reference)] if not t.strip())
    missing_count = max(0, len(reference) - len(translated))

    # chrF++ scoring (with word n-grams)
    chrf = CHRF(word_order=2)
    valid_refs = []
    valid_hyps = []
    for ref, hyp in zip(reference, translated_padded[:len(reference)]):
        if hyp.strip():
            valid_refs.append(ref)
            valid_hyps.append(hyp)

    chrf_score = 0.0
    if valid_hyps:
        result = chrf.corpus_score(valid_hyps, [valid_refs])
        chrf_score = round(result.score, 2)

    ratios = []
    for ref, trans in zip(reference, translated_padded):
        if trans.strip():
            ref_words = len(ref.split())
            trans_words = len(trans.split())
            if ref_words > 0:
                ratios.append(trans_words / ref_words)

    return {
        "sentence_count": len(reference),
        "translated_count": len(translated),
        "missing_count": missing_count,
        "empty_count": empty_count,
        "chrf_score": chrf_score,
        "avg_length_ratio": round(sum(ratios) / max(1, len(ratios)), 2) if ratios else 0,
    }


def _run_single_model(model_entry: dict, flores: dict):
    """Run translation benchmark for a single model across all language pairs."""
    model_name = model_entry["model"]
    provider = model_entry.get("provider", "openrouter")
    temperature = model_entry.get("temperature", 0.3)

    api_key = get_api_key_for_provider(provider)
    llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

    results = []
    for source_code, target_code, source_lang, target_lang, pair_iso in LANGUAGE_PAIRS:
        if has_result(f"translation_{pair_iso}", model_name, RESULTS):
            print(f"  [SKIP] {model_name} {pair_iso} — result exists")
            continue
        source_sentences = [s[source_code] for s in flores["sentences"]]
        reference = [s[target_code] for s in flores["sentences"]]
        story_text = "\n".join(source_sentences)

        bench_config_obj = _make_bench_config(source_lang, target_lang, model_name)

        try:
            with tempfile.TemporaryDirectory() as tmp:
                translator = SentenceTranslator(bench_config_obj, llm, output_base=Path(tmp))

                ((pairs, llm_response), duration) = run_with_timing(
                    lambda st=story_text: translator.translate_chapter(0, st)
                )

            translated = [p.target for p in pairs]
            metrics = compute_translation_metrics(reference, translated)

            result = BenchmarkResult(
                task=f"translation_{pair_iso}",
                model=model_name,
                provider=provider,
                temperature=temperature,
                input_fixture="flores_30.json",
                duration_seconds=round(duration, 2),
                usage=usage_from_llm_response(llm_response) if llm_response else {},
                cost_estimate_usd=cost_from_llm_response(llm_response) if llm_response else None,
                raw_output=json.dumps([p.model_dump() for p in pairs], ensure_ascii=False),
                parsed_output={"translations": translated, "reference": reference},
                deterministic_metrics=metrics,
            )
            status = "OK" if metrics["missing_count"] == 0 and metrics["empty_count"] == 0 else "GAPS"
            print(f"  [{model_name}] {pair_iso:8s}: chrF={metrics['chrf_score']:5.1f} "
                  f"{metrics['translated_count']}/{metrics['sentence_count']} "
                  f"[{status}] {duration:.1f}s")
        except Exception as e:
            result = BenchmarkResult(
                task=f"translation_{pair_iso}", model=model_name, provider=provider,
                temperature=temperature, input_fixture="flores_30.json",
                duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                deterministic_metrics={}, error=str(e),
            )
            print(f"  [{model_name}] {pair_iso:8s}: ERROR - {e}")

        save_result(result, RESULTS)
        results.append(result)

    return results


def run_translation_benchmark(bench_config_path: Path | None = None, parallel: bool = False, max_workers: int = 4):
    """Run translation benchmark across all models and language pairs."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    flores = json.loads((FIXTURES / "flores_30.json").read_text())

    models = bench_config["models"].get("translation", [])
    if not models:
        print("No translation models in config")
        return

    print(f"=== Benchmark: Translation ({len(models)} models x {len(LANGUAGE_PAIRS)} pairs{', parallel' if parallel else ''}) ===")

    def run_one(entry):
        return _run_single_model(entry, flores)

    if parallel:
        run_models_parallel(models, run_one, max_workers=max_workers)
    else:
        for entry in models:
            run_one(entry)


if __name__ == "__main__":
    run_translation_benchmark()
