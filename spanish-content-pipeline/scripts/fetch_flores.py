"""Download 30 FLORES+ devtest sentences for benchmark languages.

Usage: uv run python scripts/fetch_flores.py
Output: benchmarks/fixtures/flores_30.json
"""

import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from datasets import load_dataset

LANGUAGES = {
    "eng_Latn": "English",
    "spa_Latn": "Spanish",
    "deu_Latn": "German",
    "swh_Latn": "Swahili",
    "hau_Latn": "Hausa",
    "urd_Arab": "Urdu",
    "prs_Arab": "Dari",
    "som_Latn": "Somali",
    "amh_Ethi": "Amharic",
    "pbt_Arab": "Pashto",
    "tir_Ethi": "Tigrinya",
    "fuv_Latn": "Fula",
}

NUM_SENTENCES = 30
OUTPUT = Path(__file__).resolve().parent.parent / "benchmarks" / "fixtures" / "flores_30.json"


def _lang_key(iso_639_3: str, iso_15924: str) -> str:
    """Build FLORES+ style key like 'eng_Latn'."""
    return f"{iso_639_3}_{iso_15924}"


def main():
    ds = load_dataset("openlanguagedata/flores_plus", split="devtest")

    # Dataset is in long format: (id, iso_639_3, iso_15924, text, ...).
    # Pivot to wide format: {sentence_id -> {lang_code -> text}}.
    target_keys = set(LANGUAGES.keys())
    pivoted: dict[int, dict[str, str]] = {}
    for row in ds:
        key = _lang_key(row["iso_639_3"], row["iso_15924"])
        if key not in target_keys:
            continue
        sid = row["id"]
        if sid not in pivoted:
            pivoted[sid] = {}
        pivoted[sid][key] = row["text"]

    # Take first NUM_SENTENCES sentence IDs (sorted)
    sentence_ids = sorted(pivoted.keys())[:NUM_SENTENCES]

    sentences = []
    for idx, sid in enumerate(sentence_ids):
        entry = {"index": idx, "flores_id": sid}
        for code in LANGUAGES:
            entry[code] = pivoted[sid].get(code, "")
        sentences.append(entry)

    OUTPUT.write_text(json.dumps({"languages": LANGUAGES, "sentences": sentences}, ensure_ascii=False, indent=2))
    print(f"Wrote {len(sentences)} sentences × {len(LANGUAGES)} languages to {OUTPUT}")


if __name__ == "__main__":
    main()
