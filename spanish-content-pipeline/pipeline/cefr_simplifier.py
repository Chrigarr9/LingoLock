"""Pass 1 (CEFR simplification): Simplify raw story chapters to target CEFR level."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.llm import LLMClient, LLMResponse
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence


_CEFR_CONSTRAINTS = {
    "A1": (
        "**A1** — Max 12 words per sentence. Simple present tense only (ser, estar, hay, "
        "tener, ir + regular verbs). Subject + verb + object. "
        "No subordinate clauses (avoid: que, porque, cuando, si). "
        "No indirect object pronouns (le, les). No subjunctive, no compound tenses, "
        "no future tense, no imperatives, no preterite, no imperfecto.\n"
        'Good A1 examples: "Maria abre la maleta amarilla en el suelo." / '
        '"Ella tiene un poco de miedo." / "El taxi rojo es muy rápido." / '
        '"Ingrid dobla una camisa de algodón suave."'
    ),
    "A2": (
        "**A2** — Max 12 words. Simple past (pretérito indefinido) and imperfect (imperfecto) "
        "allowed. Basic connectors (pero, y, también, porque). Light use of common pronouns. "
        "One dependent clause at most. Reflexive verbs (levantarse, llamarse) encouraged. "
        "No subjunctive, no compound tenses, no future tense."
    ),
    "B1": (
        "**B1** — Up to 18 words. All indicative tenses freely used (present, past, future, "
        "conditional). Relative clauses (que, donde, quien). Object pronouns (lo, la, le, se). "
        "Expressions of frequency/duration. Subjunctive only in fixed phrases (ojalá, quizás).\n"
        'Good B1 examples: "Le dijo que la ciudad le parecía enorme." / "Cuando llegó al '
        'mercado, ya había cerrado." / "Prefiere ir en subte porque es más rápido."'
    ),
    "B2": (
        "**B2** — Up to 25 words. Full subjunctive freely used (querer que, esperar que, "
        "dudar que). Complex conditionals (si hubiera…). Passive voice occasionally. "
        "Idiomatic expressions, nuanced connectors (sin embargo, a pesar "
        "de, dado que). Rich descriptions, implied emotion, cultural references."
    ),
}

# Map compound levels like "A1-A2" to the higher one for simplification
_LEVEL_MAP = {
    "A1": "A1",
    "A2": "A2",
    "B1": "B1",
    "B2": "B2",
    "A1-A2": "A2",
    "A2-B1": "B1",
    "B1-B2": "B2",
}


def _resolve_cefr_level(raw_level: str) -> str:
    """Resolve a CEFR level string to a single level for constraint lookup."""
    return _LEVEL_MAP.get(raw_level, raw_level.split("-")[-1] if "-" in raw_level else raw_level)


def _build_system_prompt(cefr_level: str, narration_style: str, dialect: str) -> str:
    resolved = _resolve_cefr_level(cefr_level)
    constraint_block = _CEFR_CONSTRAINTS.get(resolved, _CEFR_CONSTRAINTS["A2"])

    narration_rule = (
        "Maintain third-person narration throughout."
        if narration_style == "third-person"
        else "Maintain first-person narration throughout."
    )

    return f"""\
You are a CEFR-level grammar simplifier for Spanish ({dialect} dialect).

Your task: take an existing chapter of a Spanish story and simplify the GRAMMAR and \
SENTENCE LENGTH of every sentence to match the {cefr_level} level. Focus on grammar — \
keep the story's content, meaning, and richness intact.

## CEFR grammar constraints (strictly enforced)
{constraint_block}

## What you MUST preserve
- Character names AND relationships (e.g. "su madre Ingrid" must stay, not become just "Ingrid")
- Dialogue: who says what, the meaning, direct speech with «guillemets»
- Plot information: where characters go, why, what they do
- Descriptions: colors, materials, sizes, emotions ("maleta amarilla", "camisa de algodón suave")
- Scene context: if someone is nervous, at an airport, packing — keep that information

## What you CAN change
- Verb tenses: convert to tenses allowed at {cefr_level}
- Sentence structure: break complex sentences into shorter ones
- Remove subordinate clauses by splitting into separate sentences
- Simplify function words (prepositions, conjunctions) if needed
- Replace multi-word technical terms with simpler equivalents that convey the same meaning \
(e.g. "cinta transportadora" → "cinta", "indicaciones luminosas" → "señales", \
"rayos X" → "máquina de seguridad"). Single concrete nouns (colors, objects, places, \
emotions) should stay even if advanced.

## Writing style
- Use natural pronoun variation. Do NOT start every sentence with the character's name. \
Use "ella/él" or implicit subjects where the referent is clear from context. \
Only repeat the name when the subject changes or after 3+ sentences.
- TENSE CONSISTENCY: If the narrative uses past tense, dialogue tags MUST also use past \
tense ("dijo Maria", "preguntó Sofia", "respondió él"). Do NOT mix present-tense \
dialogue tags ("dice", "pregunta") into a past-tense narrative. Keep all tags in the \
same tense as the surrounding narration.

