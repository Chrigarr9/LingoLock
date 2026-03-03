"""Pass 4: Generate image prompts for each sentence using the full story context."""

import json
from dataclasses import dataclass
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.models import ImagePrompt


SYSTEM_PROMPT = """\
You are a visual scene designer for a language learning app. Given a story and its \
sentences, create a vivid image prompt for EVERY sentence that will help learners \
remember the vocabulary through visual association.

You categorize each sentence as either:
- "character_scene": The protagonist is visible in the image. Use when the protagonist \
is performing an action, speaking, or present in the scene.
- "scene_only": The protagonist is NOT in the frame. Use for establishing shots, \
object close-ups, or environmental scenes.

Write prompts in English. Be specific about visual details: actions, expressions, \
environment, lighting. Do NOT include text or words in the images."""


@dataclass
class ImagePromptResult:
    protagonist_prompt: str
    style: str
    sentences: list[ImagePrompt]


class ImagePrompter:
    def __init__(self, config: DeckConfig, llm, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _output_path(self) -> Path:
        return self._output_base / self._config.deck.id / "image_prompts.json"

    def generate_prompts(
        self,
        stories: dict[int, str],
        translations: dict[int, list[dict]],
    ) -> ImagePromptResult:
        path = self._output_path()

        # Skip if already generated
        if path.exists():
            data = json.loads(path.read_text())
            return ImagePromptResult(
                protagonist_prompt=data["protagonist_prompt"],
                style=data.get("style", ""),
                sentences=[ImagePrompt(**s) for s in data["sentences"]],
            )

        prompt = self._build_prompt(stories, translations)
        result = self._llm.complete_json(prompt=prompt, system=SYSTEM_PROMPT)
        parsed = result.parsed

        # Parse into typed models
        sentences = [ImagePrompt(**s) for s in parsed["sentences"]]
        style = self._config.image_generation.style if self._config.image_generation else ""

        output = ImagePromptResult(
            protagonist_prompt=parsed["protagonist_prompt"],
            style=style,
            sentences=sentences,
        )

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        save_data = {
            "protagonist_prompt": output.protagonist_prompt,
            "style": output.style,
            "sentences": [s.model_dump() for s in sentences],
        }
        path.write_text(json.dumps(save_data, ensure_ascii=False, indent=2))

        return output

    def _build_prompt(
        self,
        stories: dict[int, str],
        translations: dict[int, list[dict]],
    ) -> str:
        p = self._config.protagonist
        style = self._config.image_generation.style if self._config.image_generation else ""

        # Build chapter context section
        chapter_sections = []
        for i in sorted(stories.keys()):
            ch = self._config.story.chapters[i]
            story_text = stories[i]

            trans_lines = []
            for t in translations.get(i, []):
                trans_lines.append(f'  [{t["sentence_index"]}] {t["source"]} → {t["target"]}')
            trans_block = "\n".join(trans_lines) if trans_lines else "  (no translations available)"

            chapter_sections.append(
                f"### Chapter {i + 1}: {ch.title}\n"
                f"Context: {ch.context}\n\n"
                f"Story:\n{story_text}\n\n"
                f"Sentences:\n{trans_block}"
            )

        chapters_text = "\n\n".join(chapter_sections)

        return f"""Create image prompts for a language learning story.

## Protagonist
Name: {p.name}
Gender: {p.gender}
Origin: {p.origin_city}, {p.origin_country}
Visual description: {p.description}

## Art Style
{style}

## Story
{chapters_text}

## Instructions
Return a JSON object with:
- "protagonist_prompt": A portrait description of {p.name} for generating a character reference image. Include their visual description and a neutral pose.
- "sentences": An array with one entry per sentence (in order). Each entry has:
  - "chapter": chapter number (1-indexed)
  - "sentence_index": sentence index within chapter (0-indexed)
  - "source": the original sentence
  - "image_type": "character_scene" or "scene_only"
  - "characters": list of characters visible (use "protagonist" for {p.name}, or descriptive names for secondary characters)
  - "prompt": English visual description for image generation. Be specific about actions, expressions, environment. Do NOT include any text/words in the image.
  - "setting": a short snake_case tag for the location (reuse same tag for recurring locations)

IMPORTANT: Generate a prompt for EVERY sentence. No skipping."""
