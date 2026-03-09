"""Pass 3b: Gap-filling sentence generation.

Two LLM calls:
  A) One assignment call: all missing words + all chapter summaries → word→chapter map.
  B) One generation call per chapter: existing sentences + assigned words → new sentences.

Both are cached to disk.
"""

import json
from pathlib import Path

from pipeline.coverage_checker import check_coverage
from pipeline.models import (
    FrequencyLemmaEntry, GapSentence, OrderedDeck, SentencePair,
)


class GapFiller:
    """Generate gap-filling sentences for missing high-frequency vocabulary.

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
        max_new_words_per_sentence: int = 3,
    ):
        self._llm = llm
        self._output_dir = output_dir
        self._chapters = config_chapters
        self._target_lang = target_language
        self._native_lang = native_language
        self._dialect = dialect
        self._max_new_words = max_new_words_per_sentence

    @property
    def gap_dir(self) -> Path:
        return self._output_dir / "gap_sentences"

    @property
    def assignment_path(self) -> Path:
        return self._output_dir / self.ASSIGNMENT_FILE

    def fill_gaps(
        self,
        deck: OrderedDeck,
        frequency_data: dict[str, int],
        frequency_lemmas: dict[str, FrequencyLemmaEntry],
        top_n: int = 1000,
    ) -> dict[int, list[GapSentence]]:
        """Assign missing words to chapters and generate gap sentences.

        Returns dict mapping chapter number → list of GapSentence.
        Caches assignment and per-chapter sentences to disk.
        """
        report = check_coverage(
            deck, frequency_data, top_n=top_n, frequency_lemmas=frequency_lemmas
        )
        missing = report.missing_words

        if not missing:
            return {}

        # Call A: assign words to chapters (cached)
        assignment = self._get_assignment(missing)

        results: dict[int, list[GapSentence]] = {}
        self.gap_dir.mkdir(parents=True, exist_ok=True)

        for chapter_num, words in sorted(assignment.items()):
            cache_path = self.gap_dir / f"chapter_{chapter_num:02d}.json"
            if cache_path.exists():
                raw = json.loads(cache_path.read_text())
                results[chapter_num] = [GapSentence(**s) for s in raw]
                continue

            # Call B: generate sentences for this chapter
            existing = self._load_existing_sentences(chapter_num)
            ch_def = self._chapters[chapter_num - 1] if chapter_num <= len(self._chapters) else None
            sentences = self._generate_sentences(chapter_num, ch_def, words, existing)
            results[chapter_num] = sentences

            cache_path.write_text(
                json.dumps([s.model_dump() for s in sentences], ensure_ascii=False, indent=2)
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
        chapter_count = len(self._chapters)
        target_per_chapter = max(1, len(missing_words) // max(1, chapter_count))

        chapter_summaries = []
        for idx, ch in enumerate(self._chapters, start=1):
            if hasattr(ch, "title"):
                title, context, vocab_focus, cefr = ch.title, ch.context, ch.vocab_focus, ch.cefr_level
            else:
                title = ch.get("title", f"Chapter {idx}")
                context = ch.get("context", "")
                vocab_focus = ch.get("vocab_focus", [])
                cefr = ch.get("cefr_level", "")
            chapter_summaries.append(
                f"  {idx}. [{cefr}] \"{title}\" — {context}. Focus: {', '.join(vocab_focus)}"
            )

        chapters_text = "\n".join(chapter_summaries)
        words_text = ", ".join(missing_words)

        system = (
            f"You are a curriculum designer for a {self._target_lang} language learning deck."
        )
        prompt = (
            f"The following {self._target_lang} words are missing from our vocabulary deck "
            f"and need to be introduced in new example sentences.\n\n"
            f"Chapters ({chapter_count} total):\n{chapters_text}\n\n"
            f"Missing words: {words_text}\n\n"
            f"Assign each word to the most appropriate chapter number (1–{chapter_count}).\n\n"
            f"Rules:\n"
            f"1. Distribute words roughly evenly — aim for ~{target_per_chapter} words per chapter.\n"
            f"2. Only cluster multiple words in one chapter when the topical fit is clearly strong "
            f"(e.g. all food words → dining chapter). Otherwise spread them out.\n"
            f"3. Match CEFR level: A1 words → early chapters, B2 words → late chapters.\n\n"
            f'Return JSON: {{"word1": chapter_number, "word2": chapter_number, ...}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw: dict = response.parsed

        # Validate and clamp chapter numbers
        result: dict[str, int] = {}
        for word in missing_words:
            ch_num = raw.get(word, 1)
            result[word] = max(1, min(chapter_count, int(ch_num)))
        return result

    # ------------------------------------------------------------------ #
    # Call B: Generation                                                   #
    # ------------------------------------------------------------------ #

    def _load_existing_sentences(self, chapter_num: int) -> list[SentencePair]:
        """Load existing translations for a chapter from disk (if available)."""
        path = self._output_dir / "translations" / f"chapter_{chapter_num:02d}.json"
        if not path.exists():
            return []
        raw = json.loads(path.read_text())
        return [SentencePair(**p) for p in raw]

    def _generate_sentences(
        self,
        chapter_num: int,
        ch_def,
        words: list[str],
        existing_sentences: list[SentencePair],
    ) -> list[GapSentence]:
        """Generate sentences covering all `words`, using existing sentences for context."""
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

        existing_text = ""
        if existing_sentences:
            lines = [f'  [{s.sentence_index}] "{s.source}"' for s in existing_sentences]
            existing_text = (
                f"\nExisting chapter sentences (numbered by sentence_index):\n"
                + "\n".join(lines)
                + "\n"
            )

        dialect_note = f" Use {self._dialect} dialect." if self._dialect else ""
        words_text = ", ".join(words)

        system = (
            f"You are a {self._target_lang} language learning content creator. "
            f"You write natural, authentic sentences at the specified CEFR level."
        )
        prompt = (
            f"Chapter {chapter_num}: \"{title}\"\n"
            f"Context: {context}\n"
            f"CEFR level: {cefr_level}{existing_text}\n"
            f"Words to introduce: {words_text}\n\n"
            f"Generate sentences that cover ALL of the words above. Rules:\n"
            f"1. Use at most {self._max_new_words} of the listed words per sentence.\n"
            f"2. Generate as many sentences as needed until every word is covered.\n"
            f"3. Each sentence must fit the chapter context and CEFR level.\n"
            f"4. Match the tone and style of the existing sentences above.{dialect_note}\n"
            f"5. Where natural, vary the grammatical form of each word across sentences "
            f"— but only when it reads naturally.\n"
            f"6. For each new sentence, specify insert_after: the sentence_index of the "
            f"existing sentence it should be placed after. Pick the position where the new "
            f"sentence fits most naturally in the story flow. Use -1 to append at the end.\n\n"
            f"Return JSON:\n"
            f'{{\n'
            f'  "sentences": [\n'
            f'    {{\n'
            f'      "source": "{self._target_lang} sentence",\n'
            f'      "covers": ["lemma1", "lemma2"],\n'
            f'      "insert_after": 3\n'
            f'    }}\n'
            f'  ]\n'
            f'}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw_sentences: list[dict] = response.parsed.get("sentences", [])

        result = []
        for s in raw_sentences:
            result.append(GapSentence(
                source=s.get("source", ""),
                covers=s.get("covers", []),
                insert_after=int(s.get("insert_after", -1)),
            ))
        return result
