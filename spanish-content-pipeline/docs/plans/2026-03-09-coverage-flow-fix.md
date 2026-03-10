# Coverage Flow Fix & Auditor Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move vocab gap filling into the text stage so gap sentences are inserted into stories before translation/extraction, switch pipeline to OpenRouter, and improve the story auditor prompt.

**Architecture:** Gap filling currently runs as a separate post-hoc stage that can't properly merge new words. Fix: move it into `run_text_stage()` between grammar gap insertion (Pass 3) and story audit (Pass 4). Add a lightweight word scanner that checks coverage against frequency data without needing vocabulary.json. Delete dead `merge_gap_sentences`. Switch all LLM calls to OpenRouter. Improve auditor prompt with concrete examples.

**Tech Stack:** Python, Pydantic, pytest, OpenRouter API

---

### Task 1: Switch pipeline to OpenRouter + update models

**Files:**
- Modify: `configs/spanish_buenos_aires.yaml:516-540` (llm + story_audit sections)
- Modify: `scripts/run_all.py:71-82` (env var lookup)

**Step 1: Update YAML config**

In `configs/spanish_buenos_aires.yaml`, change the llm section:

```yaml
llm:
  provider: "openrouter"
  model: "google/gemini-3.1-flash-lite-preview"
  fallback_model: "google/gemini-3-flash-preview"
  temperature: 0.7
  max_retries: 3
```

And the story_audit section:

```yaml
story_audit:
  enabled: true
  provider: "openrouter"
  model: "google/gemini-3.1-pro-preview"
  temperature: 0.3
```

**Step 2: Fix env var name in run_all.py**

The user's env var is `OPEN_ROUTER_API_KEY` but code looks for `OPENROUTER_API_KEY`. Update `get_api_key_for_provider` to check both:

```python
def get_api_key_for_provider(provider: str) -> str:
    if provider == "google":
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            print("Error: GEMINI_API_KEY not set")
            sys.exit(1)
        return key
    key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPEN_ROUTER_API_KEY")
    if not key:
        print("Error: OPENROUTER_API_KEY not set")
        sys.exit(1)
    return key
```

**Step 3: Run existing tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -x -q`
Expected: All existing tests pass (config tests may need the new model names)

**Step 4: Commit**

```bash
git add configs/spanish_buenos_aires.yaml scripts/run_all.py
git commit -m "feat(config): switch pipeline to OpenRouter, upgrade models"
```

---

### Task 2: Add quick word scanner for pre-vocabulary coverage check

**Files:**
- Modify: `pipeline/coverage_checker.py` (add `scan_story_coverage` function)
- Create: `tests/test_story_coverage_scanner.py`

**Step 1: Write the failing test**

```python
"""Tests for scan_story_coverage — lightweight coverage check from story text."""
from pipeline.coverage_checker import scan_story_coverage, SPANISH_FUNCTION_WORDS


def test_scan_finds_missing_words():
    """Words in frequency list but not in story text are reported missing."""
    stories = {0: "Maria camina por la calle."}
    frequency_data = {"caminar": 50, "calle": 100, "casa": 150, "la": 10}
    frequency_lemmas = {
        "camina": type("E", (), {"lemma": "caminar", "appropriate": True})(),
    }
    result = scan_story_coverage(stories, frequency_data, frequency_lemmas, top_n=200)
    assert "casa" in result.missing_words
    assert "caminar" not in result.missing_words  # present via lemma
    assert "la" not in result.missing_words  # function word


def test_scan_respects_top_n():
    """Only words within top_n are considered."""
    stories = {0: "Hola mundo."}
    frequency_data = {"hola": 50, "mundo": 100, "casa": 500}
    result = scan_story_coverage(stories, frequency_data, {}, top_n=200)
    assert "casa" not in result.missing_words  # rank 500 > top_n 200


def test_scan_filters_inappropriate():
    """Words marked inappropriate in frequency_lemmas are excluded."""
    stories = {0: "Hola."}
    frequency_data = {"mierda": 50}
    frequency_lemmas = {
        "mierda": type("E", (), {"lemma": "mierda", "appropriate": False})(),
    }
    result = scan_story_coverage(stories, frequency_data, frequency_lemmas, top_n=200)
    assert "mierda" not in result.missing_words


