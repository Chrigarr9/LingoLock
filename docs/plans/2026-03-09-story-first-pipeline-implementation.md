# Story-First Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace single-pass constrained story generation with a two-pass approach: unconstrained story (Pass 0) → CEFR simplification (Pass 1), and update gap fillers to insert sentences at natural positions with full story context.

**Architecture:** New `story_generator.py` writes natural Spanish prose in scene/shot structure without CEFR limits. New `cefr_simplifier.py` takes the raw story and simplifies each sentence to the target CEFR level. Gap fillers receive the full simplified story as context and return `insert_after` positions. `run_all.py` orchestrated with new pass order.

**Tech Stack:** Python, Pydantic models, Gemini API (via existing `pipeline/llm.py`), pytest with mock LLM

---

### Task 1: Create `story_generator.py` — unconstrained story generation

**Files:**
- Create: `spanish-content-pipeline/pipeline/story_generator.py`
- Test: `spanish-content-pipeline/tests/test_story_generator.py`

**Step 1: Write the failing tests**

Create `tests/test_story_generator.py` with the same test helper `make_config` pattern from `test_scene_story_generator.py`. Tests:

```python
# test_story_generator.py
"""Tests for unconstrained story generator (Pass 0)."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import yaml

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import ChapterScene


def make_config(tmp_path: Path):
    """Reuse same config helper as test_scene_story_generator.py."""
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "neutral",
        },
        "protagonist": {
            "name": "Charlotte", "gender": "female",
            "origin_country": "Germany",
            "visual_tag": "a slim young woman with light-brown hair, dark-teal cardigan",
        },
        "destination": {"country": "Argentina", "city": "Buenos Aires"},
        "story": {
            "cefr_level": "A1",
            "sentences_per_chapter": [8, 12],
            "narration_style": "third-person",
            "chapters": [
                {"title": "Preparation", "context": "Packing bags", "vocab_focus": ["clothing"]},
                {"title": "To the Airport", "context": "Taking a taxi", "vocab_focus": ["traffic"]},
            ],
        },
        "llm": {
            "provider": "google", "model": "gemini-2.5-flash-lite",
            "fallback_model": "gemini-2.5-flash", "temperature": 0.7, "max_retries": 3,
        },
        "image_generation": {
            "enabled": True, "provider": "together",
            "model": "test-model", "cheap_model": "test-model",
            "style": "modern cartoon illustration, vibrant flat colors",
            "width": 768, "height": 512,
        },
        "secondary_characters": [
            {"name": "Taxi Driver", "visual_tag": "a stocky man with a gray flat cap", "chapters": [2]},
        ],
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


MOCK_CHAPTER_RESPONSE = {
    "scenes": [
        {
            "setting": "charlotte_bedroom_berlin",
            "description": "A cozy bedroom with warm lamp light",
            "shots": [
                {
                    "focus": "open suitcase on bed",
                    "image_prompt": "A cozy bedroom with a dramatically large open suitcase on the bed",
                    "sentences": [
                        {"source": "Charlotte desplegó la valija amarilla sobre la cama, sintiendo el peso de todo lo que dejaba atrás.", "sentence_index": 0},
                        {"source": "«¿Segura que necesitás todo eso?», preguntó Ingrid desde la puerta, con una media sonrisa.", "sentence_index": 1},
                    ],
                },
                {
                    "focus": "travel guide on nightstand",
                    "image_prompt": "A wooden nightstand with a colorful travel guide book",
                    "sentences": [
                        {"source": "Sobre la mesita de luz descansaba la guía de Buenos Aires que Sofía le había enviado por correo.", "sentence_index": 2},
                    ],
                },
            ],
        },
    ],
}


def test_generate_chapter_produces_chapter_scene(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    chapter = gen.generate_chapter(0)

    assert isinstance(chapter, ChapterScene)
    assert chapter.chapter == 1
    assert len(chapter.scenes) == 1
    mock_llm.complete_json.assert_called_once()


def test_saves_to_stories_raw_directory(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    # Saves to stories_raw/ not stories/
    raw_file = tmp_path / "test-deck" / "stories_raw" / "chapter_01.json"
    assert raw_file.exists()
    data = json.loads(raw_file.read_text())
    assert data["chapter"] == 1


def test_system_prompt_has_no_cefr_constraints(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    call_args = mock_llm.complete_json.call_args
    system = call_args.kwargs.get("system", "")
    # Should NOT contain CEFR level constraints or word count limits
    assert "A1" not in system
    assert "Max 8 words" not in system
    assert "Max 12 words" not in system


def test_chapter_prompt_has_no_vocab_focus(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    call_args = mock_llm.complete_json.call_args
    prompt = call_args.kwargs.get("prompt") or call_args.args[0]
    # Should NOT mention vocabulary focus
    assert "Vocabulary focus" not in prompt
    assert "vocab_focus" not in prompt


def test_skips_if_cached(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()

    raw_dir = tmp_path / "test-deck" / "stories_raw"
    raw_dir.mkdir(parents=True)
    cached = {"chapter": 1, "scenes": []}
    (raw_dir / "chapter_01.json").write_text(json.dumps(cached))

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    result = gen.generate_chapter(0)

    assert result.chapter == 1
    mock_llm.complete_json.assert_not_called()


def test_post_process_replaces_protagonist_and_characters(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_response = {
        "scenes": [{
            "setting": "street",
            "description": "A street",
            "shots": [{
                "focus": "taxi",
                "image_prompt": "Close-up of PROTAGONIST and TAXI DRIVER by a yellow taxi",
                "sentences": [
                    {"source": "PROTAGONIST sube al taxi.", "sentence_index": 0},
                ],
            }],
        }],
    }
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(mock_response),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=mock_response,
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    chapter = gen.generate_chapter(1)

    sent = chapter.scenes[0].shots[0].sentences[0].source
    assert "Charlotte" in sent
    assert "PROTAGONIST" not in sent


def test_generate_all_passes_summaries(tmp_path):
    from pipeline.story_generator import StoryGenerator

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(MOCK_CHAPTER_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=MOCK_CHAPTER_RESPONSE,
    )
    mock_llm.complete.return_value = LLMResponse(
        content="Charlotte packs her bags.",
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_all(chapter_range=range(2))

    # ch2 prompt should include "Story so far"
    ch2_call = mock_llm.complete_json.call_args_list[1]
    prompt = ch2_call.kwargs.get("prompt") or ch2_call.args[0]
    assert "Story so far" in prompt
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.story_generator'`

