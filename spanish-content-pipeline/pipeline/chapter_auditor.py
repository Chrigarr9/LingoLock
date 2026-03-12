"""Pass 4b: Per-chapter narrative audit after gap insertion.

Reviews each chapter individually for internal consistency issues
introduced by gap shot insertion. Can rewrite sentences or remove
shots as a last resort.
"""

from pydantic import BaseModel

from pipeline.models import ChapterScene, Shot, ShotSentence


class ChapterAuditAction(BaseModel):
    action: str  # "rewrite", "remove_shot", or "move_shot"
    sentence_index: int | None = None  # for rewrite
    shot_index: int | None = None  # for remove_shot or move_shot (source)
    move_after: int | None = None  # for move_shot (place after this shot index, -1 = beginning)
    original: str = ""
    fixed: str = ""
    reason: str = ""


def _build_chapter_audit_prompt(
    chapter_scene: ChapterScene,
    chapter_config: dict,
    characters: list[dict],
    gap_words: list[str],
) -> tuple[str, str]:
    """Build system and user prompts for chapter audit."""
    title = chapter_config.get("title", f"Chapter {chapter_scene.chapter}")
    cefr = chapter_config.get("cefr_level", "A2")
    context = chapter_config.get("context", "")

    # Character reference
    char_lines = []
    for c in characters:
        role = c.get("role", "character")
        vtag = c.get("visual_tag", "")
        line = f"  - {c['name']}: {role}"
        if vtag:
            line += f" | appearance: {vtag}"
        char_lines.append(line)
    char_block = "\n".join(char_lines) if char_lines else "  (none specified)"

    gap_words_block = ""
    if gap_words:
        gap_words_block = (
            f"\nMANDATORY GAP VOCABULARY (must be preserved exactly):\n"
            f"  {', '.join(gap_words)}\n"
        )

    # Build per-shot focus word map for inline display
    shot_focus: dict[int, str] = {}
    flat_idx = 0
    for scene in chapter_scene.scenes:
        for shot in scene.shots:
            if shot.focus:
                shot_focus[flat_idx] = shot.focus
            flat_idx += 1

    # Full chapter content with shot and sentence indices
    content_lines = []
    shot_idx = 0
    for scene in chapter_scene.scenes:
        content_lines.append(f"  Scene: {scene.setting} — {scene.description}")
        for shot in scene.shots:
            focus_note = f" | vocab: {shot.focus}" if shot.focus else ""
            content_lines.append(
                f"  [shot {shot_idx}] image: {shot.image_prompt}{focus_note}"
            )
            for sent in shot.sentences:
                content_lines.append(
                    f'    [sent {sent.sentence_index}] "{sent.source}"'
                )
            shot_idx += 1
    content_block = "\n".join(content_lines)

    system = (
        "You are an expert narrative editor reviewing a single chapter of a "
        "graded reader story for language learners. Some shots were inserted "
        "to introduce gap vocabulary. Check that the full chapter reads as a "
        "coherent narrative. Return valid JSON."
    )

    prompt = (
        f'Chapter {chapter_scene.chapter}: "{title}" [{cefr}]\n'
        f"Context: {context}\n\n"
        f"CHARACTERS IN THIS CHAPTER:\n{char_block}\n"
        f"{gap_words_block}\n"
        f"CHAPTER CONTENT:\n{content_block}\n\n"
        f"Review this chapter for these issues:\n\n"
        f"1. NARRATIVE FLOW\n"
        f"   - Do shots connect logically? Is any placement awkward?\n"
        f"   - Does dialogue make sense in context?\n"
        f"   - Are there abrupt topic changes between consecutive shots?\n\n"
        f"2. CONTRADICTIONS\n"
        f"   - Do any shots contradict each other (wrong time, place, actions)?\n"
        f"   - Are objects or facts consistent within the chapter?\n\n"
        f"3. SETTING CONSISTENCY\n"
        f"   - All shots must happen in the chapter's physical setting\n"
        f"   - No scene jumps to unrelated locations\n\n"
        f"4. CHARACTER RULES\n"
        f"   - Only listed characters should speak or be named\n"
        f"   - Unnamed functional characters (vendor, driver, waiter) are OK "
        f"if they fit the setting\n\n"
        f"5. CEFR LEVEL [{cefr}]\n"
        f"   - Sentences must fit the chapter's CEFR level\n"
        f"   - A1: simple present, ser/estar, hay, basic questions only\n"
        f"   - A2: adds preterite, imperfecto, reflexives, modals\n\n"
        f"For each issue, choose an action:\n"
        f'- "rewrite": fix a sentence (provide sentence_index, original, fixed)\n'
        f'- "move_shot": relocate a misplaced shot (provide shot_index and move_after)\n'
        f'- "remove_shot": delete a shot that cannot be salvaged (provide shot_index)\n\n'
        f"Prefer rewriting over moving. Prefer moving over removing.\n"
        f"Use remove_shot ONLY as a last resort.\n\n"
        f"VOCABULARY PRESERVATION (critical):\n"
        f"- This is a language learning app. Every sentence teaches vocabulary.\n"
        f"- Each shot has a 'vocab:' tag showing the focus words it teaches.\n"
        f"- When rewriting, you MUST keep every focus word EXACTLY as-is (same form, same inflection).\n"
        f"- NEVER replace a specific word with a synonym or generic alternative.\n"
        f"- Only change grammar, word order, or function words around the focus vocabulary.\n"
        f"- If a sentence is awkward but contains important vocabulary, prefer moving the shot "
        f"over rewriting the content.\n\n"
        f"Return JSON:\n"
        f'{{\n'
        f'  "actions": [\n'
        f'    {{\n'
        f'      "action": "rewrite",\n'
        f'      "sentence_index": 5,\n'
        f'      "original": "exact original sentence",\n'
        f'      "fixed": "corrected sentence",\n'
        f'      "reason": "brief explanation"\n'
        f'    }},\n'
        f'    {{\n'
        f'      "action": "move_shot",\n'
        f'      "shot_index": 7,\n'
        f'      "move_after": 2,\n'
        f'      "reason": "this shot fits better after shot 2"\n'
        f'    }},\n'
        f'    {{\n'
        f'      "action": "remove_shot",\n'
        f'      "shot_index": 3,\n'
        f'      "reason": "brief explanation"\n'
        f'    }}\n'
        f'  ]\n'
        f'}}\n\n'
        f"move_after: the shot index to place the moved shot AFTER. "
        f"Use -1 to move it to the very beginning of the chapter.\n\n"
        f'If no issues found, return {{"actions": []}}.'
    )

    return system, prompt


