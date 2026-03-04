"""Pass 1 (scene-first): Generate story chapters as scenes/shots/sentences with image prompts."""

import json
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.llm import LLMClient
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


SYSTEM_PROMPT = """\
You are a film director creating a visual screenplay for a language learning app.
Think VISUALLY FIRST: imagine each scene as a location, then plan camera shots \
that highlight specific vocabulary words, then write sentences describing what's \
visible in each shot.

## Output Format
Return a JSON object with a "scenes" array. Each scene has:
- "setting": snake_case location tag (e.g. "maria_bedroom_berlin")
- "description": 1-2 sentence description of the environment (lighting, objects, mood)
- "shots": array of camera shots within this scene

Each shot has:
- "focus": what the camera focuses on (should highlight a vocabulary word)
- "image_prompt": English description of what's visible in this shot. Describe:
  - The environment (from the scene description)
  - The specific focal object/action (make it dramatically prominent — oversized, \
brightly lit, central, like a picture book)
  - Any characters present (describe by role and appearance, e.g. "a young woman \
with light-brown hair")
  - Camera angle and framing (mix wide, medium, and close-up across the chapter)
  Do NOT include art style prefixes or "no text" suffixes — these are added later.
  Keep under 200 characters.
- "sentences": array of 1-3 sentences for this shot. Each has:
  - "source": the sentence in the target language
  - "sentence_index": sequential 0-based index across ALL scenes in the chapter

## Rules
1. Every shot MUST visually highlight 1-2 vocabulary words from the focus areas.
2. Consecutive shots MUST focus on different objects/angles for variety.
3. Vary SUBJECT, ANGLE, COLOR PALETTE, and FRAMING across the whole chapter.
4. Characters can be prominent when the scene calls for it.
5. Phone calls: show only the caller's side (their room, the phone).
6. No text, labels, signs, or writing of any kind in the image descriptions.
7. No split/side-by-side/multi-panel compositions. One scene, one viewpoint.
8. Two places mentioned → pick ONE, show it as a single scene.
9. Never use "panoramic", "skyline", "iconic", "bustling" — these go photorealistic.
10. sentence_index must be sequential starting from 0 with no gaps."""


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
    """Inject style prefix, visual_tags, and 'no text' suffix into image prompts."""
    style = config.image_generation.style if config.image_generation else ""
    suffix = "no text, no writing, no letters."

    for scene in chapter_data.scenes:
        for shot in scene.shots:
            raw = shot.image_prompt.strip()
            # Remove any trailing period to avoid double-period
            if raw.endswith("."):
                raw = raw[:-1]
            shot.image_prompt = f"{style}. {raw}. {suffix}"

    return chapter_data


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
        result = self._llm.complete_json(prompt, system=SYSTEM_PROMPT)
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
