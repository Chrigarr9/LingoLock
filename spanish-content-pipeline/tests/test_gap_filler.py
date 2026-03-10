"""Tests for gap_filler.py."""
import json
from pathlib import Path
from unittest.mock import MagicMock, call

import pytest

from pipeline.gap_filler import GapFiller
from pipeline.models import (
    DeckChapter, GapShot,
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


def _write_stories(tmp_path: Path, chapter_num: int, sentences: list[dict]):
    """Write a minimal ChapterScene JSON to stories/ for gap filler context."""
    stories_dir = tmp_path / "stories"
    stories_dir.mkdir(parents=True, exist_ok=True)
    shot_sentences = [
        {"source": s["source"], "sentence_index": s["sentence_index"]}
        for s in sentences
    ]
    data = {
        "chapter": chapter_num,
        "scenes": [{"setting": "test", "description": "test", "shots": [
            {"focus": "test", "image_prompt": "test", "sentences": shot_sentences},
        ]}] if shot_sentences else [],
    }
    path = stories_dir / f"chapter_{chapter_num:02d}.json"
    path.write_text(json.dumps(data))


def test_gap_filler_calls_assignment_then_generation(tmp_path):
    """First LLM call does assignment; second does shot generation."""
    deck = _make_deck({1: ["avión"], 2: ["comer"]})
    frequency_data = {"avión": 5, "comer": 10, "restaurante": 15, "caminar": 20}

    # Write existing translations for chapter 2
    _write_stories(tmp_path / "test", 2, [
        {"chapter": 2, "sentence_index": 0,
         "source": "María pide la carta.", "target": "Maria bittet um die Speisekarte."}
    ])

    assignment_response = {"restaurante": 2, "caminar": 1}
    generation_response = {
        "shots": [
            {"sentences": ["Caminamos por el parque."],
             "image_prompt": "People walking through a sunny park",
             "covers": ["caminar"]},
        ]
    }
    generation_response_2 = {
        "shots": [
            {"sentences": ["Vamos al restaurante."],
             "image_prompt": "Friends arriving at a restaurant entrance",
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
        dialect="Rioplatense (vos, che)", lang_code="es",
    )
    results = filler.fill_gaps(
        deck=deck,
        frequency_data=frequency_data,
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
    frequency_data = {"comer": 10, "restaurante": 15}

    out_dir = tmp_path / "test"
    out_dir.mkdir()
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"restaurante": 2}))
    _write_stories(out_dir, 2, [])

    generation_response = {"shots": [
        {"sentences": ["Vamos al restaurante."],
         "image_prompt": "Restaurant entrance",
         "covers": ["restaurante"]}
    ]}
    llm = _make_mock_llm([generation_response])

    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    # Only one call (generation) — assignment was cached
    assert llm.complete_json.call_count == 1


def test_gap_filler_skips_cached_chapter_sentences(tmp_path):
    """Chapters with existing gap_sentences files skip generation."""
    deck = _make_deck({2: ["comer"]})
    frequency_data = {"comer": 10, "restaurante": 15}

    out_dir = tmp_path / "test"
    (out_dir / "gap_sentences").mkdir(parents=True)
    (out_dir / "gap_sentences" / "chapter_02.json").write_text("[]")
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"restaurante": 2}))

    llm = MagicMock()
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    llm.complete_json.assert_not_called()


def test_gap_filler_no_gaps(tmp_path):
    """When all top-N words are already covered, returns empty dict immediately."""
    deck = _make_deck({1: ["comer", "ir"]})
    frequency_data = {"comer": 1, "ir": 2}
    llm = MagicMock()
    filler = GapFiller(
        llm=llm, output_dir=tmp_path, config_chapters=[],
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    results = filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=10,
    )

    assert results == {}
    llm.complete_json.assert_not_called()


