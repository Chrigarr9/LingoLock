"""Insert gap-filler sentences at natural positions and re-index."""
import json
from pathlib import Path

from pipeline.models import GapSentence, GrammarGapSentence, SentencePair


def insert_sentences(
    existing: list[SentencePair],
    new_sentences: list[GapSentence | GrammarGapSentence],
) -> list[SentencePair]:
    """Insert new sentences at their insert_after positions and re-index.

    Sentences with insert_after=-1 are appended at the end.
    Multiple inserts at the same position are kept in order.
    """
    chapter = existing[0].chapter if existing else 1

    # Build insertion map: position -> list of sentences to insert after that index
    insertions: dict[int, list] = {}
    appends = []
    for s in new_sentences:
        pos = s.insert_after
        if pos < 0:
            appends.append(s)
        else:
            insertions.setdefault(pos, []).append(s)

    # Build result by walking existing and inserting
    result: list[SentencePair] = []
    for sent in existing:
        result.append(sent)
        if sent.sentence_index in insertions:
            for new_s in insertions[sent.sentence_index]:
                result.append(SentencePair(
                    chapter=chapter,
                    sentence_index=-1,  # will be re-indexed
                    source=new_s.source,
                    target=new_s.target,
                ))

    # Append -1 sentences
    for s in appends:
        result.append(SentencePair(
            chapter=chapter, sentence_index=-1,
            source=s.source, target=s.target,
        ))

    # Re-index
    for i, sent in enumerate(result):
        sent.sentence_index = i

    return result


def reindex_translations(path: Path) -> None:
    """Re-index sentence_index values in a translations JSON file."""
    data = json.loads(path.read_text())
    for i, entry in enumerate(data):
        entry["sentence_index"] = i
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
