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
- Write in third person about the protagonist by name (e.g. "Maria lleva…").
- Each sentence must advance the story: action, reaction, thought, or direct dialogue.
- Consecutive sentences within a shot must connect — avoid repeating the same idea.
- Include vivid color and size vocabulary: "una maleta roja enorme". Match the cartoon style.
- Include emotions and small narrative details (smells, sounds) where natural.

## CEFR grammar constraints (strictly enforced)
Apply these rules based on the chapter's CEFR level:

**A1** — Max 8 words per sentence. Simple present tense only. \
Subject + verb + object. No subordinate clauses (avoid: que, porque, cuando, si). \
No indirect object pronouns (le, les). Use only vocabulary a beginner learns in their \
first two weeks of class. If in doubt, choose the simpler word.
Good A1 examples: "Maria abre la maleta." / "Ella tiene miedo." / "El taxi es rápido." \
/ "Maria lleva una maleta roja."

**A2** — Max 12 words. Simple past (pretérito indefinido) and imperfect (imperfecto) \
allowed. Basic connectors (pero, y, también, porque). Light use of common pronouns. \
One dependent clause at most. Reflexive verbs (levantarse, llamarse) encouraged.

**B1** — Up to 18 words. All indicative tenses freely used (present, past, future, \
conditional). Relative clauses (que, donde, quien). Object pronouns (lo, la, le, se). \
Expressions of frequency/duration. Subjunctive only in fixed phrases (ojalá, quizás).
Good B1 examples: "Le dijo que la ciudad le parecía enorme." / "Cuando llegó al \
mercado, ya había cerrado." / "Prefiere ir en subte porque es más rápido."

**B2** — Up to 25 words. Full subjunctive freely used (querer que, esperar que, \
dudar que). Complex conditionals (si hubiera…). Passive voice occasionally. \
Abstract vocabulary, idiomatic expressions, nuanced connectors (sin embargo, a pesar \
de, dado que). Rich descriptions, implied emotion, cultural references.

## Direct dialogue (mandatory)
Whenever two or more characters share a scene, at least 1 in 3 sentences MUST be \
direct quoted speech using «guillemets». Format exactly like this:
  «¡Hola!», dice el conductor.
  «¿Adónde vas?», pregunta él.
  «Voy a Buenos Aires», responde Maria.
NEVER use reported speech ("Ella dice que...", "Él pregunta adónde...", \
"Maria responde con una sonrisa"). Show the words, not the description of words.

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
If {protagonist_name} is NOT in the shot (pure object close-up), omit PROTAGONIST.

## Secondary character consistency
When any named secondary character appears in a shot's image_prompt, write their \
name in ALL CAPS (e.g. SOFIA, LUCAS, ROBERTO). Do NOT describe their appearance — \
post-processing will replace the name with the canonical visual tag. Example:
  image_prompt: "Close-up of PROTAGONIST and SOFIA sharing mate on a park bench."
If a secondary character is NOT in the shot, do not mention them."""


def _build_system_prompt(config: DeckConfig) -> str:
    p = config.protagonist
    return _SYSTEM_PROMPT_TEMPLATE.format(
        protagonist_name=p.name,
        protagonist_visual_tag=p.visual_tag,
    )


def _extract_all_sentences(chapter_data: ChapterScene) -> list[str]:
    """Extract all source sentences from a chapter in order."""
    sentences = []
    for scene in chapter_data.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences.append(sent.source)
    return sentences


def _generate_summary(chapter_data: ChapterScene, llm: LLMClient) -> str:
    """Generate a concise chapter summary via LLM for cross-chapter continuity."""
    sentences = _extract_all_sentences(chapter_data)
    if not sentences:
        return ""

    sentences_text = "\n".join(f"  - {s}" for s in sentences)
    settings = [scene.setting.replace("_", " ") for scene in chapter_data.scenes]

    prompt = (
        f"Summarize this chapter in 2-3 sentences for continuity with the next chapter.\n"
        f"Focus on: what happened, character relationships, key objects/places, "
        f"emotional state, and any unresolved plot threads.\n\n"
        f"Settings: {', '.join(dict.fromkeys(settings))}\n"
        f"Sentences:\n{sentences_text}\n\n"
        f"Write a plain text summary (no JSON, no bullet points)."
    )

    response = llm.complete(prompt, system="You are a story continuity assistant. Write concise summaries.")
    return response.content.strip()


def _format_vocab_plan(vocabulary_plan) -> str:
    """Format vocabulary plan for injection into the chapter prompt."""
    if not vocabulary_plan:
        return ""
    parts = []
    if vocabulary_plan.mandatory_words:
        words_str = ", ".join(vocabulary_plan.mandatory_words)
        parts.append(
            f"\n\nMANDATORY vocabulary — you MUST use each of these words "
            f"in at least one sentence: {words_str}\n"
            f"These are high-frequency words critical for the learner. "
            f"Weave them naturally into the story."
        )
    if vocabulary_plan.teaching_scenes:
        parts.append("\n\nAdditional scene suggestions (incorporate naturally):")
        for scene_desc in vocabulary_plan.teaching_scenes:
            parts.append(f"\n- {scene_desc}")
    return "".join(parts)


def _build_chapter_prompt(
    config: DeckConfig,
    chapter_index: int,
    previous_summaries: list[str] | None = None,
    vocabulary_plan=None,  # VocabularyPlan or None
) -> str:
    chapter = config.story.chapters[chapter_index]
    p = config.protagonist
    d = config.destination
    min_sentences, max_sentences = config.story.sentences_per_chapter

    vocab_str = ", ".join(chapter.vocab_focus)

    # Secondary characters for this chapter (1-indexed) — MANDATORY presence
    secondary_section = ""
    for sc in config.secondary_characters:
        if (chapter_index + 1) in sc.chapters:
            secondary_section += f"\n- {sc.name}: MUST appear in at least one scene and speak at least one line of dialogue. Visual tag: {sc.visual_tag}"
    if secondary_section:
        secondary_section = (
            "\n\nMANDATORY characters in this chapter "
            "(each MUST appear in at least one shot and speak at least once):"
            + secondary_section
        )

    effective_cefr = chapter.cefr_level or config.story.cefr_level

    story_so_far = ""
    if previous_summaries:
        story_so_far = (
            "\n\nStory so far (maintain consistency with all details — "
            "object colors, character relationships, established facts):\n"
            + "\n".join(previous_summaries)
        )

    return f"""Write Chapter {chapter_index + 1}: "{chapter.title}"

