"""Benchmark: Multilingual Translation using FLORES+ ground truth.

Tests how well each model translates from English to low-resource languages.
Uses FLORES+ professionally translated sentences as reference.
"""

import json
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, usage_from_llm_response, cost_from_llm_response
from pipeline.llm import create_client
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"

# Target languages to benchmark (FLORES+ codes → human name, ISO 639 code)
TARGET_LANGUAGES = {
    "deu_Latn": ("German", "de"),
    "swh_Latn": ("Swahili", "sw"),
    "hau_Latn": ("Hausa", "ha"),
    "urd_Arab": ("Urdu", "ur"),
    "prs_Arab": ("Dari", "prs"),
    "som_Latn": ("Somali", "so"),
    "amh_Ethi": ("Amharic", "am"),
    "pbt_Arab": ("Pashto", "ps"),
    "tir_Ethi": ("Tigrinya", "ti"),
    "fuv_Latn": ("Fula", "ff"),
}

SOURCE_LANG_CODE = "eng_Latn"


def compute_multilingual_metrics(reference: list[str], translated: list[str]) -> dict:
    """Compare translated sentences against FLORES+ reference."""
    translated_padded = translated + [""] * max(0, len(reference) - len(translated))
    empty_count = sum(1 for t in translated_padded[:len(reference)] if not t.strip())
    missing_count = max(0, len(reference) - len(translated))

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
        "avg_length_ratio": round(sum(ratios) / max(1, len(ratios)), 2) if ratios else 0,
    }


def _build_translation_prompt(source_sentences: list[str], target_lang_name: str) -> str:
    numbered = "\n".join(f"{i+1}. {s}" for i, s in enumerate(source_sentences))
    return f"""Translate each English sentence to {target_lang_name}.
Return a JSON object with a "translations" array containing the translated sentences in order.
Do NOT include the original English. Only the {target_lang_name} translations.

Sentences:
{numbered}

Return ONLY valid JSON. No markdown fences, no extra text."""


def run_multilingual_translation_benchmark(bench_config_path: Path | None = None):
    """Run multilingual translation benchmark across all models and languages."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    flores = json.loads((FIXTURES / "flores_30.json").read_text())

    source_sentences = [s[SOURCE_LANG_CODE] for s in flores["sentences"]]

    models = bench_config["models"].get("translation", [])
    if not models:
        print("No translation models in config")
        return

    print(f"=== Benchmark: Multilingual Translation ({len(models)} models × {len(TARGET_LANGUAGES)} languages) ===")

    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        print(f"\n  Model: {model_name}")
        for flores_code, (lang_name, lang_iso) in TARGET_LANGUAGES.items():
            reference = [s[flores_code] for s in flores["sentences"]]

            try:
                prompt = _build_translation_prompt(source_sentences, lang_name)
                response, duration = run_with_timing(
                    lambda p=prompt: llm.complete_json(p, system="You are a professional translator. Return valid JSON only.")
                )
                raw_translations = response.parsed.get("translations", [])
                metrics = compute_multilingual_metrics(reference, raw_translations)

                result = BenchmarkResult(
                    task=f"translation_{lang_iso}",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="flores_30.json",
                    duration_seconds=round(duration, 2),
                    usage=usage_from_llm_response(response),
                    cost_estimate_usd=cost_from_llm_response(response),
                    raw_output=json.dumps(raw_translations, ensure_ascii=False),
                    parsed_output={"translations": raw_translations, "reference": reference},
                    deterministic_metrics=metrics,
                )
                status = "OK" if metrics["missing_count"] == 0 and metrics["empty_count"] == 0 else "GAPS"
                print(f"    {lang_name:12s}: {metrics['translated_count']}/{metrics['sentence_count']} "
                      f"ratio={metrics['avg_length_ratio']} [{status}] {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task=f"translation_{lang_iso}", model=model_name, provider=provider,
                    temperature=temperature, input_fixture="flores_30.json",
                    duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                    deterministic_metrics={}, error=str(e),
                )
                print(f"    {lang_name:12s}: ERROR — {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_multilingual_translation_benchmark()
