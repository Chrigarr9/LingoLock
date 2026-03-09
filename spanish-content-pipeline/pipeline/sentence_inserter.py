"""Insert gap-filler sentences at natural positions and re-index."""
import json
from pathlib import Path

from pipeline.models import (
    ChapterScene, GapSentence, GrammarGapSentence, SentencePair, Shot, ShotSentence,
)


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


def insert_into_chapter_scene(
    chapter_scene: ChapterScene,
    new_sentences: list[GapSentence | GrammarGapSentence],
) -> ChapterScene:
    """Insert gap sentences into a ChapterScene at their insert_after positions.

    New sentences are added to the shot that contains the insert_after sentence.
    Sentences with insert_after=-1 are appended to the last shot.
    All sentence_index values are re-numbered sequentially.
    Returns a new ChapterScene (original is not modified).
    """
    if not new_sentences:
        return chapter_scene

    # Build insertion map: sentence_index -> list of new source strings
    insertions: dict[int, list[str]] = {}
    appends: list[str] = []
    for s in new_sentences:
        if s.insert_after < 0:
            appends.append(s.source)
        else:
            insertions.setdefault(s.insert_after, []).append(s.source)

    # Walk scenes/shots/sentences, inserting new ones after matching indices
    new_scenes = []
    for scene in chapter_scene.scenes:
        new_shots = []
        for shot in scene.shots:
            new_shot_sentences: list[ShotSentence] = []
            for sent in shot.sentences:
                new_shot_sentences.append(ShotSentence(
                    source=sent.source, sentence_index=-1,
                ))
                if sent.sentence_index in insertions:
                    for src in insertions[sent.sentence_index]:
                        new_shot_sentences.append(ShotSentence(
                            source=src, sentence_index=-1,
                        ))
            new_shots.append(Shot(
                focus=shot.focus,
                image_prompt=shot.image_prompt,
                sentences=new_shot_sentences,
            ))
        new_scenes.append(type(scene)(
            setting=scene.setting,
            description=scene.description,
            shots=new_shots,
        ))

    # Append -1 sentences to the last shot
    if appends and new_scenes and new_scenes[-1].shots:
        last_shot = new_scenes[-1].shots[-1]
        for src in appends:
            last_shot.sentences.append(ShotSentence(
                source=src, sentence_index=-1,
            ))

    # Re-index all sentences sequentially
    idx = 0
    for scene in new_scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sent.sentence_index = idx
                idx += 1

    return ChapterScene(chapter=chapter_scene.chapter, scenes=new_scenes)


def reindex_translations(path: Path) -> None:
    """Re-index sentence_index values in a translations JSON file."""
    data = json.loads(path.read_text())
    for i, entry in enumerate(data):
        entry["sentence_index"] = i
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
