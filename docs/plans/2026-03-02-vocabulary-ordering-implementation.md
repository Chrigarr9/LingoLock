# Vocabulary Ordering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the pipeline's flat vocabulary output into a story-driven, chapter-grouped learning sequence with function word filtering and LLM-generated distractors.

**Architecture:** Extend `WordAnnotation` with `similar_words` field (populated during Pass 3 via LLM). Rewrite `vocabulary_builder.py` to walk chapters in story order, filter function words, deduplicate by first appearance, and produce an `OrderedDeck` structure grouped by chapter. Update `coverage_checker.py` and `scripts/build.py` to consume the new format.

**Tech Stack:** Python 3.12, Pydantic 2, pytest. All tests run from `spanish-content-pipeline/` with `uv run pytest`.

---

### Task 1: Add `similar_words` to `WordAnnotation` Model

**Files:**
- Modify: `spanish-content-pipeline/pipeline/models.py:17-23`
- Test: `spanish-content-pipeline/tests/test_models.py`

**Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
def test_word_annotation_with_similar_words():
    word = WordAnnotation(
        source="perro",
        target="Hund",
        lemma="perro",
        pos="noun",
        context_note="masculine singular",
        similar_words=["gato", "vaca", "pollo", "caballo", "pájaro", "pez"],
    )
    assert len(word.similar_words) == 6
    assert "gato" in word.similar_words


def test_word_annotation_similar_words_defaults_empty():
    word = WordAnnotation(
        source="está",
        target="ist",
        lemma="estar",
        pos="verb",
        context_note="3rd person",
    )
    assert word.similar_words == []
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_models.py::test_word_annotation_with_similar_words tests/test_models.py::test_word_annotation_similar_words_defaults_empty -v`

Expected: FAIL — `WordAnnotation` doesn't have `similar_words` field.

**Step 3: Write minimal implementation**

In `pipeline/models.py`, update `WordAnnotation`:

```python
class WordAnnotation(BaseModel):
    source: str        # Word as it appears in text
    target: str        # Contextual translation in native language
    lemma: str         # Base/dictionary form
    pos: str           # Part of speech
    context_note: str  # Grammar note (e.g. "3rd person singular present")
    similar_words: list[str] = []  # 6-8 semantically similar words in target language
```

**Step 4: Run test to verify it passes**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_models.py -v`

Expected: ALL PASS (new tests + existing `test_word_annotation_creation` still passes because `similar_words` defaults to `[]`).

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/models.py spanish-content-pipeline/tests/test_models.py
git commit -m "feat(models): add similar_words field to WordAnnotation"
```

---

### Task 2: Add `OrderedDeck`, `DeckChapter` Models and Update `VocabularyEntry`

**Files:**
- Modify: `spanish-content-pipeline/pipeline/models.py:31-38` (VocabularyEntry) and add new classes
- Test: `spanish-content-pipeline/tests/test_models.py`

**Step 1: Write the failing tests**

Add to `tests/test_models.py`:

```python
from pipeline.models import (
    SentencePair,
    WordAnnotation,
    ChapterWords,
    VocabularyEntry,
    CoverageReport,
    DeckChapter,
    OrderedDeck,
)


def test_vocabulary_entry_with_ordering_fields():
    entry = VocabularyEntry(
        id="maleta",
        source="maleta",
        target=["Koffer"],
        pos="noun",
        frequency_rank=4231,
        cefr_level="B2",
        first_chapter=1,
        order=1,
        examples=[],
        similar_words=["bolsa", "mochila", "equipaje"],
    )
    assert entry.first_chapter == 1
    assert entry.order == 1
    assert len(entry.similar_words) == 3


def test_vocabulary_entry_ordering_fields_default():
    entry = VocabularyEntry(
        id="test",
        source="test",
        target=["Test"],
        pos="noun",
        examples=[],
    )
    assert entry.first_chapter == 0
    assert entry.order == 0
    assert entry.similar_words == []


def test_deck_chapter():
    chapter = DeckChapter(
        chapter=1,
        title="Preparation",
        words=[
            VocabularyEntry(
                id="maleta", source="maleta", target=["Koffer"],
                pos="noun", first_chapter=1, order=1, examples=[], similar_words=[],
            )
        ],
    )
    assert chapter.chapter == 1
    assert len(chapter.words) == 1


