# Benchmark System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a benchmark system that runs N LLM models through each pipeline task, storing structured results as JSON for later evaluation by an agentic tool.

**Architecture:** A `benchmarks/` directory with one script per pipeline task, a shared config for model lists, and hand-crafted fixtures (mini chapter config + poisoned chapter with seeded issues). Each script reuses existing pipeline classes, iterates over candidate models, and writes per-model result JSON files.

**Tech Stack:** Python 3.12+, pydantic, pytest, existing pipeline classes (LLMClient, StoryGenerator, CEFRSimplifier, etc.)

---

### Task 1: Shared Benchmark Infrastructure

**Files:**
- Create: `benchmarks/__init__.py`
- Create: `benchmarks/common.py`
- Create: `benchmarks/bench_config.yaml`
- Create: `benchmarks/.gitignore`
- Test: `tests/test_bench_common.py`

**Step 1: Write the test for common.py**

```python
# tests/test_bench_common.py
"""Tests for benchmarks.common module."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from benchmarks.common import (
    BenchmarkResult,
    load_bench_config,
    save_result,
    model_slug,
)


def test_model_slug_normalizes_slashes():
    assert model_slug("deepseek/deepseek-v3.2") == "deepseek--deepseek-v3.2"


def test_model_slug_normalizes_dots_and_colons():
    assert model_slug("qwen/qwen3-235b-a22b-thinking-2507") == "qwen--qwen3-235b-a22b-thinking-2507"


def test_load_bench_config(tmp_path):
    cfg = tmp_path / "bench.yaml"
    cfg.write_text("""
models:
  story_generation:
    - { provider: openrouter, model: "test/model-a", temperature: 0.8 }
    - { provider: openrouter, model: "test/model-b", temperature: 0.3 }
  translation:
    - { provider: openrouter, model: "test/model-c", temperature: 0.3 }
""")
    config = load_bench_config(cfg)
    assert len(config["models"]["story_generation"]) == 2
    assert config["models"]["translation"][0]["model"] == "test/model-c"


def test_save_result_creates_directory_and_file(tmp_path):
    result = BenchmarkResult(
        task="story_gen",
        model="test/model-a",
        provider="openrouter",
        temperature=0.8,
        input_fixture="test_chapter.yaml",
        duration_seconds=1.5,
        usage={"prompt_tokens": 100, "completion_tokens": 200, "total_tokens": 300},
        raw_output="test output",
        parsed_output={"scenes": []},
        deterministic_metrics={"sentence_count": 5},
    )
    save_result(result, tmp_path)

    # Check directory structure
    slug = "test--model-a"
    dirs = list((tmp_path / "story_gen" / slug).iterdir())
    assert len(dirs) == 1
    assert dirs[0].suffix == ".json"

    saved = json.loads(dirs[0].read_text())
    assert saved["task"] == "story_gen"
    assert saved["deterministic_metrics"]["sentence_count"] == 5


def test_benchmark_result_timestamp_auto_set():
    result = BenchmarkResult(
        task="test", model="m", provider="p", temperature=0.0,
        input_fixture="f", duration_seconds=0.0,
        usage={}, raw_output="", parsed_output=None,
        deterministic_metrics={},
    )
    assert result.timestamp  # Auto-set to current time
```

**Step 2: Run test to verify it fails**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_bench_common.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'benchmarks'`

**Step 3: Implement common.py**

```python
# benchmarks/__init__.py
# (empty)
```

```python
# benchmarks/common.py
"""Shared utilities for benchmark scripts."""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class BenchmarkResult(BaseModel):
    """Standard result format for all benchmark runs."""
    task: str
    model: str
    provider: str
    temperature: float
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"))
    input_fixture: str
    duration_seconds: float
    usage: dict
    cost_estimate_usd: float | None = None
    raw_output: str
    parsed_output: dict | list | None
    deterministic_metrics: dict
    error: str | None = None


def model_slug(model_name: str) -> str:
    """Convert model name to filesystem-safe directory name."""
    return model_name.replace("/", "--")


def load_bench_config(path: Path) -> dict:
    """Load benchmark config YAML."""
    with open(path) as f:
        return yaml.safe_load(f)


def save_result(result: BenchmarkResult, results_dir: Path) -> Path:
    """Save a benchmark result to results/<task>/<model-slug>/run_<timestamp>.json."""
    slug = model_slug(result.model)
    task_dir = results_dir / result.task / slug
    task_dir.mkdir(parents=True, exist_ok=True)

    filename = f"run_{result.timestamp.replace(':', '-')}.json"
    path = task_dir / filename
    path.write_text(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
    return path


def run_with_timing(fn):
    """Call fn(), return (result, duration_seconds)."""
    start = time.monotonic()
    result = fn()
    duration = time.monotonic() - start
    return result, duration
```

```yaml
# benchmarks/bench_config.yaml
models:
  story_generation:
    - { provider: openrouter, model: "deepseek/deepseek-v3.2", temperature: 0.8 }
    - { provider: openrouter, model: "qwen/qwen3-235b-a22b-thinking-2507", temperature: 0.8 }
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.8 }
  cefr_simplification:
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.3 }
    - { provider: openrouter, model: "deepseek/deepseek-v3.2", temperature: 0.3 }
    - { provider: openrouter, model: "qwen/qwen3-235b-a22b-thinking-2507", temperature: 0.3 }
  grammar:
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.3 }
    - { provider: openrouter, model: "deepseek/deepseek-v3.2", temperature: 0.3 }
  gap_filling:
    - { provider: openrouter, model: "deepseek/deepseek-v3.2", temperature: 0.7 }
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.7 }
  chapter_audit:
    - { provider: openrouter, model: "qwen/qwen3-235b-a22b-thinking-2507", temperature: 0.3 }
    - { provider: openrouter, model: "deepseek/deepseek-v3.2", temperature: 0.3 }
  story_audit:
    - { provider: openrouter, model: "qwen/qwen3-235b-a22b-thinking-2507", temperature: 0.3 }
    - { provider: openrouter, model: "deepseek/deepseek-v3.2", temperature: 0.3 }
  translation:
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.3 }
    - { provider: openrouter, model: "deepseek/deepseek-v3.2", temperature: 0.3 }
  word_extraction:
    - { provider: openrouter, model: "qwen/qwen3-30b-a3b", temperature: 0.3 }
    - { provider: openrouter, model: "deepseek/deepseek-v3.2", temperature: 0.3 }
```

```gitignore
# benchmarks/.gitignore
results/
```

**Step 4: Run test to verify it passes**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_bench_common.py -v`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add benchmarks/ tests/test_bench_common.py
git commit -m "feat(benchmarks): add shared infrastructure — common.py + bench_config.yaml"
```

---

### Task 2: Test Fixtures — Mini Chapter Config + Poisoned Chapter

**Files:**
- Create: `benchmarks/fixtures/test_chapter.yaml`
- Create: `benchmarks/fixtures/poisoned_chapter.json`
- Create: `benchmarks/fixtures/expected_issues.json`
- Create: `benchmarks/fixtures/reference_translations.json`
- Create: `benchmarks/fixtures/reference_words.json`
- Create: `benchmarks/fixtures/raw_chapter.json`
- Test: `tests/test_bench_fixtures.py`

**Step 1: Write fixture validation test**

```python
# tests/test_bench_fixtures.py
"""Validate benchmark fixtures are well-formed and internally consistent."""
import json
from pathlib import Path

import pytest
import yaml

from pipeline.config import DeckConfig
from pipeline.models import ChapterScene


FIXTURES = Path(__file__).resolve().parent.parent / "benchmarks" / "fixtures"


def test_test_chapter_yaml_loads_as_deck_config():
    """test_chapter.yaml must be a valid DeckConfig."""
    raw = yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text())
    config = DeckConfig(**raw)
    assert config.chapter_count == 1
    assert config.protagonist.name == "Maria"
    assert len(config.secondary_characters) >= 1


def test_poisoned_chapter_loads_as_chapter_scene():
    """poisoned_chapter.json must be a valid ChapterScene."""
    data = json.loads((FIXTURES / "poisoned_chapter.json").read_text())
    cs = ChapterScene(**data)
    assert cs.chapter == 1
    total_sentences = sum(
        len(shot.sentences)
        for scene in cs.scenes
        for shot in scene.shots
    )
    assert total_sentences >= 15, f"Expected >=15 sentences, got {total_sentences}"


def test_raw_chapter_loads_as_chapter_scene():
    """raw_chapter.json must be a valid ChapterScene (pre-simplification)."""
    data = json.loads((FIXTURES / "raw_chapter.json").read_text())
    cs = ChapterScene(**data)
    assert cs.chapter == 1


