# Deterministic Lemmatization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace LLM-based word extraction and hand-maintained Spanish verb/function-word tables with spaCy for all analysis tasks, keeping LLM only for generation.

**Architecture:** New `pipeline/lemmatizer.py` wraps spaCy. Coverage checker and word extractor are rewritten to use it. Frequency lemmatizer becomes an appropriateness-only filter. All language-specific constants (`SPANISH_VERB_FORMS`, `SPANISH_FUNCTION_WORDS`) are deleted.

**Tech Stack:** spaCy (`es_core_news_sm` model), existing Pydantic models, existing LLM client.

---

### Task 1: Create `pipeline/lemmatizer.py` with tests

**Files:**
- Create: `pipeline/lemmatizer.py`
- Create: `tests/test_lemmatizer.py`

**Step 1: Write the failing tests**

```python
# tests/test_lemmatizer.py
import pytest
from pipeline.lemmatizer import lemmatize_text, lemmatize_word, is_function_word, TokenInfo


def test_lemmatize_word_verb():
    assert lemmatize_word("mira", "es") == "mirar"


def test_lemmatize_word_noun_unchanged():
    assert lemmatize_word("casa", "es") == "casa"


def test_lemmatize_word_irregular_verb():
    assert lemmatize_word("es", "es") == "ser"


def test_lemmatize_text_returns_tokens():
    tokens = lemmatize_text("Maria mira las luces.", "es")
    assert len(tokens) > 0
    assert all(isinstance(t, TokenInfo) for t in tokens)


def test_lemmatize_text_correct_lemmas():
    tokens = lemmatize_text("Maria mira las luces.", "es")
    lemmas = {t.lemma for t in tokens}
    assert "mirar" in lemmas
    assert "luz" in lemmas


def test_lemmatize_text_includes_pos():
    tokens = lemmatize_text("Maria camina.", "es")
    verb = next(t for t in tokens if t.lemma == "caminar")
    assert verb.pos == "VERB"


def test_lemmatize_text_filters_punctuation():
    tokens = lemmatize_text("¡Hola!", "es")
    assert all(t.pos != "PUNCT" for t in tokens)


def test_is_function_word_det():
    """Articles are function words."""
    tokens = lemmatize_text("la casa", "es")
    la = next(t for t in tokens if t.text == "la")
    assert is_function_word(la) is True


def test_is_function_word_personal_pronoun():
    """Personal pronouns (yo, me, se) are function words."""
    tokens = lemmatize_text("Yo quiero.", "es")
    yo = next(t for t in tokens if t.text.lower() == "yo")
    assert is_function_word(yo) is True


def test_is_function_word_indefinite_pronoun_is_content():
    """Indefinite pronouns (algo, nada) are content words."""
    tokens = lemmatize_text("Algo está aquí.", "es")
    algo = next(t for t in tokens if t.lemma == "algo")
    assert is_function_word(algo) is False


def test_is_function_word_content_word():
    """Nouns, verbs, adjectives are content words."""
    tokens = lemmatize_text("Maria camina.", "es")
    camina = next(t for t in tokens if t.lemma == "caminar")
    assert is_function_word(camina) is False
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_lemmatizer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.lemmatizer'`

**Step 3: Write minimal implementation**

```python
# pipeline/lemmatizer.py
"""Deterministic lemmatization via spaCy.

Provides language-independent tokenization, lemmatization, and POS tagging.
Replaces hand-maintained verb form tables and function word lists.
"""

from dataclasses import dataclass

import spacy
from spacy.language import Language


# POS tags that are always function words (language-independent)
_FUNCTION_POS: frozenset[str] = frozenset({
    "DET",    # articles, demonstratives, possessive determiners
    "ADP",    # prepositions
    "CCONJ",  # coordinating conjunctions
    "SCONJ",  # subordinating conjunctions
    "PROPN",  # proper nouns (names, places)
    "PUNCT",  # punctuation
    "SPACE",  # whitespace
    "X",      # other/unknown
    "SYM",    # symbols
    "PART",   # particles
})


@dataclass(frozen=True)
class TokenInfo:
    """A single token with its spaCy analysis."""
    text: str            # Surface form as it appears in text
    lemma: str           # Dictionary/base form
    pos: str             # Universal POS tag
    morph: str           # Morphological features string
    sentence_index: int  # Which sentence this token belongs to (0-based)


# Cache loaded spaCy models by language code
_models: dict[str, Language] = {}


def _get_model(lang: str) -> Language:
    """Load and cache a spaCy model for the given language code."""
    if lang not in _models:
        model_name = f"{lang}_core_news_sm"
        _models[lang] = spacy.load(model_name)
    return _models[lang]


def lemmatize_text(text: str, lang: str) -> list[TokenInfo]:
    """Tokenize and lemmatize full text with sentence context.

    Returns a TokenInfo for every non-punctuation, non-space token.
    Sentence boundaries are detected by spaCy's sentence splitter.
    """
    nlp = _get_model(lang)
    doc = nlp(text)
    tokens: list[TokenInfo] = []

    for sent_idx, sent in enumerate(doc.sents):
        for token in sent:
            if token.pos_ in ("PUNCT", "SPACE", "X", "SYM"):
                continue
            tokens.append(TokenInfo(
                text=token.text,
                lemma=token.lemma_.lower(),
                pos=token.pos_,
                morph=str(token.morph),
                sentence_index=sent_idx,
            ))
    return tokens


def lemmatize_word(word: str, lang: str) -> str:
    """Lemmatize a single word without sentence context.

    Used for frequency file words. Less accurate than lemmatize_text
    for ambiguous forms, but sufficient for lemma resolution.
    """
    nlp = _get_model(lang)
    doc = nlp(word)
    return doc[0].lemma_.lower() if doc else word.lower()


def is_function_word(token: TokenInfo) -> bool:
    """Determine if a token is a function word based on POS and morphology.

    Uses universal POS tags and morphological features, so this works
    across all languages supported by spaCy.
    """
    if token.pos in _FUNCTION_POS:
        return True

    # Personal pronouns are function words (yo, me, se, le, nos, etc.)
    # Indefinite/negative/totality pronouns are content words (algo, nada, todo)
    if token.pos == "PRON":
        return "PronType=Prs" in token.morph

    # Negation particles tagged as ADV (e.g. "no")
    if token.pos == "ADV" and "Polarity=Neg" in token.morph:
        return True

    return False
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_lemmatizer.py -v`
Expected: All 13 tests PASS