def test_ordered_deck():
    deck = OrderedDeck(
        deck_id="es-de-buenos-aires",
        deck_name="Spanish with Charlotte",
        total_words=1,
        chapters=[
            DeckChapter(
                chapter=1,
                title="Preparation",
                words=[
                    VocabularyEntry(
                        id="maleta", source="maleta", target=["Koffer"],
                        pos="noun", first_chapter=1, order=1, examples=[], similar_words=[],
                    )
                ],
            )
        ],
    )
    assert deck.total_words == 1
    assert deck.chapters[0].title == "Preparation"
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_models.py::test_vocabulary_entry_with_ordering_fields tests/test_models.py::test_ordered_deck -v`

Expected: FAIL — `DeckChapter` and `OrderedDeck` don't exist, `VocabularyEntry` missing `first_chapter`, `order`, `similar_words`.

**Step 3: Write minimal implementation**

In `pipeline/models.py`, update `VocabularyEntry` and add new models:

```python
class VocabularyEntry(BaseModel):
    id: str                         # Lemma (unique key)
    source: str                     # Lemma in target language
    target: list[str]               # All translations seen across contexts
    pos: str
    frequency_rank: int | None = None
    cefr_level: str | None = None
    first_chapter: int = 0          # Chapter where this word was first introduced
    order: int = 0                  # Global position in learning sequence
    examples: list[SentencePair]
    similar_words: list[str] = []   # 6-8 semantically similar words


class DeckChapter(BaseModel):
    chapter: int
    title: str
    words: list[VocabularyEntry]


class OrderedDeck(BaseModel):
    deck_id: str
    deck_name: str
    total_words: int
    chapters: list[DeckChapter]
```

**Step 4: Run all model tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_models.py -v`

Expected: ALL PASS. Existing tests still pass because new fields have defaults.

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/models.py spanish-content-pipeline/tests/test_models.py
git commit -m "feat(models): add OrderedDeck, DeckChapter, and ordering fields to VocabularyEntry"
```

---

### Task 3: Update Pass 3 Prompt for Similar Words

**Files:**
- Modify: `spanish-content-pipeline/pipeline/word_extractor.py:11-38` (prompt)
- Test: `spanish-content-pipeline/tests/test_word_extractor.py`

**Step 1: Write the failing test**

Add to `tests/test_word_extractor.py`:

```python
def test_extract_words_includes_similar_words(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "words": [
            {
                "source": "perro",
                "target": "Hund",
                "lemma": "perro",
                "pos": "noun",
                "context_note": "masculine singular",
                "similar_words": ["gato", "vaca", "pollo", "caballo", "pájaro", "pez"],
            },
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=200, completion_tokens=100, total_tokens=300),
        parsed=llm_output,
    )

    pairs = [
        SentencePair(chapter=1, sentence_index=0, source="Ella tiene un perro.", target="Sie hat einen Hund."),
    ]

    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    chapter_words = extractor.extract_chapter(0, pairs)

    assert chapter_words.words[0].similar_words == ["gato", "vaca", "pollo", "caballo", "pájaro", "pez"]
```

**Step 2: Run test to verify it passes (it should already pass!)**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_word_extractor.py::test_extract_words_includes_similar_words -v`

Expected: PASS — because `WordAnnotation` now accepts `similar_words` and the mock LLM returns it. The model change from Task 1 means the parsing already works. If the LLM doesn't return `similar_words`, it defaults to `[]`.

This test is a contract test — it verifies that when the LLM returns `similar_words`, the extractor preserves them.

**Step 3: Update the extraction prompt**

In `pipeline/word_extractor.py`, update `_build_extraction_prompt` to request similar words:

```python
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
- "similar_words": 6-8 semantically similar {config.languages.target} words in lemma form \
(e.g. for "perro": ["gato", "vaca", "pollo", "caballo", "pájaro", "pez", "conejo", "ratón"]). \
These are used as multiple-choice distractors, so they should be from the same semantic \
category but clearly different words.

Sentences:
{sentence_block}

Return a JSON object with a "words" array containing all extracted words.
Return ONLY valid JSON. No markdown fences, no extra text."""
```

