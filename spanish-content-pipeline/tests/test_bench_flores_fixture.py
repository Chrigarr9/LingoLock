"""Validate FLORES+ fixture is well-formed."""
import json
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent.parent / "benchmarks" / "fixtures"

EXPECTED_LANG_CODES = [
    "eng_Latn", "spa_Latn", "deu_Latn", "swh_Latn", "hau_Latn",
    "urd_Arab", "prs_Arab", "som_Latn", "amh_Ethi", "pbt_Arab",
    "tir_Ethi", "fuv_Latn",
]


def test_flores_30_has_all_languages():
    data = json.loads((FIXTURES / "flores_30.json").read_text())
    for sent in data["sentences"]:
        for code in EXPECTED_LANG_CODES:
            assert code in sent, f"Missing {code} in sentence {sent['index']}"
            assert len(sent[code]) > 0, f"Empty {code} in sentence {sent['index']}"


def test_flores_30_has_30_sentences():
    data = json.loads((FIXTURES / "flores_30.json").read_text())
    assert len(data["sentences"]) == 30


def test_flores_30_languages_dict():
    data = json.loads((FIXTURES / "flores_30.json").read_text())
    assert "English" in data["languages"].values()
    assert "Somali" in data["languages"].values()
    assert len(data["languages"]) == len(EXPECTED_LANG_CODES)
