"""Pass 1 (scene-first): Generate story chapters as scenes/shots/sentences with image prompts."""

import json
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.llm import LLMClient
from pipeline.models import ChapterScene, ImageManifest, ImagePrompt, Scene, Shot, ShotSentence


_SYSTEM_PROMPT_TEMPLATE = """\
You are both a storyteller and a film director creating a chapter of an illustrated \
language learning story.

## Two jobs at once
1. STORY: Write natural, flowing narrative prose — as if from a short story or novel. \
   Sentences tell the story from the protagonist's perspective, with her thoughts, \
   feelings, actions, and dialogue. They must flow naturally from one to the next. \
   They must NOT read like isolated image captions or vocabulary drills.
2. VISUAL: Organise those sentences into shots (camera setups) so an illustrator \
   knows exactly what to draw for each group of sentences.

## Output Format
Return a JSON object with a "scenes" array. Each scene has:
- "setting": snake_case location tag (e.g. "maria_bedroom_berlin")
- "description": 1-2 sentence description of the environment (lighting, objects, mood)
- "shots": array of camera shots within this scene

Each shot has:
- "focus": what the camera focuses on (a specific object or action, e.g. "red suitcase", \
"blue jeans", "phone screen")
- "image_prompt": English description of what's visible in this shot. Describe:
  - The environment (from the scene description)
  - The focal object/action — exaggerate size, color, and expression like a children's \
picture book. E.g. "a HUGE bright-red suitcase overflowing with clothes", "vivid cobalt-blue \
jeans held up dramatically". Make the key object impossible to miss.
  - Any characters present (describe by role and appearance, e.g. "a young woman \
with light-brown hair")
  - Camera angle: prefer close-up or medium shots. Avoid wide/establishing shots.
  Do NOT include art style prefixes or "no text" suffixes — these are added later.
  Keep under 200 characters.
- "sentences": array of 1-2 sentences for this shot. Each has:
  - "source": EXACTLY ONE sentence in the target language — one subject-verb pair, \
one terminating punctuation mark. Never combine two sentences into one source field.
  - "sentence_index": sequential 0-based index across ALL scenes in the chapter

## Sentence rules (most important)
- ONE grammatical sentence per "source" field. End with ONE period, exclamation mark, or \
question mark. Never write "Sentence one. Sentence two." in a single source — split into \
two separate sentences with their own sentence_index.
- Write in third person about the protagonist by name (e.g. "Maria öffnet…").
- Sentences must read like a novel excerpt, not a textbook or caption.
- Each sentence should advance the story: action, reaction, thought, or dialogue.
- Consecutive sentences within a shot must connect — avoid repeating the same idea.
- Include vivid color and size vocabulary: "una maleta roja enorme", "unos pantalones \
azul brillante". Match the exaggerated cartoon style of the images.
- Include emotions, internal thoughts, and small narrative details (smells, sounds).
- Use simple vocabulary appropriate for the CEFR level, but keep a natural story rhythm.
- Dialogue is allowed and encouraged.

## Visual rules
1. Every shot MUST visually highlight 1-2 vocabulary words from the focus areas.
2. Consecutive shots MUST focus on different objects/angles for variety.
3. Use mostly close-up and medium shots. Wide/establishing shots: maximum 1 per chapter.
4. Exaggerate focal objects: oversized, saturated colors, bold shapes — picture-book energy.
5. Vary SUBJECT, ANGLE, and COLOR PALETTE across shots to avoid visual repetition.
6. Characters can be prominent when the scene calls for it.
5. Phone calls: show only the caller's side (their room, the phone).
6. No text, labels, signs, or writing of any kind in the image descriptions.
7. No split/side-by-side/multi-panel compositions. One scene, one viewpoint.
8. Two places mentioned → pick ONE, show it as a single scene.
9. Never use "panoramic", "skyline", "iconic", "bustling" — these go photorealistic.
10. sentence_index must be sequential starting from 0 with no gaps.

## Character consistency
The protagonist's exact visual tag is: {protagonist_visual_tag}
When {protagonist_name} appears in a shot's image_prompt, do NOT invent your own \
description. Write the word "PROTAGONIST" and nothing else for her appearance — \
post-processing will replace it with the canonical tag. Example:
  image_prompt: "Close-up of PROTAGONIST holding a red suitcase."
If {protagonist_name} is NOT in the shot (pure object close-up), omit PROTAGONIST."""


def _build_system_prompt(config: DeckConfig) -> str:
    p = config.protagonist
    return _SYSTEM_PROMPT_TEMPLATE.format(
        protagonist_name=p.name,
        protagonist_visual_tag=p.visual_tag,
    )


def _build_chapter_prompt(config: DeckConfig, chapter_index: int) -> str:
    chapter = config.story.chapters[chapter_index]
    p = config.protagonist
    d = config.destination
    min_sentences, max_sentences = config.story.sentences_per_chapter

    landmarks_str = ", ".join(d.landmarks[:5])
    vocab_str = ", ".join(chapter.vocab_focus)

    # Secondary characters for this chapter (1-indexed)
    secondary_section = ""
    for sc in config.secondary_characters:
        if (chapter_index + 1) in sc.chapters:
            secondary_section += f"\nSecondary character: {sc.name} — {sc.visual_tag}"
    if secondary_section:
        secondary_section = "\n" + secondary_section

    return f"""Write Chapter {chapter_index + 1}: "{chapter.title}"

Language: {config.languages.target} ({config.languages.dialect} dialect)
CEFR Level: {config.story.cefr_level}
Length: {min_sentences}-{max_sentences} sentences total

Protagonist: {p.name} — {p.description}
Destination: {d.city}, {d.country}
Notable places: {landmarks_str}

Chapter context: {chapter.context}
Vocabulary focus: {vocab_str}{secondary_section}

Return the chapter as a JSON object with a "scenes" array following the format above.
Ensure sentence_index values are sequential starting from 0."""