def test_scan_uses_verb_forms():
    """Inflected verb forms are resolved via SPANISH_VERB_FORMS."""
    stories = {0: "Ella tiene un gato."}
    frequency_data = {"tener": 30, "gato": 100}
    result = scan_story_coverage(stories, frequency_data, {}, top_n=200)
    assert "tener" not in result.missing_words  # "tiene" resolves to "tener"
    assert "gato" not in result.missing_words
```

**Step 2: Run test to verify it fails**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_story_coverage_scanner.py -x -v`
Expected: FAIL — `scan_story_coverage` not found

**Step 3: Implement `scan_story_coverage`**

Add to `pipeline/coverage_checker.py`:

```python
def scan_story_coverage(
    stories: dict[int, str],
    frequency_data: dict[str, int],
    frequency_lemmas: dict | None = None,
    top_n: int = 1000,
) -> CoverageReport:
    """Lightweight coverage check from raw story text (no vocabulary.json needed).

    Tokenizes story text, resolves lemmas, and checks against frequency data.
    Used during the text stage before vocabulary extraction exists.
    """
    if frequency_lemmas is None:
        frequency_lemmas = {}

    # Build merged lemma map
    merged_map: dict[str, str] = {**SPANISH_VERB_FORMS}
    for word, entry in frequency_lemmas.items():
        merged_map[word] = entry.lemma

    # Collect inappropriate lemmas
    inappropriate: set[str] = set()
    for word, entry in frequency_lemmas.items():
        if not entry.appropriate:
            inappropriate.add(entry.lemma)
            inappropriate.add(word)

    # Tokenize all stories
    story_words: set[str] = set()
    for text in stories.values():
        for token in text.lower().split():
            cleaned = token.strip(".,;:!?¡¿\"'()[]—–-")
            if cleaned:
                story_words.add(cleaned)

    # Resolve story words to lemmas
    story_lemmas: set[str] = set(story_words)
    for w in story_words:
        if w in merged_map:
            story_lemmas.add(merged_map[w])

    # Filter frequency data
    content_freq = {
        w: rank for w, rank in frequency_data.items()
        if w not in SPANISH_FUNCTION_WORDS
    }
    top_words = {w for w, rank in content_freq.items() if rank <= top_n}

    def is_covered(word: str) -> bool:
        return word in story_lemmas or merged_map.get(word, word) in story_lemmas

    covered = {w for w in top_words if is_covered(w)}

    # Missing lemmas (deduplicated)
    missing_lemmas: set[str] = set()
    for w in top_words:
        if is_covered(w):
            continue
        lemma = merged_map.get(w, w)
        if lemma in story_lemmas or lemma in inappropriate or w in inappropriate:
            continue
        if lemma in SPANISH_FUNCTION_WORDS:
            continue
        missing_lemmas.add(lemma)

    missing_sorted = sorted(missing_lemmas, key=lambda w: content_freq.get(w, 999999))
    pct = (len(covered) / len(top_words) * 100) if top_words else 0.0

    return CoverageReport(
        total_vocabulary=len(story_lemmas),
        frequency_matched=0,
        top_1000_covered=len(covered),
        top_1000_total=len(top_words),
        coverage_percent=round(pct, 1),
        missing_words=missing_sorted,
        thresholds={},
        outside_top_n=0,
        outside_top_n_label=f"top_{top_n}",
    )
```

