"""Pass 8: Two-step image pipeline.

Step 1 — Scene Review (one call per chapter):
  Restructures shots so each has max 2 sentences, verifies focus variety.

Step 2 — Prompt Generation (one call per chapter):
  Generates <200-char image prompts for all shots.
"""

from pydantic import BaseModel

from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


# ── Models ──────────────────────────────────────────────────────────────


class ReviewedShot(BaseModel):
    """A shot in the reviewed scene structure."""
    focus: str
    sentence_indices: list[int]


class ReviewedScene(BaseModel):
    """A scene with reviewed shot structure."""
    setting: str
    shots: list[ReviewedShot]


class ShotPrompt(BaseModel):
    """Generated image prompt for a specific shot."""
    scene_index: int
    shot_index: int
    prompt: str


# ── Step 1: Scene Review ────────────────────────────────────────────────


def _build_scene_review_prompt(chapter: ChapterScene) -> tuple[str, str]:
    """Build system + user prompt for scene review."""
    system = (
        "You are a visual editor reviewing shot structure for a graded reader app. "
        "Each shot pairs an illustration with 1-2 sentences. Return valid JSON."
    )

    lines = [f"Review the shot structure for chapter {chapter.chapter}.\n"]
    lines.append("RULES:")
    lines.append("- Each shot MUST have 1-2 sentences (maximum 2)")
    lines.append("- Shots with 3+ sentences MUST be split into separate shots")
    lines.append("- Each shot focuses on ONE clear visual moment")
    lines.append("- Vary focus across consecutive shots — no three close-ups of the same subject")
    lines.append("- Maintain scene boundaries — do NOT move sentences between scenes")
    lines.append("")

    for si, scene in enumerate(chapter.scenes):
        lines.append(f"Scene {si}: {scene.setting}")
        lines.append(f"  {scene.description}")
        for hi, shot in enumerate(scene.shots):
            indices = [s.sentence_index for s in shot.sentences]
            lines.append(
                f"  Shot [{si}:{hi}] focus=\"{shot.focus}\" "
                f"sentences={indices}"
            )
            for sent in shot.sentences:
                lines.append(f"    \"{sent.source}\"")
        lines.append("")

    lines.append("Return:")
    lines.append("{")
    lines.append('  "scenes": [')
    lines.append("    {")
    lines.append('      "setting": "scene_setting",')
    lines.append('      "shots": [')
    lines.append('        {"focus": "descriptive focus", "sentence_indices": [0, 1]},')
    lines.append('        {"focus": "another focus", "sentence_indices": [2]}')
    lines.append("      ]")
    lines.append("    }")
    lines.append("  ]")
    lines.append("}")

    return system, "\n".join(lines)


def review_scenes(
    chapter: ChapterScene,
    llm=None,
) -> tuple[list[ReviewedScene], object]:
    """Review and restructure shots in a chapter. Returns (reviewed_scenes, LLMResponse)."""
    if llm is None:
        return [], None

    system, prompt = _build_scene_review_prompt(chapter)
    response = llm.complete_json(prompt, system=system)
    parsed = response.parsed
    if isinstance(parsed, list):
        parsed = {"scenes": parsed}

    scenes = []
    for raw_scene in parsed.get("scenes", []):
        shots = []
        for raw_shot in raw_scene.get("shots", []):
            shots.append(ReviewedShot(
                focus=raw_shot["focus"],
                sentence_indices=raw_shot["sentence_indices"],
            ))
        scenes.append(ReviewedScene(
            setting=raw_scene.get("setting", ""),
            shots=shots,
        ))

    return scenes, response


def apply_scene_review(
    chapter: ChapterScene,
    reviewed: list[ReviewedScene],
) -> ChapterScene:
    """Rebuild chapter shots according to scene review results."""
    # Build sentence lookup: sentence_index → ShotSentence
    all_sentences: dict[int, ShotSentence] = {}
    for scene in chapter.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                all_sentences[sent.sentence_index] = sent

    new_scenes = []
    for ri, reviewed_scene in enumerate(reviewed):
        original = chapter.scenes[ri] if ri < len(chapter.scenes) else chapter.scenes[-1]
        new_shots = []
        for reviewed_shot in reviewed_scene.shots:
            sentences = [
                all_sentences[idx]
                for idx in reviewed_shot.sentence_indices
                if idx in all_sentences
            ]
            new_shots.append(Shot(
                focus=reviewed_shot.focus,
                image_prompt="",  # filled by generate_prompts
                sentences=sentences,
            ))
        new_scenes.append(Scene(
            setting=original.setting,
            description=original.description,
            shots=new_shots,
        ))

    return ChapterScene(chapter=chapter.chapter, scenes=new_scenes)