**Step 5: Commit**

```
git add pipeline/lemmatizer.py tests/test_lemmatizer.py
git commit -m "feat(lemmatizer): add spaCy-based deterministic lemmatization"
```

---

### Task 2: Rewrite `coverage_checker.py` to use spaCy

**Files:**
- Modify: `pipeline/coverage_checker.py` (full rewrite — delete lines 7-252, rewrite functions)
- Modify: `tests/test_coverage_checker.py`
- Modify: `tests/test_story_coverage_scanner.py`

**Step 1: Rewrite test files**

Replace `tests/test_coverage_checker.py`:

```python
# tests/test_coverage_checker.py
from pipeline.coverage_checker import load_frequency_data, check_coverage
from pipeline.models import VocabularyEntry, OrderedDeck, DeckChapter


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


def test_check_coverage_basic():
    """Vocabulary entries are matched against frequency words via spaCy lemmatization."""
    vocab = [
        VocabularyEntry(id="estar", source="estar", target=["sein"], pos="verb",
                        frequency_rank=3, cefr_level="A1", examples=[]),
        VocabularyEntry(id="ser", source="ser", target=["sein"], pos="verb",
                        frequency_rank=4, cefr_level="A1", examples=[]),
    ]
    frequency_data = {"de": 1, "la": 2, "estar": 3, "ser": 4, "tener": 5}
    report = check_coverage(vocab, frequency_data, top_n=5, lang="es")

    assert report.total_vocabulary == 2
    assert report.top_1000_covered >= 2  # estar and ser; de/la filtered as function words
    assert "tener" in report.missing_words


def test_check_coverage_resolves_inflections():
    """Frequency words that are inflected forms of vocabulary lemmas are covered."""
    vocab = [
        VocabularyEntry(id="ir", source="ir", target=["gehen"], pos="verb",
                        frequency_rank=10, cefr_level="A1", examples=[]),
    ]
    # "va" lemmatizes to "ir" via spaCy
    frequency_data = {"va": 1, "ir": 2}
    report = check_coverage(vocab, frequency_data, top_n=10, lang="es")

    # Both "va" and "ir" should resolve to "ir" and be covered
    assert report.top_1000_covered >= 2


def test_check_coverage_filters_inappropriate():
    """Words marked inappropriate are excluded from missing list."""
    vocab = []
    frequency_data = {"restaurante": 1, "disparar": 2}
    inappropriate = {"disparar"}
    report = check_coverage(vocab, frequency_data, top_n=10, lang="es",
                            inappropriate_lemmas=inappropriate)

    assert "disparar" not in report.missing_words
    assert "restaurante" in report.missing_words


def test_check_coverage_deduplicates_missing_at_lemma_level():
    """Multiple inflected forms of the same missing lemma produce one entry."""
    vocab = []
    # "mira" and "mirar" both lemmatize to "mirar"
    frequency_data = {"mira": 1, "mirar": 2, "restaurante": 3}
    report = check_coverage(vocab, frequency_data, top_n=10, lang="es")

    # Should have "mirar" once, not "mira" + "mirar"
    mirar_count = sum(1 for w in report.missing_words if w == "mirar")
    assert mirar_count == 1


def test_check_coverage_with_ordered_deck():
    deck = OrderedDeck(
        deck_id="test", deck_name="Test", total_words=1,
        chapters=[DeckChapter(chapter=1, title="Ch1", words=[
            VocabularyEntry(id="caminar", source="caminar", target=["gehen"], pos="verb",
                            frequency_rank=100, cefr_level="A1", first_chapter=1,
                            order=1, examples=[], similar_words=[]),
        ])],
    )
    frequency_data = {"camina": 1, "caminar": 2}
    report = check_coverage(deck, frequency_data, top_n=10, lang="es")
    # Both resolve to "caminar" which is in vocab
    assert report.top_1000_covered >= 2


def test_check_coverage_extra_thresholds():
    vocab = [
        VocabularyEntry(id="casa", source="casa", target=["Haus"], pos="noun",
                        frequency_rank=50, cefr_level="A1", examples=[]),
    ]
    frequency_data = {"casa": 50, "perro": 100, "gato": 1500}
    report = check_coverage(vocab, frequency_data, top_n=1000, lang="es",
                            extra_thresholds=[2000])
    assert "top_2000" in report.thresholds
```