**Step 4: Run tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_story_coverage_scanner.py -x -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add pipeline/coverage_checker.py tests/test_story_coverage_scanner.py
git commit -m "feat(coverage): add scan_story_coverage for pre-vocabulary coverage check"
```

---

### Task 3: Move vocab gap filling into text stage

**Files:**
- Modify: `scripts/run_all.py:89-331` (run_text_stage — add Pass 4 vocab gaps)
- Modify: `scripts/run_all.py:436-490` (run_fill_gaps_stage — keep as fallback but simplify)

**Step 1: Add vocab gap filling to run_text_stage**

In `run_text_stage()`, after Pass 3 (grammar gap insertion, ~line 188) and before Pass 4 (story audit, ~line 190), add a new Pass 4 for vocab gap filling. Renumber existing Pass 4 (audit) to Pass 5, Pass 5 (translate) to Pass 6, Pass 6 (extract) to Pass 7.

Insert this block after the grammar gap section (after line 188):

```python
    # Pass 4: Vocabulary Gap Filling (requires frequency data + lemmas)
    if frequency_file:
        from pipeline.coverage_checker import scan_story_coverage
        from pipeline.gap_filler import GapFiller
        from pipeline.models import FrequencyLemmaEntry

        freq_path = Path(frequency_file)
        if freq_path.exists():
            frequency_data = load_frequency_data(freq_path)
            effective_top_n = top_n or config.story.coverage_top_n

            # Load frequency lemmas if available
            lemma_path = output_base / config.deck.id / "frequency_lemmas.json"
            frequency_lemmas = {}
            if lemma_path.exists():
                raw_lemmas = json.loads(lemma_path.read_text())
                frequency_lemmas = {k: FrequencyLemmaEntry(**v) for k, v in raw_lemmas.items()}

            # Quick coverage scan from story text
            pre_report = scan_story_coverage(
                stories, frequency_data, frequency_lemmas, top_n=effective_top_n,
            )
            print(f"\n=== Pass 4: Vocabulary Gap Filling ===")
            print(f"  Pre-gap coverage: {pre_report.top_1000_covered}/{pre_report.top_1000_total} ({pre_report.coverage_percent}%)")
            print(f"  Missing words: {len(pre_report.missing_words)}")

            if pre_report.missing_words:
                filler = GapFiller(
                    llm=llm,
                    output_dir=output_base / config.deck.id,
                    config_chapters=config.story.chapters,
                    target_language=config.languages.target,
                    native_language=config.languages.native,
                    dialect=config.languages.dialect or "",
                )
                gap_results = filler.fill_gaps(
                    deck=None,  # Not needed — we pass missing words directly
                    frequency_data=frequency_data,
                    frequency_lemmas=frequency_lemmas,
                    top_n=effective_top_n,
                    stories=stories,  # New param: pass stories for coverage scan
                )

                if gap_results:
                    total_gap = sum(len(s) for s in gap_results.values())
                    print(f"  Generated {total_gap} gap sentences across {len(gap_results)} chapters")

                    # Insert gap sentences into stories
                    for ch_num, gap_sents in gap_results.items():
                        ch_idx = ch_num - 1
                        if ch_idx in chapter_scenes:
                            chapter_scenes[ch_idx] = insert_into_chapter_scene(
                                chapter_scenes[ch_idx], gap_sents,
                            )
                            story_path = output_base / config.deck.id / "stories" / f"chapter_{ch_num:02d}.json"
                            story_path.write_text(json.dumps(
                                chapter_scenes[ch_idx].model_dump(), ensure_ascii=False, indent=2,
                            ))
                            stories[ch_idx] = extract_flat_text(chapter_scenes[ch_idx])
                            print(f"    Chapter {ch_num}: inserted {len(gap_sents)} gap sentences")

                    # Post-gap coverage
                    post_report = scan_story_coverage(
                        stories, frequency_data, frequency_lemmas, top_n=effective_top_n,
                    )
                    print(f"  Post-gap coverage: {post_report.top_1000_covered}/{post_report.top_1000_total} ({post_report.coverage_percent}%)")
            else:
                print("  Coverage target met — no gaps to fill.")
```

**Step 2: Update GapFiller.fill_gaps to accept stories dict**

Modify `pipeline/gap_filler.py` `fill_gaps()` to accept an optional `stories` parameter. When provided, use `scan_story_coverage` instead of `check_coverage` (which requires an OrderedDeck):

In `fill_gaps()`, change the signature and coverage check:

```python
def fill_gaps(
    self,
    deck: "OrderedDeck | None" = None,
    frequency_data: dict[str, int] | None = None,
    frequency_lemmas: dict | None = None,
    top_n: int = 1000,
    stories: dict[int, str] | None = None,
) -> dict[int, list[GapSentence]]:
    if frequency_data is None:
        frequency_data = {}

    # Get missing words — from stories (text stage) or deck (fill-gaps stage)
    if stories is not None:
        from pipeline.coverage_checker import scan_story_coverage
        report = scan_story_coverage(stories, frequency_data, frequency_lemmas, top_n=top_n)
    else:
        report = check_coverage(
            deck, frequency_data, top_n=top_n, frequency_lemmas=frequency_lemmas
        )
    missing = report.missing_words
    # ... rest unchanged