def test_expected_issues_reference_valid_sentence_indices():
    """Every expected issue must reference a sentence_index that exists in poisoned_chapter."""
    poisoned = ChapterScene(**json.loads((FIXTURES / "poisoned_chapter.json").read_text()))
    expected = json.loads((FIXTURES / "expected_issues.json").read_text())

    all_indices = set()
    for scene in poisoned.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                all_indices.add(sent.sentence_index)

    for issue in expected["issues"]:
        assert issue["sentence_index"] in all_indices, (
            f"Issue references sentence_index {issue['sentence_index']} "
            f"which doesn't exist in poisoned_chapter.json"
        )


def test_expected_issues_have_required_fields():
    expected = json.loads((FIXTURES / "expected_issues.json").read_text())
    required = {"sentence_index", "category", "description"}
    for issue in expected["issues"]:
        missing = required - set(issue.keys())
        assert not missing, f"Issue missing fields: {missing}"


def test_reference_translations_match_poisoned_chapter():
    """reference_translations must have same sentence count as poisoned chapter."""
    poisoned = ChapterScene(**json.loads((FIXTURES / "poisoned_chapter.json").read_text()))
    translations = json.loads((FIXTURES / "reference_translations.json").read_text())

    total = sum(
        len(shot.sentences)
        for scene in poisoned.scenes
        for shot in scene.shots
    )
    assert len(translations["pairs"]) == total


def test_reference_words_have_required_fields():
    words = json.loads((FIXTURES / "reference_words.json").read_text())
    required = {"source", "lemma", "pos"}
    for word in words["words"]:
        missing = required - set(word.keys())
        assert not missing, f"Word missing fields: {missing}"
```

**Step 2: Run test to verify it fails**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_bench_fixtures.py -v`
Expected: FAIL — fixture files don't exist

**Step 3: Create all fixtures**

**`benchmarks/fixtures/test_chapter.yaml`** — A minimal valid `DeckConfig` with 1 chapter (A2 level, cafe scene with Maria + Sofia):

```yaml
deck:
  name: "Benchmark Test Deck"
  id: "bench-test"

languages:
  target: "Spanish"
  target_code: "es"
  native: "German"
  native_code: "de"
  dialect: ""

protagonist:
  name: "Maria"
  gender: "female"
  origin_country: "Germany"
  visual_tag: "Maria: slim young woman, mid-20s, wavy shoulder-length light-brown hair"

destination:
  country: "Argentina"
  city: "Buenos Aires"

secondary_characters:
  - name: "Sofia"
    visual_tag: "Sofia: Argentine woman, mid-20s, long dark curly hair, olive skin"
    chapters: [1]
    role: "best friend and host"

story:
  cefr_level: "A2"
  sentences_per_chapter: [15, 20]
  coverage_top_n: 50
  narration_style: "third-person"
  grammar_targets:
    A2:
      - "pretérito indefinido (simple past: fui, compré, comí)"
      - "reflexive verbs (levantarse, llamarse, sentirse)"
      - "modal verbs (poder, querer, deber)"
  chapters:
    - title: "Café con Sofia"
      cefr_level: "A2"
      context: >
        Maria meets Sofia at a small café in San Telmo. They order coffee and
        medialunas. Sofia shows Maria her neighborhood on a hand-drawn map.
        They talk about their plans for the week. Maria is happy to finally be
        in Buenos Aires. A street musician plays tango outside.
      vocab_focus:
        - "café and food (café, medialuna, leche, azúcar, agua)"
        - "furniture (mesa, silla, ventana, puerta)"
        - "emotions (feliz, contenta, sorprendida)"
        - "directions (izquierda, derecha, cerca, lejos)"

models:
  story_generation:
    model: "deepseek/deepseek-v3.2"
    temperature: 0.8
  cefr_simplification:
    model: "qwen/qwen3-30b-a3b"
    temperature: 0.3
  grammar:
    model: "qwen/qwen3-30b-a3b"
    temperature: 0.3
  gap_filling:
    model: "deepseek/deepseek-v3.2"
    temperature: 0.7
  chapter_audit:
    model: "qwen/qwen3-235b-a22b-thinking-2507"
    temperature: 0.3
  story_audit:
    model: "qwen/qwen3-235b-a22b-thinking-2507"
    temperature: 0.3
  translation:
    model: "qwen/qwen3-30b-a3b"
    temperature: 0.3
  word_extraction:
    model: "qwen/qwen3-30b-a3b"
    temperature: 0.3
```

**`benchmarks/fixtures/raw_chapter.json`** — A valid `ChapterScene` with natural B1-level Spanish (before CEFR simplification). ~18 sentences, 3 scenes. This is the input for `bench_simplification`. Sentences are intentionally rich/complex so simplification has real work to do.

```json
{
  "chapter": 1,
  "scenes": [
    {
      "setting": "cafe_san_telmo",
      "description": "A small corner café with wooden tables, large windows, and the aroma of fresh coffee. Morning light streams in.",
      "shots": [
        {
          "focus": "café entrance",
          "image_prompt": "warm storybook illustration. Close-up of PROTAGONIST pushing open a heavy wooden door into a cozy café with warm golden light inside.",
          "sentences": [
            {"source": "Maria empujó la pesada puerta de madera del café y entró sonriendo.", "sentence_index": 0},
            {"source": "El aroma del café recién hecho la envolvió como una manta cálida.", "sentence_index": 1}
          ]
        },
        {
          "focus": "Sofia waving",
          "image_prompt": "warm storybook illustration. Medium shot of SOFIA waving enthusiastically from a small wooden table by the window.",
          "sentences": [
            {"source": "Sofia ya estaba sentada junto a la ventana y agitaba la mano con entusiasmo.", "sentence_index": 2},
            {"source": "«¡Maria! ¡Por fin estás aquí!», exclamó Sofia levantándose de la silla.", "sentence_index": 3}
          ]
        },
        {
          "focus": "hug between friends",
          "image_prompt": "warm storybook illustration. Close-up of two young women hugging tightly in front of a café table.",
          "sentences": [
            {"source": "Las dos amigas se abrazaron durante un largo momento, sin decir nada.", "sentence_index": 4},
            {"source": "Maria sintió que todas las horas del vuelo habían valido la pena.", "sentence_index": 5}
          ]
        }
      ]
    },
    {
      "setting": "cafe_table",
      "description": "The friends sit at a small table. Two cups of coffee and a plate of medialunas between them.",
      "shots": [
        {
          "focus": "coffee and medialunas",
          "image_prompt": "warm storybook illustration. Close-up of two steaming cups of coffee and a plate of golden medialunas on a wooden table.",
          "sentences": [
            {"source": "El camarero trajo dos cortados y un plato con medialunas recién horneadas.", "sentence_index": 6},
            {"source": "Maria probó una medialuna y cerró los ojos de placer.", "sentence_index": 7}
          ]
        },
        {
          "focus": "hand-drawn map",
          "image_prompt": "warm storybook illustration. Close-up of a hand-drawn map spread on the table, Sofia's finger pointing to a colorful street.",
          "sentences": [
            {"source": "Sofia desplegó un mapa dibujado a mano sobre la mesa.", "sentence_index": 8},
            {"source": "«Este es San Telmo, y aquí está la feria que tenemos que visitar», dijo señalando un punto.", "sentence_index": 9},
            {"source": "Maria estudió el mapa con curiosidad, intentando memorizar las calles.", "sentence_index": 10}
          ]
        },
        {
          "focus": "Maria's excited face",
          "image_prompt": "warm storybook illustration. Close-up of PROTAGONIST's face with wide eyes and a big smile, looking at something on the table.",
          "sentences": [
            {"source": "«¿Podemos ir también al mercado de antigüedades?», preguntó Maria emocionada.", "sentence_index": 11},
            {"source": "Sofia asintió y marcó otro punto en el mapa con un lápiz rojo.", "sentence_index": 12}
          ]
        }
      ]
    },
    {
      "setting": "cafe_exterior",
      "description": "Through the café window, a street musician plays tango on an old bandoneón.",
      "shots": [
        {
          "focus": "tango musician",
          "image_prompt": "warm storybook illustration. Through a café window, an elderly man in a dark hat plays a bandoneón on the cobblestone street.",
          "sentences": [
            {"source": "A través de la ventana, un músico anciano tocaba el bandoneón en la vereda.", "sentence_index": 13},
            {"source": "La melodía del tango flotaba entre las mesas del café.", "sentence_index": 14}
          ]
        },
        {
          "focus": "friends listening",
          "image_prompt": "warm storybook illustration. Medium shot of PROTAGONIST and SOFIA at their table, both turned toward the window, listening.",
          "sentences": [
            {"source": "Maria y Sofia dejaron de hablar para escuchar la música.", "sentence_index": 15},
            {"source": "«Esto es lo que más me gusta de Buenos Aires», susurró Sofia.", "sentence_index": 16}
          ]
        },
        {
          "focus": "Maria's journal",
          "image_prompt": "warm storybook illustration. Close-up of PROTAGONIST writing in a small leather journal, a coffee cup beside her hand.",
          "sentences": [
            {"source": "Maria sacó su diario de viaje y escribió las primeras líneas sobre su llegada.", "sentence_index": 17}
          ]
        }
      ]
    }
  ]
}
```