def test_gap_filler_assignment_prompt_mentions_equal_distribution(tmp_path):
    """Assignment prompt instructs LLM to distribute words across chapters."""
    deck = _make_deck({1: []})
    frequency_data = {"palabra": 50}

    llm = _make_mock_llm([{"palabra": 1}, {"shots": []}])
    filler = GapFiller(
        llm=llm, output_dir=tmp_path, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    assignment_prompt = llm.complete_json.call_args_list[0][0][0]
    assert "equal" in assignment_prompt.lower() or "evenly" in assignment_prompt.lower() or "distribut" in assignment_prompt.lower()


def test_gap_filler_generation_prompt_includes_existing_sentences(tmp_path):
    """Generation prompt includes existing chapter sentences for style context."""
    deck = _make_deck({1: []})
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_stories(out_dir, 1, [
        {"chapter": 1, "sentence_index": 0,
         "source": "María llega al aeropuerto.", "target": "Maria kommt am Flughafen an."}
    ])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    llm = _make_mock_llm([{"shots": []}])
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    generation_prompt = llm.complete_json.call_args_list[0][0][0]
    assert "María llega al aeropuerto" in generation_prompt


def test_gap_filler_generation_prompt_mentions_max_words_per_sentence(tmp_path):
    """Generation prompt specifies max new target words per sentence."""
    deck = _make_deck({1: []})
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_stories(out_dir, 1, [])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    llm = _make_mock_llm([{"shots": []}])
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
        max_new_words_per_sentence=3,
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    generation_prompt = llm.complete_json.call_args_list[0][0][0]
    assert "3" in generation_prompt


def test_gap_filler_parses_insert_after_shot_clamped(tmp_path):
    """insert_after_shot from LLM is clamped to valid range."""
    deck = _make_deck({1: []})
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    # Write a chapter with 1 shot (so valid range is [0, 0])
    _write_stories(out_dir, 1, [
        {"source": "Test sentence.", "sentence_index": 0},
    ])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    generation_response = {"shots": [
        {"sentences": ["Caminamos por el parque."],
         "image_prompt": "People walking in a park",
         "covers": ["caminar"],
         "insert_after_shot": 5},  # out of range — should clamp to 0
    ]}
    llm = _make_mock_llm([generation_response])

    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    results = filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    assert results[1][0].insert_after_shot == 0  # clamped to last valid shot
    assert results[1][0].sentences == ["Caminamos por el parque."]
    assert results[1][0].image_prompt == "People walking in a park"


def test_gap_filler_insert_after_shot_minus_one_clamped_to_last(tmp_path):
    """insert_after_shot -1 is clamped to last existing shot index."""
    deck = _make_deck({1: []})
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_stories(out_dir, 1, [
        {"source": "Test sentence.", "sentence_index": 0},
    ])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    generation_response = {"shots": [
        {"sentences": ["Caminamos por el parque."],
         "image_prompt": "Walking in a park",
         "covers": ["caminar"]},
         # no insert_after_shot → defaults to -1 → clamped to 0
    ]}
    llm = _make_mock_llm([generation_response])

    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    results = filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    assert results[1][0].insert_after_shot == 0  # not -1 anymore


def test_gap_filler_prompt_includes_shot_boundaries(tmp_path):
    """Generation prompt includes existing sentences with shot boundaries."""
    deck = _make_deck({1: []})
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    sentences = [
        {"chapter": 1, "sentence_index": i,
         "source": f"Sentence {i}.", "target": f"Satz {i}."}
        for i in range(15)
    ]
    _write_stories(out_dir, 1, sentences)
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    llm = _make_mock_llm([{"shots": []}])
    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    prompt = llm.complete_json.call_args_list[0][0][0]
    # All 15 sentences should appear (no truncation)
    assert "sent 14" in prompt
    assert "Sentence 14" in prompt
    # Prompt should ask for insert_after_shot and shots format
    assert "insert_after_shot" in prompt
    assert "shots" in prompt
    assert "image_prompt" in prompt


def test_gap_filler_prompt_mentions_coverage_target(tmp_path):
    """The generation prompt should mention 90% coverage target."""
    from pipeline.gap_filler import GapFiller

    prompts = []
    llm = MagicMock()
    def fake_complete_json(prompt, system=None):
        prompts.append(prompt)
        r = MagicMock()
        r.parsed = {"shots": []}
        return r
    llm.complete_json = fake_complete_json
    filler = GapFiller(
        llm=llm, output_dir=tmp_path, config_chapters=[{"title": "Test", "context": "test", "vocab_focus": [], "cefr_level": "A1"}],
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    filler._generate_shots(1, filler._chapters[0], ["casa", "perro", "gato"], "")
    assert any("90%" in p for p in prompts)


def test_gap_filler_shot_sentences_capped_at_three(tmp_path):
    """Shots with more than 3 sentences are truncated to 3."""
    deck = _make_deck({1: []})
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_stories(out_dir, 1, [])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    generation_response = {"shots": [
        {"sentences": ["Sent 1.", "Sent 2.", "Sent 3.", "Sent 4."],
         "image_prompt": "Test scene",
         "covers": ["caminar"],
         "insert_after_shot": -1},
    ]}
    llm = _make_mock_llm([generation_response])

    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    results = filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    assert len(results[1][0].sentences) == 3


def test_gap_filler_shot_string_sentence_coerced_to_list(tmp_path):
    """A single string sentence is coerced to a list."""
    deck = _make_deck({1: []})
    frequency_data = {"caminar": 50}

    out_dir = tmp_path
    _write_stories(out_dir, 1, [])
    (out_dir / "gap_word_assignment.json").write_text(json.dumps({"caminar": 1}))

    generation_response = {"shots": [
        {"sentences": "Caminamos por el parque.",
         "image_prompt": "Walking in park",
         "covers": ["caminar"]},
    ]}
    llm = _make_mock_llm([generation_response])

    filler = GapFiller(
        llm=llm, output_dir=out_dir, config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    results = filler.fill_gaps(
        deck=deck, frequency_data=frequency_data,
        top_n=1000,
    )

    assert results[1][0].sentences == ["Caminamos por el parque."]


# --- New tests for Phase 2 gap filler improvements ---


def test_gap_filler_prompt_includes_characters(tmp_path):
    """Generation prompt lists characters present in the chapter."""
    prompts = []
    llm = MagicMock()

    def fake_complete_json(prompt, system=None):
        prompts.append(prompt)
        r = MagicMock()
        r.parsed = {"shots": []}
        return r
    llm.complete_json = fake_complete_json

    secondary_chars = [
        {"name": "Ingrid", "chapters": [1], "role": "Maria's mother"},
        {"name": "Sofia", "chapters": [5, 6], "role": "best friend"},
    ]
    filler = GapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=[{"title": "Test", "context": "test", "vocab_focus": [], "cefr_level": "A1"}],
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
        protagonist_name="Maria",
        secondary_characters=secondary_chars,
    )
    filler._generate_shots(1, filler._chapters[0], ["casa"], "")

    prompt = prompts[0]
    assert "Maria" in prompt
    assert "Ingrid" in prompt
    assert "Maria's mother" in prompt
    # Sofia is not in chapter 1
    assert "Sofia" not in prompt


def test_gap_filler_prompt_includes_grammar_constraints(tmp_path):
    """Generation prompt includes CEFR grammar constraints."""
    prompts = []
    llm = MagicMock()

    def fake_complete_json(prompt, system=None):
        prompts.append(prompt)
        r = MagicMock()
        r.parsed = {"shots": []}
        return r
    llm.complete_json = fake_complete_json

    grammar_targets = {
        "A1": ["simple present tense"],
        "A2": ["pretérito indefinido", "reflexive verbs"],
    }
    filler = GapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=[{"title": "Test", "context": "test", "vocab_focus": [], "cefr_level": "A1"}],
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
        grammar_targets=grammar_targets,
    )
    filler._generate_shots(1, filler._chapters[0], ["casa"], "")

    prompt = prompts[0]
    assert "simple present tense" in prompt
    # A2 grammar should be forbidden for A1 chapter
    assert "FORBIDDEN" in prompt
    assert "pretérito indefinido" in prompt


def test_gap_filler_prompt_forbids_invented_characters(tmp_path):
    """Generation prompt instructs LLM not to invent characters."""
    prompts = []
    llm = MagicMock()

    def fake_complete_json(prompt, system=None):
        prompts.append(prompt)
        r = MagicMock()
        r.parsed = {"shots": []}
        return r
    llm.complete_json = fake_complete_json

    filler = GapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=[{"title": "Test", "context": "test", "vocab_focus": [], "cefr_level": "A1"}],
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
        protagonist_name="Maria",
    )
    filler._generate_shots(1, filler._chapters[0], ["casa"], "")

    prompt = prompts[0]
    assert "ONLY use characters listed above" in prompt
    assert "Do NOT invent" in prompt


