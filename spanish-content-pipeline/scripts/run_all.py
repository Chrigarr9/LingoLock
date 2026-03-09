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
from pipeline.sentence_inserter import insert_into_chapter_scene
from pipeline.sentence_translator import SentenceTranslator
from pipeline.story_generator import (
    StoryGenerator,
    expand_manifest_for_shared_shots,
    extract_flat_text,
    extract_image_prompts,
)
from pipeline.vocabulary_builder import build_vocabulary
from pipeline.word_extractor import WordExtractor


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
    return get_api_key_for_provider(config.llm.provider)


def run_text_stage(config, llm, chapter_range, output_base, frequency_file=None, config_path=None, top_n=None, audit_llm=None):
    """Full text pipeline: generate → simplify → grammar gaps → insert → vocab gaps → audit → translate → extract."""

    # Pass 0: Unconstrained story generation → stories_raw/
    print("=== Pass 0: Unconstrained Story Generation ===")
    story_gen = StoryGenerator(config, llm, output_base=output_base)
    raw_chapters = story_gen.generate_all(chapter_range=chapter_range)
    for idx, i in enumerate(chapter_range):
        ch = config.story.chapters[i]
        scenes_count = len(raw_chapters[idx].scenes)
        shots_count = sum(len(s.shots) for s in raw_chapters[idx].scenes)
        print(f"  Chapter {i+1}: {ch.title} ({scenes_count} scenes, {shots_count} shots)")

    # Pass 1: CEFR simplification → stories/
    print("\n=== Pass 1: CEFR Simplification ===")
    simplifier = CEFRSimplifier(config, llm, output_base=output_base)
    chapter_scenes: dict[int, ChapterScene] = {}
    stories: dict[int, str] = {}
    for idx, i in enumerate(chapter_range):
        ch = config.story.chapters[i]
        cefr = ch.cefr_level or config.story.cefr_level
        print(f"  Chapter {i+1}: {ch.title} [{cefr}]...", end=" ", flush=True)
        chapter_scenes[i] = simplifier.simplify_chapter(i, raw_chapters[idx])
        stories[i] = extract_flat_text(chapter_scenes[i])
        print("done")

    # Pass 2: Grammar Audit + Gap Fill (before translation — source only)
    if config.story.grammar_targets:
        from pipeline.grammar_auditor import audit_grammar
        from pipeline.grammar_gap_filler import GrammarGapFiller

        print("\n=== Pass 2: Grammar Audit ===")
        chapters_by_cefr: dict[str, list[str]] = {}
        for i in chapter_range:
            ch = config.story.chapters[i]
            cefr = ch.cefr_level or config.story.cefr_level
            sentences = stories[i].split("\n")
            chapters_by_cefr.setdefault(cefr, []).extend(sentences)

        grammar_report = audit_grammar(
            chapters_by_cefr=chapters_by_cefr,
            grammar_targets=config.story.grammar_targets,
            llm=llm,
        )

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
    if frequency_file:
        from pipeline.coverage_checker import scan_story_coverage
        from pipeline.gap_filler import GapFiller
        from pipeline.models import FrequencyLemmaEntry

        freq_path = Path(frequency_file)
        if freq_path.exists():
            frequency_data_local = load_frequency_data(freq_path)
            effective_top_n = top_n or config.story.coverage_top_n

            # Load frequency lemmas if available
            lemma_path = output_base / config.deck.id / "frequency_lemmas.json"
            frequency_lemmas_local = {}
            if lemma_path.exists():
                raw_lemmas = json.loads(lemma_path.read_text())
                frequency_lemmas_local = {k: FrequencyLemmaEntry(**v) for k, v in raw_lemmas.items()}

            # Quick coverage scan from story text
            pre_report = scan_story_coverage(
                stories, frequency_data_local, frequency_lemmas_local, top_n=effective_top_n,
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
                    stories=stories,
                    frequency_data=frequency_data_local,
                    frequency_lemmas=frequency_lemmas_local,
                    top_n=effective_top_n,
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
                        stories, frequency_data_local, frequency_lemmas_local, top_n=effective_top_n,
                    )
                    print(f"  Post-gap coverage: {post_report.top_1000_covered}/{post_report.top_1000_total} ({post_report.coverage_percent}%)")
            else:
                print("  Coverage target met — no gaps to fill.")

    # Pass 5: Story Audit (optional — uses separate reasoning model)
    if audit_llm:
        from pipeline.story_auditor import audit_story, apply_fixes

        print("\n=== Pass 5: Story Audit ===")
        # Build chapters dict: {chapter_num: [sentence1, sentence2, ...]}
        audit_chapters: dict[int, list[str]] = {}
        for i in chapter_range:
            audit_chapters[i + 1] = stories[i].split("\n")

        # Build characters list from config
        characters = [{"name": config.protagonist.name, "role": "protagonist"}]
        for sc in config.secondary_characters:
            characters.append({
                "name": sc.name,
                "role": "secondary character",
                "chapters": sc.chapters,
            })

        # Build chapter configs
        chapter_configs = [
            {"title": ch.title, "cefr_level": ch.cefr_level or config.story.cefr_level, "context": ch.context}
            for ch in config.story.chapters
        ]

        fixes = audit_story(
            chapters=audit_chapters,
            characters=characters,
            chapter_configs=chapter_configs,
            llm=audit_llm,
        )

        if fixes:
            print(f"  Found {len(fixes)} issues:")
            for fix in fixes:
                print(f"    Ch{fix.chapter}[{fix.sentence_index}]: {fix.reason}")
                print(f"      {fix.original}")
                print(f"      → {fix.fixed}")

            stories_dir = output_base / config.deck.id / "stories"
            applied = apply_fixes(fixes, stories_dir)
            print(f"  Applied {applied}/{len(fixes)} fixes to stories/")

            # Reload chapter_scenes and stories from fixed files
            for i in chapter_range:
                story_path = stories_dir / f"chapter_{i+1:02d}.json"
                if story_path.exists():
                    chapter_scenes[i] = ChapterScene(**json.loads(story_path.read_text()))
                    stories[i] = extract_flat_text(chapter_scenes[i])
        else:
            print("  No issues found — clean bill of health!")

    # Pass 6: Translation (on final, clean source text)
    print("\n=== Pass 6: Sentence Translation ===")
    translator = SentenceTranslator(config, llm, output_base=output_base)
    all_pairs: dict[int, list[SentencePair]] = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        all_pairs[i] = translator.translate_chapter(i, stories[i])
        print(f"done ({len(all_pairs[i])} sentences)")

    # Pass 7: Word extraction
    print("\n=== Pass 7: Word Extraction ===")
    extractor = WordExtractor(config, llm, output_base=output_base)
    all_chapters = []
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        chapter_words = extractor.extract_chapter(i, all_pairs[i])
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
        inflection_to_lemma: dict[str, str] = {}
        for ch in all_chapters:
            for w in ch.words:
                src = w.source.lower().strip()
                lemma = w.lemma.lower().strip()
                if src != lemma:
                    inflection_to_lemma[src] = lemma

        from pipeline.models import FrequencyLemmaEntry as _FLE
        frequency_lemmas = None
        lemma_path = output_base / config.deck.id / "frequency_lemmas.json"
        if lemma_path.exists():
            raw = json.loads(lemma_path.read_text())
            frequency_lemmas = {k: _FLE(**v) for k, v in raw.items()}

        print("\n=== Coverage Report ===")
        effective_top_n = top_n or config.story.coverage_top_n
        report = check_coverage(
            deck, frequency_data,
            top_n=effective_top_n,
            extra_thresholds=[2000, 3000, 4000, 5000],
            inflection_to_lemma=inflection_to_lemma,
            frequency_lemmas=frequency_lemmas,
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


def run_lemmatize_stage(config, llm, output_base, frequency_file):
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

    lem = FrequencyLemmatizer(
        llm=llm,
        output_dir=out_dir,
        target_language=config.languages.target,
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
    args = parser.parse_args()

    load_dotenv()
    config = load_config(Path(args.config))

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

    needs_llm = args.stage in ("text", "lemmatize", "fill-gaps", "all")
    llm = None
    if needs_llm:
        api_key = get_api_key(config)
        llm = create_client(
            provider=config.llm.provider,
            api_key=api_key,
            model=config.llm.model,
            temperature=config.llm.temperature,
            max_retries=config.llm.max_retries,
        )

    # Separate audit LLM client (reasoning model for story audit)
    audit_llm = None
    if config.story_audit and config.story_audit.enabled:
        audit_key = get_api_key_for_provider(config.story_audit.provider)
        audit_llm = create_client(
            provider=config.story_audit.provider,
            api_key=audit_key,
            model=config.story_audit.model,
            temperature=config.story_audit.temperature,
        )

    if args.stage in ("lemmatize", "all"):
        run_lemmatize_stage(config, llm, output_base, args.frequency_file)

    if args.stage in ("text", "all"):
        run_text_stage(config, llm, chapter_range, output_base, args.frequency_file, args.config, top_n=args.top_n, audit_llm=audit_llm)

    if args.stage in ("fill-gaps", "all"):
        run_fill_gaps_stage(config, llm, output_base, args.frequency_file, top_n=args.top_n)

    if args.stage in ("media", "all"):
        run_media_stage(config, chapter_range, output_base, args.skip_audio)

    if args.stage != "text":
        print("\nPipeline complete!")


if __name__ == "__main__":
    main()
