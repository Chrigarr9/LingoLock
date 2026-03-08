# Grammar Gap Filler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the feedback loop between the grammar auditor and story content — when grammar targets are missing, automatically generate sentences that demonstrate those structures.

**Architecture:** A new `GrammarGapFiller` class (mirroring `GapFiller`) takes the `GrammarAuditReport`, picks the best chapter per missing target, generates 1-2 sentences per target via LLM, and caches results to `grammar_gap_sentences/`. The sentences are then merged into the translation files and word-extracted so they flow through the rest of the pipeline. Wired into `run_all.py` as Pass 3d, right after the grammar audit.

**Tech Stack:** Python, Pydantic models, existing LLM client, pytest with mock LLM

---

### Task 1: Add `GrammarGapSentence` model

**Files:**
- Modify: `spanish-content-pipeline/pipeline/models.py`
- Test: `spanish-content-pipeline/tests/test_models.py` (if exists, otherwise inline verification in Task 2)

**Step 1: Write the model**

Add to `pipeline/models.py` after the `GapSentence` class:

```python
class GrammarGapSentence(BaseModel):
    source: str                  # Spanish sentence demonstrating the grammar target
    target: str                  # German translation
    grammar_target: str          # Which grammar structure this demonstrates
    cefr_level: str              # CEFR level of the target
    chapter: int                 # Chapter number it's assigned to
```

**Step 2: Verify import works**

Run: `cd spanish-content-pipeline && uv run python -c "from pipeline.models import GrammarGapSentence; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add spanish-content-pipeline/pipeline/models.py
git commit -m "feat(pipeline): add GrammarGapSentence model"
```

---

### Task 2: Create `grammar_gap_filler.py` with tests (TDD)

**Files:**
- Create: `spanish-content-pipeline/pipeline/grammar_gap_filler.py`
- Create: `spanish-content-pipeline/tests/test_grammar_gap_filler.py`

**Step 1: Write the failing tests**

