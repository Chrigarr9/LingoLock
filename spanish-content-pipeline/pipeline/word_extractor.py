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
- "similar_words": 6-8 semantically similar {config.languages.target} words in lemma form \
(e.g. for "perro": ["gato", "vaca", "pollo", "caballo", "pájaro", "pez", "conejo", "ratón"]). \
These are used as multiple-choice distractors, so they should be from the same semantic \
category but clearly different words.

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