**`benchmarks/fixtures/poisoned_chapter.json`** — Same story structure but with ~16 planted issues. Each issue is tagged by the sentence_index it appears in. The chapter is set to CEFR A2 but contains violations at multiple levels.

```json
{
  "chapter": 1,
  "scenes": [
    {
      "setting": "cafe_san_telmo",
      "description": "A small corner café in San Telmo with wooden tables.",
      "shots": [
        {
          "focus": "café entrance",
          "image_prompt": "PROTAGONIST enters café",
          "sentences": [
            {"source": "Maria abrió la puerta del café.", "sentence_index": 0},
            {"source": "Si hubiera sabido lo que le esperaba, habría corrido más rápido.", "sentence_index": 1}
          ]
        },
        {
          "focus": "Sofia waving",
          "image_prompt": "SOFIA waves",
          "sentences": [
            {"source": "Sofia estaba sentada junto a la ventana.", "sentence_index": 2},
            {"source": "«¡Maria! ¡Qué alegría!», dijo Sofia con su pelo rubio brillante.", "sentence_index": 3}
          ]
        },
        {
          "focus": "hug",
          "image_prompt": "friends hug",
          "sentences": [
            {"source": "Las amigas se abrazaron.", "sentence_index": 4},
            {"source": "Maria camina hacia la mesa y se sienta.", "sentence_index": 5}
          ]
        }
      ]
    },
    {
      "setting": "cafe_table",
      "description": "The friends sit at a table with coffee.",
      "shots": [
        {
          "focus": "coffee",
          "image_prompt": "coffee cups",
          "sentences": [
            {"source": "El camarero trajo dos cortados.", "sentence_index": 6},
            {"source": "Diego se sentó con ellas y pidió una cerveza.", "sentence_index": 7}
          ]
        },
        {
          "focus": "map",
          "image_prompt": "map on table",
          "sentences": [
            {"source": "Sofia desplegó un mapa sobre la mesa.", "sentence_index": 8},
            {"source": "«Aquí está la playa donde vamos a nadar mañana», dijo Sofia.", "sentence_index": 9},
            {"source": "Maria no obstante consideró que las circunstancias geopolíticas del barrio habían transformado inexorablemente la fisonomía urbana del sector.", "sentence_index": 10}
          ]
        },
        {
          "focus": "Maria's face",
          "image_prompt": "Maria smiles",
          "sentences": [
            {"source": "Maria se siente muy emocionada por los planes.", "sentence_index": 11},
            {"source": "Es importante que Maria haya podido viajar a Buenos Aires para que su vida hubiera cambiado.", "sentence_index": 12}
          ]
        }
      ]
    },
    {
      "setting": "beach_scene",
      "description": "A sunny beach with golden sand.",
      "shots": [
        {
          "focus": "beach",
          "image_prompt": "beach scene",
          "sentences": [
            {"source": "Maria y Sofia corrieron hacia el mar azul.", "sentence_index": 13},
            {"source": "El vendedor de helados les ofreció dos copas grandes.", "sentence_index": 14}
          ]
        },
        {
          "focus": "sunset",
          "image_prompt": "sunset",
          "sentences": [
            {"source": "Maria mira la puesta de sol con su chaqueta verde.", "sentence_index": 15},
            {"source": "Sofia dijo que Maria tenía el pelo negro y corto.", "sentence_index": 16},
            {"source": "Maria sacó tres maletas enormes del bolso pequeño.", "sentence_index": 17}
          ]
        }
      ]
    }
  ]
}
```

**`benchmarks/fixtures/expected_issues.json`** — Ground truth for the poisoned chapter:

```json
{
  "issues": [
    {
      "sentence_index": 1,
      "category": "cefr_violation",
      "description": "B2+ pluperfect subjunctive 'hubiera sabido' and conditional perfect 'habría corrido' in A2 chapter"
    },
    {
      "sentence_index": 3,
      "category": "character_description",
      "description": "Sofia described with 'pelo rubio' but her visual_tag says 'long dark curly hair'"
    },
    {
      "sentence_index": 5,
      "category": "tense_inconsistency",
      "description": "Switches to present tense 'camina/se sienta' when surrounding sentences use preterite"
    },
    {
      "sentence_index": 7,
      "category": "wrong_character",
      "description": "Diego appears but only Maria and Sofia are allowed in this chapter"
    },
    {
      "sentence_index": 9,
      "category": "setting_violation",
      "description": "References 'la playa' (beach) in a café chapter set in San Telmo"
    },
    {
      "sentence_index": 10,
      "category": "cefr_violation",
      "description": "Sentence is B2+/C1 level: 'circunstancias geopolíticas', 'inexorablemente', 'fisonomía urbana' — far too complex for A2"
    },
    {
      "sentence_index": 10,
      "category": "sentence_complexity",
      "description": "Sentence has 20+ words, far exceeding A2 max of 12 words"
    },
    {
      "sentence_index": 11,
      "category": "tense_inconsistency",
      "description": "Present tense 'se siente' when context is past narration"
    },
    {
      "sentence_index": 12,
      "category": "cefr_violation",
      "description": "Perfect subjunctive 'haya podido' and pluperfect subjunctive 'hubiera cambiado' are B2+ in A2 chapter"
    },
    {
      "sentence_index": 12,
      "category": "scene_logic",
      "description": "Nonsensical causal chain: 'es importante que haya podido viajar para que hubiera cambiado' is logically incoherent"
    },
    {
      "sentence_index": 13,
      "category": "setting_violation",
      "description": "Scene jumps to beach ('corrieron hacia el mar') — chapter is set in a café in San Telmo"
    },
    {
      "sentence_index": 14,
      "category": "setting_violation",
      "description": "Ice cream vendor on beach — inconsistent with café setting"
    },
    {
      "sentence_index": 15,
      "category": "tense_inconsistency",
      "description": "Present tense 'mira' in past-tense narration"
    },
    {
      "sentence_index": 15,
      "category": "continuity_error",
      "description": "Maria wears 'chaqueta verde' but her visual tag has 'dark-teal cardigan' (not green jacket)"
    },
    {
      "sentence_index": 16,
      "category": "character_description",
      "description": "Says Maria has 'pelo negro y corto' but her visual_tag says 'wavy shoulder-length light-brown hair'"
    },
    {
      "sentence_index": 17,
      "category": "scene_logic",
      "description": "Physically impossible: 'tres maletas enormes del bolso pequeño' — three huge suitcases from a small bag"
    }
  ]
}
```

**`benchmarks/fixtures/reference_translations.json`** — Hand-verified German translations for the poisoned chapter sentences (used for bench_translation, which translates the clean test chapter, but we also provide translations for the poisoned chapter so all sentence counts match). For bench_translation specifically, we use the raw_chapter's sentences. Create a separate file:

```json
{
  "pairs": [
    {"source": "Maria abrió la puerta del café.", "target": "Maria öffnete die Tür des Cafés."},
    {"source": "Si hubiera sabido lo que le esperaba, habría corrido más rápido.", "target": "Wenn sie gewusst hätte, was sie erwartet, wäre sie schneller gelaufen."},
    {"source": "Sofia estaba sentada junto a la ventana.", "target": "Sofia saß am Fenster."},
    {"source": "«¡Maria! ¡Qué alegría!», dijo Sofia con su pelo rubio brillante.", "target": "«Maria! Was für eine Freude!», sagte Sofia mit ihrem glänzenden blonden Haar."},
    {"source": "Las amigas se abrazaron.", "target": "Die Freundinnen umarmten sich."},
    {"source": "Maria camina hacia la mesa y se sienta.", "target": "Maria geht zum Tisch und setzt sich."},
    {"source": "El camarero trajo dos cortados.", "target": "Der Kellner brachte zwei Cortados."},
    {"source": "Diego se sentó con ellas y pidió una cerveza.", "target": "Diego setzte sich zu ihnen und bestellte ein Bier."},
    {"source": "Sofia desplegó un mapa sobre la mesa.", "target": "Sofia breitete eine Karte auf dem Tisch aus."},
    {"source": "«Aquí está la playa donde vamos a nadar mañana», dijo Sofia.", "target": "«Hier ist der Strand, an dem wir morgen schwimmen gehen», sagte Sofia."},
    {"source": "Maria no obstante consideró que las circunstancias geopolíticas del barrio habían transformado inexorablemente la fisonomía urbana del sector.", "target": "Maria erwog dennoch, dass die geopolitischen Umstände des Viertels die urbane Physiognomie des Sektors unaufhaltsam verändert hatten."},
    {"source": "Maria se siente muy emocionada por los planes.", "target": "Maria fühlt sich sehr begeistert über die Pläne."},
    {"source": "Es importante que Maria haya podido viajar a Buenos Aires para que su vida hubiera cambiado.", "target": "Es ist wichtig, dass Maria nach Buenos Aires reisen konnte, damit sich ihr Leben verändert hätte."},
    {"source": "Maria y Sofia corrieron hacia el mar azul.", "target": "Maria und Sofia rannten zum blauen Meer."},
    {"source": "El vendedor de helados les ofreció dos copas grandes.", "target": "Der Eisverkäufer bot ihnen zwei große Becher an."},
    {"source": "Maria mira la puesta de sol con su chaqueta verde.", "target": "Maria schaut den Sonnenuntergang mit ihrer grünen Jacke an."},
    {"source": "Sofia dijo que Maria tenía el pelo negro y corto.", "target": "Sofia sagte, dass Maria kurzes schwarzes Haar hatte."},
    {"source": "Maria sacó tres maletas enormes del bolso pequeño.", "target": "Maria holte drei riesige Koffer aus der kleinen Tasche."}
  ]
}
```