def _post_process(chapter_data: ChapterScene, config: DeckConfig) -> ChapterScene:
    """Inject style prefix, character tag, and 'no text' suffix into image prompts."""
    style = config.image_generation.style if config.image_generation else ""
    suffix = "no text, no writing, no letters."
    p = config.protagonist
    visual_tag = p.visual_tag

    for scene in chapter_data.scenes:
        for shot in scene.shots:
            raw = shot.image_prompt.strip()

            # Replace LLM placeholder with canonical visual_tag
            raw = raw.replace("PROTAGONIST", visual_tag)

            # Safety net: if protagonist name appears but tag wasn't injected,
            # prepend the visual_tag so the image model gets a consistent anchor.
            if p.name in raw and visual_tag not in raw:
                raw = raw.replace(p.name, f"{p.name} ({visual_tag})", 1)

            # Remove any trailing period to avoid double-period
            if raw.endswith("."):
                raw = raw[:-1]
            shot.image_prompt = f"{style}. {raw}. {suffix}"

    return chapter_data


def extract_flat_text(chapter: ChapterScene) -> str:
    """Extract all sentences as a flat newline-separated string for the translator."""
    sentences = []
    for scene in chapter.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences.append((sent.sentence_index, sent.source))
    sentences.sort(key=lambda x: x[0])
    return "\n".join(source for _, source in sentences)


def extract_image_prompts(chapter: ChapterScene) -> list[ImagePrompt]:
    """Extract one ImagePrompt per SHOT, keyed to the first sentence.

    The image generator generates one image per shot. After generation,
    run_all.py calls expand_manifest_for_shared_shots() to add manifest
    entries for all other sentences in multi-sentence shots, pointing to
    the same image file.
    """
    prompts = []
    for scene in chapter.scenes:
        for shot in scene.shots:
            if not shot.sentences:
                continue
            first_sent = shot.sentences[0]
            prompts.append(
                ImagePrompt(
                    chapter=chapter.chapter,
                    sentence_index=first_sent.sentence_index,
                    source=first_sent.source,
                    image_type="scene_only",
                    characters=[],
                    prompt=shot.image_prompt,
                    setting=scene.setting,
                )
            )
    return prompts


def expand_manifest_for_shared_shots(
    manifest: ImageManifest,
    chapters: dict[int, ChapterScene],
) -> None:
    """Add manifest entries for sentences that share a shot with another sentence.

    For a shot with sentences [0, 1], if ch01_s00 has an image, this adds
    ch01_s01 pointing to the same file. Modifies manifest in place.
    """
    for chapter in chapters.values():
        ch = str(chapter.chapter).zfill(2)
        for scene in chapter.scenes:
            for shot in scene.shots:
                if len(shot.sentences) <= 1:
                    continue
                first_key = f"ch{ch}_s{str(shot.sentences[0].sentence_index).zfill(2)}"
                first_entry = manifest.images.get(first_key)
                if first_entry and first_entry.status == "success":
                    for sent in shot.sentences[1:]:
                        alias_key = f"ch{ch}_s{str(sent.sentence_index).zfill(2)}"
                        manifest.images[alias_key] = first_entry


class SceneStoryGenerator:
    def __init__(self, config: DeckConfig, llm: LLMClient, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _story_dir(self) -> Path:
        return self._output_base / self._config.deck.id / "stories"

    def _chapter_path(self, chapter_index: int) -> Path:
        return self._story_dir() / f"chapter_{chapter_index + 1:02d}.json"

    def generate_chapter(self, chapter_index: int) -> ChapterScene:
        path = self._chapter_path(chapter_index)

        # Skip if already generated (cached)
        if path.exists():
            data = json.loads(path.read_text())
            return ChapterScene(**data)

        prompt = _build_chapter_prompt(self._config, chapter_index)
        system = _build_system_prompt(self._config)
        result = self._llm.complete_json(prompt, system=system)
        parsed = result.parsed

        chapter_data = ChapterScene(
            chapter=chapter_index + 1,
            scenes=[
                Scene(
                    setting=s["setting"],
                    description=s["description"],
                    shots=[
                        Shot(
                            focus=sh["focus"],
                            image_prompt=sh["image_prompt"],
                            sentences=[ShotSentence(**sent) for sent in sh["sentences"]],
                        )
                        for sh in s["shots"]
                    ],
                )
                for s in parsed["scenes"]
            ],
        )

        # Post-process: inject style, visual_tags, suffixes
        chapter_data = _post_process(chapter_data, self._config)

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(chapter_data.model_dump(), ensure_ascii=False, indent=2))

        return chapter_data

    def generate_all(self, chapter_range: range | None = None) -> list[ChapterScene]:
        if chapter_range is None:
            chapter_range = range(self._config.chapter_count)

        chapters = []
        for i in chapter_range:
            chapter = self.generate_chapter(i)
            chapters.append(chapter)
        return chapters
