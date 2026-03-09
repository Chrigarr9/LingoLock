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
