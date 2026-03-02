# Content Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a three-pass LLM pipeline that generates vocabulary decks from AI-written stories, configurable via YAML for any language pair.

**Architecture:** Config-driven Python package (`pipeline/`) with thin CLI scripts. Three sequential LLM passes per chapter (story generation → sentence translation → word extraction), followed by local-only vocabulary building and coverage reporting. OpenRouter as the LLM gateway.

**Tech Stack:** Python 3.12, Pydantic 2, httpx, PyYAML, uv (package manager), pytest

---

### Task 1: Python Project Scaffolding

**Files:**
- Create: `spanish-content-pipeline/pyproject.toml`
- Create: `spanish-content-pipeline/pipeline/__init__.py`
- Create: `spanish-content-pipeline/.env.example`
- Create: `spanish-content-pipeline/.gitignore`

**Step 1: Create pyproject.toml with uv**

```toml
[project]
name = "lingolock-content-pipeline"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "pydantic>=2.0",
    "pyyaml>=6.0",
    "httpx>=0.27",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

**Step 2: Create package init and env files**

`pipeline/__init__.py`: empty file

`.env.example`:
```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

`.gitignore` (inside spanish-content-pipeline/):
```
.venv/
__pycache__/
*.pyc
.env
output/
data/frequency/
```

**Step 3: Initialize venv and install deps**

Run: `cd spanish-content-pipeline && uv venv && uv pip install -e ".[dev]"`
Expected: virtual env created, all deps installed

**Step 4: Verify pytest runs**

Run: `cd spanish-content-pipeline && uv run pytest --co -q`
Expected: "no tests ran" (no error)

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pyproject.toml spanish-content-pipeline/pipeline/__init__.py spanish-content-pipeline/.env.example spanish-content-pipeline/.gitignore
git commit -m "feat(pipeline): scaffold Python project with uv and dependencies"
```

---

### Task 2: Pydantic Data Models

**Files:**
- Create: `spanish-content-pipeline/pipeline/models.py`
- Create: `spanish-content-pipeline/tests/test_models.py`

**Step 1: Write the failing test**

```python
# tests/test_models.py
from pipeline.models import (
    SentencePair,
    WordAnnotation,
    ChapterWords,
    VocabularyEntry,
    CoverageReport,
)


def test_sentence_pair_creation():
    pair = SentencePair(
        chapter=1,
        sentence_index=0,
        source="Charlotte está en su habitación.",
        target="Charlotte ist in ihrem Zimmer.",
    )
    assert pair.chapter == 1
    assert pair.source == "Charlotte está en su habitación."
    assert pair.target == "Charlotte ist in ihrem Zimmer."


def test_word_annotation_creation():
    word = WordAnnotation(
        source="está",
        target="ist",
        lemma="estar",
        pos="verb",
        context_note="3rd person singular present",
    )
    assert word.lemma == "estar"
    assert word.pos == "verb"


def test_chapter_words_contains_sentence_and_words():
    chapter = ChapterWords(
        chapter=1,
        sentences=[
            SentencePair(
                chapter=1,
                sentence_index=0,
                source="Hola.",
                target="Hallo.",
            )
        ],
        words=[
            WordAnnotation(
                source="Hola",
                target="Hallo",
                lemma="hola",
                pos="interjection",
                context_note="greeting",
            )
        ],
    )
    assert len(chapter.sentences) == 1
    assert len(chapter.words) == 1


def test_vocabulary_entry_multiple_translations():
    entry = VocabularyEntry(
        id="estar",
        source="estar",
        target=["sein", "sich befinden"],
        pos="verb",
        frequency_rank=3,
        cefr_level="A1",
        examples=[],
    )
    assert len(entry.target) == 2
    assert entry.cefr_level == "A1"


def test_vocabulary_entry_optional_fields():
    entry = VocabularyEntry(
        id="obscure_word",
        source="obscure",
        target=["obscure_translation"],
        pos="noun",
        examples=[],
    )
    assert entry.frequency_rank is None
    assert entry.cefr_level is None


def test_coverage_report():
    report = CoverageReport(
        total_vocabulary=150,
        frequency_matched=120,
        top_1000_covered=85,
        top_1000_total=1000,
        coverage_percent=8.5,
        missing_top_100=[],
    )
    assert report.coverage_percent == 8.5
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_models.py -v`
Expected: FAIL with ImportError

**Step 3: Write implementation**

```python
# pipeline/models.py
"""Data models for the content pipeline.

Uses language-neutral field names (source/target instead of spanish/german)
so the pipeline works for any language pair.
"""

from pydantic import BaseModel


class SentencePair(BaseModel):
    chapter: int
    sentence_index: int
    source: str  # Target language sentence (e.g. Spanish)
    target: str  # Native language translation (e.g. German)


class WordAnnotation(BaseModel):
    source: str        # Word as it appears in text
    target: str        # Contextual translation in native language
    lemma: str         # Base/dictionary form
    pos: str           # Part of speech
    context_note: str  # Grammar note (e.g. "3rd person singular present")


class ChapterWords(BaseModel):
    chapter: int
    sentences: list[SentencePair]
    words: list[WordAnnotation]


class VocabularyEntry(BaseModel):
    id: str                         # Lemma (unique key)
    source: str                     # Lemma in target language
    target: list[str]               # All translations seen across contexts
    pos: str
    frequency_rank: int | None = None
    cefr_level: str | None = None
    examples: list[SentencePair]


class CoverageReport(BaseModel):
    total_vocabulary: int
    frequency_matched: int
    top_1000_covered: int
    top_1000_total: int
    coverage_percent: float
    missing_top_100: list[str]  # Most frequent missing words
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_models.py -v`
Expected: 6 passed

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/models.py spanish-content-pipeline/tests/test_models.py
git commit -m "feat(pipeline): add Pydantic data models for vocabulary pipeline"
```

---

### Task 3: Config Loading

**Files:**
- Create: `spanish-content-pipeline/pipeline/config.py`
- Create: `spanish-content-pipeline/configs/spanish_buenos_aires.yaml`
- Create: `spanish-content-pipeline/tests/test_config.py`

**Step 1: Write the failing test**

