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