```

**Step 3: Update docstring and pass numbering in run_all.py header**

Update the module docstring at top of `run_all.py`:

```python
"""Run the content pipeline in reviewable stages.

Stage text (default):
  Pass 0: Story generation → stories_raw/
  Pass 1: CEFR simplification → stories/
  Pass 2: Grammar audit + grammar gap fill → gap sentences (source only)
  Pass 3: Insert grammar gap sentences into stories/
  Pass 4: Vocabulary gap fill → generate + insert into stories/
  Pass 5: Story audit → fixes applied to stories/
  Pass 6: Translation → translations/
  Pass 7: Word extraction → words/ + vocabulary.json
  Output lives in output/<deck-id>/{stories,translations,words}/, vocabulary.json.
...
"""
```

**Step 4: Run all tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -x -q`
Expected: All tests pass

**Step 5: Commit**

```bash
git add scripts/run_all.py pipeline/gap_filler.py
git commit -m "feat(pipeline): move vocab gap filling into text stage before audit"
```

---

### Task 4: Add coverage target (90%) to gap filler prompt

**Files:**
- Modify: `pipeline/gap_filler.py:238-262` (generation prompt)

**Step 1: Write failing test**

Add to `tests/test_gap_filler.py`:

```python
def test_gap_filler_prompt_mentions_coverage_target(tmp_path):
    """The generation prompt should mention 90% coverage target."""
    from pipeline.gap_filler import GapFiller

    prompts = []
    def fake_complete_json(prompt, system=None, response_schema=None):
        prompts.append(prompt)
        return type("R", (), {"parsed": {"sentences": []}})()

    llm = type("LLM", (), {"complete_json": fake_complete_json})()
    filler = GapFiller(
        llm=llm, output_dir=tmp_path, config_chapters=[{"title": "Test", "context": "test", "vocab_focus": [], "cefr_level": "A1"}],
        target_language="Spanish", native_language="German", dialect="",
    )
    filler._generate_sentences(1, filler._chapters[0], ["casa", "perro", "gato"], [])
    assert any("90%" in p for p in prompts)
```