```python
# tests/test_config.py
import tempfile
from pathlib import Path

import yaml

from pipeline.config import DeckConfig, load_config


SAMPLE_CONFIG = {
    "deck": {
        "name": "Test Deck",
        "id": "test-deck",
    },
    "languages": {
        "target": "Spanish",
        "target_code": "es",
        "native": "German",
        "native_code": "de",
        "dialect": "neutral",
    },
    "protagonist": {
        "name": "Charlotte",
        "gender": "female",
        "origin_country": "Germany",
        "origin_city": "Berlin",
    },
    "destination": {
        "country": "Argentina",
        "city": "Buenos Aires",
        "landmarks": ["Plaza de Mayo", "La Boca"],
    },
    "story": {
        "cefr_level": "A1-A2",
        "sentences_per_chapter": [8, 20],
        "chapters": [
            {
                "title": "Preparation",
                "context": "Packing bags",
                "vocab_focus": ["clothing"],
            },
        ],
    },
    "llm": {
        "provider": "openrouter",
        "model": "google/gemini-2.5-flash-lite",
        "fallback_model": "openai/gpt-4o-mini",
        "temperature": 0.7,
        "max_retries": 3,
    },
}


def test_load_config_from_yaml():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(SAMPLE_CONFIG, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.deck.name == "Test Deck"
    assert config.languages.target_code == "es"
    assert config.protagonist.name == "Charlotte"
    assert config.destination.city == "Buenos Aires"
    assert len(config.destination.landmarks) == 2
    assert len(config.story.chapters) == 1
    assert config.llm.model == "google/gemini-2.5-flash-lite"


def test_config_chapter_count():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(SAMPLE_CONFIG, f)
        f.flush()
        config = load_config(Path(f.name))

    assert config.chapter_count == 1


def test_config_output_dir():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(SAMPLE_CONFIG, f)
        f.flush()
        config = load_config(Path(f.name))

    assert "test-deck" in str(config.output_dir)


def test_config_invalid_file_raises():
    import pytest
    with pytest.raises(FileNotFoundError):
        load_config(Path("/nonexistent/config.yaml"))
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_config.py -v`
Expected: FAIL with ImportError

**Step 3: Write implementation**

```python
# pipeline/config.py
"""Deck configuration loading and validation."""

from pathlib import Path

import yaml
from pydantic import BaseModel


class DeckInfo(BaseModel):
    name: str
    id: str


class Languages(BaseModel):
    target: str       # e.g. "Spanish"
    target_code: str  # e.g. "es"
    native: str       # e.g. "German"
    native_code: str  # e.g. "de"
    dialect: str      # e.g. "neutral"


class Protagonist(BaseModel):
    name: str
    gender: str
    origin_country: str
    origin_city: str


class Destination(BaseModel):
    country: str
    city: str
    landmarks: list[str]


class ChapterDef(BaseModel):
    title: str
    context: str
    vocab_focus: list[str]


class StoryConfig(BaseModel):
    cefr_level: str
    sentences_per_chapter: list[int]  # [min, max]
    chapters: list[ChapterDef]


class LLMConfig(BaseModel):
    provider: str
    model: str
    fallback_model: str
    temperature: float
    max_retries: int


class DeckConfig(BaseModel):
    deck: DeckInfo
    languages: Languages
    protagonist: Protagonist
    destination: Destination
    story: StoryConfig
    llm: LLMConfig

    @property
    def chapter_count(self) -> int:
        return len(self.story.chapters)

    @property
    def output_dir(self) -> Path:
        return Path("output") / self.deck.id


def load_config(path: Path) -> DeckConfig:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path) as f:
        raw = yaml.safe_load(f)
    return DeckConfig(**raw)
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_config.py -v`
Expected: 4 passed

**Step 5: Create the real config file**

Write `configs/spanish_buenos_aires.yaml` with the full chapter list from the design doc (all 11 chapters with dialogues emphasized in context descriptions, real Buenos Aires landmarks, sentences_per_chapter [8, 20]).

**Step 6: Commit**

```bash
git add spanish-content-pipeline/pipeline/config.py spanish-content-pipeline/tests/test_config.py spanish-content-pipeline/configs/
git commit -m "feat(pipeline): add config loading with Pydantic validation"
```

---

### Task 4: OpenRouter LLM Client

**Files:**
- Create: `spanish-content-pipeline/pipeline/llm.py`
- Create: `spanish-content-pipeline/tests/test_llm.py`

**Step 1: Write the failing test**

The LLM client wraps OpenRouter's OpenAI-compatible API. Tests use httpx mock transport to avoid real API calls.

```python
# tests/test_llm.py
import json

import httpx
import pytest

from pipeline.llm import LLMClient, LLMResponse


def make_mock_response(content: str, status: int = 200) -> httpx.Response:
    body = {
        "choices": [{"message": {"content": content}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
    }
    return httpx.Response(status, json=body)


class MockTransport(httpx.BaseTransport):
    def __init__(self, response: httpx.Response):
        self._response = response

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        return self._response


def test_llm_client_returns_text():
    mock = make_mock_response("Hola, soy Charlotte.")
    client = LLMClient(
        api_key="test-key",
        model="test/model",
        transport=MockTransport(mock),
    )
    result = client.complete("Write a greeting")
    assert result.content == "Hola, soy Charlotte."
    assert result.usage.total_tokens == 30


def test_llm_client_returns_json():
    data = [{"spanish": "Hola", "german": "Hallo"}]
    mock = make_mock_response(json.dumps(data))
    client = LLMClient(
        api_key="test-key",
        model="test/model",
        transport=MockTransport(mock),
    )
    result = client.complete_json("Translate", response_schema=None)
    assert result.parsed == data


def test_llm_client_retries_on_500():
    """Client should retry on server errors up to max_retries."""
    call_count = 0

    class RetryTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                return httpx.Response(500, json={"error": "server error"})
            return make_mock_response("Success")

    client = LLMClient(
        api_key="test-key",
        model="test/model",
        max_retries=3,
        transport=RetryTransport(),
    )
    result = client.complete("Test retry")
    assert result.content == "Success"
    assert call_count == 3


def test_llm_client_raises_after_max_retries():
    class AlwaysFailTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, json={"error": "server error"})

    client = LLMClient(
        api_key="test-key",
        model="test/model",
        max_retries=2,
        transport=AlwaysFailTransport(),
    )
    with pytest.raises(httpx.HTTPStatusError):
        client.complete("Will fail")
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_llm.py -v`
Expected: FAIL with ImportError

**Step 3: Write implementation**