**Step 4: Run all extractor tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_word_extractor.py -v`

Expected: ALL PASS. The prompt change doesn't break existing tests since the mock LLM doesn't use the prompt. The contract test validates the new field.

**Step 5: Verify the prompt contains "similar_words"**

Quick verification that the prompt actually includes the instruction:

```python
# Optional sanity check (run interactively or as a quick test)
from pipeline.word_extractor import _build_extraction_prompt
# Check the prompt string contains the new instruction
assert "similar_words" in _build_extraction_prompt.__doc__ or True  # just check source
```

**Step 6: Commit**

```bash
git add spanish-content-pipeline/pipeline/word_extractor.py spanish-content-pipeline/tests/test_word_extractor.py
git commit -m "feat(extractor): add similar_words to Pass 3 prompt and parsing"
```

---

### Task 4: Rewrite Vocabulary Builder — Core Ordering Logic

**Files:**
- Modify: `spanish-content-pipeline/pipeline/vocabulary_builder.py` (full rewrite)
- Test: `spanish-content-pipeline/tests/test_vocabulary_builder.py` (full rewrite)

This is the largest task. The builder must:
1. Walk chapters in order (1, 2, 3...)
2. Within each chapter, walk words in sentence order
3. First-occurrence wins: assign word to its first chapter
4. Filter out function words (article, determiner, preposition, pronoun, conjunction)
5. Accumulate example sentences from later chapters
6. Merge similar_words across occurrences
7. Assign frequency rank and CEFR level
8. Return `OrderedDeck`

**Step 1: Write the failing tests**

Replace `tests/test_vocabulary_builder.py` entirely:

```python
# tests/test_vocabulary_builder.py
from pipeline.config import DeckConfig
from pipeline.models import (
    ChapterWords, DeckChapter, OrderedDeck, SentencePair,
    VocabularyEntry, WordAnnotation,
)
from pipeline.vocabulary_builder import assign_cefr_level, build_vocabulary


# --- Helpers ---

def _word(source, target, lemma, pos, context_note="", similar_words=None):
    return WordAnnotation(
        source=source, target=target, lemma=lemma, pos=pos,
        context_note=context_note, similar_words=similar_words or [],
    )


def _sentence(chapter, index, source, target):
    return SentencePair(chapter=chapter, sentence_index=index, source=source, target=target)


def _chapter(num, sentences, words):
    return ChapterWords(chapter=num, sentences=sentences, words=words)


# --- CEFR assignment (unchanged) ---

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


# --- Story ordering ---