**`benchmarks/fixtures/reference_words.json`** — Expected vocabulary extracted from raw_chapter (the clean version). Core content words only:

```json
{
  "words": [
    {"source": "empujó", "lemma": "empujar", "pos": "VERB"},
    {"source": "puerta", "lemma": "puerta", "pos": "NOUN"},
    {"source": "madera", "lemma": "madera", "pos": "NOUN"},
    {"source": "café", "lemma": "café", "pos": "NOUN"},
    {"source": "entró", "lemma": "entrar", "pos": "VERB"},
    {"source": "aroma", "lemma": "aroma", "pos": "NOUN"},
    {"source": "envolvió", "lemma": "envolver", "pos": "VERB"},
    {"source": "manta", "lemma": "manta", "pos": "NOUN"},
    {"source": "sentada", "lemma": "sentar", "pos": "VERB"},
    {"source": "ventana", "lemma": "ventana", "pos": "NOUN"},
    {"source": "agitaba", "lemma": "agitar", "pos": "VERB"},
    {"source": "mano", "lemma": "mano", "pos": "NOUN"},
    {"source": "exclamó", "lemma": "exclamar", "pos": "VERB"},
    {"source": "silla", "lemma": "silla", "pos": "NOUN"},
    {"source": "amigas", "lemma": "amigo", "pos": "NOUN"},
    {"source": "abrazaron", "lemma": "abrazar", "pos": "VERB"},
    {"source": "sintió", "lemma": "sentir", "pos": "VERB"},
    {"source": "vuelo", "lemma": "vuelo", "pos": "NOUN"},
    {"source": "camarero", "lemma": "camarero", "pos": "NOUN"},
    {"source": "cortados", "lemma": "cortado", "pos": "NOUN"},
    {"source": "plato", "lemma": "plato", "pos": "NOUN"},
    {"source": "medialunas", "lemma": "medialuna", "pos": "NOUN"},
    {"source": "probó", "lemma": "probar", "pos": "VERB"},
    {"source": "ojos", "lemma": "ojo", "pos": "NOUN"},
    {"source": "mapa", "lemma": "mapa", "pos": "NOUN"},
    {"source": "mesa", "lemma": "mesa", "pos": "NOUN"},
    {"source": "feria", "lemma": "feria", "pos": "NOUN"},
    {"source": "visitar", "lemma": "visitar", "pos": "VERB"},
    {"source": "calles", "lemma": "calle", "pos": "NOUN"},
    {"source": "mercado", "lemma": "mercado", "pos": "NOUN"},
    {"source": "lápiz", "lemma": "lápiz", "pos": "NOUN"},
    {"source": "músico", "lemma": "músico", "pos": "NOUN"},
    {"source": "bandoneón", "lemma": "bandoneón", "pos": "NOUN"},
    {"source": "vereda", "lemma": "vereda", "pos": "NOUN"},
    {"source": "melodía", "lemma": "melodía", "pos": "NOUN"},
    {"source": "tango", "lemma": "tango", "pos": "NOUN"},
    {"source": "mesas", "lemma": "mesa", "pos": "NOUN"},
    {"source": "música", "lemma": "música", "pos": "NOUN"},
    {"source": "diario", "lemma": "diario", "pos": "NOUN"},
    {"source": "viaje", "lemma": "viaje", "pos": "NOUN"},
    {"source": "escribió", "lemma": "escribir", "pos": "VERB"},
    {"source": "líneas", "lemma": "línea", "pos": "NOUN"},
    {"source": "llegada", "lemma": "llegada", "pos": "NOUN"}
  ]
}
```

**Step 4: Run test to verify it passes**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_bench_fixtures.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add benchmarks/fixtures/ tests/test_bench_fixtures.py
git commit -m "feat(benchmarks): add test fixtures — mini chapter, poisoned chapter, ground truth"
```

---

### Task 3: bench_story_gen.py

**Files:**
- Create: `benchmarks/bench_story_gen.py`
- Test: `tests/test_bench_story_gen.py`

**Step 1: Write the test**

```python
# tests/test_bench_story_gen.py
"""Tests for bench_story_gen benchmark."""
import json
from pathlib import Path
from unittest.mock import MagicMock

from benchmarks.bench_story_gen import run_story_gen_benchmark, compute_deterministic_metrics
from pipeline.models import ChapterScene


def _make_chapter_scene():
    return {
        "scenes": [{
            "setting": "cafe",
            "description": "A café",
            "shots": [
                {
                    "focus": "door",
                    "image_prompt": "PROTAGONIST enters",
                    "sentences": [
                        {"source": "Maria abrió la puerta.", "sentence_index": 0},
                        {"source": "«¡Hola!», dijo Sofia.", "sentence_index": 1},
                    ],
                },
                {
                    "focus": "table",
                    "image_prompt": "coffee on table",
                    "sentences": [
                        {"source": "Ella se sentó.", "sentence_index": 2},
                    ],
                },
            ],
        }],
    }


def test_compute_deterministic_metrics():
    data = _make_chapter_scene()
    cs = ChapterScene(chapter=1, **data)
    metrics = compute_deterministic_metrics(cs, protagonist_name="Maria", secondary_characters=["Sofia"])
    assert metrics["sentence_count"] == 3
    assert metrics["shot_count"] == 2
    assert metrics["scene_count"] == 1
    assert metrics["dialogue_count"] >= 1  # «¡Hola!»
    assert metrics["protagonist_mentions"] >= 1
    assert metrics["character_mentions"]["Sofia"] >= 1
```

**Step 2: Run test to verify it fails**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_bench_story_gen.py -v`
Expected: FAIL

**Step 3: Implement bench_story_gen.py**

```python
# benchmarks/bench_story_gen.py
"""Benchmark: Story Generation (Pass 0).

Runs StoryGenerator.generate_chapter() with each candidate model
and stores structured results for later evaluation.
"""

import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing, model_slug
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence
from pipeline.story_generator import StoryGenerator
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_deterministic_metrics(
    chapter: ChapterScene,
    protagonist_name: str = "",
    secondary_characters: list[str] | None = None,
) -> dict:
    """Compute deterministic metrics from a generated chapter."""
    secondary_characters = secondary_characters or []
    sentences = []
    for scene in chapter.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences.append(sent.source)

    sentence_count = len(sentences)
    word_count = sum(len(s.split()) for s in sentences)
    shot_count = sum(len(scene.shots) for scene in chapter.scenes)
    scene_count = len(chapter.scenes)

    # Dialogue: count sentences with guillemets
    dialogue_count = sum(1 for s in sentences if "«" in s)

    # Character mentions
    protagonist_mentions = sum(1 for s in sentences if protagonist_name.lower() in s.lower()) if protagonist_name else 0
    char_mentions = {}
    for name in secondary_characters:
        char_mentions[name] = sum(1 for s in sentences if name.lower() in s.lower())

    return {
        "sentence_count": sentence_count,
        "word_count": word_count,
        "shot_count": shot_count,
        "scene_count": scene_count,
        "dialogue_count": dialogue_count,
        "dialogue_ratio": round(dialogue_count / max(1, sentence_count), 2),
        "avg_sentence_length": round(word_count / max(1, sentence_count), 1),
        "protagonist_mentions": protagonist_mentions,
        "character_mentions": char_mentions,
    }


def run_story_gen_benchmark(bench_config_path: Path | None = None):
    """Run story generation benchmark across all candidate models."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))

    models = bench_config["models"].get("story_generation", [])
    if not models:
        print("No story_generation models in bench_config.yaml")
        return

    sc_names = [sc.name for sc in fixture_config.secondary_characters]

    print(f"=== Benchmark: Story Generation ({len(models)} models) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.8)
        print(f"\n  Model: {model_name} (temp={temperature})")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(
            provider=provider, api_key=api_key, model=model_name,
            temperature=temperature,
        )

        # Use a temp dir so caching doesn't interfere between models
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gen = StoryGenerator(fixture_config, llm, output_base=tmp_path)

            try:
                (chapter, duration) = run_with_timing(
                    lambda: gen.generate_chapter(0)
                )
                usage = llm._client  # We'll get usage from response
                metrics = compute_deterministic_metrics(
                    chapter,
                    protagonist_name=fixture_config.protagonist.name,
                    secondary_characters=sc_names,
                )
                result = BenchmarkResult(
                    task="story_gen",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="test_chapter.yaml",
                    duration_seconds=round(duration, 2),
                    usage={},  # Token usage not easily accessible from current LLM client
                    raw_output=chapter.model_dump_json(),
                    parsed_output=chapter.model_dump(),
                    deterministic_metrics=metrics,
                )
                print(f"    {metrics['sentence_count']} sentences, {metrics['scene_count']} scenes, "
                      f"{metrics['dialogue_count']} dialogue, {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task="story_gen",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="test_chapter.yaml",
                    duration_seconds=0,
                    usage={},
                    raw_output="",
                    parsed_output=None,
                    deterministic_metrics={},
                    error=str(e),
                )
                print(f"    ERROR: {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_story_gen_benchmark()
```