Replace `tests/test_story_coverage_scanner.py`:

```python
# tests/test_story_coverage_scanner.py
from pipeline.coverage_checker import scan_story_coverage


def test_scan_finds_covered_and_missing():
    """Words in story text are covered; words not in text are missing."""
    stories = {0: "Maria camina por la calle."}
    frequency_data = {"caminar": 50, "calle": 100, "casa": 150}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200)
    assert "casa" in result.missing_words
    # "camina" lemmatizes to "caminar" via spaCy
    assert "caminar" not in result.missing_words


def test_scan_respects_top_n():
    """Only words within top_n are considered."""
    stories = {0: "Hola mundo."}
    frequency_data = {"hola": 50, "mundo": 100, "casa": 500}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200)
    assert "casa" not in result.missing_words  # rank 500 > top_n 200


def test_scan_filters_inappropriate():
    """Words in inappropriate set are excluded from missing."""
    stories = {0: "Hola."}
    frequency_data = {"mierda": 50}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200,
                                 inappropriate_lemmas={"mierda"})
    assert "mierda" not in result.missing_words


def test_scan_resolves_verb_forms():
    """Inflected verb forms are resolved via spaCy."""
    stories = {0: "Ella tiene un gato."}
    frequency_data = {"tener": 30, "gato": 100}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200)
    assert "tener" not in result.missing_words  # "tiene" → "tener" via spaCy
    assert "gato" not in result.missing_words


def test_scan_resolves_regular_verbs():
    """Regular -ar verbs like mira→mirar are resolved (unlike old SPANISH_VERB_FORMS)."""
    stories = {0: "Maria mira las luces."}
    frequency_data = {"mira": 50, "mirar": 100}
    result = scan_story_coverage(stories, frequency_data, lang="es", top_n=200)
    # Both should resolve to "mirar" which is in the text
    assert "mirar" not in result.missing_words
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_coverage_checker.py tests/test_story_coverage_scanner.py -v`
Expected: FAIL — old function signatures don't match

**Step 3: Rewrite `coverage_checker.py`**