```python
"""Tests for grammar_gap_filler.py."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from pipeline.grammar_auditor import GrammarAuditReport, GrammarLevelReport, GrammarTargetResult
from pipeline.grammar_gap_filler import GrammarGapFiller
from pipeline.models import GrammarGapSentence


def _make_audit_report(missing: dict[str, list[str]]) -> GrammarAuditReport:
    """Build a report where specified targets are missing.

    Args:
        missing: {cefr_level: [target_description, ...]}
    """
    levels = {}
    for cefr, targets in missing.items():
        results = [GrammarTargetResult(target=t, present=False) for t in targets]
        coverage = 0.0
        levels[cefr] = GrammarLevelReport(cefr=cefr, targets=results, coverage=coverage)
    return GrammarAuditReport(levels=levels)


def _make_mock_llm(responses: list[dict]) -> MagicMock:
    llm = MagicMock()
    it = iter(responses)

    def side_effect(prompt, system=None):
        r = MagicMock()
        r.parsed = next(it)
        return r

    llm.complete_json.side_effect = side_effect
    return llm


def _make_chapter_defs():
    return [
        {"title": "At the Airport", "context": "Maria arrives", "vocab_focus": [], "cefr_level": "A1"},
        {"title": "At the Restaurant", "context": "Ordering food", "vocab_focus": [], "cefr_level": "A2"},
        {"title": "Deep Talk", "context": "Talking about life", "vocab_focus": [], "cefr_level": "B1"},
    ]


def test_no_missing_targets_returns_empty():
    """When all targets are present, no LLM calls and empty result."""
    report = GrammarAuditReport(levels={
        "A1": GrammarLevelReport(cefr="A1", targets=[
            GrammarTargetResult(target="present tense", present=True, example="Ella come."),
        ], coverage=1.0),
    })
    llm = MagicMock()
    filler = GrammarGapFiller(
        llm=llm, output_dir=Path("/tmp/test"),
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)
    assert result == []
    llm.complete_json.assert_not_called()


def test_generates_sentences_for_missing_targets(tmp_path):
    """Generates sentences for each missing grammar target."""
    report = _make_audit_report({"A2": ["pretérito imperfecto"]})

    llm_response = {
        "sentences": [
            {
                "source": "Cuando era niña, vivía en Buenos Aires.",
                "target": "Als sie ein Kind war, lebte sie in Buenos Aires.",
                "grammar_target": "pretérito imperfecto",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])
    out_dir = tmp_path / "test"

    filler = GrammarGapFiller(
        llm=llm, output_dir=out_dir,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="Rioplatense",
    )
    result = filler.fill_gaps(report)

    assert len(result) == 1
    assert result[0].grammar_target == "pretérito imperfecto"
    assert result[0].cefr_level == "A2"
    assert result[0].chapter == 2  # matches A2 chapter
    assert llm.complete_json.call_count == 1


def test_assigns_to_correct_cefr_chapter(tmp_path):
    """B1 grammar targets get assigned to B1 chapters."""
    report = _make_audit_report({"B1": ["subjunctive"]})

    llm_response = {
        "sentences": [
            {
                "source": "Ojalá pueda volver pronto.",
                "target": "Hoffentlich kann ich bald zurückkehren.",
                "grammar_target": "subjunctive",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)

    assert result[0].chapter == 3  # chapter 3 is B1


def test_caches_results_to_disk(tmp_path):
    """Results are cached to grammar_gap_sentences/ directory."""
    report = _make_audit_report({"A1": ["ser vs estar"]})

    llm_response = {
        "sentences": [
            {
                "source": "Ella es alta pero hoy está cansada.",
                "target": "Sie ist groß, aber heute ist sie müde.",
                "grammar_target": "ser vs estar",
            }
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(report)

    cache_path = tmp_path / "grammar_gap_sentences.json"
    assert cache_path.exists()
    cached = json.loads(cache_path.read_text())
    assert len(cached) == 1


def test_uses_cache_on_second_call(tmp_path):
    """If cache exists, no LLM calls are made."""
    cached = [
        {
            "source": "Ella era bonita.",
            "target": "Sie war hübsch.",
            "grammar_target": "imperfecto",
            "cefr_level": "A2",
            "chapter": 2,
        }
    ]
    cache_path = tmp_path / "grammar_gap_sentences.json"
    cache_path.write_text(json.dumps(cached))

    llm = MagicMock()
    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(_make_audit_report({"A2": ["imperfecto"]}))

    assert len(result) == 1
    assert result[0].source == "Ella era bonita."
    llm.complete_json.assert_not_called()


def test_prompt_includes_existing_chapter_sentences(tmp_path):
    """The generation prompt references existing sentences for style context."""
    report = _make_audit_report({"A1": ["hay"]})
    # Write translations for chapter 1
    trans_dir = tmp_path / "translations"
    trans_dir.mkdir()
    (trans_dir / "chapter_01.json").write_text(json.dumps([
        {"chapter": 1, "sentence_index": 0,
         "source": "Maria abre la maleta.", "target": "Maria öffnet den Koffer."}
    ]))

    llm = _make_mock_llm([{"sentences": [
        {"source": "Hay una maleta.", "target": "Es gibt einen Koffer.", "grammar_target": "hay"}
    ]}])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    filler.fill_gaps(report)

    prompt = llm.complete_json.call_args_list[0][0][0]
    assert "Maria abre la maleta" in prompt


def test_multiple_cefr_levels_batched(tmp_path):
    """Missing targets from multiple CEFR levels are handled in a single LLM call."""
    report = _make_audit_report({
        "A1": ["questions with qué"],
        "A2": ["pretérito imperfecto"],
    })

    llm_response = {
        "sentences": [
            {
                "source": "¿Qué es eso?",
                "target": "Was ist das?",
                "grammar_target": "questions with qué",
            },
            {
                "source": "Cuando era joven, vivía en el campo.",
                "target": "Als er jung war, lebte er auf dem Land.",
                "grammar_target": "pretérito imperfecto",
            },
        ]
    }
    llm = _make_mock_llm([llm_response])

    filler = GrammarGapFiller(
        llm=llm, output_dir=tmp_path,
        config_chapters=_make_chapter_defs(),
        target_language="Spanish", native_language="German", dialect="",
    )
    result = filler.fill_gaps(report)

    assert len(result) == 2
    # One LLM call for all missing targets (batched)
    assert llm.complete_json.call_count == 1
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_grammar_gap_filler.py -v`
Expected: All tests FAIL with `ImportError: cannot import name 'GrammarGapFiller'`