Language: {config.languages.target} ({config.languages.dialect} dialect)
CEFR Level: {effective_cefr}
Length: {min_sentences}-{max_sentences} sentences total

Protagonist: {p.name} — {p.visual_tag}
Destination: {d.city}, {d.country}

Chapter context: {chapter.context}
Vocabulary focus: {vocab_str}{secondary_section}{story_so_far}{_format_vocab_plan(vocabulary_plan)}

Return the chapter as a JSON object with a "scenes" array following the format above.
Ensure sentence_index values are sequential starting from 0."""


def _post_process(chapter_data: ChapterScene, config: DeckConfig) -> ChapterScene:
    """Replace character placeholders in image prompts and sentence source text."""
    style = config.image_generation.style if config.image_generation else ""
    suffix = "no text, no writing, no letters."
    p = config.protagonist
    visual_tag = p.visual_tag

    for scene in chapter_data.scenes:
        for shot in scene.shots:
            # --- Image prompt: replace with visual_tag for image model ---
            raw = shot.image_prompt.strip()
            raw = raw.replace("PROTAGONIST", visual_tag)
            if p.name in raw and visual_tag not in raw:
                raw = raw.replace(p.name, f"{p.name} ({visual_tag})", 1)
            for sc in config.secondary_characters:
                name_upper = sc.name.upper()
                if name_upper in raw:
                    raw = raw.replace(name_upper, sc.visual_tag)
                elif sc.name in raw and sc.visual_tag not in raw:
                    raw = raw.replace(sc.name, f"{sc.name} ({sc.visual_tag})", 1)
            if raw.endswith("."):
                raw = raw[:-1]
            shot.image_prompt = f"{style}. {raw}. {suffix}"

            # --- Sentence source: replace with plain name for learners ---
            for sentence in shot.sentences:
                sentence.source = sentence.source.replace("PROTAGONIST", p.name)
                for sc in config.secondary_characters:
                    sentence.source = sentence.source.replace(sc.name.upper(), sc.name)

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

    def generate_chapter(self, chapter_index: int, previous_summaries: list[str] | None = None, vocabulary_plan=None) -> ChapterScene:
        path = self._chapter_path(chapter_index)

        # Skip if already generated (cached)
        if path.exists():
            data = json.loads(path.read_text())
            return ChapterScene(**data)

        prompt = _build_chapter_prompt(self._config, chapter_index, previous_summaries=previous_summaries, vocabulary_plan=vocabulary_plan)
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
        summaries = []

        for i in chapter_range:
            # Load cached summary if it exists (for already-generated chapters)
            summary_path = self._story_dir() / f"summary_{i + 1:02d}.txt"

            chapter = self.generate_chapter(i, previous_summaries=summaries if summaries else None)
            chapters.append(chapter)

            # Generate and cache summary
            if summary_path.exists():
                summary = summary_path.read_text()
            else:
                summary = _generate_summary(chapter, self._llm)
                summary_path.parent.mkdir(parents=True, exist_ok=True)
                summary_path.write_text(summary)

            summaries.append(f"Chapter {i + 1}: {summary}")

        return chapters