def test_gap_filler_prompt_requires_setting_coherence(tmp_path):
    """Generation prompt requires shots to match chapter setting."""
    prompts = []
    llm = MagicMock()

    def fake_complete_json(prompt, system=None):
        prompts.append(prompt)
        r = MagicMock()
        r.parsed = {"shots": []}
        return r
    llm.complete_json = fake_complete_json

    filler = GapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=[{"title": "Test", "context": "test", "vocab_focus": [], "cefr_level": "A1"}],
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    filler._generate_shots(1, filler._chapters[0], ["casa"], "")

    prompt = prompts[0]
    assert "physical setting" in prompt
    assert "No abstract" in prompt


def test_gap_filler_prompt_shows_valid_shot_range(tmp_path):
    """Generation prompt shows valid insert_after_shot range."""
    prompts = []
    llm = MagicMock()

    def fake_complete_json(prompt, system=None):
        prompts.append(prompt)
        r = MagicMock()
        r.parsed = {"shots": []}
        return r
    llm.complete_json = fake_complete_json

    filler = GapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=[{"title": "Test", "context": "test", "vocab_focus": [], "cefr_level": "A1"}],
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    filler._generate_shots(1, filler._chapters[0], ["casa"], "")

    prompt = prompts[0]
    assert "range 0" in prompt
    assert "insert_after_shot" in prompt


def test_gap_filler_prompt_instructs_visual_consistency(tmp_path):
    """Generation prompt tells LLM to reuse unnamed character descriptions."""
    prompts = []
    llm = MagicMock()

    def fake_complete_json(prompt, system=None):
        prompts.append(prompt)
        r = MagicMock()
        r.parsed = {"shots": []}
        return r
    llm.complete_json = fake_complete_json

    filler = GapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=[{"title": "Test", "context": "test", "vocab_focus": [], "cefr_level": "A1"}],
        target_language="Spanish", native_language="German", dialect="", lang_code="es",
    )
    filler._generate_shots(1, filler._chapters[0], ["casa"], "")

    prompt = prompts[0]
    assert "reuse their exact visual description" in prompt