**Step 3: Write the implementation**

```python
"""Pass 3d: Grammar gap filler — generate sentences for missing grammar targets.

Single LLM call: all missing grammar targets + chapter context -> sentences.
Results cached to grammar_gap_sentences.json.
"""

import json
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
        # Use cache if available
        if self.cache_path.exists():
            raw = json.loads(self.cache_path.read_text())
            return [GrammarGapSentence(**s) for s in raw]

        # Collect missing targets with their CEFR level
        missing: list[tuple[str, str]] = []  # (cefr, target_description)
        for cefr, level_report in report.levels.items():
            for t in level_report.targets:
                if not t.present:
                    missing.append((cefr, t.target))

        if not missing:
            return []

        # Build CEFR -> chapter number mapping (pick first chapter at each level)
        cefr_to_chapter = self._build_cefr_chapter_map()

        # Load existing sentences for context
        existing_by_chapter = self._load_existing_sentences(cefr_to_chapter)

        # Single LLM call for all missing targets
        sentences = self._generate(missing, cefr_to_chapter, existing_by_chapter)

        # Cache
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
        """Load translations for relevant chapters."""
        result: dict[int, list[SentencePair]] = {}
        for ch_num in set(cefr_to_chapter.values()):
            path = self._output_dir / "translations" / f"chapter_{ch_num:02d}.json"
            if path.exists():
                raw = json.loads(path.read_text())
                result[ch_num] = [SentencePair(**p) for p in raw]
        return result

    def _generate(
        self,
        missing: list[tuple[str, str]],
        cefr_to_chapter: dict[str, int],
        existing_by_chapter: dict[int, list[SentencePair]],
    ) -> list[GrammarGapSentence]:
        """Single LLM call to generate sentences for all missing grammar targets."""
        # Build targets description
        targets_text = "\n".join(
            f"  - [{cefr}] {target}" for cefr, target in missing
        )

        # Build chapter context for relevant chapters
        relevant_chapters = set()
        for cefr, _ in missing:
            if cefr in cefr_to_chapter:
                relevant_chapters.add(cefr_to_chapter[cefr])

        context_parts = []
        for ch_num in sorted(relevant_chapters):
            ch_def = self._chapters[ch_num - 1] if ch_num <= len(self._chapters) else None
            if ch_def is None:
                continue
            title = ch_def.title if hasattr(ch_def, "title") else ch_def.get("title", "")
            context = ch_def.context if hasattr(ch_def, "context") else ch_def.get("context", "")
            cefr = ch_def.cefr_level if hasattr(ch_def, "cefr_level") else ch_def.get("cefr_level", "")

            existing = existing_by_chapter.get(ch_num, [])
            existing_text = ""
            if existing:
                lines = [f'    "{s.source}"' for s in existing[:5]]
                existing_text = "\n  Existing sentences:\n" + "\n".join(lines)

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
            f"4. Provide a {self._native_lang} translation for each sentence.\n"
            f"5. Use «guillemets» for any direct speech.\n\n"
            f"Return JSON:\n"
            f'{{\n'
            f'  "sentences": [\n'
            f'    {{\n'
            f'      "source": "{self._target_lang} sentence",\n'
            f'      "target": "{self._native_lang} translation",\n'
            f'      "grammar_target": "exact target description from the list above"\n'
            f'    }}\n'
            f'  ]\n'
            f'}}'
        )

        response = self._llm.complete_json(prompt, system=system)
        raw_sentences = response.parsed.get("sentences", [])

        # Build lookup for cefr from target description
        target_to_cefr = {target: cefr for cefr, target in missing}

        result = []
        for s in raw_sentences:
            grammar_target = s.get("grammar_target", "")
            cefr = target_to_cefr.get(grammar_target, "")
            chapter = cefr_to_chapter.get(cefr, 1)
            result.append(GrammarGapSentence(
                source=s.get("source", ""),
                target=s.get("target", ""),
                grammar_target=grammar_target,
                cefr_level=cefr,
                chapter=chapter,
            ))

        return result
```

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_grammar_gap_filler.py -v`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/grammar_gap_filler.py spanish-content-pipeline/tests/test_grammar_gap_filler.py
git commit -m "feat(pipeline): add GrammarGapFiller — generates sentences for missing grammar targets"
```