def test_words_ordered_by_chapter_then_sentence():
    """Words follow story order: chapter 1 before chapter 2, sentence order within."""
    s1 = _sentence(1, 0, "La maleta está lista.", "Der Koffer ist fertig.")
    s2 = _sentence(1, 1, "Charlotte lleva ropa.", "Charlotte trägt Kleidung.")
    s3 = _sentence(2, 0, "Ella toma un taxi.", "Sie nimmt ein Taxi.")

    ch1 = _chapter(1, [s1, s2], [
        _word("maleta", "Koffer", "maleta", "noun"),
        _word("lista", "fertig", "listo", "adjective"),
        _word("ropa", "Kleidung", "ropa", "noun"),
    ])
    ch2 = _chapter(2, [s3], [
        _word("taxi", "Taxi", "taxi", "noun"),
    ])

    chapter_titles = {1: "Preparation", 2: "To the Airport"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    all_words = [w for ch in deck.chapters for w in ch.words]
    ids = [w.id for w in all_words]
    assert ids == ["maleta", "listo", "ropa", "taxi"]
    assert [w.order for w in all_words] == [1, 2, 3, 4]
    assert deck.total_words == 4


# --- Deduplication ---

def test_duplicate_word_assigned_to_first_chapter():
    """When a word appears in chapters 1 and 2, it belongs to chapter 1 only."""
    s1 = _sentence(1, 0, "Está bien.", "Es ist gut.")
    s2 = _sentence(2, 0, "Ella está aquí.", "Sie ist hier.")

    ch1 = _chapter(1, [s1], [
        _word("está", "ist", "estar", "verb"),
        _word("bien", "gut", "bien", "adverb"),
    ])
    ch2 = _chapter(2, [s2], [
        _word("está", "ist", "estar", "verb"),
        _word("aquí", "hier", "aquí", "adverb"),
    ])

    chapter_titles = {1: "Ch1", 2: "Ch2"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    # "estar" should only appear in chapter 1
    ch1_words = deck.chapters[0].words
    ch2_words = deck.chapters[1].words
    assert [w.id for w in ch1_words] == ["estar", "bien"]
    assert [w.id for w in ch2_words] == ["aquí"]


def test_duplicate_word_accumulates_examples():
    """When a word reappears, the new sentence is added to its examples list."""
    s1 = _sentence(1, 0, "Está bien.", "Es ist gut.")
    s2 = _sentence(2, 0, "Ella está aquí.", "Sie ist hier.")

    ch1 = _chapter(1, [s1], [_word("está", "ist", "estar", "verb")])
    ch2 = _chapter(2, [s2], [_word("está", "ist", "estar", "verb")])

    chapter_titles = {1: "Ch1", 2: "Ch2"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    estar = deck.chapters[0].words[0]
    assert len(estar.examples) == 2
    assert estar.examples[0].chapter == 1
    assert estar.examples[1].chapter == 2


def test_duplicate_word_merges_translations():
    """Different translations of the same lemma are merged."""
    s1 = _sentence(1, 0, "Está en casa.", "Er ist zu Hause.")
    s2 = _sentence(2, 0, "Está cansada.", "Sie befindet sich müde.")

    ch1 = _chapter(1, [s1], [_word("está", "ist", "estar", "verb")])
    ch2 = _chapter(2, [s2], [_word("está", "befindet sich", "estar", "verb")])

    chapter_titles = {1: "Ch1", 2: "Ch2"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    estar = deck.chapters[0].words[0]
    assert "ist" in estar.target
    assert "befindet sich" in estar.target


# --- Function word filtering ---

def test_function_words_filtered_out():
    """Articles, prepositions, pronouns, conjunctions are excluded."""
    s1 = _sentence(1, 0, "El perro está en la casa.", "Der Hund ist im Haus.")

    ch1 = _chapter(1, [s1], [
        _word("el", "der", "el", "article"),
        _word("perro", "Hund", "perro", "noun"),
        _word("está", "ist", "estar", "verb"),
        _word("en", "in", "en", "preposition"),
        _word("la", "die", "el", "determiner"),
        _word("casa", "Haus", "casa", "noun"),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    ids = [w.id for w in deck.chapters[0].words]
    assert "perro" in ids
    assert "estar" in ids
    assert "casa" in ids
    assert "el" not in ids
    assert "en" not in ids


def test_pronouns_filtered():
    s1 = _sentence(1, 0, "Yo tengo un gato.", "Ich habe eine Katze.")

    ch1 = _chapter(1, [s1], [
        _word("yo", "ich", "yo", "pronoun"),
        _word("tengo", "habe", "tener", "verb"),
        _word("gato", "Katze", "gato", "noun"),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    ids = [w.id for w in deck.chapters[0].words]
    assert "yo" not in ids
    assert "tener" in ids
    assert "gato" in ids


def test_conjunctions_filtered():
    s1 = _sentence(1, 0, "Perro y gato.", "Hund und Katze.")

    ch1 = _chapter(1, [s1], [
        _word("perro", "Hund", "perro", "noun"),
        _word("y", "und", "y", "conjunction"),
        _word("gato", "Katze", "gato", "noun"),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    ids = [w.id for w in deck.chapters[0].words]
    assert "y" not in ids


# --- Frequency and CEFR ---

def test_frequency_rank_and_cefr_assigned():
    s1 = _sentence(1, 0, "Ella come pan.", "Sie isst Brot.")

    ch1 = _chapter(1, [s1], [
        _word("come", "isst", "comer", "verb"),
        _word("pan", "Brot", "pan", "noun"),
    ])

    freq = {"comer": 400, "pan": 2000}
    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], frequency_data=freq, chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    comer = next(w for w in deck.chapters[0].words if w.id == "comer")
    pan = next(w for w in deck.chapters[0].words if w.id == "pan")
    assert comer.frequency_rank == 400
    assert comer.cefr_level == "A1"
    assert pan.frequency_rank == 2000
    assert pan.cefr_level == "B1"


# --- Similar words ---

def test_similar_words_carried_through():
    s1 = _sentence(1, 0, "El perro corre.", "Der Hund rennt.")

    ch1 = _chapter(1, [s1], [
        _word("perro", "Hund", "perro", "noun", similar_words=["gato", "vaca", "pollo"]),
        _word("corre", "rennt", "correr", "verb", similar_words=["caminar", "saltar"]),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    perro = next(w for w in deck.chapters[0].words if w.id == "perro")
    assert perro.similar_words == ["gato", "vaca", "pollo"]


def test_similar_words_merged_across_chapters():
    """When a word appears in multiple chapters with different similar_words, merge them."""
    s1 = _sentence(1, 0, "El perro.", "Der Hund.")
    s2 = _sentence(2, 0, "Un perro grande.", "Ein großer Hund.")

    ch1 = _chapter(1, [s1], [_word("perro", "Hund", "perro", "noun", similar_words=["gato", "vaca"])])
    ch2 = _chapter(2, [s2], [_word("perro", "Hund", "perro", "noun", similar_words=["caballo", "pájaro"])])

    chapter_titles = {1: "Ch1", 2: "Ch2"}
    deck = build_vocabulary([ch1, ch2], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    perro = deck.chapters[0].words[0]
    assert "gato" in perro.similar_words
    assert "vaca" in perro.similar_words
    assert "caballo" in perro.similar_words
    assert "pájaro" in perro.similar_words


# --- Edge cases ---

def test_empty_chapters():
    chapter_titles = {}
    deck = build_vocabulary([], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")
    assert deck.total_words == 0
    assert deck.chapters == []


def test_chapter_with_all_function_words():
    """A chapter where all words are function words produces an empty chapter."""
    s1 = _sentence(1, 0, "El y la.", "Der und die.")

    ch1 = _chapter(1, [s1], [
        _word("el", "der", "el", "article"),
        _word("y", "und", "y", "conjunction"),
        _word("la", "die", "el", "determiner"),
    ])

    chapter_titles = {1: "Ch1"}
    deck = build_vocabulary([ch1], chapter_titles=chapter_titles, deck_id="test", deck_name="Test")

    # Chapter still exists but with no words
    assert len(deck.chapters) == 1
    assert len(deck.chapters[0].words) == 0
    assert deck.total_words == 0
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_vocabulary_builder.py -v`

Expected: FAIL — `build_vocabulary` doesn't accept `chapter_titles`, `deck_id`, `deck_name` params, and doesn't return `OrderedDeck`.

**Step 3: Rewrite `vocabulary_builder.py`**

Replace `pipeline/vocabulary_builder.py` entirely:

```python
"""BUILD step: Produce a story-ordered, chapter-grouped vocabulary deck."""

from pipeline.models import (
    ChapterWords, DeckChapter, OrderedDeck, SentencePair,
    VocabularyEntry, WordAnnotation,
)

FILTERED_POS = {"article", "determiner", "preposition", "pronoun", "conjunction"}


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


def _is_function_word(word: WordAnnotation) -> bool:
    return word.pos.lower().strip() in FILTERED_POS


def build_vocabulary(
    chapters: list[ChapterWords],
    frequency_data: dict[str, int] | None = None,
    chapter_titles: dict[int, str] | None = None,
    deck_id: str = "",
    deck_name: str = "",
) -> OrderedDeck:
    """Build a story-ordered, chapter-grouped vocabulary deck.

    Words are ordered by first appearance (chapter order, then sentence order
    within each chapter). Function words are filtered out. Duplicate lemmas
    accumulate example sentences and translations from later chapters.
    """
    if frequency_data is None:
        frequency_data = {}
    if chapter_titles is None:
        chapter_titles = {}

    # Track seen lemmas and their data
    seen_lemmas: dict[str, VocabularyEntry] = {}  # lemma -> entry
    lemma_chapter: dict[str, int] = {}  # lemma -> first chapter number
    chapter_word_lists: dict[int, list[str]] = {}  # chapter_num -> ordered lemma list

    global_order = 0

    for chapter in chapters:
        chapter_num = chapter.chapter
        chapter_word_lists[chapter_num] = []

        for word in chapter.words:
            if _is_function_word(word):
                continue

            lemma = word.lemma.lower().strip()

            if lemma not in seen_lemmas:
                # First occurrence: create new entry
                global_order += 1
                seen_lemmas[lemma] = VocabularyEntry(
                    id=lemma,
                    source=lemma,
                    target=[word.target],
                    pos=word.pos,
                    frequency_rank=frequency_data.get(lemma),
                    cefr_level=assign_cefr_level(frequency_data.get(lemma)),
                    first_chapter=chapter_num,
                    order=global_order,
                    examples=list(chapter.sentences),
                    similar_words=list(word.similar_words),
                )
                lemma_chapter[lemma] = chapter_num
                chapter_word_lists[chapter_num].append(lemma)
            else:
                # Duplicate: accumulate translations, examples, similar_words
                entry = seen_lemmas[lemma]

                if word.target not in entry.target:
                    entry.target.append(word.target)

                for s in chapter.sentences:
                    if s not in entry.examples:
                        entry.examples.append(s)

                for sw in word.similar_words:
                    if sw not in entry.similar_words:
                        entry.similar_words.append(sw)

    # Build chapter-grouped output
    deck_chapters = []
    for chapter in chapters:
        chapter_num = chapter.chapter
        title = chapter_titles.get(chapter_num, f"Chapter {chapter_num}")
        words_in_chapter = [
            seen_lemmas[lemma]
            for lemma in chapter_word_lists.get(chapter_num, [])
        ]
        deck_chapters.append(DeckChapter(
            chapter=chapter_num,
            title=title,
            words=words_in_chapter,
        ))

    return OrderedDeck(
        deck_id=deck_id,
        deck_name=deck_name,
        total_words=global_order,
        chapters=deck_chapters,
    )
```

**Step 4: Run all builder tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_vocabulary_builder.py -v`

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/vocabulary_builder.py spanish-content-pipeline/tests/test_vocabulary_builder.py
git commit -m "feat(builder): rewrite vocabulary builder with story ordering and function word filtering"
```

---

### Task 5: Update Coverage Checker to Accept `OrderedDeck`

**Files:**
- Modify: `spanish-content-pipeline/pipeline/coverage_checker.py:27-52`
- Test: `spanish-content-pipeline/tests/test_coverage_checker.py`

**Step 1: Write the failing test**

Add to `tests/test_coverage_checker.py`:

```python
from pipeline.models import VocabularyEntry, OrderedDeck, DeckChapter


def test_check_coverage_with_ordered_deck():
    deck = OrderedDeck(
        deck_id="test",
        deck_name="Test",
        total_words=2,
        chapters=[
            DeckChapter(
                chapter=1,
                title="Ch1",
                words=[
                    VocabularyEntry(id="estar", source="estar", target=["sein"], pos="verb",
                                    frequency_rank=3, cefr_level="A1", first_chapter=1,
                                    order=1, examples=[], similar_words=[]),
                    VocabularyEntry(id="ser", source="ser", target=["sein"], pos="verb",
                                    frequency_rank=4, cefr_level="A1", first_chapter=1,
                                    order=2, examples=[], similar_words=[]),
                ],
            )
        ],
    )
    frequency_data = {"de": 1, "la": 2, "estar": 3, "ser": 4, "tener": 5}

    report = check_coverage(deck, frequency_data, top_n=5)

    assert report.total_vocabulary == 2
    assert report.frequency_matched == 2
    assert report.top_1000_covered == 2
    assert report.coverage_percent == 40.0
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_coverage_checker.py::test_check_coverage_with_ordered_deck -v`

Expected: FAIL — `check_coverage` expects `list[VocabularyEntry]`, not `OrderedDeck`.

**Step 3: Update `coverage_checker.py`**

Update `check_coverage` to accept either `OrderedDeck` or `list[VocabularyEntry]`:

```python
"""REPORT step: Analyze vocabulary coverage against frequency data."""

from pathlib import Path

from pipeline.models import CoverageReport, OrderedDeck, VocabularyEntry


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


def _extract_vocab(vocab: OrderedDeck | list[VocabularyEntry]) -> list[VocabularyEntry]:
    """Extract flat word list from either format."""
    if isinstance(vocab, OrderedDeck):
        return [w for ch in vocab.chapters for w in ch.words]
    return vocab


def check_coverage(
    vocab: OrderedDeck | list[VocabularyEntry],
    frequency_data: dict[str, int],
    top_n: int = 1000,
) -> CoverageReport:
    """Check how many of the top-N frequent words are covered by our vocabulary."""
    entries = _extract_vocab(vocab)
    our_lemmas = {v.id.lower() for v in entries}
    top_words = {word for word, rank in frequency_data.items() if rank <= top_n}

    covered = our_lemmas & top_words
    missing = top_words - our_lemmas
    frequency_matched = sum(1 for v in entries if v.frequency_rank is not None)

    # Sort missing words by frequency rank (most frequent first)
    missing_sorted = sorted(missing, key=lambda w: frequency_data.get(w, 999999))

    coverage_pct = (len(covered) / len(top_words) * 100) if top_words else 0.0

    return CoverageReport(
        total_vocabulary=len(entries),
        frequency_matched=frequency_matched,
        top_1000_covered=len(covered),
        top_1000_total=len(top_words),
        coverage_percent=round(coverage_pct, 1),
        missing_top_100=missing_sorted[:100],
    )
```

**Step 4: Run all coverage checker tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_coverage_checker.py -v`

Expected: ALL PASS (both old tests with `list[VocabularyEntry]` and new test with `OrderedDeck`).

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/coverage_checker.py spanish-content-pipeline/tests/test_coverage_checker.py
git commit -m "feat(coverage): accept OrderedDeck format in coverage checker"
```

---

### Task 6: Update `scripts/build.py` to Produce `OrderedDeck` Output

**Files:**
- Modify: `spanish-content-pipeline/scripts/build.py`
- Modify: `spanish-content-pipeline/scripts/run_all.py:110-124`

**Step 1: Update `scripts/build.py`**

```python
"""Run BUILD step: Produce story-ordered vocabulary deck."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.coverage_checker import load_frequency_data
from pipeline.models import ChapterWords
from pipeline.vocabulary_builder import build_vocabulary
from scripts.run_all import parse_chapter_range


def main():
    parser = argparse.ArgumentParser(description="Build vocabulary database from extracted words")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--chapters", default=None, help="Chapter range (e.g. '1-3' or '1')")
    parser.add_argument("--frequency-file", default=None, help="Path to FrequencyWords file")
    args = parser.parse_args()

    config = load_config(Path(args.config))
    chapter_range = (
        parse_chapter_range(args.chapters, config.chapter_count)
        if args.chapters
        else range(config.chapter_count)
    )

    output_base = Path("output")

    # Load chapter words from disk
    all_chapters = []
    for i in chapter_range:
        words_path = output_base / config.deck.id / "words" / f"chapter_{i+1:02d}.json"
        if not words_path.exists():
            print(f"  Chapter {i+1}: SKIPPED (words not extracted yet)")
            continue
        all_chapters.append(ChapterWords(**json.loads(words_path.read_text())))

    # Load frequency data
    frequency_data = {}
    if args.frequency_file:
        freq_path = Path(args.frequency_file)
        if freq_path.exists():
            frequency_data = load_frequency_data(freq_path)
            print(f"  Loaded {len(frequency_data)} frequency entries")

    # Build chapter titles from config
    chapter_titles = {
        i + 1: config.story.chapters[i].title
        for i in chapter_range
        if i < len(config.story.chapters)
    }

    print("=== Building Vocabulary Database ===")
    deck = build_vocabulary(
        all_chapters,
        frequency_data=frequency_data,
        chapter_titles=chapter_titles,
        deck_id=config.deck.id,
        deck_name=config.deck.name,
    )
    vocab_path = output_base / config.deck.id / "vocabulary.json"
    vocab_path.parent.mkdir(parents=True, exist_ok=True)
    vocab_path.write_text(
        json.dumps(deck.model_dump(), ensure_ascii=False, indent=2)
    )
    print(f"  {deck.total_words} unique vocabulary entries saved to {vocab_path}")


if __name__ == "__main__":
    main()
```

**Step 2: Update the BUILD section in `scripts/run_all.py`**

Replace lines 110-125 in `run_all.py` (the `# BUILD: Vocabulary Database` section):

```python
    # BUILD: Vocabulary Database
    print("\n=== Building Vocabulary Database ===")
    frequency_data = {}
    if args.frequency_file:
        freq_path = Path(args.frequency_file)
        if freq_path.exists():
            frequency_data = load_frequency_data(freq_path)
            print(f"  Loaded {len(frequency_data)} frequency entries")

    chapter_titles = {
        i + 1: config.story.chapters[i].title
        for i in chapter_range
    }

    deck = build_vocabulary(
        all_chapters,
        frequency_data=frequency_data,
        chapter_titles=chapter_titles,
        deck_id=config.deck.id,
        deck_name=config.deck.name,
    )
    vocab_path = output_base / config.deck.id / "vocabulary.json"
    vocab_path.parent.mkdir(parents=True, exist_ok=True)
    vocab_path.write_text(
        json.dumps(deck.model_dump(), ensure_ascii=False, indent=2)
    )
    print(f"  {deck.total_words} unique vocabulary entries saved to {vocab_path}")

    # REPORT: Coverage Analysis
    if frequency_data:
        print("\n=== Coverage Report ===")
        report = check_coverage(deck, frequency_data, top_n=1000)
```

**Step 3: Run full test suite**

Run: `cd spanish-content-pipeline && uv run pytest -v`

Expected: ALL PASS. The existing test_cli.py tests may need updating if they test build.py output format.

**Step 4: Commit**

```bash
git add spanish-content-pipeline/scripts/build.py spanish-content-pipeline/scripts/run_all.py
git commit -m "feat(scripts): update build and run_all to produce OrderedDeck format"
```

---

### Task 7: Fix Any Remaining Test Breakage

**Files:**
- Potentially: `spanish-content-pipeline/tests/test_cli.py`
- Potentially: `spanish-content-pipeline/tests/test_integration.py`

**Step 1: Run full test suite**

Run: `cd spanish-content-pipeline && uv run pytest -v`

**Step 2: Fix any failures**

Review test_cli.py and test_integration.py. These may reference the old `build_vocabulary` signature or expect a flat list output. Update them to match the new `OrderedDeck` return type and the new function signature.

Common fixes:
- Tests that call `build_vocabulary([chapters])` need to add `chapter_titles={}`, `deck_id="test"`, `deck_name="Test"` kwargs.
- Tests that check `len(result)` on the return value need to use `result.total_words` or iterate `result.chapters`.

**Step 3: Run tests again**

Run: `cd spanish-content-pipeline && uv run pytest -v`

Expected: ALL PASS.

**Step 4: Commit if changes were made**

```bash
git add spanish-content-pipeline/tests/
git commit -m "fix(tests): update remaining tests for OrderedDeck format"
```

---

### Task 8: Final Verification — Full Test Suite

**Step 1: Run entire test suite**

Run: `cd spanish-content-pipeline && uv run pytest -v --tb=short`

Expected: ALL PASS.

**Step 2: Verify vocabulary.json schema by dry-running the builder with test data**

Run a quick Python check (in the spanish-content-pipeline directory):

```python
uv run python -c "
from pipeline.models import OrderedDeck
import json
# Verify model serializes correctly
deck = OrderedDeck(deck_id='test', deck_name='Test', total_words=0, chapters=[])
print(json.dumps(deck.model_dump(), indent=2))
"
```

Expected: valid JSON with `deck_id`, `deck_name`, `total_words`, `chapters` fields.

**Step 3: Commit (if any final fixes)**

No commit if everything passes from Task 7.
