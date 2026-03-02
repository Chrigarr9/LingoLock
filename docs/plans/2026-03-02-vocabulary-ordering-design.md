# Vocabulary Ordering Design: Story-Driven Learning Sequence

**Date:** 2026-03-02
**Status:** Approved
**Scope:** Vocabulary ordering, function word filtering, distractor generation

---

## Overview

Transform the pipeline's flat vocabulary output into a story-driven, chapter-grouped learning sequence. Words are ordered by their first appearance in Charlotte's narrative, function words are filtered out, and each entry carries 6-8 semantically similar Spanish words for multiple-choice quiz distractors.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Ordering logic location | Pipeline output | Simpler app, easier to test and iterate |
| Primary sort criterion | Story/sentence order | Narrative engagement; the story IS the curriculum |
| Intra-chapter ordering | Sentence appearance order | Mirrors the reading experience |
| Duplicate handling | First occurrence only | Word positioned at first chapter; later chapters add example sentences |
| Output grouping | Grouped by chapter | App can show chapter transitions |
| Output file | Replace vocabulary.json | Single authoritative output, not a separate file |
| Function words | Filter out | Articles, prepositions, pronouns, conjunctions excluded from deck |
| Distractors | LLM-generated, Spanish-only | 6-8 similar words per entry, integrated into Pass 3 |

---

## Pipeline Step Placement

The ordering step replaces the current vocabulary builder as the step producing `vocabulary.json`:

```
Pass 1: Story Generation     -> stories/chapter_N.txt
Pass 2: Sentence Translation  -> translations/chapter_N.json
Pass 3: Word Extraction       -> words/chapter_N.json  (now includes similar_words)
BUILD:  Vocabulary Orderer    -> vocabulary.json  (chapter-grouped, story-ordered)
REPORT: Coverage Checker      -> coverage_report.json
```

Data flow:

```
words/chapter_1.json  --+
words/chapter_2.json  --+                          +-- vocabulary.json (ordered, grouped)
  ...                  --+-> vocabulary_orderer ---+
words/chapter_11.json --+                          +-- (feeds into coverage_checker)
frequency/es_50k.txt  --+
```

---

## Data Models

### WordAnnotation (Pass 3 output, updated)

```python
class WordAnnotation(BaseModel):
    source: str             # Word as it appears in text
    target: str             # Contextual translation
    lemma: str              # Base/dictionary form
    pos: str                # Part of speech
    context_note: str       # Grammar note
    similar_words: list[str]  # 6-8 semantically similar Spanish words (lemma form)
```

### OrderedDeck (BUILD output, new top-level model)

```python
class OrderedDeck(BaseModel):
    deck_id: str
    deck_name: str
    total_words: int
    chapters: list[DeckChapter]

class DeckChapter(BaseModel):
    chapter: int
    title: str
    words: list[VocabularyEntry]
```

### VocabularyEntry (updated)

```python
class VocabularyEntry(BaseModel):
    id: str                         # Lemma (unique key)
    source: str                     # Lemma in target language
    target: list[str]               # All translations seen across contexts
    pos: str
    frequency_rank: int | None
    cefr_level: str | None
    first_chapter: int              # Chapter where this word was first introduced
    order: int                      # Global position in the learning sequence
    examples: list[SentencePair]    # All sentences, tagged with chapter number
    similar_words: list[str]        # 6-8 Spanish distractors
```

---

## Output Format (vocabulary.json)

```json
{
  "deck_id": "es-de-buenos-aires",
  "deck_name": "Spanish with Charlotte - Buenos Aires",
  "total_words": 187,
  "chapters": [
    {
      "chapter": 1,
      "title": "Preparation",
      "words": [
        {
          "id": "maleta",
          "source": "maleta",
          "target": ["Koffer"],
          "pos": "noun",
          "frequency_rank": 4231,
          "cefr_level": "B2",
          "first_chapter": 1,
          "order": 1,
          "examples": [
            {
              "chapter": 1,
              "sentence_index": 2,
              "source": "Charlotte pone la ropa en la maleta.",
              "target": "Charlotte legt die Kleidung in den Koffer."
            }
          ],
          "similar_words": ["bolsa", "mochila", "equipaje", "bolso", "baul", "valija", "cartera", "maletín"]
        }
      ]
    }
  ]
}
```

---

## Function Word Filtering

The orderer excludes words with these POS tags:

- `article` / `determiner`
- `preposition`
- `pronoun`
- `conjunction`

Filtering uses the `pos` field from Pass 3. Function words still appear naturally in example sentences; they are only excluded as standalone vocabulary entries. This approach is language-agnostic (no hardcoded stopword lists).

---

## Distractor Generation

Integrated into Pass 3 (Word Extraction). The LLM prompt requests 6-8 semantically similar Spanish words per vocabulary entry.

**App usage:**
- **Hard mode (4 options):** Pick 3 random from `similar_words` + correct answer
- **Easy mode (2 options):** Pick 1 random word NOT in `similar_words` (any other deck word) + correct answer

When a similar word later appears as its own vocabulary entry (e.g., "gato" is a distractor for "perro" in chapter 1, then appears as a real word in chapter 6), it becomes a full entry with its own translations and examples. No conflict.

---

## Example Sentence Rotation

A word is introduced once (at its first chapter appearance). When the same word appears in later chapters, the new sentence is added to the word's `examples` list with its chapter number.

The app uses the `chapter` field on each example to cycle sentences as the learner progresses:
- When the learner is in chapter 1, show the chapter 1 example
- When the learner reaches chapter 6 and the word comes up for review, show the chapter 6 example
- The spaced repetition state carries forward (does not reset on new context)

---

## Implementation Changes

| File | Change |
|------|--------|
| `pipeline/models.py` | Add `similar_words` to `WordAnnotation` and `VocabularyEntry`. Add `first_chapter` and `order` to `VocabularyEntry`. Add `OrderedDeck` and `DeckChapter` models. |
| `pipeline/word_extractor.py` | Update Pass 3 prompt to request 6-8 similar words. Update JSON parsing for `similar_words`. |
| `pipeline/vocabulary_builder.py` | Rewrite: walk chapters in story order, deduplicate by first appearance, filter function words, assign global order, group by chapter. Return `OrderedDeck`. |
| `pipeline/coverage_checker.py` | Accept `OrderedDeck` instead of flat list (extract words from chapters). |
| `scripts/build.py` | Serialize `OrderedDeck` format to vocabulary.json. |
| `tests/` | Update tests for new model fields and builder behavior. |

No new files needed.