**Step 4: Run test to verify it passes**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_bench_story_gen.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add benchmarks/bench_story_gen.py tests/test_bench_story_gen.py
git commit -m "feat(benchmarks): add bench_story_gen — story generation benchmark"
```

---

### Task 4: bench_simplification.py

**Files:**
- Create: `benchmarks/bench_simplification.py`
- Test: `tests/test_bench_simplification.py`

**Step 1: Write the test**

```python
# tests/test_bench_simplification.py
"""Tests for bench_simplification benchmark."""
from benchmarks.bench_simplification import compute_deterministic_metrics
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


def _make_simplified_chapter():
    return ChapterScene(
        chapter=1,
        scenes=[Scene(
            setting="cafe",
            description="A café",
            shots=[
                Shot(focus="door", image_prompt="test", sentences=[
                    ShotSentence(source="Maria abre la puerta.", sentence_index=0),
                    ShotSentence(source="El café es grande.", sentence_index=1),
                ]),
                Shot(focus="table", image_prompt="test", sentences=[
                    ShotSentence(source="Ella se sienta en la mesa pequeña cerca de la ventana grande.", sentence_index=2),
                ]),
            ],
        )],
    )


def test_compute_deterministic_metrics():
    chapter = _make_simplified_chapter()
    metrics = compute_deterministic_metrics(chapter, cefr_level="A2", lang="es")
    assert metrics["sentence_count"] == 3
    assert metrics["max_sentence_length_words"] >= 10  # The long sentence
    assert "avg_sentence_length_words" in metrics
    assert isinstance(metrics["sentences_exceeding_word_limit"], int)
```

**Step 2: Run test to verify it fails**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_bench_simplification.py -v`
Expected: FAIL

**Step 3: Implement bench_simplification.py**

The script loads `raw_chapter.json`, runs `CEFRSimplifier.simplify_chapter()` with each model, and computes CEFR adherence metrics (sentence length vs level limits, vocabulary complexity).

```python
# benchmarks/bench_simplification.py
"""Benchmark: CEFR Simplification (Pass 1).

Runs CEFRSimplifier on the raw_chapter fixture with each candidate model.
"""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing
from pipeline.cefr_simplifier import CEFRSimplifier
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"

# CEFR word limits per level
_WORD_LIMITS = {"A1": 12, "A2": 12, "B1": 18, "B2": 25}


def compute_deterministic_metrics(chapter: ChapterScene, cefr_level: str, lang: str = "es") -> dict:
    """Compute simplification quality metrics."""
    resolved = cefr_level.split("-")[-1] if "-" in cefr_level else cefr_level
    word_limit = _WORD_LIMITS.get(resolved, 12)

    sentences = []
    for scene in chapter.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences.append(sent.source)

    lengths = [len(s.split()) for s in sentences]

    return {
        "sentence_count": len(sentences),
        "avg_sentence_length_words": round(sum(lengths) / max(1, len(lengths)), 1),
        "max_sentence_length_words": max(lengths) if lengths else 0,
        "word_limit_for_level": word_limit,
        "sentences_exceeding_word_limit": sum(1 for l in lengths if l > word_limit),
        "scene_count": len(chapter.scenes),
        "shot_count": sum(len(s.shots) for s in chapter.scenes),
    }


def run_simplification_benchmark(bench_config_path: Path | None = None):
    """Run CEFR simplification benchmark across all candidate models."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    cefr = fixture_config.story.chapters[0].cefr_level or fixture_config.story.cefr_level

    models = bench_config["models"].get("cefr_simplification", [])
    if not models:
        print("No cefr_simplification models in bench_config.yaml")
        return

    print(f"=== Benchmark: CEFR Simplification ({len(models)} models, target {cefr}) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        with tempfile.TemporaryDirectory() as tmp:
            simplifier = CEFRSimplifier(fixture_config, llm, output_base=Path(tmp))

            try:
                (chapter, duration) = run_with_timing(
                    lambda: simplifier.simplify_chapter(0, raw_chapter)
                )
                metrics = compute_deterministic_metrics(chapter, cefr)
                result = BenchmarkResult(
                    task="simplification",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="raw_chapter.json",
                    duration_seconds=round(duration, 2),
                    usage={},
                    raw_output=chapter.model_dump_json(),
                    parsed_output=chapter.model_dump(),
                    deterministic_metrics=metrics,
                )
                exceed = metrics["sentences_exceeding_word_limit"]
                print(f"    {metrics['sentence_count']} sentences, "
                      f"avg {metrics['avg_sentence_length_words']} words, "
                      f"{exceed} exceeding limit, {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task="simplification", model=model_name, provider=provider,
                    temperature=temperature, input_fixture="raw_chapter.json",
                    duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                    deterministic_metrics={}, error=str(e),
                )
                print(f"    ERROR: {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_simplification_benchmark()
```

**Step 4: Run test, then commit**

Run: `uv run pytest tests/test_bench_simplification.py -v`

```bash
git add benchmarks/bench_simplification.py tests/test_bench_simplification.py
git commit -m "feat(benchmarks): add bench_simplification — CEFR simplification benchmark"
```

---

### Task 5: bench_grammar.py

**Files:**
- Create: `benchmarks/bench_grammar.py`
- Test: `tests/test_bench_grammar.py`

**Step 1: Write the test**

```python
# tests/test_bench_grammar.py
"""Tests for bench_grammar benchmark."""
from benchmarks.bench_grammar import compute_grammar_audit_metrics


def test_compute_grammar_audit_metrics():
    """Known targets: 3 total, 2 detected = 66.7% coverage."""
    from pipeline.grammar_auditor import GrammarAuditReport, GrammarLevelReport, GrammarTargetResult
    report = GrammarAuditReport(levels={
        "A2": GrammarLevelReport(
            cefr="A2",
            targets=[
                GrammarTargetResult(target="pretérito indefinido", present=True, example="fui"),
                GrammarTargetResult(target="reflexive verbs", present=True, example="se llama"),
                GrammarTargetResult(target="modal verbs", present=False),
            ],
            coverage=0.667,
        )
    })
    metrics = compute_grammar_audit_metrics(report)
    assert metrics["targets_total"] == 3
    assert metrics["targets_detected"] == 2
    assert metrics["targets_missing"] == 1
```

**Step 2: Run test to verify it fails, then implement**