```python
# pipeline/coverage_checker.py
"""Coverage analysis: compare vocabulary against frequency data using spaCy lemmatization."""

from pathlib import Path

from pipeline.lemmatizer import TokenInfo, is_function_word, lemmatize_text, lemmatize_word
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


def _lemmatize_frequency_words(
    frequency_data: dict[str, int],
    lang: str,
    top_n: int,
) -> dict[str, str]:
    """Lemmatize frequency file words via spaCy. Returns word → lemma map.

    Only processes words up to rank top_n. Function words (by POS)
    are mapped to themselves — they'll be filtered later via is_function_word.
    """
    result: dict[str, str] = {}
    for word, rank in frequency_data.items():
        if rank <= top_n:
            result[word] = lemmatize_word(word, lang)
    return result


def _is_freq_function_word(word: str, lang: str) -> bool:
    """Check if a frequency-file word is a function word using spaCy."""
    tokens = lemmatize_text(word, lang)
    if not tokens:
        return False
    return is_function_word(tokens[0])


def _extract_vocab(vocab: OrderedDeck | list[VocabularyEntry]) -> list[VocabularyEntry]:
    """Extract flat word list from either format."""
    if isinstance(vocab, OrderedDeck):
        return [w for ch in vocab.chapters for w in ch.words]
    return vocab


def check_coverage(
    vocab: OrderedDeck | list[VocabularyEntry],
    frequency_data: dict[str, int],
    top_n: int = 1000,
    lang: str = "es",
    extra_thresholds: list[int] | None = None,
    inappropriate_lemmas: set[str] | None = None,
) -> CoverageReport:
    """Check how many top-N content words are covered by our vocabulary.

    Uses spaCy to lemmatize frequency words and compare against vocabulary lemmas.
    Function words are identified by POS tag (language-independent).
    """
    if inappropriate_lemmas is None:
        inappropriate_lemmas = set()

    entries = _extract_vocab(vocab)
    our_lemmas = {v.id.lower() for v in entries}

    # Lemmatize frequency words
    max_n = max([top_n] + list(extra_thresholds or []))
    freq_lemma_map = _lemmatize_frequency_words(frequency_data, lang, max_n)

    # Filter function words from frequency data
    content_freq: dict[str, int] = {}
    for word, rank in frequency_data.items():
        if rank <= max_n and not _is_freq_function_word(word, lang):
            content_freq[word] = rank

    def is_covered(word: str) -> bool:
        lemma = freq_lemma_map.get(word, word)
        return word in our_lemmas or lemma in our_lemmas

    # Top-N coverage
    top_words = {w for w, rank in content_freq.items() if rank <= top_n}
    covered = {w for w in top_words if is_covered(w)}
    frequency_matched = sum(1 for v in entries if v.frequency_rank is not None)

    # Missing lemmas (deduplicated)
    missing_lemmas: set[str] = set()
    for w in top_words:
        if is_covered(w):
            continue
        lemma = freq_lemma_map.get(w, w)
        if lemma in our_lemmas or lemma in inappropriate_lemmas or w in inappropriate_lemmas:
            continue
        missing_lemmas.add(lemma)

    missing_sorted = sorted(missing_lemmas, key=lambda w: content_freq.get(w, 999999))
    coverage_pct = (len(covered) / len(top_words) * 100) if top_words else 0.0

    # Extra thresholds
    thresholds: dict[str, dict[str, float]] = {}
    for n in (extra_thresholds or []):
        top_n_words = {w for w, rank in content_freq.items() if rank <= n}
        n_covered = {w for w in top_n_words if is_covered(w)}
        pct = (len(n_covered) / len(top_n_words) * 100) if top_n_words else 0.0
        thresholds[f"top_{n}"] = {
            "covered": len(n_covered),
            "total": len(top_n_words),
            "percent": round(pct, 1),
        }

    outside_top = sum(
        1 for v in entries
        if v.frequency_rank is None or v.frequency_rank > max_n
    )

    return CoverageReport(
        total_vocabulary=len(entries),
        frequency_matched=frequency_matched,
        top_1000_covered=len(covered),
        top_1000_total=len(top_words),
        coverage_percent=round(coverage_pct, 1),
        missing_words=missing_sorted,
        thresholds=thresholds,
        outside_top_n=outside_top,
        outside_top_n_label=f"top_{max_n}",
    )


def scan_story_coverage(
    stories: dict[int, str],
    frequency_data: dict[str, int],
    lang: str = "es",
    top_n: int = 1000,
    inappropriate_lemmas: set[str] | None = None,
) -> CoverageReport:
    """Coverage check from raw story text using spaCy lemmatization.

    Tokenizes story text with full sentence context for accurate lemmatization.
    Used during the text stage before vocabulary extraction exists.
    """
    if inappropriate_lemmas is None:
        inappropriate_lemmas = set()

    # Lemmatize all story text with spaCy (full sentence context)
    story_lemmas: set[str] = set()
    for text in stories.values():
        for token in lemmatize_text(text, lang):
            story_lemmas.add(token.lemma)

    # Lemmatize frequency words
    freq_lemma_map = _lemmatize_frequency_words(frequency_data, lang, top_n)

    # Filter function words
    content_freq: dict[str, int] = {}
    for word, rank in frequency_data.items():
        if rank <= top_n and not _is_freq_function_word(word, lang):
            content_freq[word] = rank

    top_words = {w for w, rank in content_freq.items() if rank <= top_n}

    def is_covered(word: str) -> bool:
        lemma = freq_lemma_map.get(word, word)
        return word in story_lemmas or lemma in story_lemmas

    covered = {w for w in top_words if is_covered(w)}

    # Missing lemmas (deduplicated)
    missing_lemmas: set[str] = set()
    for w in top_words:
        if is_covered(w):
            continue
        lemma = freq_lemma_map.get(w, w)
        if lemma in story_lemmas or lemma in inappropriate_lemmas or w in inappropriate_lemmas:
            continue
        missing_lemmas.add(lemma)

    missing_sorted = sorted(missing_lemmas, key=lambda w: content_freq.get(w, 999999))
    pct = (len(covered) / len(top_words) * 100) if top_words else 0.0

    return CoverageReport(
        total_vocabulary=len(story_lemmas),
        frequency_matched=0,
        top_1000_covered=len(covered),
        top_1000_total=len(top_words),
        coverage_percent=round(pct, 1),
        missing_words=missing_sorted,
        thresholds={},
        outside_top_n=0,
        outside_top_n_label=f"top_{top_n}",
    )
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_coverage_checker.py tests/test_story_coverage_scanner.py -v`
Expected: All tests PASS

**Step 5: Commit**

```
git add pipeline/coverage_checker.py tests/test_coverage_checker.py tests/test_story_coverage_scanner.py
git commit -m "refactor(coverage): replace Spanish tables with spaCy lemmatization"
```

---

### Task 3: Rewrite `frequency_lemmatizer.py` → appropriateness filter only

**Files:**
- Modify: `pipeline/frequency_lemmatizer.py` (rewrite — spaCy for lemmas, LLM for appropriateness only)
- Modify: `tests/test_frequency_lemmatizer.py`

**Step 1: Rewrite test file**