---

### Task 3: Wire into `run_all.py` as Pass 3d

**Files:**
- Modify: `spanish-content-pipeline/scripts/run_all.py` (after Pass 3c grammar audit, ~line 166)

**Step 1: Add grammar gap filling after the grammar audit**

Insert after the grammar audit section in `run_text_stage()` (after the `for t in level_report.targets` print loop), still inside the `if config.story.grammar_targets:` block:

```python
        # Pass 3d: Grammar Gap Filling
        from pipeline.grammar_gap_filler import GrammarGapFiller

        grammar_filler = GrammarGapFiller(
            llm=llm,
            output_dir=output_base / config.deck.id,
            config_chapters=[
                {"title": ch.title, "context": ch.context,
                 "vocab_focus": ch.vocab_focus, "cefr_level": ch.cefr_level or config.story.cefr_level}
                for ch in config.story.chapters
            ],
            target_language=config.languages.target,
            native_language=config.languages.native,
            dialect=config.languages.dialect or "",
        )
        grammar_sentences = grammar_filler.fill_gaps(grammar_report)

        if grammar_sentences:
            print(f"\n=== Pass 3d: Grammar Gap Filling ===")
            print(f"  Generated {len(grammar_sentences)} sentences for missing grammar targets")
            for s in grammar_sentences:
                print(f"    [{s.cefr_level}] {s.grammar_target}")
                print(f"      {s.source}")
        else:
            print("\n  No grammar gaps to fill.")
```

**Step 2: Merge grammar gap sentences into translations**

After the grammar gap filling, append the new sentences to the relevant translation files so they're available for the vocabulary builder and media stages:

```python
        # Append grammar gap sentences to translation files
        if grammar_sentences:
            from collections import defaultdict
            by_chapter: dict[int, list] = defaultdict(list)
            for gs in grammar_sentences:
                by_chapter[gs.chapter].append(gs)

            for ch_num, g_sentences in by_chapter.items():
                trans_path = output_base / config.deck.id / "translations" / f"chapter_{ch_num:02d}.json"
                existing = json.loads(trans_path.read_text()) if trans_path.exists() else []
                for gs in g_sentences:
                    existing.append({
                        "chapter": ch_num,
                        "sentence_index": len(existing),
                        "source": gs.source,
                        "target": gs.target,
                    })
                trans_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2))

            # Also add to all_pairs so vocabulary builder picks them up
            for gs in grammar_sentences:
                if gs.chapter - 1 in {i for i in chapter_range}:
                    ch_idx = gs.chapter - 1
                    if ch_idx not in all_pairs:
                        all_pairs[ch_idx] = []
                    all_pairs[ch_idx].append(SentencePair(
                        chapter=gs.chapter,
                        sentence_index=len(all_pairs[ch_idx]),
                        source=gs.source,
                        target=gs.target,
                    ))
```

**Step 3: Run the existing test suite to verify nothing breaks**

Run: `cd spanish-content-pipeline && uv run pytest -v`
Expected: All existing tests PASS

**Step 4: Commit**

```bash
git add spanish-content-pipeline/scripts/run_all.py
git commit -m "feat(pipeline): wire grammar gap filler as Pass 3d in run_all.py"
```

---

### Task 4: End-to-end verification

**Step 1: Delete grammar gap cache (if exists) and re-run text stage**

```bash
cd spanish-content-pipeline
rm -f output/es-de-buenos-aires/grammar_gap_sentences.json
```

**Step 2: Run pipeline text stage for chapters 1-6 (A1 only, cheapest test)**

```bash
uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --chapters 1-6 --stage text --frequency-file data/frequency/es_50k.txt
```

Expected: Pass 3c shows missing A1 targets, Pass 3d generates sentences for them.

**Step 3: Verify the grammar gap sentences cache was created**

```bash
cat output/es-de-buenos-aires/grammar_gap_sentences.json | python -m json.tool | head -30
```

**Step 4: Commit if all looks good**

```bash
git add -A
git commit -m "feat(pipeline): grammar gap filler verified end-to-end"
```