```python
# benchmarks/bench_grammar.py
"""Benchmark: Grammar Audit + Gap Fill (Pass 2).

Runs grammar audit on test chapter text, then grammar gap filler for missing targets.
"""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing
from pipeline.config import DeckConfig
from pipeline.grammar_auditor import GrammarAuditReport, audit_grammar
from pipeline.grammar_gap_filler import GrammarGapFiller
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from pipeline.story_generator import extract_flat_text
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_grammar_audit_metrics(report: GrammarAuditReport) -> dict:
    """Compute metrics from grammar audit report."""
    total = 0
    detected = 0
    for level_report in report.levels.values():
        for t in level_report.targets:
            total += 1
            if t.present:
                detected += 1
    return {
        "targets_total": total,
        "targets_detected": detected,
        "targets_missing": total - detected,
        "coverage": round(detected / max(1, total), 3),
    }


def run_grammar_benchmark(bench_config_path: Path | None = None):
    """Run grammar audit + gap fill benchmark."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))

    # Load the raw chapter to get sentences for grammar audit
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    flat_text = extract_flat_text(raw_chapter)
    cefr = fixture_config.story.chapters[0].cefr_level or fixture_config.story.cefr_level

    chapters_by_cefr = {cefr: flat_text.split("\n")}

    models = bench_config["models"].get("grammar", [])
    if not models:
        print("No grammar models in bench_config.yaml")
        return

    print(f"=== Benchmark: Grammar Audit + Gap Fill ({len(models)} models) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        try:
            # Grammar audit
            (report, audit_duration) = run_with_timing(
                lambda: audit_grammar(chapters_by_cefr, fixture_config.story.grammar_targets, llm=llm)
            )
            audit_metrics = compute_grammar_audit_metrics(report)

            # Grammar gap fill
            with tempfile.TemporaryDirectory() as tmp:
                filler = GrammarGapFiller(
                    llm=llm,
                    output_dir=Path(tmp),
                    config_chapters=[{
                        "title": ch.title, "context": ch.context,
                        "vocab_focus": ch.vocab_focus,
                        "cefr_level": ch.cefr_level or fixture_config.story.cefr_level,
                    } for ch in fixture_config.story.chapters],
                    target_language=fixture_config.languages.target,
                    native_language=fixture_config.languages.native,
                    dialect=fixture_config.languages.dialect or "",
                )
                (gap_sentences, fill_duration) = run_with_timing(
                    lambda: filler.fill_gaps(report)
                )

            total_duration = audit_duration + fill_duration
            metrics = {
                **audit_metrics,
                "gap_sentences_generated": len(gap_sentences),
                "audit_duration": round(audit_duration, 2),
                "fill_duration": round(fill_duration, 2),
            }

            result = BenchmarkResult(
                task="grammar",
                model=model_name,
                provider=provider,
                temperature=temperature,
                input_fixture="raw_chapter.json",
                duration_seconds=round(total_duration, 2),
                usage={},
                raw_output=json.dumps({
                    "audit": report.model_dump(),
                    "gap_sentences": [s.model_dump() for s in gap_sentences],
                }),
                parsed_output={
                    "audit": report.model_dump(),
                    "gap_sentences": [s.model_dump() for s in gap_sentences],
                },
                deterministic_metrics=metrics,
            )
            print(f"    {audit_metrics['targets_detected']}/{audit_metrics['targets_total']} detected, "
                  f"{len(gap_sentences)} gaps filled, {total_duration:.1f}s")
        except Exception as e:
            result = BenchmarkResult(
                task="grammar", model=model_name, provider=provider,
                temperature=temperature, input_fixture="raw_chapter.json",
                duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                deterministic_metrics={}, error=str(e),
            )
            print(f"    ERROR: {e}")

        save_result(result, RESULTS)


if __name__ == "__main__":
    run_grammar_benchmark()
```

**Step 3: Run test, then commit**

```bash
git add benchmarks/bench_grammar.py tests/test_bench_grammar.py
git commit -m "feat(benchmarks): add bench_grammar — grammar audit + gap fill benchmark"
```

---

### Task 6: bench_chapter_audit.py + bench_audit.py

**Files:**
- Create: `benchmarks/bench_chapter_audit.py`
- Create: `benchmarks/bench_audit.py`
- Test: `tests/test_bench_audit.py`

**Step 1: Write the test for shared precision/recall logic**

```python
# tests/test_bench_audit.py
"""Tests for audit benchmark precision/recall computation."""
from benchmarks.bench_audit import compute_audit_metrics


def test_perfect_precision_recall():
    """All expected issues found, no false positives."""
    expected = [
        {"sentence_index": 1, "category": "cefr_violation"},
        {"sentence_index": 3, "category": "character_description"},
    ]
    found_indices = {1, 3}
    metrics = compute_audit_metrics(expected, found_indices, total_fixes=2)
    assert metrics["precision"] == 1.0
    assert metrics["recall"] == 1.0


def test_partial_recall():
    """Only 1 of 2 issues found."""
    expected = [
        {"sentence_index": 1, "category": "cefr_violation"},
        {"sentence_index": 3, "category": "character_description"},
    ]
    found_indices = {1}
    metrics = compute_audit_metrics(expected, found_indices, total_fixes=1)
    assert metrics["recall"] == 0.5
    assert metrics["precision"] == 1.0


def test_false_positives():
    """Found issues at indices not in expected list."""
    expected = [
        {"sentence_index": 1, "category": "cefr_violation"},
    ]
    found_indices = {1, 5, 8}
    metrics = compute_audit_metrics(expected, found_indices, total_fixes=3)
    assert metrics["recall"] == 1.0
    assert metrics["precision"] < 1.0
    assert metrics["false_positives"] == 2
```

**Step 2: Run test to verify it fails, then implement both scripts**

```python
# benchmarks/bench_audit.py
"""Benchmark: Story Audit (Pass 5) — cross-story audit with seeded issues.

Also provides compute_audit_metrics() used by bench_chapter_audit.
"""

import json
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from pipeline.story_auditor import audit_story
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_audit_metrics(
    expected_issues: list[dict],
    found_indices: set[int],
    total_fixes: int,
) -> dict:
    """Compute precision/recall of audit results against expected issues."""
    expected_indices = {issue["sentence_index"] for issue in expected_issues}
    true_positives = len(found_indices & expected_indices)
    false_positives = len(found_indices - expected_indices)
    false_negatives = len(expected_indices - found_indices)

    precision = true_positives / max(1, true_positives + false_positives)
    recall = true_positives / max(1, len(expected_indices))

    f1 = 2 * precision * recall / max(0.001, precision + recall)

    return {
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1": round(f1, 3),
        "total_expected": len(expected_indices),
        "total_fixes": total_fixes,
    }


def run_audit_benchmark(bench_config_path: Path | None = None):
    """Run story audit benchmark with poisoned chapter."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    poisoned = ChapterScene(**json.loads((FIXTURES / "poisoned_chapter.json").read_text()))
    expected = json.loads((FIXTURES / "expected_issues.json").read_text())

    # Build sentences dict for audit_story
    sentences_by_chapter: dict[int, list[str]] = {}
    for scene in poisoned.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences_by_chapter.setdefault(1, []).append(sent.source)

    characters = [{"name": fixture_config.protagonist.name, "role": "protagonist"}]
    for sc in fixture_config.secondary_characters:
        characters.append({"name": sc.name, "role": sc.role or "secondary character", "chapters": sc.chapters})

    chapter_configs = [{
        "title": ch.title,
        "cefr_level": ch.cefr_level or fixture_config.story.cefr_level,
        "context": ch.context,
    } for ch in fixture_config.story.chapters]

    models = bench_config["models"].get("story_audit", [])
    if not models:
        print("No story_audit models in bench_config.yaml")
        return

    print(f"=== Benchmark: Story Audit ({len(models)} models, {len(expected['issues'])} seeded issues) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        try:
            ((fixes, unnamed), duration) = run_with_timing(
                lambda: audit_story(
                    chapters=sentences_by_chapter,
                    characters=characters,
                    chapter_configs=chapter_configs,
                    llm=llm,
                )
            )
            found_indices = {f.sentence_index for f in fixes}
            metrics = compute_audit_metrics(expected["issues"], found_indices, total_fixes=len(fixes))
            metrics["unnamed_characters_found"] = len(unnamed)

            result = BenchmarkResult(
                task="audit",
                model=model_name,
                provider=provider,
                temperature=temperature,
                input_fixture="poisoned_chapter.json",
                duration_seconds=round(duration, 2),
                usage={},
                raw_output=json.dumps({
                    "fixes": [f.model_dump() for f in fixes],
                    "unnamed": [u.model_dump() for u in unnamed],
                }),
                parsed_output={
                    "fixes": [f.model_dump() for f in fixes],
                    "unnamed": [u.model_dump() for u in unnamed],
                },
                deterministic_metrics=metrics,
            )
            print(f"    P={metrics['precision']:.2f} R={metrics['recall']:.2f} F1={metrics['f1']:.2f} "
                  f"({metrics['true_positives']}tp/{metrics['false_positives']}fp/{metrics['false_negatives']}fn) "
                  f"{duration:.1f}s")
        except Exception as e:
            result = BenchmarkResult(
                task="audit", model=model_name, provider=provider,
                temperature=temperature, input_fixture="poisoned_chapter.json",
                duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                deterministic_metrics={}, error=str(e),
            )
            print(f"    ERROR: {e}")

        save_result(result, RESULTS)


if __name__ == "__main__":
    run_audit_benchmark()
```

