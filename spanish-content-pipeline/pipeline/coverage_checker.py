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