## Rules
- {narration_rule}
- Preserve direct dialogue with «guillemets». Dialogue can use simpler grammar but must \
keep the same meaning, speaker, and content words.
- You may split one complex sentence into two simpler sentences if needed to stay within \
the word limit. Never merge two sentences into one.
- Keep the same scene/shot structure. Same number of scenes, same number of shots per scene.
- Return a JSON object with the same structure: {{"scenes": [...]}}
- Each sentence must have "source" (simplified Spanish) and "sentence_index" (will be re-numbered later, \
but keep them sequential starting from 0).
- Do NOT change image_prompt, focus, setting, or description fields — return them as-is \
(they will be overwritten from the original anyway)."""


def _build_user_prompt(raw_chapter: ChapterScene, cefr_level: str) -> str:
    chapter_json = json.dumps(raw_chapter.model_dump(), ensure_ascii=False, indent=2)
    return f"""\
Simplify this chapter's grammar to CEFR level {cefr_level}.

Here is the raw chapter JSON:
{chapter_json}

Instructions:
- Simplify the GRAMMAR of each "source" field to match {cefr_level} constraints.
- Keep ALL vocabulary from the original. Do not replace words with simpler synonyms.
- Keep the same number of scenes and shots. You may add sentences (split complex ones) \
but never remove or merge sentences.
- Preserve all dialogue — simplify the grammar but keep the same meaning, speaker, and \
content words. Keep direct speech with «guillemets».
- Preserve character relationships (e.g. "su madre Ingrid" not just "Ingrid").
- Return the full JSON with the same structure."""


def _overlay_raw_metadata(raw: ChapterScene, simplified: ChapterScene) -> ChapterScene:
    """Overlay image prompts, focus, setting, description from raw onto simplified.

    Walks raw and simplified scenes/shots in parallel. Takes sentences from simplified
    but restores all visual metadata from raw. Re-numbers sentence_index sequentially.
    """
    result_scenes = []
    sentence_counter = 0

    for raw_scene, simp_scene in zip(raw.scenes, simplified.scenes):
        result_shots = []
        for raw_shot, simp_shot in zip(raw_scene.shots, simp_scene.shots):
            # Take sentences from simplified, but re-number
            renumbered = []
            for sent in simp_shot.sentences:
                renumbered.append(ShotSentence(
                    source=sent.source,
                    sentence_index=sentence_counter,
                ))
                sentence_counter += 1

            result_shots.append(Shot(
                focus=raw_shot.focus,
                image_prompt=raw_shot.image_prompt,
                sentences=renumbered,
            ))

        result_scenes.append(Scene(
            setting=raw_scene.setting,
            description=raw_scene.description,
            shots=result_shots,
        ))

    return ChapterScene(
        chapter=raw.chapter,
        scenes=result_scenes,
    )


class CEFRSimplifier:
    def __init__(self, config: DeckConfig, llm: LLMClient, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _story_dir(self) -> Path:
        return self._output_base / self._config.deck.id / "stories"

    def _chapter_path(self, chapter_index: int) -> Path:
        return self._story_dir() / f"chapter_{chapter_index + 1:02d}.json"

    def simplify_chapter(self, chapter_index: int, raw_chapter: ChapterScene) -> tuple[ChapterScene, LLMResponse | None]:
        path = self._chapter_path(chapter_index)

        # Skip if already simplified (cached)
        if path.exists():
            data = json.loads(path.read_text())
            return ChapterScene(**data), None

        # Determine CEFR level
        chapter_def = self._config.story.chapters[chapter_index]
        cefr_level = chapter_def.cefr_level or self._config.story.cefr_level
        narration_style = getattr(self._config.story, "narration_style", "third-person")
        dialect = self._config.languages.dialect

        system = _build_system_prompt(cefr_level, narration_style, dialect)
        user = _build_user_prompt(raw_chapter, cefr_level)

        result = self._llm.complete_json(user, system=system)
        parsed = result.parsed

        # Build ChapterScene from LLM response
        simplified = ChapterScene(
            chapter=raw_chapter.chapter,
            scenes=[
                Scene(
                    setting=s.get("setting", ""),
                    description=s.get("description", ""),
                    shots=[
                        Shot(
                            focus=sh.get("focus", ""),
                            image_prompt=sh.get("image_prompt", ""),
                            sentences=[
                                ShotSentence(
                                    source=sent.get("source", sent.get("text", "")),
                                    sentence_index=sent.get("sentence_index", 0),
                                )
                                for sent in sh["sentences"]
                            ],
                        )
                        for sh in s["shots"]
                    ],
                )
                for s in parsed["scenes"]
            ],
        )

        # Overlay: restore image prompts and metadata from raw input
        chapter_data = _overlay_raw_metadata(raw_chapter, simplified)

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(chapter_data.model_dump(), ensure_ascii=False, indent=2))

        return chapter_data, result