def audit_chapter(
    chapter_scene: ChapterScene,
    chapter_config: dict,
    characters: list[dict],
    llm=None,
    gap_words: list[str] | None = None,
) -> tuple[list[ChapterAuditAction], object]:
    """Audit a single chapter and return (actions, LLMResponse | None)."""
    if llm is None:
        return [], None

    system, prompt = _build_chapter_audit_prompt(
        chapter_scene, chapter_config, characters,
        gap_words or [],
    )
    response = llm.complete_json(prompt, system=system)
    raw_actions = response.parsed.get("actions", [])

    actions = []
    for a in raw_actions:
        try:
            actions.append(ChapterAuditAction(**a))
        except Exception:
            continue
    return actions, response


def apply_chapter_actions(
    chapter_scene: ChapterScene,
    actions: list[ChapterAuditAction],
) -> ChapterScene:
    """Apply audit actions to a ChapterScene. Returns a new ChapterScene.

    Actions are applied in order: rewrites first, then moves, then removals.
    Moves use the original shot indices (before any removals).
    """
    if not actions:
        return chapter_scene

    # Collect shot indices to remove
    remove_shots = {
        a.shot_index for a in actions
        if a.action == "remove_shot" and a.shot_index is not None
    }

    # Collect moves: source shot_index → move_after target
    moves: dict[int, int] = {}
    for a in actions:
        if a.action == "move_shot" and a.shot_index is not None and a.move_after is not None:
            moves[a.shot_index] = a.move_after

    # Collect sentence rewrites: sentence_index → fixed text
    rewrites: dict[int, str] = {}
    for a in actions:
        if a.action == "rewrite" and a.sentence_index is not None:
            rewrites[a.sentence_index] = a.fixed

    # Step 1: Flatten all shots with their scene association, apply rewrites
    flat_shots: list[tuple[int, Shot, int]] = []  # (global_shot_idx, shot, scene_idx)
    shot_idx = 0
    for scene_idx, scene in enumerate(chapter_scene.scenes):
        for shot in scene.shots:
            if shot_idx not in remove_shots:
                new_sentences = []
                for sent in shot.sentences:
                    source = rewrites.get(sent.sentence_index, sent.source)
                    new_sentences.append(ShotSentence(source=source, sentence_index=-1))
                flat_shots.append((shot_idx, Shot(
                    focus=shot.focus,
                    image_prompt=shot.image_prompt,
                    sentences=new_sentences,
                ), scene_idx))
            shot_idx += 1

    # Step 2: Apply moves by reordering the flat list
    if moves:
        # Extract shots that need moving
        to_move = {idx for idx in moves if idx not in remove_shots}
        staying = [(orig_idx, shot, sc) for orig_idx, shot, sc in flat_shots
                   if orig_idx not in to_move]
        moving = [(orig_idx, shot, sc) for orig_idx, shot, sc in flat_shots
                  if orig_idx in to_move]

        # Insert each moved shot after its target position
        for orig_idx, shot, sc in moving:
            target = moves[orig_idx]
            # Find insertion point: after the shot with original index == target
            insert_pos = 0
            if target >= 0:
                for i, (stay_idx, _, _) in enumerate(staying):
                    if stay_idx == target:
                        insert_pos = i + 1
                        break
                    # If target not found (removed), append to the position after
                    # the closest preceding shot
                    if stay_idx < target:
                        insert_pos = i + 1
            # Determine scene from target position
            if insert_pos < len(staying):
                sc = staying[insert_pos][2]
            elif staying:
                sc = staying[-1][2]
            staying.insert(insert_pos, (orig_idx, shot, sc))

        flat_shots = staying

    # Step 3: Rebuild scenes from flat list
    scene_shots: dict[int, list[Shot]] = {}
    for _, shot, scene_idx in flat_shots:
        scene_shots.setdefault(scene_idx, []).append(shot)

    new_scenes = []
    for scene_idx, scene in enumerate(chapter_scene.scenes):
        shots = scene_shots.get(scene_idx, [])
        if shots:
            new_scenes.append(type(scene)(
                setting=scene.setting,
                description=scene.description,
                shots=shots,
            ))

    # Step 4: Re-index all sentences
    idx = 0
    for scene in new_scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sent.sentence_index = idx
                idx += 1

    return ChapterScene(chapter=chapter_scene.chapter, scenes=new_scenes)