# ── Step 2: Prompt Generation ───────────────────────────────────────────


def _build_prompt_generation_prompt(
    chapter: ChapterScene,
    characters: list[dict],
) -> tuple[str, str]:
    """Build system + user prompt for image prompt generation."""
    system = (
        "You are an image prompt writer for a language learning storybook. "
        "Write concise, visual descriptions for cartoon illustrations. "
        "Return valid JSON."
    )

    char_lines = []
    for c in characters:
        tag = c.get("image_tag") or c.get("visual_tag", "")
        name = c.get("name", "")
        placeholder = "PROTAGONIST" if c.get("role") == "protagonist" else name.upper()
        if tag:
            char_lines.append(f"  {placeholder}: {name} — {tag}")
    char_block = "\n".join(char_lines) if char_lines else "  (none)"

    lines = [f"Write an image prompt for each shot in chapter {chapter.chapter}.\n"]
    lines.append(f"CHARACTERS (use EXACT placeholder names in ALL CAPS):\n{char_block}\n")

    for si, scene in enumerate(chapter.scenes):
        lines.append(f"Scene {si}: {scene.setting} — {scene.description}")
        for hi, shot in enumerate(scene.shots):
            texts = " | ".join(s.source for s in shot.sentences)
            lines.append(f"  Shot [{si}:{hi}] focus=\"{shot.focus}\"")
            lines.append(f"    Sentences: {texts}")
        lines.append("")

    lines.append("RULES:")
    lines.append("- Describe what is VISIBLE: environment, focal object, character actions")
    lines.append("- Exaggerate focal objects: oversized, vivid colors, bold shapes")
    lines.append("- Use PROTAGONIST for the protagonist, CHARACTER_NAME (ALL CAPS) for others")
    lines.append("- Prefer close-up and medium shots, avoid wide/establishing shots")
    lines.append("- NO text, labels, signs, or writing in the image")
    lines.append("- NO art style prefixes or suffixes — added later")
    lines.append("- Each prompt MUST be under 200 characters")
    lines.append("")
    lines.append("Return:")
    lines.append("{")
    lines.append('  "prompts": [')
    lines.append('    {"scene_index": 0, "shot_index": 0, "prompt": "Close-up of ..."},')
    lines.append('    {"scene_index": 0, "shot_index": 1, "prompt": "Medium shot of ..."}')
    lines.append("  ]")
    lines.append("}")

    return system, "\n".join(lines)


def generate_prompts(
    chapter: ChapterScene,
    characters: list[dict],
    llm=None,
) -> tuple[list[ShotPrompt], object]:
    """Generate image prompts for all shots in a chapter. Returns (prompts, LLMResponse)."""
    if llm is None:
        return [], None

    system, prompt = _build_prompt_generation_prompt(chapter, characters)
    response = llm.complete_json(prompt, system=system)
    parsed = response.parsed
    if isinstance(parsed, list):
        parsed = {"prompts": parsed}

    prompts = []
    for raw in parsed.get("prompts", []):
        try:
            prompts.append(ShotPrompt(**raw))
        except Exception:
            continue

    return prompts, response


def apply_prompts(
    chapter: ChapterScene,
    prompts: list[ShotPrompt],
) -> ChapterScene:
    """Set image_prompt on each shot from generated prompts."""
    prompt_map = {(p.scene_index, p.shot_index): p.prompt for p in prompts}
    for si, scene in enumerate(chapter.scenes):
        for hi, shot in enumerate(scene.shots):
            key = (si, hi)
            if key in prompt_map:
                shot.image_prompt = prompt_map[key]
    return chapter