```python
# tests/test_frequency_lemmatizer.py
"""Tests for frequency_lemmatizer.py — now uses spaCy for lemmas, LLM for appropriateness only."""
import json
from unittest.mock import MagicMock

from pipeline.frequency_lemmatizer import FrequencyLemmatizer
from pipeline.models import FrequencyLemmaEntry


def _make_mock_llm(batch_responses: list[dict]) -> MagicMock:
    """Returns a mock LLMClient whose complete_json cycles through responses."""
    llm = MagicMock()
    responses = iter(batch_responses)

    def side_effect(prompt, system=None):
        r = MagicMock()
        r.parsed = next(responses)
        return r

    llm.complete_json.side_effect = side_effect
    return llm


def test_lemmatize_uses_spacy_for_lemmas(tmp_path):
    """Lemma comes from spaCy, not from LLM."""
    words = ["camina", "restaurante"]
    # LLM only returns appropriateness — no lemma field needed
    llm_response = {
        "caminar": True,
        "restaurante": True,
    }
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel Spanish, Buenos Aires",
    )
    result = lem.lemmatize(words)

    # "camina" should be lemmatized by spaCy to "caminar"
    assert result["camina"].lemma == "caminar"
    assert result["restaurante"].lemma == "restaurante"


def test_appropriateness_from_llm(tmp_path):
    """LLM determines appropriateness."""
    words = ["restaurante", "disparar"]
    llm_response = {
        "restaurante": True,
        "disparar": False,
    }
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel",
    )
    result = lem.lemmatize(words)

    assert result["restaurante"].appropriate is True
    assert result["disparar"].appropriate is False


def test_lemmatize_uses_cache(tmp_path):
    """Second call reads from disk; LLM is never called."""
    cached = {
        "camina": {"lemma": "caminar", "appropriate": True},
    }
    (tmp_path / "frequency_lemmas.json").write_text(json.dumps(cached))

    llm = MagicMock()
    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel",
    )
    result = lem.lemmatize(["camina"])

    llm.complete_json.assert_not_called()
    assert result["camina"].lemma == "caminar"


def test_lemmatize_filters_function_words(tmp_path):
    """Function words (by spaCy POS) are skipped — not sent to LLM."""
    words = ["de", "la", "restaurante"]
    llm_response = {"restaurante": True}
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel",
    )
    result = lem.lemmatize(words)

    # Function words should not be in the result at all
    assert "de" not in result
    assert "la" not in result
    assert "restaurante" in result


def test_lemmatize_deduplicates_by_lemma(tmp_path):
    """Multiple inflections mapping to same lemma are sent as one lemma to LLM."""
    words = ["mira", "mirar", "miraba"]
    # All three → "mirar" via spaCy. LLM sees "mirar" once.
    llm_response = {"mirar": True}
    llm = _make_mock_llm([llm_response])

    lem = FrequencyLemmatizer(
        llm=llm, output_dir=tmp_path, target_language="Spanish",
        lang_code="es", domain="travel",
    )
    result = lem.lemmatize(words)

    # All three words should have the same lemma
    assert result["mira"].lemma == "mirar"
    assert result["mirar"].lemma == "mirar"
    assert result["miraba"].lemma == "mirar"
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_frequency_lemmatizer.py -v`
Expected: FAIL — old constructor doesn't accept `lang_code`

**Step 3: Rewrite `frequency_lemmatizer.py`**