```python
# pipeline/llm.py
"""OpenRouter LLM client with retry and JSON mode support."""

import json
import time
from dataclasses import dataclass

import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass
class Usage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


@dataclass
class LLMResponse:
    content: str
    usage: Usage
    parsed: dict | list | None = None


class LLMClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        temperature: float = 0.7,
        max_retries: int = 3,
        transport: httpx.BaseTransport | None = None,
    ):
        self._api_key = api_key
        self._model = model
        self._temperature = temperature
        self._max_retries = max_retries
        client_kwargs = {"timeout": 120.0}
        if transport:
            client_kwargs["transport"] = transport
        self._client = httpx.Client(**client_kwargs)

    def _call(self, messages: list[dict], response_format: dict | None = None) -> LLMResponse:
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": self._temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(OPENROUTER_URL, json=payload, headers=headers)
            if response.status_code < 500:
                response.raise_for_status()
                break
            last_error = response
            if attempt < self._max_retries - 1:
                time.sleep(1 * (attempt + 1))
        else:
            if last_error:
                last_error.raise_for_status()

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        usage_data = data.get("usage", {})
        usage = Usage(
            prompt_tokens=usage_data.get("prompt_tokens", 0),
            completion_tokens=usage_data.get("completion_tokens", 0),
            total_tokens=usage_data.get("total_tokens", 0),
        )
        return LLMResponse(content=content, usage=usage)

    def complete(self, prompt: str, system: str | None = None) -> LLMResponse:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return self._call(messages)

    def complete_json(
        self, prompt: str, system: str | None = None, response_schema: dict | None = None
    ) -> LLMResponse:
        response_format = {"type": "json_object"}
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        result = self._call(messages, response_format=response_format)
        result.parsed = json.loads(result.content)
        return result
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_llm.py -v`
Expected: 4 passed

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/llm.py spanish-content-pipeline/tests/test_llm.py
git commit -m "feat(pipeline): add OpenRouter LLM client with retry support"
```

---

### Task 5: Story Generator (Pass 1)

**Files:**
- Create: `spanish-content-pipeline/pipeline/story_generator.py`
- Create: `spanish-content-pipeline/tests/test_story_generator.py`

**Step 1: Write the failing test**

```python
# tests/test_story_generator.py
import json
from pathlib import Path
from unittest.mock import MagicMock

from pipeline.config import DeckConfig, load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.story_generator import StoryGenerator


