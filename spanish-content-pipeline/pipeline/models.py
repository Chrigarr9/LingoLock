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