**Step 3: Implement `story_generator.py`**

Create `pipeline/story_generator.py` by adapting `scene_story_generator.py`:
- Copy the class structure, `_post_process`, summary generation, caching logic
- **Remove** from system prompt: all CEFR grammar constraints (A1/A2/B1/B2 blocks), vocabulary focus, word count limits per sentence, `sentences_per_chapter` min enforcement
- **Keep** in system prompt: scene/shot JSON format, image prompt rules, dialogue rules, character consistency (PROTAGONIST, CAPS names), visual rules
- **Remove** from chapter prompt: `Vocabulary focus: ...` line, CEFR level, `_format_vocab_plan`
- **Keep** in chapter prompt: title, context, characters, story so far, sentence count target (25-35 without "CEFR" framing)
- Output directory: `stories_raw/` instead of `stories/`
- Remove `vocabulary_plan` parameter from `generate_chapter` and `_build_chapter_prompt`

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add pipeline/story_generator.py tests/test_story_generator.py
git commit -m "feat(pipeline): add unconstrained story generator (Pass 0)"
```

---

### Task 2: Create `cefr_simplifier.py` — CEFR level simplification

**Files:**
- Create: `spanish-content-pipeline/pipeline/cefr_simplifier.py`
- Test: `spanish-content-pipeline/tests/test_cefr_simplifier.py`

**Step 1: Write the failing tests**

```python
# test_cefr_simplifier.py
"""Tests for CEFR simplification (Pass 1)."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import yaml

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


def make_config(tmp_path: Path):
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "neutral",
        },
        "protagonist": {
            "name": "Charlotte", "gender": "female",
            "origin_country": "Germany",
            "visual_tag": "a slim young woman with light-brown hair",
        },
        "destination": {"country": "Argentina", "city": "Buenos Aires"},
        "story": {
            "cefr_level": "A1",
            "sentences_per_chapter": [8, 12],
            "chapters": [
                {"title": "Preparation", "context": "Packing bags",
                 "vocab_focus": ["clothing"], "cefr_level": "A1"},
                {"title": "At the Restaurant", "context": "Ordering food",
                 "vocab_focus": ["food"], "cefr_level": "A2"},
            ],
        },
        "llm": {
            "provider": "google", "model": "gemini-2.5-flash-lite",
            "fallback_model": "gemini-2.5-flash", "temperature": 0.7, "max_retries": 3,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def _make_raw_chapter() -> ChapterScene:
    return ChapterScene(
        chapter=1,
        scenes=[Scene(
            setting="bedroom",
            description="A cozy bedroom",
            shots=[
                Shot(
                    focus="suitcase",
                    image_prompt="style. A suitcase on a bed. no text.",
                    sentences=[
                        ShotSentence(source="Charlotte desplegó la valija sobre la cama, sintiendo el peso de todo lo que dejaba atrás.", sentence_index=0),
                        ShotSentence(source="«¿Segura que necesitás todo eso?», preguntó Ingrid.", sentence_index=1),
                    ],
                ),
            ],
        )],
    )


# The LLM returns simplified sentences in the same JSON structure
SIMPLIFIED_RESPONSE = {
    "scenes": [{
        "setting": "bedroom",
        "description": "A cozy bedroom",
        "shots": [{
            "focus": "suitcase",
            "image_prompt": "style. A suitcase on a bed. no text.",
            "sentences": [
                {"source": "Charlotte pone la valija en la cama.", "sentence_index": 0},
                {"source": "«¿Llevás todo eso?», pregunta Ingrid.", "sentence_index": 1},
            ],
        }],
    }],
}


def test_simplify_chapter_returns_chapter_scene(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(SIMPLIFIED_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=SIMPLIFIED_RESPONSE,
    )

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    raw = _make_raw_chapter()
    result = simplifier.simplify_chapter(0, raw)

    assert isinstance(result, ChapterScene)
    assert result.chapter == 1
    assert result.scenes[0].shots[0].sentences[0].source == "Charlotte pone la valija en la cama."


def test_preserves_image_prompts(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(SIMPLIFIED_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=SIMPLIFIED_RESPONSE,
    )

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    raw = _make_raw_chapter()
    result = simplifier.simplify_chapter(0, raw)

    # Image prompts should pass through from raw, not from LLM response
    assert result.scenes[0].shots[0].image_prompt == raw.scenes[0].shots[0].image_prompt


def test_saves_to_stories_directory(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(SIMPLIFIED_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=SIMPLIFIED_RESPONSE,
    )

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    raw = _make_raw_chapter()
    simplifier.simplify_chapter(0, raw)

    story_file = tmp_path / "test-deck" / "stories" / "chapter_01.json"
    assert story_file.exists()


def test_skips_if_cached(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = MagicMock()

    story_dir = tmp_path / "test-deck" / "stories"
    story_dir.mkdir(parents=True)
    cached = {"chapter": 1, "scenes": []}
    (story_dir / "chapter_01.json").write_text(json.dumps(cached))

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    raw = _make_raw_chapter()
    result = simplifier.simplify_chapter(0, raw)

    assert result.chapter == 1
    mock_llm.complete_json.assert_not_called()


def test_prompt_includes_cefr_level(tmp_path):
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(SIMPLIFIED_RESPONSE),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=SIMPLIFIED_RESPONSE,
    )

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    raw = _make_raw_chapter()
    simplifier.simplify_chapter(0, raw)

    call_args = mock_llm.complete_json.call_args
    prompt = call_args.kwargs.get("prompt") or call_args.args[0]
    system = call_args.kwargs.get("system", "")
    # CEFR level should be in the prompt or system
    combined = prompt + system
    assert "A1" in combined


def test_handles_sentence_splitting(tmp_path):
    """When LLM splits one complex sentence into two simpler ones, indices are re-numbered."""
    from pipeline.cefr_simplifier import CEFRSimplifier

    config = make_config(tmp_path)

    # LLM splits sentence 0 into two sentences
    split_response = {
        "scenes": [{
            "setting": "bedroom",
            "description": "A cozy bedroom",
            "shots": [{
                "focus": "suitcase",
                "image_prompt": "ignored — should use raw",
                "sentences": [
                    {"source": "Charlotte pone la valija.", "sentence_index": 0},
                    {"source": "Es una valija grande.", "sentence_index": 1},
                    {"source": "«¿Llevás todo?», pregunta Ingrid.", "sentence_index": 2},
                ],
            }],
        }],
    }
    mock_llm = MagicMock()
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(split_response),
        usage=Usage(prompt_tokens=500, completion_tokens=300, total_tokens=800),
        parsed=split_response,
    )

    simplifier = CEFRSimplifier(config, mock_llm, output_base=tmp_path)
    raw = _make_raw_chapter()
    result = simplifier.simplify_chapter(0, raw)

    all_sentences = [s for scene in result.scenes for shot in scene.shots for s in shot.sentences]
    indices = [s.sentence_index for s in all_sentences]
    assert indices == [0, 1, 2]  # Sequential
    assert len(all_sentences) == 3  # One was split
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_cefr_simplifier.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Implement `cefr_simplifier.py`**

Create `pipeline/cefr_simplifier.py`:
- `CEFRSimplifier(config, llm, output_base)` class
- `simplify_chapter(chapter_index, raw_chapter: ChapterScene) -> ChapterScene`
- System prompt contains the CEFR grammar constraint blocks (moved from `scene_story_generator.py`)
- User prompt sends the raw chapter JSON and asks LLM to return same structure with simplified `source` fields
- After receiving LLM response, **overlay**: take simplified sentences from LLM, but preserve `image_prompt`, `focus`, `setting`, `description` from raw input
- Re-number `sentence_index` sequentially if LLM splits sentences
- Cache to `stories/chapter_XX.json`

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_cefr_simplifier.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add pipeline/cefr_simplifier.py tests/test_cefr_simplifier.py
git commit -m "feat(pipeline): add CEFR simplifier (Pass 1)"
```

---

### Task 3: Update gap fillers — story context and insert positions

**Files:**
- Modify: `spanish-content-pipeline/pipeline/gap_filler.py`
- Modify: `spanish-content-pipeline/pipeline/grammar_gap_filler.py`
- Modify: `spanish-content-pipeline/pipeline/models.py`
- Modify: `spanish-content-pipeline/tests/test_gap_filler.py`
- Modify: `spanish-content-pipeline/tests/test_grammar_gap_filler.py`

**Step 1: Add `insert_after` field to gap sentence models**

In `models.py`, add `insert_after: int = -1` to both `GapSentence` and `GrammarGapSentence`:

```python
class GapSentence(BaseModel):
    source: str
    target: str
    covers: list[str]
    word_annotations: dict[str, GapWordAnnotation] = {}
    insert_after: int = -1  # sentence_index to insert after (-1 = append)

class GrammarGapSentence(BaseModel):
    source: str
    target: str
    grammar_target: str
    cefr_level: str
    chapter: int
    insert_after: int = -1  # sentence_index to insert after (-1 = append)
```

**Step 2: Update gap filler to send full story context and request insert_after**

In `gap_filler.py`, change `_load_existing_sentences` to load ALL sentences (not just 10), and change `_generate_sentences` prompt:
- Include all existing sentences numbered by index
- Ask LLM to return `insert_after` for each new sentence
- Parse `insert_after` from response

In `grammar_gap_filler.py`, same changes:
- `_load_existing_sentences` sends all sentences (not just 5)
- Prompt asks for `insert_after` in JSON response
- Parse it

**Step 3: Update tests**

Add tests verifying:
- `insert_after` is parsed from LLM response
- Full story context (all sentences) appears in prompt
- `insert_after` defaults to -1 if not provided by LLM

**Step 4: Run tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_gap_filler.py tests/test_grammar_gap_filler.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add pipeline/models.py pipeline/gap_filler.py pipeline/grammar_gap_filler.py tests/test_gap_filler.py tests/test_grammar_gap_filler.py
git commit -m "feat(pipeline): gap fillers accept story context and return insert positions"
```

---

### Task 4: Add sentence insertion logic + re-indexing

**Files:**
- Create: `spanish-content-pipeline/pipeline/sentence_inserter.py`
- Test: `spanish-content-pipeline/tests/test_sentence_inserter.py`

**Step 1: Write the failing tests**

```python
# test_sentence_inserter.py
"""Tests for sentence insertion and re-indexing."""
import json
from pathlib import Path

from pipeline.models import GapSentence, GrammarGapSentence, SentencePair
from pipeline.sentence_inserter import insert_sentences, reindex_translations


def test_insert_single_sentence():
    existing = [
        SentencePair(chapter=1, sentence_index=0, source="A.", target="A_de."),
        SentencePair(chapter=1, sentence_index=1, source="B.", target="B_de."),
        SentencePair(chapter=1, sentence_index=2, source="C.", target="C_de."),
    ]
    new = [GapSentence(source="X.", target="X_de.", covers=["x"], insert_after=1)]

    result = insert_sentences(existing, new)
    sources = [s.source for s in result]
    assert sources == ["A.", "B.", "X.", "C."]
    # Re-indexed
    indices = [s.sentence_index for s in result]
    assert indices == [0, 1, 2, 3]


def test_insert_multiple_at_same_position():
    existing = [
        SentencePair(chapter=1, sentence_index=0, source="A.", target="A_de."),
        SentencePair(chapter=1, sentence_index=1, source="B.", target="B_de."),
    ]
    new = [
        GapSentence(source="X.", target="X_de.", covers=["x"], insert_after=0),
        GapSentence(source="Y.", target="Y_de.", covers=["y"], insert_after=0),
    ]

    result = insert_sentences(existing, new)
    sources = [s.source for s in result]
    assert sources == ["A.", "X.", "Y.", "B."]


def test_insert_after_minus_one_appends():
    existing = [
        SentencePair(chapter=1, sentence_index=0, source="A.", target="A_de."),
    ]
    new = [GapSentence(source="Z.", target="Z_de.", covers=["z"], insert_after=-1)]

    result = insert_sentences(existing, new)
    sources = [s.source for s in result]
    assert sources == ["A.", "Z."]


def test_grammar_gap_sentences_also_work():
    existing = [
        SentencePair(chapter=1, sentence_index=0, source="A.", target="A_de."),
        SentencePair(chapter=1, sentence_index=1, source="B.", target="B_de."),
    ]
    new = [GrammarGapSentence(
        source="G.", target="G_de.", grammar_target="subjunctive",
        cefr_level="B1", chapter=1, insert_after=0,
    )]

    result = insert_sentences(existing, new)
    sources = [s.source for s in result]
    assert sources == ["A.", "G.", "B."]


def test_reindex_translations_file(tmp_path):
    trans_dir = tmp_path / "translations"
    trans_dir.mkdir()
    data = [
        {"chapter": 1, "sentence_index": 0, "source": "A.", "target": "A_de."},
        {"chapter": 1, "sentence_index": 1, "source": "NEW.", "target": "NEW_de."},
        {"chapter": 1, "sentence_index": 2, "source": "B.", "target": "B_de."},
    ]
    path = trans_dir / "chapter_01.json"
    path.write_text(json.dumps(data))

    reindex_translations(path)

    result = json.loads(path.read_text())
    indices = [s["sentence_index"] for s in result]
    assert indices == [0, 1, 2]
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_sentence_inserter.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Implement `sentence_inserter.py`**

```python
"""Insert gap-filler sentences at natural positions and re-index."""
import json
from pathlib import Path

from pipeline.models import GapSentence, GrammarGapSentence, SentencePair


def insert_sentences(
    existing: list[SentencePair],
    new_sentences: list[GapSentence | GrammarGapSentence],
) -> list[SentencePair]:
    """Insert new sentences at their insert_after positions and re-index.

    Sentences with insert_after=-1 are appended at the end.
    Multiple inserts at the same position are kept in order.
    """
    chapter = existing[0].chapter if existing else 1

    # Build insertion map: position -> list of sentences to insert after that index
    insertions: dict[int, list] = {}
    appends = []
    for s in new_sentences:
        pos = s.insert_after
        if pos < 0:
            appends.append(s)
        else:
            insertions.setdefault(pos, []).append(s)

    # Build result by walking existing and inserting
    result: list[SentencePair] = []
    for sent in existing:
        result.append(sent)
        if sent.sentence_index in insertions:
            for new_s in insertions[sent.sentence_index]:
                result.append(SentencePair(
                    chapter=chapter,
                    sentence_index=-1,  # will be re-indexed
                    source=new_s.source,
                    target=new_s.target,
                ))

    # Append -1 sentences
    for s in appends:
        result.append(SentencePair(
            chapter=chapter, sentence_index=-1,
            source=s.source, target=s.target,
        ))

    # Re-index
    for i, sent in enumerate(result):
        sent.sentence_index = i

    return result


def reindex_translations(path: Path) -> None:
    """Re-index sentence_index values in a translations JSON file."""
    data = json.loads(path.read_text())
    for i, entry in enumerate(data):
        entry["sentence_index"] = i
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
```

**Step 4: Run tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_sentence_inserter.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add pipeline/sentence_inserter.py tests/test_sentence_inserter.py
git commit -m "feat(pipeline): add sentence inserter with position-aware re-indexing"
```

---

### Task 5: Update `run_all.py` — new pipeline orchestration

**Files:**
- Modify: `spanish-content-pipeline/scripts/run_all.py`

**Step 1: Update `run_text_stage`**

Replace the current flow with:

1. **Pass 0**: Use `StoryGenerator` (from `story_generator.py`) instead of `SceneStoryGenerator`. Output to `stories_raw/`.
2. **Pass 1**: Use `CEFRSimplifier` to simplify each raw chapter. Output to `stories/`.
3. **Pass 2-3**: Translation + word extraction (unchanged, reads from `stories/`)
4. **Pass 3c-3d**: Grammar audit + gap filling (updated to use `insert_sentences`)
5. Vocab gap filling uses `insert_sentences`
6. Remove `vocabulary_planner` import and usage

Key changes:
- Import `StoryGenerator` from `pipeline.story_generator` instead of `SceneStoryGenerator`
- Import `CEFRSimplifier` from `pipeline.cefr_simplifier`
- Import `insert_sentences` from `pipeline.sentence_inserter`
- Remove `from pipeline.vocabulary_planner import plan_vocabulary`
- Remove the `vocab_plans` block entirely
- After gap filling, call `insert_sentences` to merge new sentences into existing translations, then `reindex_translations`
- Use `extract_flat_text` and `extract_image_prompts` from `story_generator` (or keep the shared helpers)

**Step 2: Run existing CLI tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_cli.py -v`
Expected: PASS (after updating imports)

**Step 3: Commit**

```bash
git add scripts/run_all.py
git commit -m "feat(pipeline): wire up story-first two-pass pipeline in run_all.py"
```

---

### Task 6: Clean up deprecated files

**Files:**
- Remove reference to `vocabulary_planner` from `run_all.py` (done in Task 5)
- Keep `scene_story_generator.py` for now (extraction helpers `extract_flat_text`, `extract_image_prompts`, `expand_manifest_for_shared_shots` are still used)
- Move shared helpers to `story_generator.py` or a shared module

**Step 1: Move shared extraction helpers**

Copy `extract_flat_text`, `extract_image_prompts`, `expand_manifest_for_shared_shots`, and `_post_process` to `story_generator.py`. Update imports in `run_all.py`.

**Step 2: Update test imports**

Tests that import from `scene_story_generator` for extraction helpers should import from `story_generator` instead.

**Step 3: Run all tests**

Run: `cd spanish-content-pipeline && uv run pytest -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(pipeline): consolidate helpers into story_generator, remove vocab planner usage"
```

---

### Task 7: Delete cached output and end-to-end test

**Step 1: Delete old cached output**

```bash
rm -rf spanish-content-pipeline/output/es-de-buenos-aires/stories/
rm -rf spanish-content-pipeline/output/es-de-buenos-aires/translations/
rm -rf spanish-content-pipeline/output/es-de-buenos-aires/words/
rm -rf spanish-content-pipeline/output/es-de-buenos-aires/vocabulary.json
rm -rf spanish-content-pipeline/output/es-de-buenos-aires/coverage_report.json
rm -rf spanish-content-pipeline/output/es-de-buenos-aires/grammar_gap_sentences.json
rm -rf spanish-content-pipeline/output/es-de-buenos-aires/gap_sentences/
rm -rf spanish-content-pipeline/output/es-de-buenos-aires/gap_word_assignment.json
```

**Step 2: Run the pipeline on chapters 1-3**

```bash
cd spanish-content-pipeline
uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --chapters 1-3
```

**Step 3: Review output**

- Check `stories_raw/` has unconstrained prose
- Check `stories/` has CEFR-simplified versions
- Compare a few sentences between raw and simplified
- Verify translations still work
- Check that any gap filler sentences have `insert_after` positions

**Step 4: Commit output review notes (if needed)**

No code commit — just verification.
