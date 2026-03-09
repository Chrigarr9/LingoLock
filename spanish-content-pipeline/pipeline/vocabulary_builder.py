"""BUILD step: Produce a story-ordered, chapter-grouped vocabulary deck."""

from pipeline.models import (
    ChapterWords, DeckChapter, OrderedDeck,
    VocabularyEntry, WordAnnotation,
)

FILTERED_POS = {"article", "determiner", "preposition", "conjunction"}


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
                    examples=[
                        s for s in chapter.sentences
                        if word.source.lower() in s.source.lower()
                    ],
                    similar_words=list(word.similar_words),
                )
                chapter_word_lists[chapter_num].append(lemma)
            else:
                # Duplicate: accumulate translations, examples, similar_words
                entry = seen_lemmas[lemma]

                if word.target not in entry.target:
                    entry.target.append(word.target)

                for s in chapter.sentences:
                    if word.source.lower() in s.source.lower() and s not in entry.examples:
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