```python
# pipeline/frequency_lemmatizer.py
"""Frequency word lemmatization (spaCy) and domain appropriateness filtering (LLM).

spaCy handles lemmatization deterministically. The LLM is called once (cached)
to classify lemmas as appropriate/inappropriate for the deck domain.
"""

import json
from pathlib import Path

from pipeline.lemmatizer import is_function_word, lemmatize_text, lemmatize_word
from pipeline.models import FrequencyLemmaEntry


class FrequencyLemmatizer:
    """Lemmatize frequency words via spaCy, filter appropriateness via LLM.

    Args:
        llm: LLMClient instance (used only for appropriateness filtering).
        output_dir: Directory to save/load frequency_lemmas.json.
        target_language: Human-readable language name, e.g. "Spanish".
        lang_code: ISO language code, e.g. "es" (for spaCy model).
        domain: Short domain description for appropriateness filtering.
        batch_size: Number of lemmas per LLM call (default 500).
    """

    CACHE_FILE = "frequency_lemmas.json"

    def __init__(
        self,
        llm,
        output_dir: Path,
        target_language: str,
        lang_code: str,
        domain: str,
        batch_size: int = 500,
    ):
        self._llm = llm
        self._output_dir = output_dir
        self._language = target_language
        self._lang_code = lang_code
        self._domain = domain
        self._batch_size = batch_size

    @property
    def cache_path(self) -> Path:
        return self._output_dir / self.CACHE_FILE

    def lemmatize(self, words: list[str]) -> dict[str, FrequencyLemmaEntry]:
        """Lemmatize words via spaCy, filter via LLM. Cached to disk.

        Returns dict mapping surface form → FrequencyLemmaEntry.
        """
        if self.cache_path.exists():
            raw = json.loads(self.cache_path.read_text())
            return {k: FrequencyLemmaEntry(**v) for k, v in raw.items()}

        # Step 1: spaCy lemmatization + function word filtering
        word_to_lemma: dict[str, str] = {}
        for w in words:
            tokens = lemmatize_text(w, self._lang_code)
            if tokens and is_function_word(tokens[0]):
                continue  # Skip function words
            word_to_lemma[w] = lemmatize_word(w, self._lang_code)

        # Step 2: Deduplicate lemmas for LLM call
        unique_lemmas = sorted(set(word_to_lemma.values()))

        # Step 3: LLM appropriateness filtering on unique lemmas
        appropriateness: dict[str, bool] = {}
        for i in range(0, len(unique_lemmas), self._batch_size):
            batch = unique_lemmas[i : i + self._batch_size]
            batch_result = self._filter_batch(batch)
            appropriateness.update(batch_result)

        # Step 4: Build result mapping surface form → entry
        result: dict[str, FrequencyLemmaEntry] = {}
        for word, lemma in word_to_lemma.items():
            result[word] = FrequencyLemmaEntry(
                lemma=lemma,
                appropriate=appropriateness.get(lemma, True),
            )

        # Cache to disk
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(
            json.dumps(
                {k: v.model_dump() for k, v in result.items()},
                ensure_ascii=False, indent=2,
            )
        )
        return result

    def _filter_batch(self, lemmas: list[str]) -> dict[str, bool]:
        """Ask LLM which lemmas are appropriate for the domain."""
        word_list = "\n".join(lemmas)
        system = (
            f"You are a {self._language} linguistics expert helping build a language learning deck "
            f"for the domain: {self._domain}."
        )
        prompt = (
            f"For each {self._language} word below, answer true or false:\n"
            f"Is this word relevant and appropriate for a language learning deck "
            f'in the domain "{self._domain}"?\n'
            f"Answer false for: profanity, extreme violence, pure film/TV slang, "
            f"English proper names, or technical subtitle jargon.\n\n"
            f"Words:\n{word_list}\n\n"
            f'Return JSON: {{"word1": true, "word2": false, ...}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw: dict = response.parsed

        result: dict[str, bool] = {}
        for lemma in lemmas:
            result[lemma] = bool(raw.get(lemma, True))
        return result
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_frequency_lemmatizer.py -v`
Expected: All tests PASS

**Step 5: Commit**

```
git add pipeline/frequency_lemmatizer.py tests/test_frequency_lemmatizer.py
git commit -m "refactor(freq-lemmatizer): use spaCy for lemmas, LLM for appropriateness only"
```

---

### Task 4: Rewrite `word_extractor.py` — hybrid spaCy + LLM

**Files:**
- Modify: `pipeline/word_extractor.py` (rewrite)
- Modify: `tests/test_word_extractor.py`

**Step 1: Rewrite test file**

```python
# tests/test_word_extractor.py
import json
from pathlib import Path
from unittest.mock import MagicMock

from pipeline.config import load_config
from pipeline.llm import LLMResponse, Usage
from pipeline.models import SentencePair, ChapterWords
from pipeline.word_extractor import WordExtractor


def make_mock_config(tmp_path: Path):
    import yaml
    config_data = {
        "deck": {"name": "Test", "id": "test-deck"},
        "languages": {
            "target": "Spanish", "target_code": "es",
            "native": "German", "native_code": "de", "dialect": "neutral",
        },
        "protagonist": {"name": "Charlotte", "gender": "female", "origin_country": "Germany"},
        "destination": {"country": "Argentina", "city": "Buenos Aires"},
        "story": {
            "cefr_level": "A1-A2", "sentences_per_chapter": [8, 12],
            "chapters": [{"title": "Test", "context": "Test context", "vocab_focus": ["test"]}],
        },
        "llm": {
            "provider": "openrouter", "model": "test/model",
            "fallback_model": "test/fallback", "temperature": 0.7, "max_retries": 3,
        },
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.dump(config_data))
    return load_config(config_path)


def test_extract_uses_spacy_for_tokenization(tmp_path):
    """spaCy identifies all tokens — LLM only provides translations."""
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    # LLM returns translations for spaCy-identified words
    llm_output = {
        "words": [
            {"source": "está", "target": "ist", "context_note": "3rd person singular",
             "similar_words": ["ser", "parecer"]},
            {"source": "nerviosa", "target": "nervös", "context_note": "feminine singular",
             "similar_words": ["tranquilo", "feliz"]},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=200, completion_tokens=100, total_tokens=300),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source="Charlotte está nerviosa.", target="Charlotte ist nervös.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result = extractor.extract_chapter(0, pairs)

    assert isinstance(result, ChapterWords)
    # spaCy should identify tokens; LLM should be called for annotations
    assert mock_llm.complete_json.called
    assert len(result.words) >= 2


def test_extract_preserves_spacy_lemma_and_pos(tmp_path):
    """Lemma and POS come from spaCy, not from LLM."""
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "words": [
            {"source": "camina", "target": "geht", "context_note": "3rd person",
             "similar_words": ["correr"]},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source="Maria camina.", target="Maria geht.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result = extractor.extract_chapter(0, pairs)

    camina = next((w for w in result.words if w.source == "camina"), None)
    assert camina is not None
    assert camina.lemma == "caminar"  # From spaCy
    assert camina.pos == "VERB"       # From spaCy


def test_extract_skips_if_exists(tmp_path):
    """Cached files are loaded without calling LLM."""
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    words_dir = tmp_path / "test-deck" / "words"
    words_dir.mkdir(parents=True)
    existing = {
        "chapter": 1,
        "sentences": [{"chapter": 1, "sentence_index": 0, "source": "Hola.", "target": "Hallo."}],
        "words": [{"source": "Hola", "target": "Hallo", "lemma": "hola",
                    "pos": "INTJ", "context_note": "greeting"}],
    }
    (words_dir / "chapter_01.json").write_text(json.dumps(existing))

    pairs = [SentencePair(chapter=1, sentence_index=0, source="Hola.", target="Hallo.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result = extractor.extract_chapter(0, pairs)

    assert len(result.words) == 1
    mock_llm.complete_json.assert_not_called()


def test_extract_includes_similar_words(tmp_path):
    config = make_mock_config(tmp_path)
    mock_llm = MagicMock()

    llm_output = {
        "words": [
            {"source": "perro", "target": "Hund", "context_note": "masculine singular",
             "similar_words": ["gato", "vaca", "pollo", "caballo", "pájaro", "pez"]},
        ]
    }
    mock_llm.complete_json.return_value = LLMResponse(
        content=json.dumps(llm_output),
        usage=Usage(prompt_tokens=200, completion_tokens=100, total_tokens=300),
        parsed=llm_output,
    )

    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source="Ella tiene un perro.", target="Sie hat einen Hund.")]
    extractor = WordExtractor(config, mock_llm, output_base=tmp_path)
    result = extractor.extract_chapter(0, pairs)

    perro = next((w for w in result.words if w.source == "perro"), None)
    assert perro is not None
    assert len(perro.similar_words) >= 6
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_word_extractor.py -v`
Expected: FAIL — old implementation doesn't use spaCy

