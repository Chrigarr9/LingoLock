"""Verify pipeline classes return (result, LLMResponse | None) tuples."""
import json
from unittest.mock import MagicMock

from pipeline.llm import LLMResponse, Usage


def _make_response(parsed: dict | list) -> LLMResponse:
    """Create a mock LLMResponse with usage data."""
    return LLMResponse(
        content=json.dumps(parsed),
        usage=Usage(
            prompt_tokens=100, completion_tokens=50, total_tokens=150,
            cost_usd=0.001, generation_id="gen-test-123",
        ),
        parsed=parsed,
    )


def test_sentence_translator_returns_usage(tmp_path):
    from pipeline.sentence_translator import SentenceTranslator

    config = _minimal_config()
    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "sentences": [
            {"source": "Hola mundo.", "target": "Hallo Welt."},
        ]
    })

    translator = SentenceTranslator(config, llm, output_base=tmp_path)
    result = translator.translate_chapter(0, "Hola mundo.")
    assert isinstance(result, tuple) and len(result) == 2
    pairs, response = result
    assert len(pairs) == 1
    assert response is not None
    assert response.usage.cost_usd == 0.001


def test_sentence_translator_cached_returns_none(tmp_path):
    """When result is cached, response should be None."""
    from pipeline.sentence_translator import SentenceTranslator

    config = _minimal_config()
    llm = MagicMock()

    # Pre-create cached file
    trans_dir = tmp_path / config.deck.id / "translations"
    trans_dir.mkdir(parents=True)
    (trans_dir / "chapter_01.json").write_text(json.dumps([
        {"chapter": 1, "sentence_index": 0, "source": "Hola.", "target": "Hallo."}
    ]))

    translator = SentenceTranslator(config, llm, output_base=tmp_path)
    pairs, response = translator.translate_chapter(0, "Hola.")
    assert len(pairs) == 1
    assert response is None
    llm.complete_json.assert_not_called()


def test_story_generator_returns_usage(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = _minimal_config()
    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "scenes": [{
            "setting": "airport",
            "description": "A busy airport",
            "shots": [{
                "focus": "suitcase",
                "image_prompt": "A red suitcase",
                "sentences": [{"source": "Hola.", "sentence_index": 0}],
            }],
        }]
    })
    # Also mock generate_summary's complete call
    llm.complete.return_value = LLMResponse(
        content="Chapter summary.",
        usage=Usage(prompt_tokens=10, completion_tokens=5, total_tokens=15),
    )

    gen = StoryGenerator(config, llm, output_base=tmp_path)
    result = gen.generate_chapter(0)
    assert isinstance(result, tuple) and len(result) == 2
    chapter, response = result
    assert chapter.chapter == 1
    assert response is not None
    assert response.usage.prompt_tokens == 100


def test_cefr_simplifier_returns_usage(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier
    from pipeline.models import ChapterScene, Scene, Shot, ShotSentence

    config = _minimal_config()
    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "scenes": [{
            "setting": "airport",
            "description": "A busy airport",
            "shots": [{
                "focus": "suitcase",
                "image_prompt": "A red suitcase",
                "sentences": [{"source": "Hola.", "sentence_index": 0}],
            }],
        }]
    })

    raw_chapter = ChapterScene(chapter=1, scenes=[
        Scene(setting="airport", description="A busy airport", shots=[
            Shot(focus="suitcase", image_prompt="A red suitcase", sentences=[
                ShotSentence(source="Hola mundo.", sentence_index=0),
            ]),
        ]),
    ])

    simplifier = CEFRSimplifier(config, llm, output_base=tmp_path)
    result = simplifier.simplify_chapter(0, raw_chapter)
    assert isinstance(result, tuple) and len(result) == 2
    chapter, response = result
    assert chapter.chapter == 1
    assert response is not None


def test_grammar_auditor_returns_usage():
    from pipeline.grammar_auditor import audit_grammar

    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "targets": [{"target": "present tense", "present": True, "example": "Yo soy."}]
    })

    result = audit_grammar(
        chapters_by_cefr={"A1": ["Yo soy Maria."]},
        grammar_targets={"A1": ["present tense"]},
        llm=llm,
    )
    assert isinstance(result, tuple) and len(result) == 2
    report, responses = result
    assert len(responses) == 1
    assert responses[0].usage.cost_usd == 0.001


def test_grammar_auditor_empty_returns_empty_list():
    from pipeline.grammar_auditor import audit_grammar

    report, responses = audit_grammar(
        chapters_by_cefr={}, grammar_targets={}, llm=None,
    )
    assert responses == []


