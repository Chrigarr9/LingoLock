"""Insert gap-filler sentences at natural positions and re-index."""

from pipeline.models import (
    ChapterScene, GapSentence, GrammarGapSentence, Shot, ShotSentence,
)


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
