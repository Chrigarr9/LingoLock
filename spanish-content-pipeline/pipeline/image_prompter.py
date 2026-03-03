"""Pass 4: Generate image prompts for each sentence using the full story context."""

import json
import re
from dataclasses import dataclass
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.models import ImagePrompt


# Matches chapter title lines like "Capítulo 1: Preparación" or "Chapter 2: Arrival"
_CHAPTER_TITLE_RE = re.compile(r"^(Capítulo|Chapter)\s+\d+\s*:", re.IGNORECASE)


def _is_chapter_title(source: str) -> bool:
    return bool(_CHAPTER_TITLE_RE.match(source.strip()))


SYSTEM_PROMPT = """\
You are a visual scene designer for a language learning app. Given a story with \
sentences and their KEY VOCABULARY, create an image prompt for each sentence \
that helps learners remember the vocabulary through visual association.

## Character Consistency — CRITICAL
You will be given a VISUAL_TAG for the protagonist and for any secondary characters. \
When a character appears in a scene, you MUST include their VISUAL_TAG phrase exactly \
as given. Do not abbreviate, rephrase, or drop any part of it. This is the ONLY way \
to keep characters looking consistent across all images.

When showing unnamed/background people, describe them by HAIR, CLOTHING, and BODY TYPE. \
Do not describe facial features in detail for anyone.

## Composition
- Show characters as part of a rich environment — not isolated portraits.
- Frame as medium or wide shots. Mix angles across the chapter.
- Two people together in person is fine. Phone calls: just show the caller's side.

## Vocabulary — EXAGGERATE
Make the key vocabulary object dramatically prominent — oversized, brightly lit, \
central. Think picture book: a suitcase that fills half the room, shoes towering \
over furniture, clothes flying into a bag.

## Shared Images
If consecutive sentences describe the same moment with little visual difference, \
they CAN share the same image. Set the "prompt" to the EXACT same text for both. \
Only do this for 2-3 sentences max. Most sentences should have unique images.

## Variety
Every UNIQUE image in the chapter must look clearly different from all others — \
different subject, angle, color palette, framing. The set should feel like a \
picture book storyboard when viewed as thumbnails.

## Bans
- No text, labels, signs, or writing of any kind in images.
- No split/side-by-side/multi-panel compositions. One scene, one viewpoint.
- No "panoramic", "skyline", "iconic", "bustling" — these go photorealistic.
- No isolated portraits (head-and-shoulders with blank background).
- Two places mentioned → pick ONE, show it as a single scene.

## Prompt Length
Keep each prompt under 250 characters after the style prefix. \
Describe one clear scene simply. Do not over-describe.

Write prompts in English. Be specific but concise."""


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
        words: dict[int, list[dict]] | None = None,
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

        prompt = self._build_prompt(stories, translations, words)
        result = self._llm.complete_json(prompt=prompt, system=SYSTEM_PROMPT)
        parsed = result.parsed

        # Parse into typed models, filtering out any chapter title sentences
        sentences = [
            ImagePrompt(**s) for s in parsed["sentences"]
            if not _is_chapter_title(s.get("source", ""))
        ]
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
        words: dict[int, list[dict]] | None = None,
    ) -> str:
        p = self._config.protagonist
        style = self._config.image_generation.style if self._config.image_generation else ""
        words = words or {}

        # Build chapter context section
        chapter_sections = []
        for i in sorted(stories.keys()):
            ch = self._config.story.chapters[i]
            story_text = stories[i]
            ch_words = words.get(i, [])

            trans_lines = []
            for t in translations.get(i, []):
                sentence_src = t["source"]
                # Skip chapter title sentences (e.g. "Capítulo 1: Preparación")
                if _is_chapter_title(sentence_src):
                    continue
                # Find vocabulary words that appear in this sentence (deduplicated)
                seen = set()
                matched = []
                for w in ch_words:
                    key = w["source"].lower()
                    if (
                        key in sentence_src.lower()
                        and w["pos"] in ("noun", "verb", "adjective")
                        and key not in seen
                    ):
                        seen.add(key)
                        matched.append(f'{w["source"]} ({w["pos"]}: {w["target"]})')
                vocab_str = f'  Vocab: {", ".join(matched)}' if matched else ""
                trans_lines.append(
                    f'  [{t["sentence_index"]}] {t["source"]} → {t["target"]}'
                    f'{vocab_str}'
                )
            trans_block = "\n".join(trans_lines) if trans_lines else "  (no translations available)"

            chapter_sections.append(
                f"### Chapter {i + 1}: {ch.title}\n"
                f"Context: {ch.context}\n\n"
                f"Story:\n{story_text}\n\n"
                f"Sentences:\n{trans_block}"
            )

        chapters_text = "\n\n".join(chapter_sections)

        visual_tag = p.visual_tag or p.description

        # Build secondary characters section
        secondary_chars = self._config.secondary_characters
        char_tags_section = ""
        if secondary_chars:
            lines = []
            for sc in secondary_chars:
                ch_list = ", ".join(str(c) for c in sc.chapters)
                lines.append(f"- {sc.name} (chapters {ch_list}): {sc.visual_tag}")
            char_tags_section = (
                "\n\n## Secondary Character VISUAL_TAGs\n"
                + "\n".join(lines)
                + "\nUse the exact VISUAL_TAG when these characters appear in their chapters."
            )

        return f"""Create image prompts for a language learning story. Think of it as a picture book storyboard.

## Protagonist
{p.name}: {p.description}

## VISUAL_TAG (use this EXACT phrase when {p.name} appears)
{visual_tag}{char_tags_section}

## Art Style (MUST start every prompt)
{style}

## Story
{chapters_text}

## Instructions
Return a JSON object with:
- "protagonist_prompt": A portrait description of {p.name} ({p.description}) for reference. \
Start with the style prefix.
- "sentences": An array with one entry per sentence listed above. Each entry has:
  - "chapter": chapter number (1-indexed)
  - "sentence_index": sentence index within chapter (0-indexed)
  - "source": the original sentence
  - "image_type": always "scene_only"
  - "characters": always empty list []
  - "prompt": Start with "{style}." then describe the scene. When {p.name} is visible, \
include their VISUAL_TAG ("{visual_tag}") in the prompt — do NOT abbreviate it. \
When secondary characters appear, include their VISUAL_TAG too. \
Show characters within their environment. Make vocabulary objects prominent. \
NEVER include text/labels. NEVER split layouts. \
End every prompt with "no text, no writing, no letters."
  - "setting": a short snake_case tag for the location

RULES:
1. Generate a prompt for EVERY sentence listed above — no skipping.
2. Every prompt starts with the art style string.
3. CHARACTER CONSISTENCY: When {p.name} appears, always include their VISUAL_TAG \
("{visual_tag}") — never shorten to just a name or "slim". When secondary characters \
appear, use their VISUAL_TAG exactly. This is critical for visual consistency.
4. Show characters IN their environment — medium/wide shots, never isolated portraits.
5. Vocabulary objects should be clearly visible and well-placed in the scene.
6. Phone calls: show only the caller's side (their room, the phone, the window). \
Never show both callers together.
7. Two people in the same image are fine IF they are physically together in the story.
8. No text, writing, labels, signs, books with visible pages, or newspapers. \
No multi-panel/split layouts.
9. Two places mentioned → pick ONE, show it as a single scene.
10. NEVER use "split", "side by side", "panoramic", "skyline" in any prompt.
11. VARIETY across the ENTIRE chapter: every image must feel distinct from ALL \
others in the chapter — not just its neighbors. Vary SUBJECT, ANGLE, COLOR PALETTE, \
and FRAMING throughout.
12. EXAGGERATE the key vocabulary object — make it comically large, dramatically \
lit, or impossibly prominent. This is a cartoon, not a photograph.
13. Every prompt MUST end with the phrase: no text, no writing, no letters."""
