"""Pass 4b: Per-chapter narrative audit after gap insertion.

Reviews each chapter individually for internal consistency issues
introduced by gap shot insertion. Can rewrite sentences or remove
shots as a last resort.
"""

from pydantic import BaseModel

from pipeline.models import ChapterScene, Shot, ShotSentence


class ChapterAuditAction(BaseModel):
    action: str  # "rewrite" or "remove_shot"
    sentence_index: int | None = None  # for rewrite
    shot_index: int | None = None  # for remove_shot
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
        char_lines.append(f"  - {c['name']}: {role}")
    char_block = "\n".join(char_lines) if char_lines else "  (none specified)"

    # Gap words that must survive
    gap_words_block = ""
    if gap_words:
        gap_words_block = (
            f"\nGAP WORDS (must survive in final text): {', '.join(gap_words)}\n"
        )

    # Full chapter content with shot and sentence indices
    content_lines = []
    shot_idx = 0
    for scene in chapter_scene.scenes:
        content_lines.append(f"  Scene: {scene.setting} — {scene.description}")
        for shot in scene.shots:
            content_lines.append(
                f"  [shot {shot_idx}] image: {shot.image_prompt}"
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
        f'- "remove_shot": delete a shot that cannot be salvaged (provide shot_index)\n\n'
        f"Use remove_shot ONLY as a last resort — prefer rewriting.\n\n"
        f"IMPORTANT: If you rewrite a sentence containing a gap word, the "
        f"rewritten sentence MUST still contain that word. Never remove a shot "
        f"that is the only source of a gap word.\n\n"
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
        f'      "action": "remove_shot",\n'
        f'      "shot_index": 3,\n'
        f'      "reason": "brief explanation"\n'
        f'    }}\n'
        f'  ]\n'
        f'}}\n\n'
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
    """Apply audit actions to a ChapterScene. Returns a new ChapterScene."""
    if not actions:
        return chapter_scene

    # Collect shot indices to remove
    remove_shots = {
        a.shot_index for a in actions
        if a.action == "remove_shot" and a.shot_index is not None
    }

    # Collect sentence rewrites: sentence_index → fixed text
    rewrites: dict[int, str] = {}
    for a in actions:
        if a.action == "rewrite" and a.sentence_index is not None:
            rewrites[a.sentence_index] = a.fixed

    # Rebuild scenes, applying rewrites and removing shots
    new_scenes = []
    shot_idx = 0
    for scene in chapter_scene.scenes:
        new_shots = []
        for shot in scene.shots:
            if shot_idx in remove_shots:
                shot_idx += 1
                continue

            new_sentences = []
            for sent in shot.sentences:
                source = rewrites.get(sent.sentence_index, sent.source)
                new_sentences.append(ShotSentence(
                    source=source, sentence_index=-1,
                ))
            new_shots.append(Shot(
                focus=shot.focus,
                image_prompt=shot.image_prompt,
                sentences=new_sentences,
            ))
            shot_idx += 1

        new_scenes.append(type(scene)(
            setting=scene.setting,
            description=scene.description,
            shots=new_shots,
        ))

    # Re-index all sentences
    idx = 0
    for scene in new_scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sent.sentence_index = idx
                idx += 1

    return ChapterScene(chapter=chapter_scene.chapter, scenes=new_scenes)
