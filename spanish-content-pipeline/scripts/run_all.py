"""Run the content pipeline in reviewable stages.

Stage text (default):
  Pass 0: Story generation → stories_raw/
  Pass 1: CEFR simplification → stories/
  Pass 2: Grammar audit + grammar gap fill → gap sentences (source only)
  Pass 3: Insert grammar gap sentences into stories/
  Pass 4: Vocabulary gap fill → generate + insert into stories/
  Pass 5: Story audit (find→fix loop) → fixes applied to stories/
  Pass 6: Translation → translations/
  Pass 7: Word extraction → words/ + vocabulary.json
  Pass 8: Image pipeline (scene review + prompt generation) → updated stories/
  Output lives in output/<deck-id>/{stories,translations,words}/, vocabulary.json.

Stage lemmatize:
  LLM-lemmatize top-N words from frequency file. Cached — safe to re-run.
  Output: output/<deck-id>/frequency_lemmas.json

Stage fill-gaps:
  Generate gap-filling sentences for missing high-frequency vocabulary.
  Requires vocabulary.json (text stage) + frequency_lemmas.json (lemmatize stage).
  Output: output/<deck-id>/gap_sentences/, vocabulary.json (rebuilt).

Stage media:
  Reads text output from disk (no LLM calls), then generates images and audio.
  Run only once you are happy with the text.

Usage:
  uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --chapters 1-2
  uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --stage lemmatize --frequency-file data/frequency/es_50k.txt
  uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --stage fill-gaps --frequency-file data/frequency/es_50k.txt
  uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --chapters 1-2 --stage media
  uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --stage all
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import DeckConfig, load_config
from pipeline.coverage_checker import check_coverage, load_frequency_data
from pipeline.image_generator import ImageGenerator
from pipeline.llm import create_client
from pipeline.models import ChapterScene, ImagePromptResult, SentencePair
from pipeline.cefr_simplifier import CEFRSimplifier
from pipeline.sentence_inserter import insert_into_chapter_scene, insert_shots_into_chapter_scene
from pipeline.sentence_translator import SentenceTranslator
from pipeline.story_generator import (
    StoryGenerator,
    expand_manifest_for_shared_shots,
    extract_flat_text,
    extract_image_prompts,
    finalize_image_prompt,
)
from pipeline.image_auditor import (
    review_scenes,
    apply_scene_review,
    generate_prompts,
    apply_prompts,
)
from pipeline.vocabulary_builder import build_vocabulary
from pipeline.word_extractor import WordExtractor


class CostTracker:
    """Track API costs per pipeline step."""

    def __init__(self):
        self._steps: list[tuple[str, float]] = []
        self._current_step: str = ""
        self._current_cost: float = 0.0

    def begin(self, step_name: str):
        """Start tracking a new pipeline step."""
        if self._current_step:
            self._steps.append((self._current_step, self._current_cost))
        self._current_step = step_name
        self._current_cost = 0.0

    def add(self, response):
        """Add cost from an LLMResponse (or list of them)."""
        if response is None:
            return
        if isinstance(response, list):
            for r in response:
                self.add(r)
            return
        cost = getattr(getattr(response, "usage", None), "cost_usd", None)
        if cost:
            self._current_cost += cost

    def finish(self):
        """Flush the current step and print the summary."""
        if self._current_step:
            self._steps.append((self._current_step, self._current_cost))
            self._current_step = ""
        total = sum(c for _, c in self._steps)
        if total == 0:
            return
        print("\n=== Cost Summary ===")
        for step, cost in self._steps:
            if cost > 0:
                print(f"  {step:40s} {cost * 100:8.2f}¢")
        print(f"  {'─' * 40} {'─' * 8}")
        print(f"  {'TOTAL':40s} {total * 100:8.2f}¢  (${total:.4f})")


def parse_chapter_range(spec: str, max_chapters: int) -> range:
    if "-" in spec:
        start, end = spec.split("-", 1)
        return range(int(start) - 1, int(end))
    else:
        idx = int(spec) - 1
        return range(idx, idx + 1)


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


def get_api_key(config: DeckConfig) -> str:
    return get_api_key_for_provider(config.models.story_generation.provider)


def _inject_unnamed_characters(config_path: Path, unnamed_chars: list, config: DeckConfig) -> list[str]:
    """Append newly discovered unnamed characters to the config YAML.

    Compares unnamed characters against existing secondary_characters by
    role (case-insensitive). New characters are appended to the YAML file
    under secondary_characters with a comment marking them as auto-injected.
    Returns list of injected character names/roles.
    """
    existing_roles = {sc.role.lower().strip() for sc in config.secondary_characters if sc.role}
    existing_names = {sc.name.lower().strip() for sc in config.secondary_characters}

    new_chars = []
    for uc in unnamed_chars:
        role_lower = uc.role.lower().strip()
        # Skip if role or a similar name already exists
        if role_lower in existing_roles:
            continue
        # Also check if the role words overlap significantly with an existing name
        role_words = set(role_lower.split())
        if any(role_words & set(n.split()) for n in existing_names):
            continue
        new_chars.append(uc)

    if not new_chars:
        return []

    # Build YAML lines to append
    lines = []
    for uc in new_chars:
        # Capitalize first word of role as a name
        name = uc.role.title()
        lines.append(f"")
        lines.append(f"  # Auto-injected by story audit")
        lines.append(f"  - name: \"{name}\"")
        lines.append(f"    visual_tag: \"{uc.suggested_visual_tag}\"")
        lines.append(f"    image_tag: \"\"")
        lines.append(f"    chapters: {uc.chapters}")
        lines.append(f"    role: \"{uc.role}\"")

    # Append to config file
    yaml_text = config_path.read_text()
    yaml_text = yaml_text.rstrip() + "\n" + "\n".join(lines) + "\n"
    config_path.write_text(yaml_text)

    # Also update the in-memory config so subsequent passes see the new characters
    from pipeline.config import SecondaryCharacter
    for uc in new_chars:
        config.secondary_characters.append(SecondaryCharacter(
            name=uc.role.title(),
            visual_tag=uc.suggested_visual_tag,
            chapters=uc.chapters,
            role=uc.role,
        ))

    return [uc.role.title() for uc in new_chars]


def create_model_client(model_config, transport=None):
    """Create an LLM client from a ModelConfig."""
    api_key = get_api_key_for_provider(model_config.provider)
    return create_client(
        provider=model_config.provider,
        api_key=api_key,
        model=model_config.model,
        temperature=model_config.temperature,
        max_retries=model_config.max_retries,
        transport=transport,
    )


def run_text_stage(config, chapter_range, output_base, frequency_file=None, config_path=None, top_n=None, skip_image_audit=False):
    """Full text pipeline: generate → simplify → grammar gaps → insert → vocab gaps → audit → translate → extract."""
    cost = CostTracker()

    # Pass 0: Unconstrained story generation → stories_raw/
    cost.begin("Pass 0: Story Generation")
    print("=== Pass 0: Unconstrained Story Generation ===")
    llm_story = create_model_client(config.models.story_generation)
    story_gen = StoryGenerator(config, llm_story, output_base=output_base)
    raw_chapters = []
    summaries = []
    for i in chapter_range:
        ch = config.story.chapters[i]
        chapter, resp = story_gen.generate_chapter(i, previous_summaries=summaries if summaries else None)
        cost.add(resp)
        raw_chapters.append(chapter)
        # Load or generate summary for continuity
        summary_path = output_base / config.deck.id / "stories_raw" / f"summary_{i + 1:02d}.txt"
        if summary_path.exists():
            summaries.append(summary_path.read_text())
        scenes_count = len(chapter.scenes)
        shots_count = sum(len(s.shots) for s in chapter.scenes)
        print(f"  Chapter {i+1}: {ch.title} ({scenes_count} scenes, {shots_count} shots)")

    # Pass 1: CEFR simplification → stories/
    cost.begin("Pass 1: CEFR Simplification")
    print("\n=== Pass 1: CEFR Simplification ===")
    llm_simplify = create_model_client(config.models.cefr_simplification)
    simplifier = CEFRSimplifier(config, llm_simplify, output_base=output_base)
    chapter_scenes: dict[int, ChapterScene] = {}
    stories: dict[int, str] = {}
    for idx, i in enumerate(chapter_range):
        ch = config.story.chapters[i]
        cefr = ch.cefr_level or config.story.cefr_level
        print(f"  Chapter {i+1}: {ch.title} [{cefr}]...", end=" ", flush=True)
        chapter_scenes[i], resp = simplifier.simplify_chapter(i, raw_chapters[idx])
        cost.add(resp)
        stories[i] = extract_flat_text(chapter_scenes[i])
        print("done")

    # Pass 2: Grammar Audit + Gap Fill (before translation — source only)
    if config.story.grammar_targets:
        from pipeline.grammar_auditor import audit_grammar
        from pipeline.grammar_gap_filler import GrammarGapFiller

        cost.begin("Pass 2: Grammar Audit + Gap Fill")
        print("\n=== Pass 2: Grammar Audit ===")
        llm_grammar = create_model_client(config.models.grammar)
        chapters_by_cefr: dict[str, list[str]] = {}
        for i in chapter_range:
            ch = config.story.chapters[i]
            cefr = ch.cefr_level or config.story.cefr_level
            sentences = stories[i].split("\n")
            chapters_by_cefr.setdefault(cefr, []).extend(sentences)

        grammar_report, grammar_responses = audit_grammar(
            chapters_by_cefr=chapters_by_cefr,
            grammar_targets=config.story.grammar_targets,
            llm=llm_grammar,
        )
        cost.add(grammar_responses)

        for cefr, level_report in sorted(grammar_report.levels.items()):
            present = sum(1 for t in level_report.targets if t.present)
            total = len(level_report.targets)
            print(f"  {cefr}: {present}/{total} grammar targets present ({level_report.coverage:.0%})")
            for t in level_report.targets:
                status = "OK" if t.present else "MISSING"
                print(f"    [{status}] {t.target}")
                if t.present and t.example:
                    print(f"           Example: {t.example}")

        # Pass 2b: Grammar Gap Filling
        grammar_filler = GrammarGapFiller(
            llm=llm_grammar,
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
        grammar_sentences, grammar_fill_resp = grammar_filler.fill_gaps(grammar_report)
        cost.add(grammar_fill_resp)

        if grammar_sentences:
            print(f"\n=== Pass 2b: Grammar Gap Filling ===")
            print(f"  Generated {len(grammar_sentences)} sentences for missing grammar targets")
            for s in grammar_sentences:
                print(f"    [{s.cefr_level}] {s.grammar_target}")
                print(f"      {s.source}")

            # Pass 3: Insert grammar gap sentences into stories/ ChapterScene JSON
            from collections import defaultdict
            by_chapter: dict[int, list] = defaultdict(list)
            for gs in grammar_sentences:
                by_chapter[gs.chapter].append(gs)

            print(f"\n=== Pass 3: Insert Gap Sentences into Stories ===")
            for ch_num, g_sentences in by_chapter.items():
                ch_idx = ch_num - 1
                if ch_idx in chapter_scenes:
                    chapter_scenes[ch_idx] = insert_into_chapter_scene(
                        chapter_scenes[ch_idx], g_sentences,
                    )
                    # Update stories/ on disk
                    story_path = output_base / config.deck.id / "stories" / f"chapter_{ch_num:02d}.json"
                    story_path.write_text(json.dumps(
                        chapter_scenes[ch_idx].model_dump(), ensure_ascii=False, indent=2,
                    ))
                    # Re-extract flat text for translation
                    stories[ch_idx] = extract_flat_text(chapter_scenes[ch_idx])
                    print(f"  Chapter {ch_num}: inserted {len(g_sentences)} gap sentences")
        else:
            print("\n  No grammar gaps to fill.")

    # Pass 4: Vocabulary Gap Filling (requires frequency data + lemmas)
    # Pass 4: Vocabulary Gap Filling
    cost.begin("Pass 4: Vocab Gap Fill")
    gap_words_by_chapter: dict[int, list[str]] = {}
    if frequency_file:
        from pipeline.coverage_checker import scan_story_coverage
        from pipeline.gap_filler import GapFiller

        freq_path = Path(frequency_file)
        if freq_path.exists():
            frequency_data_local = load_frequency_data(freq_path)
            effective_top_n = top_n or config.story.coverage_top_n
            lang_code = config.languages.target_code

            # Auto-run lemmatization if frequency_lemmas.json doesn't exist yet
            lemma_path = output_base / config.deck.id / "frequency_lemmas.json"
            if not lemma_path.exists():
                from pipeline.frequency_lemmatizer import FrequencyLemmatizer
                print("\n=== Auto: Frequency Lemmatization (first run) ===")
                lemma_model = config.models.lemmatization or config.models.cefr_simplification
                llm_lemma = create_model_client(lemma_model)
                lem = FrequencyLemmatizer(
                    llm=llm_lemma,
                    output_dir=output_base / config.deck.id,
                    target_language=config.languages.target,
                    lang_code=lang_code,
                    domain=f"travel {config.languages.target}, {config.destination.city}",
                )
                top_words = sorted(
                    [w for w in frequency_data_local if frequency_data_local[w] <= 2000],
                    key=lambda w: frequency_data_local[w],
                )
                lem_result = lem.lemmatize(top_words)
                appropriate = sum(1 for e in lem_result.values() if e.appropriate)
                cost.add(None)  # LLM cost tracked internally
                print(f"  {len(lem_result)} words lemmatized, {appropriate} appropriate for deck")

            # Load inappropriate lemmas from frequency_lemmas.json
            inappropriate_lemmas: set[str] = set()
            if lemma_path.exists():
                from pipeline.models import FrequencyLemmaEntry
                raw_lemmas = json.loads(lemma_path.read_text())
                for word, entry_data in raw_lemmas.items():
                    entry = FrequencyLemmaEntry(**entry_data)
                    if not entry.appropriate:
                        inappropriate_lemmas.add(entry.lemma)
                        inappropriate_lemmas.add(word)

            # Quick coverage scan from story text
            pre_report = scan_story_coverage(
                stories, frequency_data_local, lang=lang_code, top_n=effective_top_n,
                inappropriate_lemmas=inappropriate_lemmas,
            )
            print(f"\n=== Pass 4: Vocabulary Gap Filling ===")
            print(f"  Pre-gap coverage: {pre_report.top_1000_covered}/{pre_report.top_1000_total} ({pre_report.coverage_percent}%)")
            print(f"  Missing words: {len(pre_report.missing_words)}")

            if pre_report.missing_words:
                # Clear gap sentence cache (assignment depends on chapter range)
                gap_cache = output_base / config.deck.id / "gap_sentences"
                assignment_cache = output_base / config.deck.id / "gap_word_assignment.json"
                if gap_cache.exists():
                    import shutil
                    shutil.rmtree(gap_cache)
                if assignment_cache.exists():
                    assignment_cache.unlink()

                llm_gap = create_model_client(config.models.gap_filling)
                filler = GapFiller(
                    llm=llm_gap,
                    output_dir=output_base / config.deck.id,
                    config_chapters=config.story.chapters,
                    target_language=config.languages.target,
                    native_language=config.languages.native,
                    dialect=config.languages.dialect or "",
                    lang_code=lang_code,
                    chapter_range=chapter_range,
                    protagonist_name=config.protagonist.name,
                    secondary_characters=config.secondary_characters,
                    grammar_targets=config.story.grammar_targets,
                )
                gap_results, gap_responses = filler.fill_gaps(
                    stories=stories,
                    frequency_data=frequency_data_local,
                    top_n=effective_top_n,
                    inappropriate_lemmas=inappropriate_lemmas,
                )

                cost.add(gap_responses)

                if gap_results:
                    total_gap = sum(len(s) for s in gap_results.values())
                    print(f"  Generated {total_gap} gap sentences across {len(gap_results)} chapters")

                    # Insert gap shots into stories, collect gap words per chapter
                    gap_words_by_chapter: dict[int, list[str]] = {}
                    for ch_num, gap_sents in gap_results.items():
                        ch_idx = ch_num - 1
                        if ch_idx in chapter_scenes:
                            chapter_scenes[ch_idx] = insert_shots_into_chapter_scene(
                                chapter_scenes[ch_idx], gap_sents,
                            )
                            gap_words_by_chapter[ch_num] = [
                                w for gs in gap_sents for w in gs.covers
                            ]
                            story_path = output_base / config.deck.id / "stories" / f"chapter_{ch_num:02d}.json"
                            story_path.write_text(json.dumps(
                                chapter_scenes[ch_idx].model_dump(), ensure_ascii=False, indent=2,
                            ))
                            stories[ch_idx] = extract_flat_text(chapter_scenes[ch_idx])
                            print(f"    Chapter {ch_num}: inserted {len(gap_sents)} gap sentences")

                    # Post-gap coverage
                    post_report = scan_story_coverage(
                        stories, frequency_data_local, lang=lang_code, top_n=effective_top_n,
                        inappropriate_lemmas=inappropriate_lemmas,
                    )
                    print(f"  Post-gap coverage: {post_report.top_1000_covered}/{post_report.top_1000_total} ({post_report.coverage_percent}%)")
            else:
                print("  Coverage target met — no gaps to fill.")

    # Pass 4b: Per-Chapter Narrative Audit (runs for all chapters, not just gap-filled ones)
    cost.begin("Pass 4b: Chapter Audit")
    from pipeline.chapter_auditor import audit_chapter, apply_chapter_actions

    print("\n=== Pass 4b: Per-Chapter Narrative Audit ===")
    llm_ch_audit = create_model_client(config.models.chapter_audit)

    for ch_idx in chapter_range:
        if ch_idx not in chapter_scenes:
            continue
        ch_num = ch_idx + 1

        ch_config = {
            "title": config.story.chapters[ch_idx].title,
            "cefr_level": config.story.chapters[ch_idx].cefr_level or config.story.cefr_level,
            "context": config.story.chapters[ch_idx].context,
        }

        # Filter characters to this chapter
        ch_chars = [{"name": config.protagonist.name, "role": "protagonist"}]
        for sc_char in config.secondary_characters:
            if ch_num in sc_char.chapters:
                ch_chars.append({"name": sc_char.name, "role": sc_char.role or "secondary character"})

        gap_words = gap_words_by_chapter.get(ch_num, [])

        actions, ch_audit_resp = audit_chapter(
            chapter_scene=chapter_scenes[ch_idx],
            chapter_config=ch_config,
            characters=ch_chars,
            llm=llm_ch_audit,
            gap_words=gap_words,
        )
        cost.add(ch_audit_resp)

        if actions:
            rewrites = sum(1 for a in actions if a.action == "rewrite")
            moves = sum(1 for a in actions if a.action == "move_shot")
            removals = sum(1 for a in actions if a.action == "remove_shot")
            parts = []
            if rewrites: parts.append(f"{rewrites} rewrites")
            if moves: parts.append(f"{moves} moves")
            if removals: parts.append(f"{removals} removals")
            print(f"  Chapter {ch_num}: {', '.join(parts)}")
            for a in actions:
                if a.action == "rewrite":
                    print(f"    [sent {a.sentence_index}] {a.reason}")
                    print(f"      {a.original}")
                    print(f"      → {a.fixed}")
                elif a.action == "move_shot":
                    print(f"    [shot {a.shot_index}] MOVE after shot {a.move_after}: {a.reason}")
                else:
                    print(f"    [shot {a.shot_index}] REMOVE: {a.reason}")

            chapter_scenes[ch_idx] = apply_chapter_actions(chapter_scenes[ch_idx], actions)
            story_path = output_base / config.deck.id / "stories" / f"chapter_{ch_num:02d}.json"
            story_path.write_text(json.dumps(
                chapter_scenes[ch_idx].model_dump(), ensure_ascii=False, indent=2,
            ))
            stories[ch_idx] = extract_flat_text(chapter_scenes[ch_idx])
        else:
            print(f"  Chapter {ch_num}: no issues found")

    # Pass 5: Story Audit — iterative find→fix loop
    cost.begin("Pass 5: Story Audit")
    from pipeline.story_auditor import find_issues, fix_issues_parallel, apply_fixes, dedup_consecutive_sentences

    max_iterations = config.story.audit_max_iterations
    llm_review = create_model_client(config.models.story_review)
    llm_fix = create_model_client(config.models.story_fix)

    audit_log: dict = {"iterations": [], "image_audit": None, "unnamed_characters": []}

    # Build characters list from config
    characters = [{"name": config.protagonist.name, "role": "protagonist"}]
    for sc in config.secondary_characters:
        characters.append({
            "name": sc.name,
            "role": sc.role or "secondary character",
            "chapters": sc.chapters,
            "visual_tag": sc.visual_tag,
        })

    # Build chapter configs
    chapter_configs = [
        {"title": ch.title, "cefr_level": ch.cefr_level or config.story.cefr_level, "context": ch.context}
        for ch in config.story.chapters
    ]

    all_unnamed = []
    for iteration in range(1, max_iterations + 1):
        print(f"\n=== Pass 5a: Story Review (iteration {iteration}/{max_iterations}) ===")

        # Build chapters dict from current stories
        audit_chapters: dict[int, list[str]] = {}
        for i in chapter_range:
            audit_chapters[i + 1] = stories[i].split("\n")

        # Build focus words map: (chapter, sentence_index) → shot.focus
        focus_words_map: dict[tuple[int, int], str] = {}
        for i in chapter_range:
            if i in chapter_scenes:
                ch_num = i + 1
                for scene in chapter_scenes[i].scenes:
                    for shot in scene.shots:
                        if shot.focus:
                            for sent in shot.sentences:
                                focus_words_map[(ch_num, sent.sentence_index)] = shot.focus

        (issues, unnamed_chars), review_resp = find_issues(
            chapters=audit_chapters,
            characters=characters,
            chapter_configs=chapter_configs,
            llm=llm_review,
            focus_words_map=focus_words_map,
        )
        cost.add(review_resp)

        if unnamed_chars:
            all_unnamed.extend(unnamed_chars)

        critical = [i for i in issues if i.severity == "critical"]
        minor = [i for i in issues if i.severity == "minor"]
        print(f"  Found {len(critical)} critical, {len(minor)} minor issues")

        if not critical:
            print("  No critical issues — story is clean!")
            audit_log["iterations"].append({
                "iteration": iteration,
                "issues": [i.model_dump() for i in issues],
                "fixes": [],
                "applied": 0,
            })
            break

        for issue in issues:
            tag = "CRITICAL" if issue.severity == "critical" else "minor"
            print(f"    [{tag}] Ch{issue.chapter}[{issue.sentence_index}] "
                  f"({issue.category}): {issue.description}")

        # Pass 5b: Fix all issues in parallel (stop condition uses critical count)
        print(f"\n=== Pass 5b: Fixing {len(issues)} issues ===")
        fixes = fix_issues_parallel(
            issues,
            chapters=audit_chapters,
            chapter_configs=chapter_configs,
            llm=llm_fix,
            max_workers=4,
            focus_words_map=focus_words_map,
        )

        for fix in fixes:
            if fix.action == "remove":
                print(f"    Ch{fix.chapter}[{fix.sentence_index}]: REMOVE")
            else:
                print(f"    Ch{fix.chapter}[{fix.sentence_index}]: {fix.original}")
                print(f"      → {fix.fixed}")

        stories_dir = output_base / config.deck.id / "stories"
        applied = apply_fixes(fixes, stories_dir)
        print(f"  Applied {applied}/{len(fixes)} fixes")

        # Post-fix: remove duplicate consecutive sentences
        for i in chapter_range:
            story_path = stories_dir / f"chapter_{i+1:02d}.json"
            if story_path.exists():
                ch_data = json.loads(story_path.read_text())
                dupes = dedup_consecutive_sentences(ch_data)
                if dupes:
                    print(f"  Removed {dupes} duplicate sentences in chapter {i+1}")
                    story_path.write_text(json.dumps(ch_data, ensure_ascii=False, indent=2))

        audit_log["iterations"].append({
            "iteration": iteration,
            "issues": [i.model_dump() for i in issues],
            "fixes": [f.model_dump() for f in fixes],
            "applied": applied,
        })

        # Reload stories from disk
        for i in chapter_range:
            story_path = stories_dir / f"chapter_{i+1:02d}.json"
            if story_path.exists():
                chapter_scenes[i] = ChapterScene(**json.loads(story_path.read_text()))
                stories[i] = extract_flat_text(chapter_scenes[i])

    if all_unnamed:
        print(f"\n  Unnamed recurring characters ({len(all_unnamed)}):")
        for uc in all_unnamed:
            print(f"    {uc.role} (chapters {uc.chapters}): {uc.suggested_visual_tag}")

        # Auto-inject new unnamed characters into the config YAML
        if config_path:
            injected = _inject_unnamed_characters(Path(config_path), all_unnamed, config)
            if injected:
                print(f"  Auto-injected {len(injected)} new character(s) into config:")
                for name in injected:
                    print(f"    + {name}")

    audit_log["unnamed_characters"] = [u.model_dump() for u in all_unnamed]

    # Write audit log
    audit_log_path = output_base / config.deck.id / "audit_log.json"
    audit_log_path.write_text(json.dumps(audit_log, ensure_ascii=False, indent=2))
    print(f"\n  Audit log saved to {audit_log_path}")

    # Pass 6: Translation (on final, clean source text)
    cost.begin("Pass 6: Translation")
    print("\n=== Pass 6: Sentence Translation ===")
    llm_translate = create_model_client(config.models.translation)
    translator = SentenceTranslator(config, llm_translate, output_base=output_base)
    all_pairs: dict[int, list[SentencePair]] = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        all_pairs[i], trans_resp = translator.translate_chapter(i, stories[i])
        cost.add(trans_resp)
        print(f"done ({len(all_pairs[i])} sentences)")

    # Pass 7: Word extraction
    cost.begin("Pass 7: Word Extraction")
    print("\n=== Pass 7: Word Extraction ===")
    llm_extract = create_model_client(config.models.word_extraction)
    extractor = WordExtractor(config, llm_extract, output_base=output_base)
    all_chapters = []
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        chapter_words, extract_resp = extractor.extract_chapter(i, all_pairs[i])
        cost.add(extract_resp)
        all_chapters.append(chapter_words)
        print(f"done ({len(chapter_words.words)} words)")

    # Vocabulary DB
    print("\n=== Building Vocabulary Database ===")
    frequency_data = {}
    if frequency_file:
        freq_path = Path(frequency_file)
        if freq_path.exists():
            frequency_data = load_frequency_data(freq_path)
            print(f"  Loaded {len(frequency_data)} frequency entries")

    chapter_titles = {i + 1: config.story.chapters[i].title for i in chapter_range}
    deck = build_vocabulary(
        all_chapters,
        frequency_data=frequency_data,
        chapter_titles=chapter_titles,
        deck_id=config.deck.id,
        deck_name=config.deck.name,
    )
    vocab_path = output_base / config.deck.id / "vocabulary.json"
    vocab_path.parent.mkdir(parents=True, exist_ok=True)
    vocab_path.write_text(json.dumps(deck.model_dump(), ensure_ascii=False, indent=2))
    print(f"  {deck.total_words} unique vocabulary entries saved to {vocab_path}")

    # Coverage report
    if frequency_data:
        # Build inappropriate lemmas set from frequency_lemmas.json
        inappropriate_cov: set[str] = set()
        lemma_path = output_base / config.deck.id / "frequency_lemmas.json"
        if lemma_path.exists():
            from pipeline.models import FrequencyLemmaEntry as _FLE
            raw = json.loads(lemma_path.read_text())
            for word, entry_data in raw.items():
                entry = _FLE(**entry_data)
                if not entry.appropriate:
                    inappropriate_cov.add(entry.lemma)
                    inappropriate_cov.add(word)

        print("\n=== Coverage Report ===")
        effective_top_n = top_n or config.story.coverage_top_n
        report = check_coverage(
            deck, frequency_data,
            top_n=effective_top_n,
            lang=config.languages.target_code,
            extra_thresholds=[2000, 3000, 4000, 5000],
            inappropriate_lemmas=inappropriate_cov,
        )
        report_path = output_base / config.deck.id / "coverage_report.json"
        report_path.write_text(json.dumps(report.model_dump(), ensure_ascii=False, indent=2))
        print(f"  Top  1000: {report.top_1000_covered:3d}/{report.top_1000_total} ({report.coverage_percent}%)")
        for key, data in sorted(report.thresholds.items()):
            n = key.replace("top_", "")
            print(f"  Top {int(n):5d}: {int(data['covered']):3d}/{int(data['total'])} ({data['percent']}%)")
        print(f"  Outside {report.outside_top_n_label}: {report.outside_top_n} words ({report.outside_top_n / report.total_vocabulary * 100:.1f}% of vocab)")
        missing_preview = ", ".join(report.missing_words[:20])
        print(f"  Top missing content words: {missing_preview}")

    # Pass 8: Image Pipeline — Scene Review + Prompt Generation
    # Runs AFTER all text work (translation + word extraction) is complete.
    if not skip_image_audit:
        cost.begin("Pass 8: Image Pipeline")
        print("\n=== Pass 8: Image Pipeline ===")
        llm_img_review = create_model_client(config.models.image_review)
        llm_img_prompt = create_model_client(config.models.image_fix)

        # Build character info with image_tags for prompt generation
        img_characters = [{
            "name": config.protagonist.name,
            "role": "protagonist",
            "image_tag": config.protagonist.image_tag,
            "visual_tag": config.protagonist.visual_tag,
        }]
        for sc in config.secondary_characters:
            img_characters.append({
                "name": sc.name,
                "role": sc.role or "secondary character",
                "image_tag": sc.image_tag,
                "visual_tag": sc.visual_tag,
                "chapters": sc.chapters,
            })

        img_audit_log = []
        for i in chapter_range:
            ch_num = i + 1
            story_path = output_base / config.deck.id / "stories" / f"chapter_{ch_num:02d}.json"
            if not story_path.exists():
                continue

            ch_data = ChapterScene(**json.loads(story_path.read_text()))
            pre_shots = sum(len(s.shots) for s in ch_data.scenes)

            # Step 1: Scene Review — restructure shots (split oversized)
            reviewed, review_resp = review_scenes(ch_data, llm=llm_img_review)
            cost.add(review_resp)

            if reviewed:
                ch_data = apply_scene_review(ch_data, reviewed)
                post_shots = sum(len(s.shots) for s in ch_data.scenes)
                delta = f" ({pre_shots} → {post_shots})" if post_shots != pre_shots else ""
                print(f"  Ch{ch_num}: {post_shots} shots{delta}")
            else:
                post_shots = pre_shots
                print(f"  Ch{ch_num}: {post_shots} shots (review skipped)")

            # Step 2: Prompt Generation — new prompts for all shots
            ch_chars = [c for c in img_characters
                        if c.get("role") == "protagonist"
                        or ch_num in c.get("chapters", [])]
            prompts, prompt_resp = generate_prompts(ch_data, ch_chars, llm=llm_img_prompt)
            cost.add(prompt_resp)

            if prompts:
                ch_data = apply_prompts(ch_data, prompts)
                expected = sum(len(s.shots) for s in ch_data.scenes)
                if len(prompts) < expected:
                    print(f"          {len(prompts)}/{expected} prompts (some missing)")
                else:
                    print(f"          {len(prompts)} prompts generated")

            # Step 3: Finalize — inject character tags + style/suffix
            for scene in ch_data.scenes:
                for shot in scene.shots:
                    if shot.image_prompt:
                        shot.image_prompt = finalize_image_prompt(shot.image_prompt, config)

            # Save updated chapter
            story_path.write_text(json.dumps(ch_data.model_dump(), ensure_ascii=False, indent=2))
            chapter_scenes[i] = ch_data
            stories[i] = extract_flat_text(ch_data)

            img_audit_log.append({
                "chapter": ch_num,
                "pre_shots": pre_shots,
                "post_shots": post_shots,
                "prompts_generated": len(prompts),
            })

        audit_log["image_audit"] = img_audit_log
    else:
        print("\n=== Pass 8: Image Pipeline [SKIPPED] ===")
        audit_log["image_audit"] = []

    cost.finish()

    out_dir = output_base / config.deck.id
    print(f"""