```python
# benchmarks/bench_chapter_audit.py
"""Benchmark: Chapter Audit (Pass 4b) — per-chapter audit with seeded issues."""

import json
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.bench_audit import compute_audit_metrics
from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing
from pipeline.chapter_auditor import audit_chapter
from pipeline.config import DeckConfig
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def run_chapter_audit_benchmark(bench_config_path: Path | None = None):
    """Run chapter audit benchmark with poisoned chapter."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    poisoned = ChapterScene(**json.loads((FIXTURES / "poisoned_chapter.json").read_text()))
    expected = json.loads((FIXTURES / "expected_issues.json").read_text())

    ch_config = {
        "title": fixture_config.story.chapters[0].title,
        "cefr_level": fixture_config.story.chapters[0].cefr_level or fixture_config.story.cefr_level,
        "context": fixture_config.story.chapters[0].context,
    }
    characters = [{"name": fixture_config.protagonist.name, "role": "protagonist"}]
    for sc in fixture_config.secondary_characters:
        if 1 in sc.chapters:
            characters.append({"name": sc.name, "role": sc.role or "secondary character"})

    models = bench_config["models"].get("chapter_audit", [])
    if not models:
        print("No chapter_audit models in bench_config.yaml")
        return

    print(f"=== Benchmark: Chapter Audit ({len(models)} models, {len(expected['issues'])} seeded issues) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        try:
            ((actions), duration) = run_with_timing(
                lambda: audit_chapter(
                    chapter_scene=poisoned,
                    chapter_config=ch_config,
                    characters=characters,
                    llm=llm,
                    gap_words=[],
                )
            )
            found_indices = set()
            for a in actions:
                if a.sentence_index is not None:
                    found_indices.add(a.sentence_index)
                if a.shot_index is not None:
                    # Map shot_index back to sentence indices
                    shot_idx = 0
                    for scene in poisoned.scenes:
                        for shot in scene.shots:
                            if shot_idx == a.shot_index:
                                for sent in shot.sentences:
                                    found_indices.add(sent.sentence_index)
                            shot_idx += 1

            metrics = compute_audit_metrics(expected["issues"], found_indices, total_fixes=len(actions))

            result = BenchmarkResult(
                task="chapter_audit",
                model=model_name,
                provider=provider,
                temperature=temperature,
                input_fixture="poisoned_chapter.json",
                duration_seconds=round(duration, 2),
                usage={},
                raw_output=json.dumps([a.model_dump() for a in actions]),
                parsed_output=[a.model_dump() for a in actions],
                deterministic_metrics=metrics,
            )
            print(f"    P={metrics['precision']:.2f} R={metrics['recall']:.2f} F1={metrics['f1']:.2f} "
                  f"({metrics['true_positives']}tp/{metrics['false_positives']}fp/{metrics['false_negatives']}fn) "
                  f"{duration:.1f}s")
        except Exception as e:
            result = BenchmarkResult(
                task="chapter_audit", model=model_name, provider=provider,
                temperature=temperature, input_fixture="poisoned_chapter.json",
                duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                deterministic_metrics={}, error=str(e),
            )
            print(f"    ERROR: {e}")

        save_result(result, RESULTS)


if __name__ == "__main__":
    run_chapter_audit_benchmark()
```

**Step 3: Run test, then commit**

```bash
git add benchmarks/bench_audit.py benchmarks/bench_chapter_audit.py tests/test_bench_audit.py
git commit -m "feat(benchmarks): add bench_audit + bench_chapter_audit — audit benchmarks with P/R/F1"
```

---

### Task 7: bench_translation.py

**Files:**
- Create: `benchmarks/bench_translation.py`
- Test: `tests/test_bench_translation.py`

**Step 1: Write the test**

```python
# tests/test_bench_translation.py
"""Tests for bench_translation benchmark."""
from benchmarks.bench_translation import compute_deterministic_metrics


def test_compute_translation_metrics():
    source_sentences = ["Maria abre la puerta.", "Ella sonríe."]
    pairs = [
        {"source": "Maria abre la puerta.", "target": "Maria öffnet die Tür."},
        {"source": "Ella sonríe.", "target": "Sie lächelt."},
    ]
    metrics = compute_deterministic_metrics(source_sentences, pairs)
    assert metrics["source_count"] == 2
    assert metrics["translated_count"] == 2
    assert metrics["missing_translations"] == 0
    assert metrics["avg_token_ratio"] > 0


def test_missing_translation():
    source_sentences = ["Hola.", "Adiós."]
    pairs = [{"source": "Hola.", "target": "Hallo."}]
    metrics = compute_deterministic_metrics(source_sentences, pairs)
    assert metrics["missing_translations"] == 1
```

**Step 2: Implement**

```python
# benchmarks/bench_translation.py
"""Benchmark: Translation (Pass 6)."""

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
from pipeline.models import ChapterScene
from pipeline.sentence_translator import SentenceTranslator
from pipeline.story_generator import extract_flat_text
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_deterministic_metrics(source_sentences: list[str], pairs: list[dict]) -> dict:
    """Compute translation quality metrics."""
    translated_sources = {p["source"] for p in pairs}
    missing = [s for s in source_sentences if s not in translated_sources]

    ratios = []
    for p in pairs:
        src_words = len(p["source"].split())
        tgt_words = len(p["target"].split())
        if src_words > 0:
            ratios.append(tgt_words / src_words)

    return {
        "source_count": len(source_sentences),
        "translated_count": len(pairs),
        "missing_translations": len(missing),
        "avg_token_ratio": round(sum(ratios) / max(1, len(ratios)), 2),
    }


def run_translation_benchmark(bench_config_path: Path | None = None):
    """Run translation benchmark."""
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    flat_text = extract_flat_text(raw_chapter)
    source_sentences = flat_text.split("\n")

    models = bench_config["models"].get("translation", [])
    if not models:
        print("No translation models in bench_config.yaml")
        return

    print(f"=== Benchmark: Translation ({len(models)} models, {len(source_sentences)} sentences) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.3)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        with tempfile.TemporaryDirectory() as tmp:
            translator = SentenceTranslator(fixture_config, llm, output_base=Path(tmp))

            try:
                (pairs, duration) = run_with_timing(
                    lambda: translator.translate_chapter(0, flat_text)
                )
                pairs_dicts = [p.model_dump() for p in pairs]
                metrics = compute_deterministic_metrics(source_sentences, pairs_dicts)

                result = BenchmarkResult(
                    task="translation",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="raw_chapter.json",
                    duration_seconds=round(duration, 2),
                    usage={},
                    raw_output=json.dumps(pairs_dicts, ensure_ascii=False),
                    parsed_output=pairs_dicts,
                    deterministic_metrics=metrics,
                )
                print(f"    {metrics['translated_count']}/{metrics['source_count']} translated, "
                      f"ratio {metrics['avg_token_ratio']}, {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task="translation", model=model_name, provider=provider,
                    temperature=temperature, input_fixture="raw_chapter.json",
                    duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                    deterministic_metrics={}, error=str(e),
                )
                print(f"    ERROR: {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_translation_benchmark()
```

**Step 3: Run test, then commit**

```bash
git add benchmarks/bench_translation.py tests/test_bench_translation.py
git commit -m "feat(benchmarks): add bench_translation — translation benchmark"
```

---

### Task 8: bench_word_extraction.py

**Files:**
- Create: `benchmarks/bench_word_extraction.py`
- Test: `tests/test_bench_word_extraction.py`

**Step 1: Write the test**

```python
# tests/test_bench_word_extraction.py
"""Tests for bench_word_extraction benchmark."""
from benchmarks.bench_word_extraction import compute_extraction_metrics


def test_compute_extraction_metrics():
    reference = [
        {"source": "puerta", "lemma": "puerta", "pos": "NOUN"},
        {"source": "café", "lemma": "café", "pos": "NOUN"},
        {"source": "entró", "lemma": "entrar", "pos": "VERB"},
    ]
    extracted = [
        {"source": "puerta", "lemma": "puerta", "pos": "NOUN", "target": "Tür"},
        {"source": "café", "lemma": "café", "pos": "NOUN", "target": "Kaffee"},
        {"source": "grande", "lemma": "grande", "pos": "ADJ", "target": "groß"},
    ]
    metrics = compute_extraction_metrics(reference, extracted)
    assert metrics["reference_count"] == 3
    assert metrics["extracted_count"] == 3
    assert metrics["matched_lemmas"] == 2  # puerta, café (entrar not extracted)
    assert metrics["recall"] > 0
    assert metrics["precision"] > 0
```

**Step 2: Implement**

```python
# benchmarks/bench_word_extraction.py
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
```

**Step 3: Run test, then commit**

```bash
git add benchmarks/bench_word_extraction.py tests/test_bench_word_extraction.py
git commit -m "feat(benchmarks): add bench_word_extraction — word extraction benchmark"
```

---

### Task 9: bench_gap_filler.py

**Files:**
- Create: `benchmarks/bench_gap_filler.py`
- Test: `tests/test_bench_gap_filler.py`

**Step 1: Write the test**

```python
# tests/test_bench_gap_filler.py
"""Tests for bench_gap_filler benchmark."""
from benchmarks.bench_gap_filler import compute_gap_filler_metrics
from pipeline.models import GapShot


def test_compute_gap_filler_metrics():
    target_words = ["restaurante", "cocinar"]
    shots = [
        GapShot(
            sentences=["Maria entra al restaurante.", "Ella quiere cocinar."],
            image_prompt="test",
            covers=["restaurante", "cocinar"],
            insert_after_shot=0,
        ),
    ]
    metrics = compute_gap_filler_metrics(target_words, shots)
    assert metrics["target_words_total"] == 2
    assert metrics["target_words_covered"] == 2
    assert metrics["shot_count"] == 1
    assert metrics["total_sentences"] == 2
```

