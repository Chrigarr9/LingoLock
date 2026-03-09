"""Tests for gap_filler.py."""
import json
from pathlib import Path
from unittest.mock import MagicMock, call

import pytest

from pipeline.gap_filler import GapFiller
from pipeline.models import (
    DeckChapter, FrequencyLemmaEntry, GapSentence,
    OrderedDeck, SentencePair, VocabularyEntry,
)


def _make_deck(words_by_chapter: dict[int, list[str]]) -> OrderedDeck:
    chapters = [
        DeckChapter(
            chapter=ch,
            title=f"Chapter {ch}",
            words=[
                VocabularyEntry(id=w, source=w, target=[w], pos="noun",
                                first_chapter=ch, order=i, examples=[])
                for i, w in enumerate(words)
            ],
        )
        for ch, words in words_by_chapter.items()
    ]
    return OrderedDeck(
        deck_id="test", deck_name="Test",
        total_words=sum(len(w) for w in words_by_chapter.values()),
        chapters=chapters,
    )


def _make_chapter_defs():
    return [
        {"title": "At the Airport", "context": "Maria arrives and takes a taxi",
         "vocab_focus": ["airport", "taxi", "luggage"], "cefr_level": "A1"},
        {"title": "At the Restaurant", "context": "Ordering food at a local restaurant",
         "vocab_focus": ["restaurant", "menu", "food", "order"], "cefr_level": "A2"},
    ]


def _make_mock_llm(responses: list[dict]) -> MagicMock:
    """Cycles through JSON responses for successive complete_json calls."""
    llm = MagicMock()
    it = iter(responses)

    def side_effect(prompt, system=None):
        r = MagicMock()
        r.parsed = next(it)
        return r

    llm.complete_json.side_effect = side_effect
    return llm


def _write_translations(tmp_path: Path, chapter_num: int, sentences: list[dict]):
    trans_dir = tmp_path / "translations"
    trans_dir.mkdir(parents=True, exist_ok=True)
    path = trans_dir / f"chapter_{chapter_num:02d}.json"
    path.write_text(json.dumps(sentences))


def test_gap_filler_calls_assignment_then_generation(tmp_path):
    """First LLM call does assignment; second does sentence generation."""
    deck = _make_deck({1: ["avión"], 2: ["comer"]})
    frequency_lemmas = {
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
        "caminar": FrequencyLemmaEntry(lemma="caminar", appropriate=True),
    }
    frequency_data = {"avión": 5, "comer": 10, "restaurante": 15, "caminar": 20}

    # Write existing translations for chapter 2
    _write_translations(tmp_path / "test", 2, [
        {"chapter": 2, "sentence_index": 0,
         "source": "María pide la carta.", "target": "Maria bittet um die Speisekarte."}
    ])

    assignment_response = {"restaurante": 2, "caminar": 1}
    generation_response = {
        "sentences": [
            {"source": "Caminamos por el parque.",
             "covers": ["caminar"]},
        ]
    }
    generation_response_2 = {
        "sentences": [
            {"source": "Vamos al restaurante.",
             "covers": ["restaurante"]},
        ]
    }
    llm = _make_mock_llm([assignment_response, generation_response, generation_response_2])

    filler = GapFiller(
        llm=llm,
        output_dir=tmp_path / "test",
        config_chapters=_make_chapter_defs(),
        target_language="Spanish",
        native_language="German",
        dialect="Rioplatense (vos, che)",
    )
    results = filler.fill_gaps(
        deck=deck,
        frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas,
        top_n=1000,
    )

    # Assignment call + one generation call per chapter with words
    assert llm.complete_json.call_count == 3
    assert isinstance(results, dict)
    assert any(len(s) > 0 for s in results.values())

    # Assignment cached to disk
    assert (tmp_path / "test" / "gap_word_assignment.json").exists()


def test_gap_filler_uses_cached_assignment(tmp_path):
    """If gap_word_assignment.json exists, assignment LLM call is skipped."""
    deck = _make_deck({2: ["comer"]})
    frequency_lemmas = {
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
    }
    frequency_data = {"comer": 10, "restaurante": 15}

    out_dir = tmp_path / "test"
    out_dir.mkdir()
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"restaurante": 2}))
    _write_translations(out_dir, 2, [])

    generation_response = {"sentences": [
        {"source": "Vamos al restaurante.",
         "covers": ["restaurante"]}
    ]}
    llm = _make_mock_llm([generation_response])

    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    # Only one call (generation) — assignment was cached
    assert llm.complete_json.call_count == 1


def test_gap_filler_skips_cached_chapter_sentences(tmp_path):
    """Chapters with existing gap_sentences files skip generation."""
    deck = _make_deck({2: ["comer"]})
    frequency_lemmas = {
        "restaurante": FrequencyLemmaEntry(lemma="restaurante", appropriate=True),
    }
    frequency_data = {"comer": 10, "restaurante": 15}

    out_dir = tmp_path / "test"
    (out_dir / "gap_sentences").mkdir(parents=True)
    (out_dir / "gap_sentences" / "chapter_02.json").write_text("[]")
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"restaurante": 2}))

    llm = MagicMock()
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    llm.complete_json.assert_not_called()