def make_mock_config(tmp_path: Path) -> DeckConfig:
    """Create a minimal config for testing."""
    import yaml

    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish",
            "target_code": "es",
            "native": "German",
            "native_code": "de",
            "dialect": "neutral",
        },
        "protagonist": {
            "name": "Charlotte",
            "gender": "female",
            "origin_country": "Germany",
            "origin_city": "Berlin",
        },
        "destination": {
            "country": "Argentina",
            "city": "Buenos Aires",
            "landmarks": ["Plaza de Mayo"],
        },
        "story": {
            "cefr_level": "A1-A2",
            "sentences_per_chapter": [8, 12],
            "chapters": [
                {
                    "title": "Preparation",
                    "context": "Packing bags",
                    "vocab_focus": ["clothing"],
                },
                {
                    "title": "To the Airport",
                    "context": "Taking a taxi",
                    "vocab_focus": ["traffic"],
                },
            ],
        },
        "llm": {
            "provider": "openrouter",
            "model": "test/model",
            "fallback_model": "test/fallback",
            "temperature": 0.7,
            "max_retries": 3,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def test_generate_chapter_calls_llm(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete.return_value = LLMResponse(
        content="Charlotte está en su habitación. Ella tiene una maleta grande.",
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    story_text = gen.generate_chapter(0)

    assert "Charlotte" in story_text
    mock_llm.complete.assert_called_once()


def test_generate_chapter_saves_to_file(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete.return_value = LLMResponse(
        content="Charlotte está nerviosa.",
        usage=Usage(prompt_tokens=100, completion_tokens=20, total_tokens=120),
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    story_file = tmp_path / "test-deck" / "stories" / "chapter_01.txt"
    assert story_file.exists()
    assert "nerviosa" in story_file.read_text()


def test_generate_chapter_skips_if_already_exists(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-create the output file
    story_dir = tmp_path / "test-deck" / "stories"
    story_dir.mkdir(parents=True)
    (story_dir / "chapter_01.txt").write_text("Already generated.")

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    story_text = gen.generate_chapter(0)

    assert story_text == "Already generated."
    mock_llm.complete.assert_not_called()


def test_prompt_includes_config_details(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()
    mock_llm.complete.return_value = LLMResponse(
        content="Story text",
        usage=Usage(prompt_tokens=100, completion_tokens=20, total_tokens=120),
    )

    gen = StoryGenerator(config, mock_llm, output_base=tmp_path)
    gen.generate_chapter(0)

    call_args = mock_llm.complete.call_args
    prompt = call_args.kwargs.get("prompt", call_args.args[0] if call_args.args else "")
    assert "Charlotte" in prompt
    assert "Buenos Aires" in prompt
    assert "A1-A2" in prompt
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py -v`
Expected: FAIL with ImportError

**Step 3: Write implementation**

```python
# pipeline/story_generator.py
"""Pass 1: Generate story chapters using LLM."""

from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.llm import LLMClient


SYSTEM_PROMPT = """You are a language learning story writer. You write short, engaging stories \
for language learners. Your stories use simple vocabulary and grammar appropriate for the \
specified CEFR level. Include dialogue between characters to make the story natural and \
conversational. Use real place names and cultural details from the destination city."""


def _build_chapter_prompt(config: DeckConfig, chapter_index: int) -> str:
    chapter = config.story.chapters[chapter_index]
    p = config.protagonist
    d = config.destination
    min_sentences, max_sentences = config.story.sentences_per_chapter

    pronoun = "She" if p.gender == "female" else "He"
    possessive = "her" if p.gender == "female" else "his"

    landmarks_str = ", ".join(d.landmarks[:5])

    return f"""Write Chapter {chapter_index + 1}: "{chapter.title}"

Language: {config.languages.target} ({config.languages.dialect} dialect)
CEFR Level: {config.story.cefr_level}
Length: {min_sentences}-{max_sentences} sentences

Protagonist: {p.name}, a young person from {p.origin_city}, {p.origin_country}.
{pronoun} is preparing to move to {d.city}, {d.country}.

Chapter context: {chapter.context}
Vocabulary focus areas: {", ".join(chapter.vocab_focus)}

Notable landmarks/places in {d.city}: {landmarks_str}

Requirements:
- Write ONLY in {config.languages.target}
- Use simple grammar: present tense, basic past tense, simple future
- No complex subordinate clauses
- Include at least one dialogue exchange with another character
- Reference real places in {d.city} where appropriate
- Make the reader feel {p.name}'s emotions (excitement, nervousness, curiosity)
- Each sentence should introduce vocabulary from the focus areas
- Output ONLY the story text, no translations or annotations"""


class StoryGenerator:
    def __init__(self, config: DeckConfig, llm: LLMClient, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _story_dir(self) -> Path:
        return self._output_base / self._config.deck.id / "stories"

    def _chapter_path(self, chapter_index: int) -> Path:
        return self._story_dir() / f"chapter_{chapter_index + 1:02d}.txt"

    def generate_chapter(self, chapter_index: int) -> str:
        path = self._chapter_path(chapter_index)

        # Skip if already generated
        if path.exists():
            return path.read_text()

        prompt = _build_chapter_prompt(self._config, chapter_index)
        result = self._llm.complete(prompt, system=SYSTEM_PROMPT)

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(result.content)

        return result.content

    def generate_all(self, chapter_range: range | None = None) -> list[str]:
        if chapter_range is None:
            chapter_range = range(self._config.chapter_count)

        stories = []
        for i in chapter_range:
            story = self.generate_chapter(i)
            stories.append(story)
        return stories
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_story_generator.py -v`
Expected: 4 passed

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/story_generator.py spanish-content-pipeline/tests/test_story_generator.py
git commit -m "feat(pipeline): add story generator (Pass 1) with incremental saving"
```

---

### Task 6: Sentence Translator (Pass 2)

**Files:**
- Create: `spanish-content-pipeline/pipeline/sentence_translator.py`
- Create: `spanish-content-pipeline/tests/test_sentence_translator.py`

**Step 1: Write the failing test**

```python
# tests/test_sentence_translator.py
import json
from pathlib import Path
from unittest.mock import MagicMock

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import SentencePair
from pipeline.sentence_translator import SentenceTranslator


def make_mock_config(tmp_path: Path):
    """Reuse the same helper pattern from test_story_generator."""
    import yaml

    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish",
            "target_code": "es",
            "native": "German",
            "native_code": "de",
            "dialect": "neutral",
        },
        "protagonist": {
            "name": "Charlotte",
            "gender": "female",
            "origin_country": "Germany",
            "origin_city": "Berlin",
        },
        "destination": {
            "country": "Argentina",
            "city": "Buenos Aires",
            "landmarks": ["Plaza de Mayo"],
        },
        "story": {
            "cefr_level": "A1-A2",
            "sentences_per_chapter": [8, 12],
            "chapters": [
                {"title": "Test", "context": "Test context", "vocab_focus": ["test"]},
            ],
        },
        "llm": {
            "provider": "openrouter",
            "model": "test/model",
            "fallback_model": "test/fallback",
            "temperature": 0.7,
            "max_retries": 3,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def test_translate_chapter_returns_sentence_pairs(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "sentences": [
            {"source": "Charlotte está nerviosa.", "target": "Charlotte ist nervös."},
            {"source": "Ella tiene una maleta.", "target": "Sie hat einen Koffer."},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
        parsed=llm_output,
    )

    translator = SentenceTranslator(config, mock_llm, output_base=tmp_path)
    story_text = "Charlotte está nerviosa. Ella tiene una maleta."
    pairs = translator.translate_chapter(0, story_text)

    assert len(pairs) == 2
    assert isinstance(pairs[0], SentencePair)
    assert pairs[0].source == "Charlotte está nerviosa."
    assert pairs[0].target == "Charlotte ist nervös."
    assert pairs[0].chapter == 1  # 1-indexed in the model


def test_translate_chapter_saves_json(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "sentences": [
            {"source": "Hola.", "target": "Hallo."},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=50, completion_tokens=20, total_tokens=70),
        parsed=llm_output,
    )

    translator = SentenceTranslator(config, mock_llm, output_base=tmp_path)
    translator.translate_chapter(0, "Hola.")

    json_path = tmp_path / "test-deck" / "translations" / "chapter_01.json"
    assert json_path.exists()
    saved = json.loads(json_path.read_text())
    assert len(saved) == 1


def test_translate_chapter_skips_if_exists(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    # Pre-create the output file
    trans_dir = tmp_path / "test-deck" / "translations"
    trans_dir.mkdir(parents=True)
    existing = [{"chapter": 1, "sentence_index": 0, "source": "Hola.", "target": "Hallo."}]
    (trans_dir / "chapter_01.json").write_text(json.dumps(existing))

    translator = SentenceTranslator(config, mock_llm, output_base=tmp_path)
    pairs = translator.translate_chapter(0, "Hola.")

    assert len(pairs) == 1
    mock_llm.complete_json.assert_not_called()
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_sentence_translator.py -v`
Expected: FAIL with ImportError

**Step 3: Write implementation**

```python
# pipeline/sentence_translator.py
"""Pass 2: Translate story sentences to the native language."""

import json
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.llm import LLMClient
from pipeline.models import SentencePair


SYSTEM_PROMPT = """You are a professional translator. Translate each sentence naturally — \
not word-for-word. Preserve the meaning and tone. Return valid JSON only."""


def _build_translation_prompt(config: DeckConfig, story_text: str) -> str:
    return f"""Translate each sentence from {config.languages.target} to {config.languages.native}.

Return a JSON object with a "sentences" array. Each element has:
- "source": the original {config.languages.target} sentence (unchanged)
- "target": the natural {config.languages.native} translation

Text to translate:
{story_text}

Return ONLY valid JSON. No markdown fences, no extra text."""


class SentenceTranslator:
    def __init__(self, config: DeckConfig, llm: LLMClient, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _translations_dir(self) -> Path:
        return self._output_base / self._config.deck.id / "translations"

    def _chapter_path(self, chapter_index: int) -> Path:
        return self._translations_dir() / f"chapter_{chapter_index + 1:02d}.json"

    def translate_chapter(self, chapter_index: int, story_text: str) -> list[SentencePair]:
        path = self._chapter_path(chapter_index)

        # Skip if already translated
        if path.exists():
            data = json.loads(path.read_text())
            return [SentencePair(**item) for item in data]

        prompt = _build_translation_prompt(self._config, story_text)
        result = self._llm.complete_json(prompt, system=SYSTEM_PROMPT)

        raw_sentences = result.parsed.get("sentences", [])
        pairs = []
        for i, s in enumerate(raw_sentences):
            pair = SentencePair(
                chapter=chapter_index + 1,
                sentence_index=i,
                source=s["source"],
                target=s["target"],
            )
            pairs.append(pair)

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps([p.model_dump() for p in pairs], ensure_ascii=False, indent=2))

        return pairs
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_sentence_translator.py -v`
Expected: 3 passed

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/sentence_translator.py spanish-content-pipeline/tests/test_sentence_translator.py
git commit -m "feat(pipeline): add sentence translator (Pass 2) with JSON output"
```

---

### Task 7: Word Extractor (Pass 3)

**Files:**
- Create: `spanish-content-pipeline/pipeline/word_extractor.py`
- Create: `spanish-content-pipeline/tests/test_word_extractor.py`

**Step 1: Write the failing test**

```python
# tests/test_word_extractor.py
import json
from pathlib import Path
from unittest.mock import MagicMock

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import SentencePair, WordAnnotation, ChapterWords
from pipeline.word_extractor import WordExtractor


def make_mock_config(tmp_path: Path):
    import yaml

    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish",
            "target_code": "es",
            "native": "German",
            "native_code": "de",
            "dialect": "neutral",
        },
        "protagonist": {
            "name": "Charlotte",
            "gender": "female",
            "origin_country": "Germany",
            "origin_city": "Berlin",
        },
        "destination": {
            "country": "Argentina",
            "city": "Buenos Aires",
            "landmarks": ["Plaza de Mayo"],
        },
        "story": {
            "cefr_level": "A1-A2",
            "sentences_per_chapter": [8, 12],
            "chapters": [
                {"title": "Test", "context": "Test context", "vocab_focus": ["test"]},
            ],
        },
        "llm": {
            "provider": "openrouter",
            "model": "test/model",
            "fallback_model": "test/fallback",
            "temperature": 0.7,
            "max_retries": 3,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def test_extract_words_returns_chapter_words(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "words": [
            {
                "source": "está",
                "target": "ist",
                "lemma": "estar",
                "pos": "verb",
                "context_note": "3rd person singular present",
            },
            {
                "source": "nerviosa",
                "target": "nervös",
                "lemma": "nervioso",
                "pos": "adjective",
                "context_note": "feminine singular",
            },
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=200, completion_tokens=100, total_tokens=300),
        parsed=llm_output,
    )

    pairs = [
        SentencePair(chapter=1, sentence_index=0, source="Charlotte está nerviosa.", target="Charlotte ist nervös."),
    ]

    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    chapter_words = extractor.extract_chapter(0, pairs)

    assert isinstance(chapter_words, ChapterWords)
    assert len(chapter_words.words) == 2
    assert chapter_words.words[0].lemma == "estar"
    assert chapter_words.sentences == pairs


def test_extract_words_saves_json(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "words": [
            {
                "source": "Hola",
                "target": "Hallo",
                "lemma": "hola",
                "pos": "interjection",
                "context_note": "greeting",
            },
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=50, completion_tokens=30, total_tokens=80),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0, source="Hola.", target="Hallo.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    extractor.extract_chapter(0, pairs)

    json_path = tmp_path / "test-deck" / "words" / "chapter_01.json"
    assert json_path.exists()


def test_extract_words_skips_if_exists(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    words_dir = tmp_path / "test-deck" / "words"
    words_dir.mkdir(parents=True)
    existing = {
        "chapter": 1,
        "sentences": [{"chapter": 1, "sentence_index": 0, "source": "Hola.", "target": "Hallo."}],
        "words": [{"source": "Hola", "target": "Hallo", "lemma": "hola", "pos": "interjection", "context_note": "greeting"}],
    }
    (words_dir / "chapter_01.json").write_text(json.dumps(existing))

    pairs = [SentencePair(chapter=1, sentence_index=0, source="Hola.", target="Hallo.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result = extractor.extract_chapter(0, pairs)

    assert len(result.words) == 1
    mock_llm.complete_json.assert_not_called()
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_word_extractor.py -v`
Expected: FAIL with ImportError

**Step 3: Write implementation**

```python
# pipeline/word_extractor.py
"""Pass 3: Extract word-level vocabulary annotations from translated chapters."""

import json
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.llm import LLMClient
from pipeline.models import ChapterWords, SentencePair, WordAnnotation


SYSTEM_PROMPT = """You are a linguistics expert. Analyze text and extract vocabulary with \
precise grammatical annotations. Return valid JSON only."""


def _build_extraction_prompt(config: DeckConfig, pairs: list[SentencePair]) -> str:
    sentence_block = "\n".join(
        f"{i+1}. {p.source}\n   → {p.target}" for i, p in enumerate(pairs)
    )

    return f"""Analyze the following {config.languages.target} sentences with their \
{config.languages.native} translations. Extract every content word (nouns, verbs, \
adjectives, adverbs, important prepositions, conjunctions).

Skip: articles (el, la, los, las, un, una), personal pronouns used as subjects (yo, tú, \
él, ella), and proper nouns (names of people, places).

For each word, provide:
- "source": the word as it appears in the sentence
- "target": the correct {config.languages.native} translation in this context
- "lemma": the base/dictionary form (infinitive for verbs, masculine singular for adjectives)
- "pos": part of speech (noun, verb, adjective, adverb, preposition, conjunction, interjection)
- "context_note": brief grammar note (e.g. "3rd person singular present", "feminine plural")

Sentences:
{sentence_block}

Return a JSON object with a "words" array containing all extracted words.
Return ONLY valid JSON. No markdown fences, no extra text."""


class WordExtractor:
    def __init__(self, config: DeckConfig, llm: LLMClient, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _words_dir(self) -> Path:
        return self._output_base / self._config.deck.id / "words"

    def _chapter_path(self, chapter_index: int) -> Path:
        return self._words_dir() / f"chapter_{chapter_index + 1:02d}.json"

    def extract_chapter(self, chapter_index: int, pairs: list[SentencePair]) -> ChapterWords:
        path = self._chapter_path(chapter_index)

        # Skip if already extracted
        if path.exists():
            data = json.loads(path.read_text())
            return ChapterWords(**data)

        prompt = _build_extraction_prompt(self._config, pairs)
        result = self._llm.complete_json(prompt, system=SYSTEM_PROMPT)

        raw_words = result.parsed.get("words", [])
        words = [WordAnnotation(**w) for w in raw_words]
        chapter_words = ChapterWords(
            chapter=chapter_index + 1,
            sentences=pairs,
            words=words,
        )

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(chapter_words.model_dump(), ensure_ascii=False, indent=2)
        )

        return chapter_words
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_word_extractor.py -v`
Expected: 3 passed

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/word_extractor.py spanish-content-pipeline/tests/test_word_extractor.py
git commit -m "feat(pipeline): add word extractor (Pass 3) with per-word annotations"
```

---

### Task 8: Vocabulary Builder (BUILD step)

**Files:**
- Create: `spanish-content-pipeline/pipeline/vocabulary_builder.py`
- Create: `spanish-content-pipeline/tests/test_vocabulary_builder.py`

**Step 1: Write the failing test**

```python
# tests/test_vocabulary_builder.py
from pipeline.models import ChapterWords, SentencePair, WordAnnotation, VocabularyEntry
from pipeline.vocabulary_builder import build_vocabulary, assign_cefr_level


def test_build_vocabulary_deduplicates_by_lemma():
    ch1 = ChapterWords(
        chapter=1,
        sentences=[SentencePair(chapter=1, sentence_index=0, source="Está bien.", target="Es ist gut.")],
        words=[
            WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="3rd person"),
            WordAnnotation(source="bien", target="gut", lemma="bien", pos="adverb", context_note=""),
        ],
    )
    ch2 = ChapterWords(
        chapter=2,
        sentences=[SentencePair(chapter=2, sentence_index=0, source="Ella está aquí.", target="Sie ist hier.")],
        words=[
            WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="3rd person"),
            WordAnnotation(source="aquí", target="hier", lemma="aquí", pos="adverb", context_note=""),
        ],
    )

    vocab = build_vocabulary([ch1, ch2])

    # "estar" appears in both chapters but should be deduplicated
    lemmas = [v.id for v in vocab]
    assert lemmas.count("estar") == 1
    assert len(vocab) == 3  # estar, bien, aquí


def test_build_vocabulary_merges_examples():
    ch1 = ChapterWords(
        chapter=1,
        sentences=[SentencePair(chapter=1, sentence_index=0, source="Está bien.", target="Es ist gut.")],
        words=[WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="")],
    )
    ch2 = ChapterWords(
        chapter=2,
        sentences=[SentencePair(chapter=2, sentence_index=0, source="Ella está aquí.", target="Sie ist hier.")],
        words=[WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="")],
    )

    vocab = build_vocabulary([ch1, ch2])
    estar = next(v for v in vocab if v.id == "estar")

    # Should have examples from both chapters
    assert len(estar.examples) == 2


def test_build_vocabulary_merges_translations():
    ch1 = ChapterWords(
        chapter=1,
        sentences=[SentencePair(chapter=1, sentence_index=0, source="Está en casa.", target="Er ist zu Hause.")],
        words=[WordAnnotation(source="está", target="ist", lemma="estar", pos="verb", context_note="")],
    )
    ch2 = ChapterWords(
        chapter=2,
        sentences=[SentencePair(chapter=2, sentence_index=0, source="Está cansada.", target="Sie befindet sich müde.")],
        words=[WordAnnotation(source="está", target="befindet sich", lemma="estar", pos="verb", context_note="")],
    )

    vocab = build_vocabulary([ch1, ch2])
    estar = next(v for v in vocab if v.id == "estar")

    assert "ist" in estar.target
    assert "befindet sich" in estar.target


def test_assign_cefr_level():
    assert assign_cefr_level(100) == "A1"
    assert assign_cefr_level(500) == "A1"
    assert assign_cefr_level(501) == "A2"
    assert assign_cefr_level(1500) == "A2"
    assert assign_cefr_level(1501) == "B1"
    assert assign_cefr_level(3000) == "B1"
    assert assign_cefr_level(3001) == "B2"
    assert assign_cefr_level(5000) == "B2"
    assert assign_cefr_level(5001) == "C1"
    assert assign_cefr_level(8000) == "C1"
    assert assign_cefr_level(8001) == "C2"
    assert assign_cefr_level(None) is None
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_vocabulary_builder.py -v`
Expected: FAIL with ImportError

**Step 3: Write implementation**

```python
# pipeline/vocabulary_builder.py
"""BUILD step: Merge word annotations into a deduplicated vocabulary database."""

from pipeline.models import ChapterWords, SentencePair, VocabularyEntry


def assign_cefr_level(frequency_rank: int | None) -> str | None:
    if frequency_rank is None:
        return None
    if frequency_rank <= 500:
        return "A1"
    elif frequency_rank <= 1500:
        return "A2"
    elif frequency_rank <= 3000:
        return "B1"
    elif frequency_rank <= 5000:
        return "B2"
    elif frequency_rank <= 8000:
        return "C1"
    else:
        return "C2"


def build_vocabulary(
    chapters: list[ChapterWords],
    frequency_data: dict[str, int] | None = None,
) -> list[VocabularyEntry]:
    """Merge all chapter word annotations into a deduplicated vocabulary list.

    Args:
        chapters: List of ChapterWords from the word extraction pass.
        frequency_data: Optional dict mapping lemma -> frequency rank.
    """
    if frequency_data is None:
        frequency_data = {}

    # Accumulate per-lemma data
    lemma_translations: dict[str, set[str]] = {}
    lemma_pos: dict[str, str] = {}
    lemma_examples: dict[str, list[SentencePair]] = {}

    for chapter in chapters:
        # Build a set of sentence pairs for this chapter
        sentence_set = {s.sentence_index: s for s in chapter.sentences}

        for word in chapter.words:
            lemma = word.lemma.lower().strip()
            if lemma not in lemma_translations:
                lemma_translations[lemma] = set()
                lemma_pos[lemma] = word.pos
                lemma_examples[lemma] = []

            lemma_translations[lemma].add(word.target)

            # Add all sentences from this chapter as examples for this word
            # (the word appeared in this chapter's text)
            for s in chapter.sentences:
                if s not in lemma_examples[lemma]:
                    lemma_examples[lemma].append(s)

    # Build final vocabulary entries
    entries = []
    for lemma in sorted(lemma_translations.keys()):
        rank = frequency_data.get(lemma)
        entry = VocabularyEntry(
            id=lemma,
            source=lemma,
            target=sorted(lemma_translations[lemma]),
            pos=lemma_pos[lemma],
            frequency_rank=rank,
            cefr_level=assign_cefr_level(rank),
            examples=lemma_examples[lemma],
        )
        entries.append(entry)

    return entries
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_vocabulary_builder.py -v`
Expected: 4 passed

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/vocabulary_builder.py spanish-content-pipeline/tests/test_vocabulary_builder.py
git commit -m "feat(pipeline): add vocabulary builder with deduplication and CEFR assignment"
```

---

### Task 9: Coverage Checker (REPORT step)

**Files:**
- Create: `spanish-content-pipeline/pipeline/coverage_checker.py`
- Create: `spanish-content-pipeline/tests/test_coverage_checker.py`

**Step 1: Write the failing test**

```python
# tests/test_coverage_checker.py
from pathlib import Path

from pipeline.coverage_checker import load_frequency_data, check_coverage
from pipeline.models import VocabularyEntry


def test_load_frequency_data(tmp_path):
    """FrequencyWords format: 'word count' per line, sorted by frequency."""
    freq_file = tmp_path / "es_50k.txt"
    freq_file.write_text("de 12345678\nla 9876543\nestar 5432100\nser 5000000\ntener 4000000\n")

    data = load_frequency_data(freq_file)

    assert data["de"] == 1
    assert data["la"] == 2
    assert data["estar"] == 3
    assert data["ser"] == 4
    assert data["tener"] == 5


def test_check_coverage():
    vocab = [
        VocabularyEntry(id="estar", source="estar", target=["sein"], pos="verb", frequency_rank=3, cefr_level="A1", examples=[]),
        VocabularyEntry(id="ser", source="ser", target=["sein"], pos="verb", frequency_rank=4, cefr_level="A1", examples=[]),
        VocabularyEntry(id="obscure", source="obscure", target=["obscur"], pos="adjective", examples=[]),
    ]
    frequency_data = {"de": 1, "la": 2, "estar": 3, "ser": 4, "tener": 5}

    report = check_coverage(vocab, frequency_data, top_n=5)

    assert report.total_vocabulary == 3
    assert report.frequency_matched == 2  # estar and ser have ranks
    assert report.top_1000_covered == 2   # estar(3) and ser(4) are in top 5
    assert report.top_1000_total == 5
    assert report.coverage_percent == 40.0  # 2/5 = 40%
    assert "de" in report.missing_top_100
    assert "tener" in report.missing_top_100


def test_check_coverage_empty_vocab():
    report = check_coverage([], {"de": 1, "la": 2}, top_n=1000)
    assert report.total_vocabulary == 0
    assert report.coverage_percent == 0.0
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_coverage_checker.py -v`
Expected: FAIL with ImportError

**Step 3: Write implementation**

```python
# pipeline/coverage_checker.py
"""REPORT step: Analyze vocabulary coverage against frequency data."""

from pathlib import Path

from pipeline.models import CoverageReport, VocabularyEntry


def load_frequency_data(path: Path) -> dict[str, int]:
    """Load FrequencyWords format: 'word count' per line, already sorted by frequency.

    Returns dict mapping word -> rank (1 = most frequent).
    """
    data = {}
    rank = 0
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) >= 2:
            rank += 1
            word = parts[0].lower()
            data[word] = rank
    return data


def check_coverage(
    vocab: list[VocabularyEntry],
    frequency_data: dict[str, int],
    top_n: int = 1000,
) -> CoverageReport:
    """Check how many of the top-N frequent words are covered by our vocabulary."""
    our_lemmas = {v.id.lower() for v in vocab}
    top_words = {word for word, rank in frequency_data.items() if rank <= top_n}

    covered = our_lemmas & top_words
    missing = top_words - our_lemmas
    frequency_matched = sum(1 for v in vocab if v.frequency_rank is not None)

    # Sort missing words by frequency rank (most frequent first)
    missing_sorted = sorted(missing, key=lambda w: frequency_data.get(w, 999999))

    coverage_pct = (len(covered) / len(top_words) * 100) if top_words else 0.0

    return CoverageReport(
        total_vocabulary=len(vocab),
        frequency_matched=frequency_matched,
        top_1000_covered=len(covered),
        top_1000_total=len(top_words),
        coverage_percent=round(coverage_pct, 1),
        missing_top_100=missing_sorted[:100],
    )
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_coverage_checker.py -v`
Expected: 3 passed

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/coverage_checker.py spanish-content-pipeline/tests/test_coverage_checker.py
git commit -m "feat(pipeline): add coverage checker with frequency data loading"
```

---

### Task 10: CLI Scripts (generate, translate, extract, build, report, run_all)

**Files:**
- Create: `spanish-content-pipeline/scripts/generate.py`
- Create: `spanish-content-pipeline/scripts/translate.py`
- Create: `spanish-content-pipeline/scripts/extract.py`
- Create: `spanish-content-pipeline/scripts/build.py`
- Create: `spanish-content-pipeline/scripts/report.py`
- Create: `spanish-content-pipeline/scripts/run_all.py`

**Step 1: Write a test for the CLI argument parsing**

```python
# tests/test_cli.py
import subprocess
import sys


def test_run_all_help():
    """Verify the CLI entry point is importable and shows help."""
    result = subprocess.run(
        [sys.executable, "-m", "scripts.run_all", "--help"],
        capture_output=True,
        text=True,
        cwd=".",  # from spanish-content-pipeline/
    )
    assert result.returncode == 0
    assert "--config" in result.stdout
```

**Step 2: Write the CLI scripts**

Each script follows the same pattern: parse args, load config, create LLM client, run the relevant pipeline step. The key script is `run_all.py` which orchestrates all steps:

```python
# scripts/run_all.py
"""Run the full content pipeline end-to-end."""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Add parent dir to path so pipeline package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.coverage_checker import check_coverage, load_frequency_data
from pipeline.llm import LLMClient
from pipeline.sentence_translator import SentenceTranslator
from pipeline.story_generator import StoryGenerator
from pipeline.vocabulary_builder import build_vocabulary
from pipeline.word_extractor import WordExtractor


def parse_chapter_range(spec: str, max_chapters: int) -> range:
    """Parse '1-3' or '1' into a range. Chapters are 1-indexed in the CLI."""
    if "-" in spec:
        start, end = spec.split("-", 1)
        return range(int(start) - 1, int(end))
    else:
        idx = int(spec) - 1
        return range(idx, idx + 1)


def main():
    parser = argparse.ArgumentParser(description="Run the full content pipeline")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--chapters", default=None, help="Chapter range (e.g. '1-3' or '1'). Defaults to all.")
    parser.add_argument("--frequency-file", default=None, help="Path to FrequencyWords file (e.g. data/frequency/es_50k.txt)")
    args = parser.parse_args()

    load_dotenv()
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("Error: OPENROUTER_API_KEY not set in environment or .env file")
        sys.exit(1)

    config = load_config(Path(args.config))
    chapter_range = (
        parse_chapter_range(args.chapters, config.chapter_count)
        if args.chapters
        else range(config.chapter_count)
    )

    llm = LLMClient(
        api_key=api_key,
        model=config.llm.model,
        temperature=config.llm.temperature,
        max_retries=config.llm.max_retries,
    )

    output_base = Path("output")
    print(f"Pipeline: {config.deck.name}")
    print(f"Chapters: {chapter_range.start + 1}-{chapter_range.stop}")
    print(f"Model: {config.llm.model}")
    print()

    # Pass 1: Story Generation
    print("=== Pass 1: Story Generation ===")
    story_gen = StoryGenerator(config, llm, output_base=output_base)
    stories = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        stories[i] = story_gen.generate_chapter(i)
        print("done")

    # Pass 2: Sentence Translation
    print("\n=== Pass 2: Sentence Translation ===")
    translator = SentenceTranslator(config, llm, output_base=output_base)
    all_pairs = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        all_pairs[i] = translator.translate_chapter(i, stories[i])
        print(f"done ({len(all_pairs[i])} sentences)")

    # Pass 3: Word Extraction
    print("\n=== Pass 3: Word Extraction ===")
    extractor = WordExtractor(config, llm, output_base=output_base)
    all_chapters = []
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        chapter_words = extractor.extract_chapter(i, all_pairs[i])
        all_chapters.append(chapter_words)
        print(f"done ({len(chapter_words.words)} words)")

    # BUILD: Vocabulary Database
    print("\n=== Building Vocabulary Database ===")
    frequency_data = {}
    if args.frequency_file:
        freq_path = Path(args.frequency_file)
        if freq_path.exists():
            frequency_data = load_frequency_data(freq_path)
            print(f"  Loaded {len(frequency_data)} frequency entries")

    vocab = build_vocabulary(all_chapters, frequency_data)
    vocab_path = output_base / config.deck.id / "vocabulary.json"
    vocab_path.parent.mkdir(parents=True, exist_ok=True)
    vocab_path.write_text(
        json.dumps([v.model_dump() for v in vocab], ensure_ascii=False, indent=2)
    )
    print(f"  {len(vocab)} unique vocabulary entries saved to {vocab_path}")

    # REPORT: Coverage Analysis
    if frequency_data:
        print("\n=== Coverage Report ===")
        report = check_coverage(vocab, frequency_data, top_n=1000)
        report_path = output_base / config.deck.id / "coverage_report.json"
        report_path.write_text(
            json.dumps(report.model_dump(), ensure_ascii=False, indent=2)
        )
        print(f"  Total vocabulary: {report.total_vocabulary}")
        print(f"  With frequency data: {report.frequency_matched}")
        print(f"  Top 1000 coverage: {report.top_1000_covered}/{report.top_1000_total} ({report.coverage_percent}%)")
        print(f"  Report saved to {report_path}")

    print("\nPipeline complete!")


if __name__ == "__main__":
    main()
```

Individual scripts (`generate.py`, `translate.py`, `extract.py`, `build.py`, `report.py`) follow the same pattern but only run their respective step. They share the same argument parsing.

**Step 3: Run the help test**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_cli.py -v`
Expected: 1 passed

**Step 4: Commit**

```bash
git add spanish-content-pipeline/scripts/ spanish-content-pipeline/tests/test_cli.py
git commit -m "feat(pipeline): add CLI scripts for running pipeline steps"
```

---

### Task 11: Download Frequency Data & Create Full Config

**Files:**
- Download: `spanish-content-pipeline/data/frequency/es_50k.txt`
- Finalize: `spanish-content-pipeline/configs/spanish_buenos_aires.yaml`

**Step 1: Download FrequencyWords Spanish data**

Run:
```bash
cd spanish-content-pipeline
mkdir -p data/frequency
wget -O data/frequency/es_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt
```

**Step 2: Verify the data**

Run: `head -5 data/frequency/es_50k.txt && wc -l data/frequency/es_50k.txt`
Expected: Lines like `de 12345678`, total ~50,000 lines

**Step 3: Write integration test**

```python
# tests/test_integration.py
from pathlib import Path

from pipeline.coverage_checker import load_frequency_data


def test_real_frequency_data_loads():
    """Verify the downloaded FrequencyWords file can be loaded."""
    freq_path = Path(__file__).parent.parent / "data" / "frequency" / "es_50k.txt"
    if not freq_path.exists():
        import pytest
        pytest.skip("Frequency data not downloaded yet")

    data = load_frequency_data(freq_path)
    assert len(data) > 40000  # Should be ~50k entries
    assert "de" in data
    assert "estar" in data
    assert data["de"] < data["estar"]  # "de" is more frequent
```

**Step 4: Run test**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_integration.py -v`
Expected: 1 passed

**Step 5: Commit**

```bash
git add spanish-content-pipeline/data/frequency/.gitkeep spanish-content-pipeline/tests/test_integration.py spanish-content-pipeline/configs/
git commit -m "feat(pipeline): add frequency data download and full deck config"
```

Note: The actual `es_50k.txt` file should be in `.gitignore` (it's ~2MB of downloaded data). Only the `.gitkeep` and config are committed.

---

### Task 12: End-to-End Test Run (3 Chapters)

**Step 1: Set up .env with real API key**

```bash
cd spanish-content-pipeline
cp .env.example .env
# Edit .env and add your real OPENROUTER_API_KEY
```

**Step 2: Run the full pipeline for 3 chapters**

```bash
cd spanish-content-pipeline
uv run python scripts/run_all.py \
  --config configs/spanish_buenos_aires.yaml \
  --chapters 1-3 \
  --frequency-file data/frequency/es_50k.txt
```

Expected output:
```
Pipeline: Spanish with Charlotte - Buenos Aires
Chapters: 1-3
Model: google/gemini-2.5-flash-lite

=== Pass 1: Story Generation ===
  Chapter 1: Preparation... done
  Chapter 2: To the Airport... done
  Chapter 3: At the Airport... done

=== Pass 2: Sentence Translation ===
  Chapter 1: Preparation... done (12 sentences)
  Chapter 2: To the Airport... done (15 sentences)
  Chapter 3: At the Airport... done (14 sentences)

=== Pass 3: Word Extraction ===
  Chapter 1: Preparation... done (35 words)
  Chapter 2: To the Airport... done (42 words)
  Chapter 3: At the Airport... done (38 words)

=== Building Vocabulary Database ===
  Loaded 50000 frequency entries
  ~100-150 unique vocabulary entries saved to output/es-de-buenos-aires/vocabulary.json

=== Coverage Report ===
  Total vocabulary: ~120
  With frequency data: ~100
  Top 1000 coverage: ~60/1000 (6.0%)
  Report saved to output/es-de-buenos-aires/coverage_report.json

Pipeline complete!
```

**Step 3: Validate output files**

Run: `ls -la output/es-de-buenos-aires/`
Expected: stories/, translations/, words/, vocabulary.json, coverage_report.json

Run: `python -c "import json; d=json.load(open('output/es-de-buenos-aires/vocabulary.json')); print(f'{len(d)} entries'); print(d[0])"` to inspect first entry

**Step 4: Commit generated output for reference**

Do NOT commit the output/ directory (it's in .gitignore). But verify everything looks correct.

**Step 5: Run full test suite**

Run: `cd spanish-content-pipeline && uv run pytest -v`
Expected: All tests pass (~20+ tests)

**Step 6: Final commit**

```bash
git commit -m "feat(pipeline): verify end-to-end pipeline with 3-chapter test run"
```
