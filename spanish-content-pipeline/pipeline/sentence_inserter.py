"""Insert gap-filler sentences at natural positions and re-index."""

from pipeline.models import (
    ChapterScene, GapSentence, GrammarGapSentence, Scene, Shot, ShotSentence,
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


def insert_shots_into_chapter_scene(
    chapter_scene: ChapterScene,
    new_shots: list,  # list[GapShot] — uses duck typing to avoid circular import
) -> ChapterScene:
    """Insert gap shots as new shots in the chapter.

    Each gap shot becomes a new Shot with its own image_prompt and sentences.
    Shots with insert_after_shot=N are placed after the Nth shot (0-based global count).
    Shots with insert_after_shot=-1 are appended to the last scene.
    All sentence_index values are re-numbered sequentially.
    Returns a new ChapterScene (original is not modified).
    """
    if not new_shots:
        return chapter_scene

    # Count total existing shots
    total_shots = sum(len(scene.shots) for scene in chapter_scene.scenes)

    # Build insertion map: global_shot_idx -> list of new Shots to insert after
    insertions: dict[int, list[Shot]] = {}
    appends: list[Shot] = []

    for gap_shot in new_shots:
        new_shot = Shot(
            focus=", ".join(gap_shot.covers),
            image_prompt=gap_shot.image_prompt,
            sentences=[
                ShotSentence(source=s, sentence_index=-1)
                for s in gap_shot.sentences
            ],
        )
        if gap_shot.insert_after_shot < 0:
            appends.append(new_shot)
        else:
            idx = min(gap_shot.insert_after_shot, total_shots - 1)
            insertions.setdefault(idx, []).append(new_shot)

    # Rebuild scenes with new shots inserted
    new_scenes = []
    current_global = 0
    for scene in chapter_scene.scenes:
        new_scene_shots = []
        for shot in scene.shots:
            # Copy existing shot
            new_scene_shots.append(Shot(
                focus=shot.focus,
                image_prompt=shot.image_prompt,
                sentences=[ShotSentence(source=s.source, sentence_index=-1) for s in shot.sentences],
            ))
            # Insert any new shots after this one
            if current_global in insertions:
                new_scene_shots.extend(insertions[current_global])
            current_global += 1
        new_scenes.append(type(scene)(
            setting=scene.setting,
            description=scene.description,
            shots=new_scene_shots,
        ))

    # Append -1 shots to last scene
    if appends and new_scenes:
        new_scenes[-1].shots.extend(appends)

    # Re-index all sentences sequentially
    idx = 0
    for scene in new_scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sent.sentence_index = idx
                idx += 1

    return ChapterScene(chapter=chapter_scene.chapter, scenes=new_scenes)