def test_gap_filler_no_gaps(tmp_path):
    """When all top-N words are already covered, returns empty dict immediately."""
    deck = _make_deck({1: ["comer", "ir"]})
    frequency_data = {"comer": 1, "ir": 2}
    frequency_lemmas = {
        "comer": FrequencyLemmaEntry(lemma="comer", appropriate=True),
        "ir": FrequencyLemmaEntry(lemma="ir", appropriate=True),
    }

    llm = MagicMock()
    filler = GapFiller(
        llm=llm, output_dir=tmp_path, config_chapters=[],
        target_language="Spanish", native_language="German", dialect="",
    )
    results = filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=10,
    )

    assert results == {}
    llm.complete_json.assert_not_called()


def test_gap_filler_assignment_prompt_mentions_equal_distribution(tmp_path):
    """Assignment prompt instructs LLM to distribute words across chapters."""
    deck = _make_deck({1: []})
    frequency_lemmas = {
        "palabra": FrequencyLemmaEntry(lemma="palabra", appropriate=True),
    }
    frequency_data = {"palabra": 50}

    llm = _make_mock_llm([{"palabra": 1}, {"sentences": []}])
    filler = GapFiller(
        llm=llm, output_dir=tmp_path, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    assignment_prompt = llm.complete_json.call_args_list[0][0][0]
    assert "equal" in assignment_prompt.lower() or "evenly" in assignment_prompt.lower() or "distribut" in assignment_prompt.lower()


def test_gap_filler_generation_prompt_includes_existing_sentences(tmp_path):
    """Generation prompt includes existing chapter sentences for style context."""
    deck = _make_deck({1: []})
    frequency_lemmas = {
        "caminar": FrequencyLemmaEntry(lemma="caminar", appropriate=True),
    }
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_translations(out_dir, 1, [
        {"chapter": 1, "sentence_index": 0,
         "source": "María llega al aeropuerto.", "target": "Maria kommt am Flughafen an."}
    ])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    llm = _make_mock_llm([{"sentences": []}])
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    generation_prompt = llm.complete_json.call_args_list[0][0][0]
    assert "María llega al aeropuerto" in generation_prompt


def test_gap_filler_generation_prompt_mentions_max_words_per_sentence(tmp_path):
    """Generation prompt specifies max new target words per sentence."""
    deck = _make_deck({1: []})
    frequency_lemmas = {
        "caminar": FrequencyLemmaEntry(lemma="caminar", appropriate=True),
    }
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_translations(out_dir, 1, [])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    llm = _make_mock_llm([{"sentences": []}])
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
        max_new_words_per_sentence=3,
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    generation_prompt = llm.complete_json.call_args_list[0][0][0]
    assert "3" in generation_prompt


def test_gap_filler_parses_insert_after(tmp_path):
    """insert_after is parsed from LLM response."""
    deck = _make_deck({1: []})
    frequency_lemmas = {
        "caminar": FrequencyLemmaEntry(lemma="caminar", appropriate=True),
    }
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_translations(out_dir, 1, [])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    generation_response = {"sentences": [
        {"source": "Caminamos por el parque.",
         "covers": ["caminar"],
         "insert_after": 5},
    ]}
    llm = _make_mock_llm([generation_response])

    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    results = filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    assert results[1][0].insert_after == 5


def test_gap_filler_insert_after_defaults_to_minus_one(tmp_path):
    """insert_after defaults to -1 when not provided by LLM."""
    deck = _make_deck({1: []})
    frequency_lemmas = {
        "caminar": FrequencyLemmaEntry(lemma="caminar", appropriate=True),
    }
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_translations(out_dir, 1, [])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    generation_response = {"sentences": [
        {"source": "Caminamos por el parque.",
         "covers": ["caminar"]},
    ]}
    llm = _make_mock_llm([generation_response])

    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    results = filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    assert results[1][0].insert_after == -1


def test_gap_filler_prompt_includes_all_sentences_with_indices(tmp_path):
    """Generation prompt includes ALL existing sentences with sentence_index numbers."""
    deck = _make_deck({1: []})
    frequency_lemmas = {
        "caminar": FrequencyLemmaEntry(lemma="caminar", appropriate=True),
    }
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    sentences = [
        {"chapter": 1, "sentence_index": i,
         "source": f"Sentence {i}.", "target": f"Satz {i}."}
        for i in range(15)
    ]
    _write_translations(out_dir, 1, sentences)
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    llm = _make_mock_llm([{"sentences": []}])
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas, top_n=1000,
    )

    prompt = llm.complete_json.call_args_list[0][0][0]
    # All 15 sentences should appear (no truncation)
    assert "[14]" in prompt
    assert "Sentence 14" in prompt
    # Prompt should ask for insert_after
    assert "insert_after" in prompt