**Step 2: Run test — expect FAIL**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_gap_filler.py::test_gap_filler_prompt_mentions_coverage_target -x -v`

**Step 3: Update the generation prompt**

In `gap_filler.py`, `_generate_sentences()`, update the prompt rules:

```python
        prompt = (
            f"Chapter {chapter_num}: \"{title}\"\n"
            f"Context: {context}\n"
            f"CEFR level: {cefr_level}{existing_text}\n"
            f"Words to introduce ({len(words)} words): {words_text}\n\n"
            f"Generate sentences that cover as many of these words as possible. Rules:\n"
            f"1. Use at most {self._max_new_words} of the listed words per sentence.\n"
            f"2. Target at least 90% coverage — cover at least {max(1, int(len(words) * 0.9))} of the {len(words)} words.\n"
            f"3. Generate as many sentences as needed until the coverage target is met.\n"
            f"4. Each sentence must fit the chapter context and CEFR level.\n"
            f"5. Match the tone and style of the existing sentences above.{dialect_note}\n"
            f"6. Where natural, vary the grammatical form of each word across sentences "
            f"— but only when it reads naturally.\n"
            f"7. For each new sentence, specify insert_after: the sentence_index of the "
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
```

**Step 4: Run test — expect PASS**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_gap_filler.py -x -v`

**Step 5: Commit**

```bash
git add pipeline/gap_filler.py tests/test_gap_filler.py
git commit -m "feat(gap-filler): add 90% coverage target to generation prompt"
```

---

### Task 5: Delete dead `merge_gap_sentences` code

**Files:**
- Modify: `pipeline/vocabulary_builder.py:123-197` (delete `merge_gap_sentences`)
- Modify: `scripts/run_all.py:436-490` (simplify `run_fill_gaps_stage` or remove merge call)
- Delete test: `tests/test_vocabulary_builder.py` — remove `test_merge_gap_sentences_*` tests

**Step 1: Remove `merge_gap_sentences` from vocabulary_builder.py**

Delete lines 123-197 (the entire `merge_gap_sentences` function).

**Step 2: Remove merge call from `run_fill_gaps_stage`**

In `run_fill_gaps_stage`, remove the import of `merge_gap_sentences` and the merge logic. The fill-gaps stage now just generates gap sentences to disk (they get inserted in text stage):

```python
def run_fill_gaps_stage(config, llm, output_base, frequency_file, top_n=None):
    """Generate gap-filling sentences (standalone). Sentences are inserted during text stage."""
    from pipeline.gap_filler import GapFiller
    from pipeline.models import FrequencyLemmaEntry

    out_dir = output_base / config.deck.id
    lemma_path = out_dir / "frequency_lemmas.json"

    if not frequency_file:
        print("Error: --frequency-file required for fill-gaps stage")
        sys.exit(1)
    if not lemma_path.exists():
        print("Error: frequency_lemmas.json not found. Run --stage lemmatize first.")
        sys.exit(1)

    print("=== Gap Filling (standalone) ===")
    frequency_data = load_frequency_data(Path(frequency_file))
    raw_lemmas = json.loads(lemma_path.read_text())
    frequency_lemmas = {k: FrequencyLemmaEntry(**v) for k, v in raw_lemmas.items()}

    # Load stories for coverage scan
    stories_dir = out_dir / "stories"
    stories: dict[int, str] = {}
    if stories_dir.exists():
        from pipeline.models import ChapterScene
        for story_file in sorted(stories_dir.glob("chapter_*.json")):
            ch_num = int(story_file.stem.split("_")[1])
            cs = ChapterScene(**json.loads(story_file.read_text()))
            stories[ch_num - 1] = extract_flat_text(cs)

    filler = GapFiller(
        llm=llm,
        output_dir=out_dir,
        config_chapters=config.story.chapters,
        target_language=config.languages.target,
        native_language=config.languages.native,
        dialect=config.languages.dialect or "",
    )
    gap_results = filler.fill_gaps(
        stories=stories,
        frequency_data=frequency_data,
        frequency_lemmas=frequency_lemmas,
        top_n=top_n or config.story.coverage_top_n,
    )

    if not gap_results:
        print("  No gaps to fill.")
        return

    total_sentences = sum(len(s) for s in gap_results.values())
    print(f"  Generated {total_sentences} gap sentences across {len(gap_results)} chapters")
    print("  Note: Run --stage text to insert these into stories and rebuild vocabulary.")
```

**Step 3: Remove dead tests**

Remove `test_merge_gap_sentences_adds_new_word` and `test_merge_gap_sentences_adds_example_to_existing_word` from `tests/test_vocabulary_builder.py`. Also remove the import of `merge_gap_sentences` from that file.

**Step 4: Run all tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -x -q`
Expected: All tests pass

**Step 5: Commit**

```bash
git add pipeline/vocabulary_builder.py scripts/run_all.py tests/test_vocabulary_builder.py
git commit -m "refactor: remove dead merge_gap_sentences, simplify fill-gaps stage"
```

---

### Task 6: Improve story auditor prompt with examples

**Files:**
- Modify: `pipeline/story_auditor.py:21-81` (improve `_build_audit_prompt`)
- Modify: `tests/test_story_auditor.py` (update test expectations)

**Step 1: Update the auditor prompt**

Replace `_build_audit_prompt` with an improved version that includes concrete examples:

```python
def _build_audit_prompt(
    chapters: dict[int, list[str]],
    characters: list[dict],
    chapter_configs: list[dict],
) -> tuple[str, str]:
    """Build system prompt and user prompt for the audit call."""

    # Character reference
    char_lines = []
    for c in characters:
        role = c.get("role", "character")
        chapters_in = c.get("chapters", [])
        ch_note = f" (chapters {chapters_in})" if chapters_in else ""
        char_lines.append(f"  - {c['name']}: {role}{ch_note}")
    char_block = "\n".join(char_lines)

    # Full story text
    story_lines = []
    for ch_num in sorted(chapters.keys()):
        cfg = chapter_configs[ch_num - 1] if ch_num <= len(chapter_configs) else {}
        title = cfg.get("title", f"Chapter {ch_num}")
        cefr = cfg.get("cefr_level", "?")
        context = cfg.get("context", "")
        story_lines.append(f"\n--- Chapter {ch_num}: \"{title}\" [{cefr}] ---")
        if context:
            story_lines.append(f"  Context: {context}")
        for idx, sentence in enumerate(chapters[ch_num]):
            story_lines.append(f"  [{ch_num}:{idx}] {sentence}")
    story_block = "\n".join(story_lines)

    system = (
        "You are an expert language editor reviewing a graded reader story "
        "for language learners. You check for semantic, grammatical, and "
        "continuity errors. Only flag clear mistakes — not style preferences. "
        "Return valid JSON."
    )

    prompt = (
        f"Review this complete story for errors.\n\n"
        f"CHARACTERS:\n{char_block}\n\n"
        f"STORY:\n{story_block}\n\n"
        f"Check for these error categories:\n\n"
        f"1. TENSE CONSISTENCY\n"
        f"   - Narrative tense must be consistent within each chapter\n"
        f"   - Past events must use past tense, not present\n"
        f"   - Example error: \"Yo estoy perdida en Roma\" when narrating a past memory "
        f"→ fix: \"Yo estaba perdida en Roma\"\n"
        f"   - Example error: Using present tense \"María camina\" mid-chapter when the "
        f"rest uses preterite \"María caminó\"\n\n"
        f"2. CHARACTER CONSISTENCY\n"
        f"   - Characters must only appear in their assigned chapters\n"
        f"   - Names, relationships, and roles must be consistent\n"
        f"   - Check the character list above for which chapters each character appears in\n\n"
        f"3. CROSS-CHAPTER CONTINUITY\n"
        f"   - Objects, clothing, and possessions must be consistent across chapters\n"
        f"   - Example error: \"cardigan verde\" in ch3 when ch1 established \"chaqueta azul\"\n"
        f"   - Locations must match the story context (don't reference cities the character hasn't visited)\n\n"
        f"4. CEFR LEVEL VIOLATIONS\n"
        f"   - Each chapter has a CEFR level shown in brackets [A1], [A2], etc.\n"
        f"   - A1 chapters: only simple present, ser/estar, hay, basic adjectives, simple questions\n"
        f"   - A1 should NOT have: subjunctive, compound tenses, imperatives with clitics, "
        f"advanced vocabulary like \"temblorosas\", \"alivio\", \"anuncia\"\n"
        f"   - A2 chapters may add: preterite, imperfecto, reflexives, comparatives, modals\n"
        f"   - Example error: \"Ten cuidado y llámame\" in A1 (imperative+clitic = A2+)\n"
        f"   - Example error: \"Cuídate\" in A1 (reflexive imperative = A2+)\n"
        f"   - When fixing CEFR violations, simplify the sentence to fit the level, "
        f"don't just swap one word\n\n"
        f"5. SCENE LOGIC\n"
        f"   - Actions must fit the setting described in context\n"
        f"   - Verb collocations must be correct (cars don't walk, people don't fly)\n"
        f"   - Contradictions within a chapter (e.g. \"many open suitcases\" when only one was mentioned)\n\n"
        f"Return ONLY a JSON object with a 'fixes' array. Each fix:\n"
        f'{{\n'
        f'  "fixes": [\n'
        f'    {{\n'
        f'      "chapter": 1,\n'
        f'      "sentence_index": 5,\n'
        f'      "original": "exact original sentence",\n'
        f'      "fixed": "corrected sentence",\n'
        f'      "reason": "brief explanation"\n'
        f'    }}\n'
        f'  ]\n'
        f'}}\n\n'
        f"If no errors found, return {{\"fixes\": []}}."
    )

    return system, prompt
```

**Step 2: Run existing auditor tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_story_auditor.py -x -v`
Expected: Tests should still pass (they test the response parsing, not prompt content)

**Step 3: Commit**

```bash
git add pipeline/story_auditor.py
git commit -m "feat(auditor): improve prompt with concrete error examples and CEFR rules"
```

---

### Task 7: Run pipeline on chapters 1-3 and verify

**Step 1: Delete old cached output to force regeneration**

```bash
rm -rf output/es-de-buenos-aires/gap_sentences/
rm -rf output/es-de-buenos-aires/gap_word_assignment.json
# Keep stories_raw/ cached to avoid re-generating stories from scratch
# Delete stories/ to force re-simplification (picks up gap sentences)
rm -rf output/es-de-buenos-aires/stories/
rm -rf output/es-de-buenos-aires/translations/
rm -rf output/es-de-buenos-aires/words/
rm -rf output/es-de-buenos-aires/vocabulary.json
```

**Step 2: Run the pipeline**

```bash
cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline
uv run python scripts/run_all.py \
  --config configs/spanish_buenos_aires.yaml \
  --chapters 1-3 \
  --frequency-file data/frequency/es_50k.txt \
  --top-n 250
```

**Step 3: Verify results**

Check the output for:
- Pre-gap and post-gap coverage numbers (should show improvement)
- Gap sentences inserted into stories/
- Audit fixes applied (should catch tense/CEFR issues)
- Final coverage report (target: ≥90% of top 250)
- vocabulary.json has more words than before (was 129)