def test_chapter_auditor_returns_usage():
    from pipeline.chapter_auditor import audit_chapter
    from pipeline.models import ChapterScene, Scene, Shot, ShotSentence

    llm = MagicMock()
    llm.complete_json.return_value = _make_response({"actions": []})

    chapter = ChapterScene(chapter=1, scenes=[
        Scene(setting="test", description="test", shots=[
            Shot(focus="test", image_prompt="test", sentences=[
                ShotSentence(source="Hola.", sentence_index=0),
            ]),
        ]),
    ])
    result = audit_chapter(chapter, {"title": "Test"}, [{"name": "Maria"}], llm=llm)
    assert isinstance(result, tuple) and len(result) == 2
    actions, response = result
    assert response is not None


def test_chapter_auditor_no_llm_returns_none():
    from pipeline.chapter_auditor import audit_chapter
    from pipeline.models import ChapterScene, Scene, Shot, ShotSentence

    chapter = ChapterScene(chapter=1, scenes=[
        Scene(setting="test", description="test", shots=[
            Shot(focus="test", image_prompt="test", sentences=[
                ShotSentence(source="Hola.", sentence_index=0),
            ]),
        ]),
    ])
    actions, response = audit_chapter(chapter, {"title": "Test"}, [{"name": "Maria"}])
    assert actions == []
    assert response is None


def test_story_auditor_returns_usage():
    from pipeline.story_auditor import audit_story

    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "fixes": [], "unnamed_characters": []
    })

    result = audit_story(
        chapters={1: ["Hola."]},
        characters=[{"name": "Maria"}],
        chapter_configs=[{"title": "Ch1", "cefr_level": "A1", "context": "test"}],
        llm=llm,
    )
    assert isinstance(result, tuple) and len(result) == 2
    (fixes, unnamed), response = result
    assert response is not None


def test_story_auditor_no_llm_returns_none():
    from pipeline.story_auditor import audit_story

    (fixes, unnamed), response = audit_story(
        chapters={}, characters=[], chapter_configs=[], llm=None,
    )
    assert fixes == []
    assert unnamed == []
    assert response is None


def test_grammar_gap_filler_returns_usage(tmp_path):
    from pipeline.grammar_auditor import GrammarAuditReport, GrammarLevelReport, GrammarTargetResult
    from pipeline.grammar_gap_filler import GrammarGapFiller

    llm = MagicMock()
    llm.complete_json.return_value = _make_response({
        "sentences": [{
            "source": "Yo hablo español.",
            "grammar_target": "present tense",
            "insert_after": -1,
        }]
    })

    filler = GrammarGapFiller(
        llm=llm,
        output_dir=tmp_path,
        config_chapters=[{"title": "Ch1", "context": "test", "cefr_level": "A1", "vocab_focus": []}],
        target_language="Spanish",
        native_language="German",
        dialect="",
    )

    report = GrammarAuditReport(levels={
        "A1": GrammarLevelReport(
            cefr="A1",
            targets=[GrammarTargetResult(target="present tense", present=False)],
            coverage=0.0,
        )
    })

    result = filler.fill_gaps(report)
    assert isinstance(result, tuple) and len(result) == 2
    sentences, response = result
    assert len(sentences) == 1
    assert response is not None


def test_grammar_gap_filler_cached_returns_none(tmp_path):
    from pipeline.grammar_auditor import GrammarAuditReport, GrammarLevelReport, GrammarTargetResult
    from pipeline.grammar_gap_filler import GrammarGapFiller

    # Pre-create cache
    (tmp_path / "grammar_gap_sentences.json").write_text(json.dumps([
        {"source": "Yo hablo.", "grammar_target": "present tense",
         "cefr_level": "A1", "chapter": 1, "insert_after": -1}
    ]))

    llm = MagicMock()
    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=[], target_language="Spanish",
        native_language="German", dialect="",
    )

    report = GrammarAuditReport(levels={
        "A1": GrammarLevelReport(
            cefr="A1",
            targets=[GrammarTargetResult(target="present tense", present=False)],
            coverage=0.0,
        )
    })

    sentences, response = filler.fill_gaps(report)
    assert len(sentences) == 1
    assert response is None
    llm.complete_json.assert_not_called()


def _minimal_config():
    """Build a minimal DeckConfig for testing."""
    from pipeline.config import DeckConfig
    return DeckConfig(**{
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de",
            "dialect": "Rioplatense",
        },
        "protagonist": {"name": "Maria", "gender": "female", "origin_country": "Germany"},
        "destination": {"country": "Argentina", "city": "Buenos Aires"},
        "story": {
            "cefr_level": "A1",
            "sentences_per_chapter": [15, 25],
            "chapters": [{"title": "Arrival", "context": "Maria arrives", "vocab_focus": ["airport"]}],
        },
        "models": {
            "story_generation": {"model": "test/model"},
            "cefr_simplification": {"model": "test/model"},
            "grammar": {"model": "test/model"},
            "gap_filling": {"model": "test/model"},
            "chapter_audit": {"model": "test/model"},
            "story_audit": {"model": "test/model"},
            "translation": {"model": "test/model"},
            "word_extraction": {"model": "test/model"},
        },
    })
