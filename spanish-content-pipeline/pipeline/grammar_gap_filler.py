"""Pass 3d: Grammar gap filler — generate sentences for missing grammar targets.

Single LLM call: all missing grammar targets + chapter context -> sentences.
Results cached to grammar_gap_sentences.json.
"""

import json
import re
from pathlib import Path

from pipeline.grammar_auditor import GrammarAuditReport
from pipeline.models import GrammarGapSentence, SentencePair


class GrammarGapFiller:
    """Generate sentences for grammar targets missing from the story.

    Args:
        llm: LLMClient or GeminiClient instance.
        output_dir: Deck output directory.
        config_chapters: List of chapter defs (title, context, cefr_level, vocab_focus).
        target_language: e.g. "Spanish".
        native_language: e.g. "German".
        dialect: e.g. "Rioplatense (vos, che)". Empty string = no dialect note.
    """

    CACHE_FILE = "grammar_gap_sentences.json"

    def __init__(
        self,
        llm,
        output_dir: Path,
        config_chapters: list,
        target_language: str,
        native_language: str,
        dialect: str,
    ):
        self._llm = llm
        self._output_dir = output_dir
        self._chapters = config_chapters
        self._target_lang = target_language
        self._native_lang = native_language
        self._dialect = dialect

    @property
    def cache_path(self) -> Path:
        return self._output_dir / self.CACHE_FILE

    def fill_gaps(self, report: GrammarAuditReport) -> list[GrammarGapSentence]:
        """Generate sentences for missing grammar targets.

        Returns list of GrammarGapSentence. Cached to disk.
        """
        if self.cache_path.exists():
            raw = json.loads(self.cache_path.read_text())
            return [GrammarGapSentence(**s) for s in raw]

        missing: list[tuple[str, str]] = []  # (cefr, target_description)
        for cefr, level_report in report.levels.items():
            for t in level_report.targets:
                if not t.present:
                    missing.append((cefr, t.target))

        if not missing:
            return []

        cefr_to_chapter = self._build_cefr_chapter_map()
        existing_by_chapter = self._load_existing_sentences(cefr_to_chapter)
        sentences = self._generate(missing, cefr_to_chapter, existing_by_chapter)

        self._output_dir.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(
            json.dumps([s.model_dump() for s in sentences], ensure_ascii=False, indent=2)
        )

        return sentences

    def _build_cefr_chapter_map(self) -> dict[str, int]:
        """Map each CEFR level to the first chapter at that level."""
        result: dict[str, int] = {}
        for idx, ch in enumerate(self._chapters, start=1):
            cefr = ch.cefr_level if hasattr(ch, "cefr_level") else ch.get("cefr_level", "")
            if cefr and cefr not in result:
                result[cefr] = idx
        return result

    def _load_existing_sentences(
        self, cefr_to_chapter: dict[str, int]
    ) -> dict[int, list[SentencePair]]:
        """Load existing sentences for relevant chapters.

        Tries stories/ first (scene JSON → flat sentences), falls back to
        translations/ for backwards compatibility.
        """
        result: dict[int, list[SentencePair]] = {}
        for ch_num in set(cefr_to_chapter.values()):
            # Try stories/ (new pipeline order — translations don't exist yet)
            story_path = self._output_dir / "stories" / f"chapter_{ch_num:02d}.json"
            if story_path.exists():
                from pipeline.models import ChapterScene
                chapter_data = ChapterScene(**json.loads(story_path.read_text()))
                pairs = []
                for scene in chapter_data.scenes:
                    for shot in scene.shots:
                        for sent in shot.sentences:
                            pairs.append(SentencePair(
                                chapter=ch_num, sentence_index=sent.sentence_index,
                                source=sent.source, target="",
                            ))
                result[ch_num] = pairs
                continue
            # Fallback: translations/ (old pipeline order)
            trans_path = self._output_dir / "translations" / f"chapter_{ch_num:02d}.json"
            if trans_path.exists():
                raw = json.loads(trans_path.read_text())
                result[ch_num] = [SentencePair(**p) for p in raw]
        return result

    def _generate(
        self,
        missing: list[tuple[str, str]],
        cefr_to_chapter: dict[str, int],
        existing_by_chapter: dict[int, list[SentencePair]],
    ) -> list[GrammarGapSentence]:
        """Single LLM call to generate sentences for all missing grammar targets."""
        targets_text = "\n".join(
            f"  - [{cefr}] {target}" for cefr, target in missing
        )

        relevant_chapters = set()
        for cefr, _ in missing:
            if cefr in cefr_to_chapter:
                relevant_chapters.add(cefr_to_chapter[cefr])

        context_parts = []
        for ch_num in sorted(relevant_chapters):
            if ch_num > len(self._chapters):
                continue
            ch_def = self._chapters[ch_num - 1]
            title = ch_def.title if hasattr(ch_def, "title") else ch_def.get("title", "")
            context = ch_def.context if hasattr(ch_def, "context") else ch_def.get("context", "")
            cefr = ch_def.cefr_level if hasattr(ch_def, "cefr_level") else ch_def.get("cefr_level", "")

            existing = existing_by_chapter.get(ch_num, [])
            existing_text = ""
            if existing:
                lines = [f'    [{s.sentence_index}] "{s.source}"' for s in existing]
                existing_text = "\n  Existing sentences (numbered by sentence_index):\n" + "\n".join(lines)

            context_parts.append(
                f"  Chapter {ch_num} [{cefr}]: \"{title}\" - {context}{existing_text}"
            )

        chapters_context = "\n".join(context_parts)
        dialect_note = f" Use {self._dialect} dialect." if self._dialect else ""

        system = (
            f"You are a {self._target_lang} grammar expert creating example sentences "
            f"for a language learning deck."
        )
        prompt = (
            f"The following grammar structures are MISSING from our {self._target_lang} "
            f"language deck and need example sentences:\n\n"
            f"Missing grammar targets:\n{targets_text}\n\n"
            f"Available chapters:\n{chapters_context}\n\n"
            f"Generate 1-2 natural sentences for EACH missing grammar target. Rules:\n"
            f"1. Each sentence must clearly demonstrate the grammar structure.\n"
            f"2. Match the chapter context and CEFR level.\n"
            f"3. Match the tone and style of existing sentences.{dialect_note}\n"
            f"4. Use «guillemets» for any direct speech.\n"
            f"5. For each new sentence, specify insert_after: the sentence_index of the "
            f"existing sentence it should be placed after. Pick the position where the new "
            f"sentence fits most naturally in the story flow. Use -1 to append at the end.\n\n"
            f"Return JSON:\n"
            f'{{\n'
            f'  "sentences": [\n'
            f'    {{\n'
            f'      "source": "{self._target_lang} sentence",\n'
            f'      "grammar_target": "exact target description from the list above",\n'
            f'      "insert_after": 3\n'
            f'    }}\n'
            f'  ]\n'
            f'}}'
        )

        response = self._llm.complete_json(prompt, system=system)
        raw_sentences = response.parsed.get("sentences", [])

        target_to_cefr = {target: cefr for cefr, target in missing}

        result = []
        for s in raw_sentences:
            grammar_target = s.get("grammar_target", "")
            # Try exact match first, then fuzzy match
            cefr = target_to_cefr.get(grammar_target, "")
            if not cefr:
                # LLM often returns "[A2] target desc" — parse the CEFR prefix
                m = re.match(r"\[([A-C][12])\]\s*", grammar_target)
                if m:
                    cefr = m.group(1)
            if not cefr:
                # Last resort: try substring match against known targets
                for known_target, known_cefr in target_to_cefr.items():
                    if known_target in grammar_target or grammar_target in known_target:
                        cefr = known_cefr
                        break
            chapter = cefr_to_chapter.get(cefr, 1)
            result.append(GrammarGapSentence(
                source=s.get("source", ""),
                grammar_target=grammar_target,
                cefr_level=cefr,
                chapter=chapter,
                insert_after=int(s.get("insert_after", -1)),
            ))

        return result