**Step 3: Rewrite `word_extractor.py`**

```python
# pipeline/word_extractor.py
"""Pass 7: Extract word-level vocabulary annotations from translated chapters.

Hybrid approach: spaCy identifies all tokens (deterministic), then LLM provides
contextual translations, similar words, and grammar notes (generative).
"""

import json
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.lemmatizer import is_function_word, lemmatize_text
from pipeline.llm import LLMClient
from pipeline.models import ChapterWords, SentencePair, WordAnnotation


SYSTEM_PROMPT = """You are a linguistics expert providing contextual translations \
and vocabulary annotations. Return valid JSON only."""


def _build_annotation_prompt(config: DeckConfig, pairs: list[SentencePair],
                              words_by_sentence: dict[int, list[dict]]) -> str:
    """Build prompt asking LLM to annotate pre-identified words."""
    sentence_block = "\n".join(
        f"{i+1}. {p.source}\n   → {p.target}" for i, p in enumerate(pairs)
    )

    word_block_parts = []
    for sent_idx, words in sorted(words_by_sentence.items()):
        for w in words:
            word_block_parts.append(
                f'  - "{w["source"]}" (sentence {sent_idx + 1}, {w["pos"]})'
            )
    word_block = "\n".join(word_block_parts)

    return f"""Here are {config.languages.target} sentences with {config.languages.native} translations, \
and the words I need you to annotate.

Sentences:
{sentence_block}

Words to annotate:
{word_block}

For each word, provide:
- "source": the word exactly as listed above
- "target": the correct {config.languages.native} translation in the context of its sentence
- "context_note": brief grammar note (e.g. "3rd person singular present", "feminine plural")
- "similar_words": 6-8 semantically similar {config.languages.target} words in lemma form \
(used as multiple-choice distractors — same semantic category but clearly different words)

Return a JSON object with a "words" array.
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

        lang = self._config.languages.target_code

        # Step A: Deterministic tokenization via spaCy
        # Process each sentence separately to maintain sentence_index alignment
        spacy_words: list[dict] = []  # {source, lemma, pos, sentence_index}
        words_by_sentence: dict[int, list[dict]] = {}

        for pair in pairs:
            tokens = lemmatize_text(pair.source, lang)
            sent_words = []
            for token in tokens:
                if is_function_word(token):
                    continue
                entry = {
                    "source": token.text,
                    "lemma": token.lemma,
                    "pos": token.pos,
                    "sentence_index": pair.sentence_index,
                }
                spacy_words.append(entry)
                sent_words.append(entry)
            if sent_words:
                words_by_sentence[pair.sentence_index] = sent_words

        # Step B: LLM provides translations, similar words, context notes
        prompt = _build_annotation_prompt(self._config, pairs, words_by_sentence)
        result = self._llm.complete_json(prompt, system=SYSTEM_PROMPT)
        raw_annotations = result.parsed.get("words", [])

        # Build lookup: source text → LLM annotation
        annotation_map: dict[str, dict] = {}
        for ann in raw_annotations:
            source = ann.get("source", "")
            annotation_map[source] = ann

        # Merge: spaCy provides lemma/pos, LLM provides target/similar_words/context_note
        words: list[WordAnnotation] = []
        for sw in spacy_words:
            ann = annotation_map.get(sw["source"], {})
            words.append(WordAnnotation(
                source=sw["source"],
                target=ann.get("target", ""),
                lemma=sw["lemma"],      # From spaCy (deterministic)
                pos=sw["pos"],          # From spaCy (deterministic)
                context_note=ann.get("context_note", ""),
                similar_words=ann.get("similar_words", []),
            ))

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

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_word_extractor.py -v`
Expected: All tests PASS