Text generation complete. Review your output before generating media:
  Stories + image prompts : {out_dir}/stories/
  Translations            : {out_dir}/translations/
  Vocabulary              : {out_dir}/vocabulary.json

Edit any file freely — the pipeline reads from disk and won't overwrite unless you delete the file.
When happy, run:
  uv run python scripts/run_all.py --config {config_path or config.deck.id} --stage media
""")


def run_media_stage(config, chapter_range, output_base, skip_audio=False):
    """Load text output from disk, generate images and audio. No LLM calls."""

    out_dir = output_base / config.deck.id

    # Load scenes from disk
    from pipeline.models import ChapterScene
    chapter_scenes = {}
    all_pairs = {}
    for i in chapter_range:
        story_path = out_dir / "stories" / f"chapter_{i+1:02d}.json"
        if not story_path.exists():
            print(f"Error: {story_path} not found. Run --stage text first.")
            sys.exit(1)
        chapter_scenes[i] = ChapterScene(**json.loads(story_path.read_text()))

        trans_path = out_dir / "translations" / f"chapter_{i+1:02d}.json"
        if not trans_path.exists():
            print(f"Error: {trans_path} not found. Run --stage text first.")
            sys.exit(1)
        all_pairs[i] = [SentencePair(**p) for p in json.loads(trans_path.read_text())]

    # Image generation
    if config.image_generation and config.image_generation.enabled:
        print("=== Image Generation ===")
        all_image_prompts = []
        for i in chapter_range:
            all_image_prompts.extend(extract_image_prompts(chapter_scenes[i]))

        style = config.image_generation.style
        image_prompt_result = ImagePromptResult(style=style, sentences=all_image_prompts)
        print(f"  {len(all_image_prompts)} image prompts from scene data")

        prompts_path = out_dir / "image_prompts.json"
        prompts_path.write_text(json.dumps({
            "protagonist_prompt": "",
            "style": style,
            "sentences": [p.model_dump() for p in all_image_prompts],
        }, ensure_ascii=False, indent=2))

        together_key = os.environ.get("TOGETHER_API_KEY")
        gemini_key = os.environ.get("GEMINI_API_KEY")
        generator = ImageGenerator(config, together_api_key=together_key, gemini_api_key=gemini_key, output_base=output_base)
        manifest = generator.generate_all(image_prompt_result)

        expand_manifest_for_shared_shots(manifest, chapter_scenes)
        manifest_path = out_dir / "image_manifest.json"
        manifest_path.write_text(json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2))

        success = sum(1 for e in manifest.images.values() if e.status == "success")
        failed = sum(1 for e in manifest.images.values() if e.status == "failed")
        print(f"  {success} image entries in manifest ({len(all_image_prompts)} shots), {failed} failed")

    # Audio generation
    if not skip_audio and config.audio_generation and config.audio_generation.enabled:
        print("\n=== Pass 4: Audio Generation ===")
        from pipeline.audio_generator import AudioGenerator
        gemini_key = os.environ.get("GEMINI_API_KEY")
        all_sentences = [pair for i in chapter_range for pair in all_pairs[i]]
        audio_gen = AudioGenerator(config, api_key=gemini_key, output_base=output_base)
        audio_manifest = audio_gen.generate_all(all_sentences)
        success = sum(1 for e in audio_manifest.audio.values() if e.status == "success")
        failed = sum(1 for e in audio_manifest.audio.values() if e.status == "failed")
        print(f"  {success} audio files generated, {failed} failed")


def run_lemmatize_stage(config, output_base, frequency_file):
    """Pass 0: LLM-lemmatize frequency file. Cached — safe to re-run."""
    from pipeline.frequency_lemmatizer import FrequencyLemmatizer

    if not frequency_file:
        print("Error: --frequency-file required for lemmatize stage")
        sys.exit(1)

    freq_path = Path(frequency_file)
    if not freq_path.exists():
        print(f"Error: frequency file not found: {freq_path}")
        sys.exit(1)

    out_dir = output_base / config.deck.id
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=== Pass 0: Frequency Lemmatization ===")
    frequency_data = load_frequency_data(freq_path)

    lemma_model = config.models.lemmatization or config.models.cefr_simplification
    llm_lemma = create_model_client(lemma_model)
    lem = FrequencyLemmatizer(
        llm=llm_lemma,
        output_dir=out_dir,
        target_language=config.languages.target,
        lang_code=config.languages.target_code,
        domain=f"travel {config.languages.target}, {config.destination.city}",
    )

    top_words = sorted(
        [w for w in frequency_data if frequency_data[w] <= 2000],
        key=lambda w: frequency_data[w],
    )
    result = lem.lemmatize(top_words)
    appropriate = sum(1 for e in result.values() if e.appropriate)
    print(f"  {len(result)} words lemmatized, {appropriate} appropriate for deck")
    print(f"  Saved to {lem.cache_path}")


def run_fill_gaps_stage(config, output_base, frequency_file, top_n=None):
    """Generate gap-filling sentences (standalone). Sentences are inserted during text stage."""
    from pipeline.gap_filler import GapFiller

    out_dir = output_base / config.deck.id
    lang_code = config.languages.target_code

    if not frequency_file:
        print("Error: --frequency-file required for fill-gaps stage")
        sys.exit(1)

    print("=== Gap Filling (standalone) ===")
    frequency_data = load_frequency_data(Path(frequency_file))

    # Build inappropriate lemmas from frequency_lemmas.json if available
    inappropriate_lemmas: set[str] = set()
    lemma_path = out_dir / "frequency_lemmas.json"
    if lemma_path.exists():
        from pipeline.models import FrequencyLemmaEntry
        raw_lemmas = json.loads(lemma_path.read_text())
        for word, entry_data in raw_lemmas.items():
            entry = FrequencyLemmaEntry(**entry_data)
            if not entry.appropriate:
                inappropriate_lemmas.add(entry.lemma)
                inappropriate_lemmas.add(word)

    # Load stories for coverage scan
    stories_dir = out_dir / "stories"
    stories: dict[int, str] = {}
    if stories_dir.exists():
        from pipeline.models import ChapterScene
        for story_file in sorted(stories_dir.glob("chapter_*.json")):
            ch_num = int(story_file.stem.split("_")[1])
            cs = ChapterScene(**json.loads(story_file.read_text()))
            stories[ch_num - 1] = extract_flat_text(cs)

    llm_gap = create_model_client(config.models.gap_filling)
    filler = GapFiller(
        llm=llm_gap,
        output_dir=out_dir,
        config_chapters=config.story.chapters,
        target_language=config.languages.target,
        native_language=config.languages.native,
        dialect=config.languages.dialect or "",
        lang_code=lang_code,
        protagonist_name=config.protagonist.name,
        secondary_characters=config.secondary_characters,
        grammar_targets=config.story.grammar_targets,
    )
    gap_results, _ = filler.fill_gaps(
        stories=stories,
        frequency_data=frequency_data,
        top_n=top_n or config.story.coverage_top_n,
        inappropriate_lemmas=inappropriate_lemmas,
    )

    if not gap_results:
        print("  No gaps to fill.")
        return

    total_sentences = sum(len(s) for s in gap_results.values())
    print(f"  Generated {total_sentences} gap sentences across {len(gap_results)} chapters")
    print("  Note: Run --stage text to insert these into stories and rebuild vocabulary.")


def main():
    parser = argparse.ArgumentParser(description="Run the full content pipeline")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--chapters", default=None, help="Chapter range (e.g. '1-3' or '1'). Defaults to all.")
    parser.add_argument("--stage", default="text",
                        choices=["text", "lemmatize", "fill-gaps", "media", "all"],
                        help=(
                            "text = story/translations/vocab (default); "
                            "lemmatize = Pass 0: LLM lemmatize frequency file; "
                            "fill-gaps = Pass 3b: gap sentences + rebuild vocab; "
                            "media = images/audio; "
                            "all = lemmatize + text + fill-gaps + media"
                        ))
    parser.add_argument("--frequency-file", default=None, help="Path to FrequencyWords file")
    parser.add_argument("--top-n", type=int, default=None,
                        help="Target top-N frequency words for coverage/gap-filling (overrides config)")
    parser.add_argument("--skip-audio", action="store_true", help="Skip audio generation (media/all stages)")
    parser.add_argument("--skip-image-audit", action="store_true", help="Skip Pass 5c image prompt audit")
    parser.add_argument("--deck-id", default=None, help="Override deck ID (changes output directory)")
    args = parser.parse_args()

    load_dotenv()
    config = load_config(Path(args.config))
    if args.deck_id:
        config.deck.id = args.deck_id

    # Use frequency file from CLI, or fall back to config default
    frequency_file = args.frequency_file
    if not frequency_file and config.story.frequency_file:
        frequency_file = config.story.frequency_file

    chapter_range = (
        parse_chapter_range(args.chapters, config.chapter_count)
        if args.chapters
        else range(config.chapter_count)
    )

    output_base = Path("output")
    print(f"Pipeline: {config.deck.name}")
    print(f"Chapters: {chapter_range.start + 1}-{chapter_range.stop}")
    print(f"Stage:    {args.stage}")
    print()

    if args.stage in ("lemmatize", "all"):
        run_lemmatize_stage(config, output_base, frequency_file)

    if args.stage in ("text", "all"):
        run_text_stage(config, chapter_range, output_base, frequency_file, args.config,
                       top_n=args.top_n, skip_image_audit=args.skip_image_audit)

    if args.stage in ("fill-gaps", "all"):
        run_fill_gaps_stage(config, output_base, frequency_file, top_n=args.top_n)

    if args.stage in ("media", "all"):
        run_media_stage(config, chapter_range, output_base, args.skip_audio)

    if args.stage != "text":
        print("\nPipeline complete!")


if __name__ == "__main__":
    main()