**Step 2: Implement**

```python
# benchmarks/bench_gap_filler.py
"""Benchmark: Vocabulary Gap Filler (Pass 4)."""

import json
import sys
import tempfile
from pathlib import Path

import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.common import BenchmarkResult, load_bench_config, save_result, run_with_timing
from pipeline.config import DeckConfig
from pipeline.coverage_checker import load_frequency_data
from pipeline.gap_filler import GapFiller
from pipeline.llm import create_client
from pipeline.models import ChapterScene, GapShot
from pipeline.story_generator import extract_flat_text
from scripts.run_all import get_api_key_for_provider

BENCH_DIR = Path(__file__).resolve().parent
FIXTURES = BENCH_DIR / "fixtures"
RESULTS = BENCH_DIR / "results"


def compute_gap_filler_metrics(target_words: list[str], shots: list[GapShot]) -> dict:
    """Compute gap filler quality metrics."""
    covered = set()
    total_sentences = 0
    for shot in shots:
        covered.update(shot.covers)
        total_sentences += len(shot.sentences)

    target_set = set(target_words)
    words_covered = target_set & covered

    return {
        "target_words_total": len(target_set),
        "target_words_covered": len(words_covered),
        "coverage_ratio": round(len(words_covered) / max(1, len(target_set)), 3),
        "shot_count": len(shots),
        "total_sentences": total_sentences,
        "avg_sentences_per_shot": round(total_sentences / max(1, len(shots)), 1),
    }


def run_gap_filler_benchmark(bench_config_path: Path | None = None):
    """Run gap filler benchmark.

    Uses the raw_chapter fixture as existing story context and a small
    set of "missing" words as the gap fill target.
    """
    load_dotenv()

    config_path = bench_config_path or BENCH_DIR / "bench_config.yaml"
    bench_config = load_bench_config(config_path)
    fixture_config = DeckConfig(**yaml.safe_load((FIXTURES / "test_chapter.yaml").read_text()))
    raw_chapter = ChapterScene(**json.loads((FIXTURES / "raw_chapter.json").read_text()))
    flat_text = extract_flat_text(raw_chapter)

    # Simulate missing words — common words not in the fixture
    missing_words = ["restaurante", "cocinar", "plato", "caminar", "dormir",
                     "habitación", "calle", "autobús", "tienda", "dinero"]

    # Build fake frequency data for missing words
    frequency_data = {w: i + 1 for i, w in enumerate(missing_words)}
    stories = {0: flat_text}

    models = bench_config["models"].get("gap_filling", [])
    if not models:
        print("No gap_filling models in bench_config.yaml")
        return

    print(f"=== Benchmark: Gap Filler ({len(models)} models, {len(missing_words)} target words) ===")
    for model_entry in models:
        model_name = model_entry["model"]
        provider = model_entry.get("provider", "openrouter")
        temperature = model_entry.get("temperature", 0.7)
        print(f"\n  Model: {model_name}")

        api_key = get_api_key_for_provider(provider)
        llm = create_client(provider=provider, api_key=api_key, model=model_name, temperature=temperature)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            # Write story context so gap filler can load it
            stories_dir = tmp_path / "stories"
            stories_dir.mkdir(parents=True, exist_ok=True)
            (stories_dir / "chapter_01.json").write_text(
                json.dumps(raw_chapter.model_dump(), ensure_ascii=False, indent=2)
            )

            filler = GapFiller(
                llm=llm,
                output_dir=tmp_path,
                config_chapters=fixture_config.story.chapters,
                target_language=fixture_config.languages.target,
                native_language=fixture_config.languages.native,
                dialect=fixture_config.languages.dialect or "",
                lang_code=fixture_config.languages.target_code,
                chapter_range=range(1),
                protagonist_name=fixture_config.protagonist.name,
                secondary_characters=fixture_config.secondary_characters,
                grammar_targets=fixture_config.story.grammar_targets,
            )

            try:
                (gap_results, duration) = run_with_timing(
                    lambda: filler.fill_gaps(
                        stories=stories,
                        frequency_data=frequency_data,
                        top_n=len(missing_words),
                    )
                )
                all_shots = [shot for shots in gap_results.values() for shot in shots]
                metrics = compute_gap_filler_metrics(missing_words, all_shots)

                result = BenchmarkResult(
                    task="gap_filler",
                    model=model_name,
                    provider=provider,
                    temperature=temperature,
                    input_fixture="raw_chapter.json",
                    duration_seconds=round(duration, 2),
                    usage={},
                    raw_output=json.dumps(
                        {str(k): [s.model_dump() for s in v] for k, v in gap_results.items()},
                        ensure_ascii=False,
                    ),
                    parsed_output={str(k): [s.model_dump() for s in v] for k, v in gap_results.items()},
                    deterministic_metrics=metrics,
                )
                print(f"    {metrics['target_words_covered']}/{metrics['target_words_total']} covered, "
                      f"{metrics['shot_count']} shots, {duration:.1f}s")
            except Exception as e:
                result = BenchmarkResult(
                    task="gap_filler", model=model_name, provider=provider,
                    temperature=temperature, input_fixture="raw_chapter.json",
                    duration_seconds=0, usage={}, raw_output="", parsed_output=None,
                    deterministic_metrics={}, error=str(e),
                )
                print(f"    ERROR: {e}")

            save_result(result, RESULTS)


if __name__ == "__main__":
    run_gap_filler_benchmark()
```

**Step 3: Run test, then commit**

```bash
git add benchmarks/bench_gap_filler.py tests/test_bench_gap_filler.py
git commit -m "feat(benchmarks): add bench_gap_filler — vocabulary gap filler benchmark"
```

---

### Task 10: run_benchmarks.py — Runner Script

**Files:**
- Create: `benchmarks/run_benchmarks.py`

**Step 1: Implement the runner**

```python
# benchmarks/run_benchmarks.py
"""Run all or selected benchmark tasks."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmarks.bench_story_gen import run_story_gen_benchmark
from benchmarks.bench_simplification import run_simplification_benchmark
from benchmarks.bench_grammar import run_grammar_benchmark
from benchmarks.bench_gap_filler import run_gap_filler_benchmark
from benchmarks.bench_chapter_audit import run_chapter_audit_benchmark
from benchmarks.bench_audit import run_audit_benchmark
from benchmarks.bench_translation import run_translation_benchmark
from benchmarks.bench_word_extraction import run_word_extraction_benchmark

ALL_TASKS = {
    "story_gen": run_story_gen_benchmark,
    "simplification": run_simplification_benchmark,
    "grammar": run_grammar_benchmark,
    "gap_filler": run_gap_filler_benchmark,
    "chapter_audit": run_chapter_audit_benchmark,
    "audit": run_audit_benchmark,
    "translation": run_translation_benchmark,
    "word_extraction": run_word_extraction_benchmark,
}


def main():
    parser = argparse.ArgumentParser(description="Run benchmark tasks")
    parser.add_argument(
        "--tasks",
        default=None,
        help=f"Comma-separated task names. Available: {','.join(ALL_TASKS.keys())}. Default: all.",
    )
    parser.add_argument(
        "--config",
        default=None,
        help="Path to bench_config.yaml. Default: benchmarks/bench_config.yaml",
    )
    args = parser.parse_args()

    config_path = Path(args.config) if args.config else None

    if args.tasks:
        task_names = [t.strip() for t in args.tasks.split(",")]
        for name in task_names:
            if name not in ALL_TASKS:
                print(f"Unknown task: {name}. Available: {', '.join(ALL_TASKS.keys())}")
                sys.exit(1)
    else:
        task_names = list(ALL_TASKS.keys())

    print(f"Running {len(task_names)} benchmark(s): {', '.join(task_names)}\n")
    for name in task_names:
        ALL_TASKS[name](config_path)
        print()

    print("All benchmarks complete. Results in benchmarks/results/")


if __name__ == "__main__":
    main()
```

**Step 2: Commit**

```bash
git add benchmarks/run_benchmarks.py
git commit -m "feat(benchmarks): add run_benchmarks.py — run all or selected benchmarks"
```

---

### Task 11: Run All Tests + Final Verification

**Step 1: Run the full test suite**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -v`
Expected: All existing 191 tests PASS + all new benchmark tests PASS

**Step 2: Verify .gitignore**

Run: `ls benchmarks/results/` — should not exist (gitignored)

**Step 3: Update memory**

Update `memory/pipeline-improvements.md` to mark Phase 6 as done and `MEMORY.md` with new key files.

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "feat(benchmarks): Phase 6 complete — benchmark system with 8 tasks"
```