**Step 5: Commit**

```
git add pipeline/word_extractor.py tests/test_word_extractor.py
git commit -m "refactor(word-extractor): hybrid spaCy tokenization + LLM annotation"
```

---

### Task 5: Update `run_all.py` and `gap_filler.py` call sites

**Files:**
- Modify: `scripts/run_all.py`
- Modify: `pipeline/gap_filler.py` (update `scan_story_coverage` / `check_coverage` calls)

**Step 1: Update `gap_filler.py`**

The `fill_gaps` method calls `scan_story_coverage` and `check_coverage`. Update these calls to use the new signatures (add `lang` parameter, remove `frequency_lemmas`, add `inappropriate_lemmas`).

Key changes in `gap_filler.py`:
- `fill_gaps()` needs a `lang` parameter
- Replace `frequency_lemmas=frequency_lemmas` with `inappropriate_lemmas=<set from frequency_lemmas>`
- Constructor needs `lang_code` parameter

**Step 2: Update `run_all.py`**

Key changes:
- `run_lemmatize_stage`: pass `lang_code` to `FrequencyLemmatizer`
- `run_text_stage`:
  - `scan_story_coverage` calls: add `lang=config.languages.target_code`, build `inappropriate_lemmas` set from frequency_lemmas, remove `frequency_lemmas` param
  - `GapFiller` constructor: add `lang_code`
  - `check_coverage` call in coverage report section: add `lang`, replace `frequency_lemmas` with `inappropriate_lemmas`
  - Remove `inflection_to_lemma` building (lines 366-372 — no longer needed)
- `run_fill_gaps_stage`: same changes to `GapFiller` and `check_coverage` calls

**Step 3: Run full test suite**

Run: `uv run pytest tests/ -v`
Expected: All tests PASS (including gap_filler tests which may need minor updates to new signatures)

**Step 4: Commit**

```
git add scripts/run_all.py pipeline/gap_filler.py
git commit -m "refactor(pipeline): update call sites for spaCy-based coverage"
```

---

### Task 6: Update gap_filler tests

**Files:**
- Modify: `tests/test_gap_filler.py`

**Step 1: Update all `FrequencyLemmaEntry` usage**

The gap filler tests pass `frequency_lemmas` dicts. These need to be converted to `inappropriate_lemmas` sets where used for filtering, and `FrequencyLemmaEntry` still works for the data structure but the calls to coverage functions change.

Review each test and update:
- `frequency_lemmas={...}` → keep for GapFiller constructor if it still uses them, or convert to `inappropriate_lemmas` set
- Add `lang_code="es"` to GapFiller constructor

**Step 2: Run gap filler tests**

Run: `uv run pytest tests/test_gap_filler.py -v`
Expected: All tests PASS

**Step 3: Commit**

```
git add tests/test_gap_filler.py
git commit -m "test(gap-filler): update for spaCy-based coverage signatures"
```

---

### Task 7: Remove `simplemma` dependency, verify full test suite

**Files:**
- Modify: `pyproject.toml` (remove simplemma)

**Step 1: Remove simplemma**

Run: `uv remove simplemma`

**Step 2: Run full test suite**

Run: `uv run pytest tests/ -v`
Expected: All 162+ tests PASS

**Step 3: Run pipeline end-to-end smoke test**

Delete output and rerun chapters 1-3:
```bash
rm -rf output/es-de-buenos-aires/
uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml \
    --chapters 1-3 --stage text --frequency-file data/frequency/es_50k.txt
```

Verify:
- Pre-gap and post-gap coverage numbers are higher than before (~38% vs old 19%)
- Word extraction finds all tokens (not just LLM-selected ones)
- Coverage report uses spaCy lemmatization

**Step 4: Commit**

```
git add pyproject.toml uv.lock
git commit -m "chore: remove simplemma dependency"
```

---

### Task 8: Update memory

**Files:**
- Modify: `/home/christoph/.claude/projects/-mnt-Shared-Code-projects-LingoLock/memory/MEMORY.md`

Update memory to reflect:
- spaCy replaces SPANISH_VERB_FORMS and SPANISH_FUNCTION_WORDS
- Word extractor is now hybrid (spaCy + LLM)
- frequency_lemmatizer uses spaCy for lemmas, LLM for appropriateness only
- Coverage checking is deterministic via spaCy
- `simplemma` removed, `spacy` + `es-core-news-sm` added
