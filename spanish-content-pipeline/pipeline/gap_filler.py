"""Pass 3b: Gap-filling shot generation.

Two LLM calls:
  A) One assignment call: all missing words + all chapter summaries → word→chapter map.
  B) One generation call per chapter: existing shots + assigned words → new shots.

Both are cached to disk.
"""

import json
from pathlib import Path

from pipeline.coverage_checker import check_coverage
from pipeline.models import (
    ChapterScene, GapShot, OrderedDeck, SentencePair,
)


class GapFiller:
    """Generate gap-filling shots for missing high-frequency vocabulary.

    Args:
        llm: LLMClient or GeminiClient instance.
        output_dir: Deck output directory (gap_sentences/ and assignment file saved here).
        config_chapters: List of ChapterDef objects or dicts
                         (title, context, vocab_focus, cefr_level).
        target_language: e.g. "Spanish".
        native_language: e.g. "German".
        dialect: e.g. "Rioplatense (vos, che)". Empty string = no dialect note.
        max_new_words_per_sentence: LLM is told to use at most this many new
                                    target words per generated sentence (default 3).
    """

    ASSIGNMENT_FILE = "gap_word_assignment.json"

    def __init__(
        self,
        llm,
        output_dir: Path,
        config_chapters: list,
        target_language: str,
        native_language: str,
        dialect: str,
        lang_code: str = "es",
        max_new_words_per_sentence: int = 3,
        chapter_range: range | None = None,
        protagonist_name: str = "",
        secondary_characters: list | None = None,
        grammar_targets: dict[str, list[str]] | None = None,
    ):
        self._llm = llm
        self._output_dir = output_dir
        self._chapters = config_chapters
        self._target_lang = target_language
        self._native_lang = native_language
        self._dialect = dialect
        self._lang_code = lang_code
        self._max_new_words = max_new_words_per_sentence
        self._target_chapters = chapter_range  # None = all chapters
        self._protagonist_name = protagonist_name
        self._secondary_characters = secondary_characters or []
        self._grammar_targets = grammar_targets or {}

    @property
    def gap_dir(self) -> Path:
        return self._output_dir / "gap_sentences"

    @property
    def assignment_path(self) -> Path:
        return self._output_dir / self.ASSIGNMENT_FILE

    def fill_gaps(
        self,
        deck: "OrderedDeck | None" = None,
        frequency_data: dict[str, int] | None = None,
        top_n: int = 1000,
        stories: dict[int, str] | None = None,
        inappropriate_lemmas: set[str] | None = None,
    ) -> dict[int, list[GapShot]]:
        """Assign missing words to chapters and generate gap shots.

        Returns dict mapping chapter number → list of GapShot.
        Caches assignment and per-chapter shots to disk.
        """
        if frequency_data is None:
            frequency_data = {}

        # Get missing words — from stories (text stage) or deck (fill-gaps stage)
        if stories is not None:
            from pipeline.coverage_checker import scan_story_coverage
            report = scan_story_coverage(
                stories, frequency_data, lang=self._lang_code, top_n=top_n,
                inappropriate_lemmas=inappropriate_lemmas,
            )
        else:
            report = check_coverage(
                deck, frequency_data, top_n=top_n, lang=self._lang_code,
                inappropriate_lemmas=inappropriate_lemmas,
            )
        missing = report.missing_words

        if not missing:
            return {}

        # Call A: assign words to chapters (cached)
        assignment = self._get_assignment(missing)

        results: dict[int, list[GapShot]] = {}
        self.gap_dir.mkdir(parents=True, exist_ok=True)

        for chapter_num, words in sorted(assignment.items()):
            cache_path = self.gap_dir / f"chapter_{chapter_num:02d}.json"
            if cache_path.exists():
                raw = json.loads(cache_path.read_text())
                results[chapter_num] = [GapShot(**s) for s in raw]
                continue

            # Call B: generate shots for this chapter
            existing_context = self._load_existing_context(chapter_num)
            ch_def = self._chapters[chapter_num - 1] if chapter_num <= len(self._chapters) else None
            shots = self._generate_shots(chapter_num, ch_def, words, existing_context)
            results[chapter_num] = shots

            cache_path.write_text(
                json.dumps([s.model_dump() for s in shots], ensure_ascii=False, indent=2)
            )

        return results

    # ------------------------------------------------------------------ #
    # Call A: Assignment                                                   #
    # ------------------------------------------------------------------ #

    def _get_assignment(self, missing_words: list[str]) -> dict[int, list[str]]:
        """Return word→chapter assignment, using cache if available."""
        if self.assignment_path.exists():
            raw = json.loads(self.assignment_path.read_text())
            # raw is {word: chapter_num}
            assignment: dict[int, list[str]] = {}
            for word, ch in raw.items():
                assignment.setdefault(int(ch), []).append(word)
            return assignment

        raw_assignment = self._assign_via_llm(missing_words)

        self._output_dir.mkdir(parents=True, exist_ok=True)
        self.assignment_path.write_text(
            json.dumps(raw_assignment, ensure_ascii=False, indent=2)
        )

        assignment: dict[int, list[str]] = {}
        for word, ch in raw_assignment.items():
            assignment.setdefault(int(ch), []).append(word)
        return assignment

    def _assign_via_llm(self, missing_words: list[str]) -> dict[str, int]:
        """Single LLM call: assign each missing word to a chapter number."""
        if self._target_chapters is not None:
            target_indices = list(self._target_chapters)  # 0-based indices
        else:
            target_indices = list(range(len(self._chapters)))

        target_per_chapter = max(1, len(missing_words) // max(1, len(target_indices)))

        chapter_summaries = []
        for idx in target_indices:
            ch_num = idx + 1
            ch = self._chapters[idx]
            if hasattr(ch, "title"):
                title, context, vocab_focus, cefr = ch.title, ch.context, ch.vocab_focus, ch.cefr_level
            else:
                title = ch.get("title", f"Chapter {ch_num}")
                context = ch.get("context", "")
                vocab_focus = ch.get("vocab_focus", [])
                cefr = ch.get("cefr_level", "")
            chapter_summaries.append(
                f"  {ch_num}. [{cefr}] \"{title}\" — {context}. Focus: {', '.join(vocab_focus)}"
            )

        chapters_text = "\n".join(chapter_summaries)
        words_text = ", ".join(missing_words)
        valid_nums = [idx + 1 for idx in target_indices]
        valid_range = ", ".join(str(n) for n in valid_nums)

        system = (
            f"You are a curriculum designer for a {self._target_lang} language learning deck."
        )
        prompt = (
            f"The following {self._target_lang} words are missing from our vocabulary deck "
            f"and need to be introduced in new example sentences.\n\n"
            f"Chapters:\n{chapters_text}\n\n"
            f"Missing words: {words_text}\n\n"
            f"Assign each word to the most appropriate chapter number ({valid_range}).\n\n"
            f"Rules:\n"
            f"1. Distribute words roughly evenly — aim for ~{target_per_chapter} words per chapter.\n"
            f"2. Only cluster multiple words in one chapter when the topical fit is clearly strong "
            f"(e.g. all food words → dining chapter). Otherwise spread them out.\n"
            f"3. Match CEFR level: A1 words → early chapters, B2 words → late chapters.\n\n"
            f'Return JSON: {{"word1": chapter_number, "word2": chapter_number, ...}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw: dict = response.parsed

        # Validate chapter numbers — clamp to valid target chapters
        result: dict[str, int] = {}
        for word in missing_words:
            ch_num = raw.get(word, valid_nums[0])
            ch_num = int(ch_num)
            if ch_num not in valid_nums:
                ch_num = valid_nums[0]
            result[word] = ch_num
        return result

    # ------------------------------------------------------------------ #
    # Call B: Generation                                                   #
    # ------------------------------------------------------------------ #

    def _load_existing_context(self, chapter_num: int) -> str:
        """Load existing chapter and format as shot-grouped context with image prompts."""
        story_path = self._output_dir / "stories" / f"chapter_{chapter_num:02d}.json"
        if not story_path.exists():
            return ""
        chapter_data = ChapterScene(**json.loads(story_path.read_text()))
        lines = []
        shot_idx = 0
        for scene in chapter_data.scenes:
            for shot in scene.shots:
                lines.append(f"  [shot {shot_idx}] image: {shot.image_prompt}")
                for sent in shot.sentences:
                    lines.append(f'    [sent {sent.sentence_index}] "{sent.source}"')
                shot_idx += 1
        if not lines:
            return ""
        return (
            f"\nExisting chapter ({shot_idx} shots):\n"
            + "\n".join(lines)
            + "\n"
        )

    def _get_characters_for_chapter(self, chapter_num: int) -> str:
        """Build a character list string for a specific chapter."""
        chars = []
        if self._protagonist_name:
            chars.append(f"  - {self._protagonist_name} (protagonist, present in every chapter)")
        for sc in self._secondary_characters:
            ch_list = getattr(sc, "chapters", None) or sc.get("chapters", [])
            if chapter_num in ch_list:
                name = getattr(sc, "name", None) or sc.get("name", "")
                role = getattr(sc, "role", None) or sc.get("role", "")
                role_note = f" — {role}" if role else ""
                chars.append(f"  - {name}{role_note}")
        if not chars:
            return ""
        return "\nCharacters in this chapter:\n" + "\n".join(chars) + "\n"

    def _get_grammar_constraints(self, cefr_level: str) -> str:
        """Build CEFR grammar constraint text for the generation prompt."""
        # Collect allowed grammar from this level and all levels below
        cefr_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
        try:
            level_idx = cefr_order.index(cefr_level)
        except ValueError:
            level_idx = 1  # default to A2

        allowed = []
        forbidden = []
        for i, level in enumerate(cefr_order):
            targets = self._grammar_targets.get(level, [])
            if i <= level_idx:
                allowed.extend(targets)
            else:
                forbidden.extend(targets)

        if not allowed and not forbidden:
            return ""

        parts = [f"\nGrammar constraints for {cefr_level}:"]
        if allowed:
            parts.append("  ALLOWED: " + "; ".join(allowed))
        if forbidden:
            parts.append(f"  FORBIDDEN (above {cefr_level}): " + "; ".join(forbidden[:6]))
        return "\n".join(parts) + "\n"

    def _generate_shots(
        self,
        chapter_num: int,
        ch_def,
        words: list[str],
        existing_context: str,
    ) -> list[GapShot]:
        """Generate shots covering all `words`, using existing context for style."""
        if ch_def is not None and hasattr(ch_def, "title"):
            title = ch_def.title
            context = ch_def.context
            cefr_level = ch_def.cefr_level or "A2"
        elif ch_def:
            title = ch_def.get("title", f"Chapter {chapter_num}")
            context = ch_def.get("context", "")
            cefr_level = ch_def.get("cefr_level", "A2")
        else:
            title = f"Chapter {chapter_num}"
            context = ""
            cefr_level = "A2"

        dialect_note = f" Use {self._dialect} dialect." if self._dialect else ""
        words_text = ", ".join(words)
        character_section = self._get_characters_for_chapter(chapter_num)
        grammar_section = self._get_grammar_constraints(cefr_level)

        # Count existing shots for valid insert_after_shot range
        total_existing = self._count_existing_shots(chapter_num)

        system = (
            f"You are a {self._target_lang} language learning content creator. "
            f"You write natural, authentic sentences at the specified CEFR level."
        )
        prompt = (
            f"Chapter {chapter_num}: \"{title}\"\n"
            f"Context: {context}\n"
            f"CEFR level: {cefr_level}{character_section}{grammar_section}{existing_context}\n"
            f"Words to introduce ({len(words)} words): {words_text}\n\n"
            f"Generate SHOTS (groups of 1-3 sentences) that cover these words. "
            f"Each shot will have its own illustration.\n\n"
            f"Rules:\n"
            f"1. Each shot has 1-3 sentences and one image_prompt (in English) describing the visual scene.\n"
            f"2. Use at most {self._max_new_words} of the listed words per sentence.\n"
            f"3. Target at least 90% coverage — cover at least "
            f"{max(1, int(len(words) * 0.9))} of the {len(words)} words.\n"
            f"4. Each sentence must fit the chapter context and CEFR level.{grammar_section and ' Follow the grammar constraints above strictly.' or ''}\n"
            f"5. Match the tone and style of the existing sentences above.{dialect_note}\n"
            f"6. The image_prompt should visually illustrate the vocabulary in the sentences.\n"
            f"7. For insert_after_shot: specify which existing shot index (0-based, range 0–{max(0, total_existing - 1)}) "
            f"this new shot should be placed after.\n"
            f"8. ONLY use characters listed above. Do NOT invent new characters (no unnamed father, vendor, stranger, etc.). "
            f"If an unnamed character (bus driver, vendor, waiter) already appears in the existing shots above, "
            f"reuse their exact visual description from the image_prompt.\n"
            f"9. Every shot must happen in the chapter's physical setting and advance the chapter's story. "
            f"No abstract thoughts, philosophical tangents, or scenes in a different location.\n\n"
            f"Return JSON:\n"
            f'{{\n'
            f'  "shots": [\n'
            f'    {{\n'
            f'      "sentences": ["{self._target_lang} sentence 1", "{self._target_lang} sentence 2"],\n'
            f'      "image_prompt": "English description of the scene for illustration",\n'
            f'      "covers": ["lemma1", "lemma2"],\n'
            f'      "insert_after_shot": 3\n'
            f'    }}\n'
            f'  ]\n'
            f'}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw_shots: list[dict] = response.parsed.get("shots", [])

        result = []
        for s in raw_shots:
            sentences = s.get("sentences", [])
            if isinstance(sentences, str):
                sentences = [sentences]
            raw_idx = int(s.get("insert_after_shot", -1))
            # Clamp -1 or out-of-range to last existing shot
            if raw_idx < 0 or total_existing == 0:
                clamped_idx = max(0, total_existing - 1)
            else:
                clamped_idx = min(raw_idx, total_existing - 1)
            result.append(GapShot(
                sentences=sentences[:3],  # enforce max 3
                image_prompt=s.get("image_prompt", ""),
                covers=s.get("covers", []),
                insert_after_shot=clamped_idx,
            ))
        return result

    def _count_existing_shots(self, chapter_num: int) -> int:
        """Count total shots in the existing chapter JSON."""
        story_path = self._output_dir / "stories" / f"chapter_{chapter_num:02d}.json"
        if not story_path.exists():
            return 0
        chapter_data = ChapterScene(**json.loads(story_path.read_text()))
        return sum(len(scene.shots) for scene in chapter_data.scenes)
