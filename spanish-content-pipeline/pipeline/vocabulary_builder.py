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
        for word in chapter.words:
            lemma = word.lemma.lower().strip()
            if lemma not in lemma_translations:
                lemma_translations[lemma] = set()
                lemma_pos[lemma] = word.pos
                lemma_examples[lemma] = []

            lemma_translations[lemma].add(word.target)

            # Add all sentences from this chapter as examples for this word
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
