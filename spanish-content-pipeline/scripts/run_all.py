"""Run the content pipeline in two reviewable stages.

Stage 1 — text (default):
  Passes 1-3: story generation, translation, word extraction + vocabulary DB.
  Output lives in output/<deck-id>/stories/, translations/, words/, vocabulary.json.
  Review and edit those files before proceeding.

Stage 2 — media:
  Reads text output from disk (no LLM calls), then generates images and audio.
  Run only once you are happy with the text.

Usage:
  uv run python scripts/run_all.py --config configs/spanish_buenos_aires.yaml --chapters 1-2
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
from pipeline.models import ImagePromptResult, SentencePair
from pipeline.scene_story_generator import (
    SceneStoryGenerator,
    expand_manifest_for_shared_shots,
    extract_flat_text,
    extract_image_prompts,
)
from pipeline.sentence_translator import SentenceTranslator
from pipeline.vocabulary_builder import build_vocabulary
from pipeline.word_extractor import WordExtractor


def parse_chapter_range(spec: str, max_chapters: int) -> range:
    if "-" in spec:
        start, end = spec.split("-", 1)
        return range(int(start) - 1, int(end))
    else:
        idx = int(spec) - 1
        return range(idx, idx + 1)


def get_api_key(config: DeckConfig) -> str:
    if config.llm.provider == "google":
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            print("Error: GEMINI_API_KEY not set")
            sys.exit(1)
        return key
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("Error: OPENROUTER_API_KEY not set")
        sys.exit(1)
    return key


def run_text_stage(config, llm, chapter_range, output_base, frequency_file=None):
    """Passes 1-3 + vocabulary. All output cached to disk for review."""

    # Pass 1: Story generation
    print("=== Pass 1: Scene-First Story Generation ===")
    scene_gen = SceneStoryGenerator(config, llm, output_base=output_base)
    chapter_scenes = {}
    stories = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        chapter_scenes[i] = scene_gen.generate_chapter(i)
        stories[i] = extract_flat_text(chapter_scenes[i])
        scenes_count = len(chapter_scenes[i].scenes)
        shots_count = sum(len(s.shots) for s in chapter_scenes[i].scenes)
        print(f"done ({scenes_count} scenes, {shots_count} shots)")

    # Pass 2: Translation
    print("\n=== Pass 2: Sentence Translation ===")
    translator = SentenceTranslator(config, llm, output_base=output_base)
    all_pairs = {}
    for i in chapter_range:
        ch = config.story.chapters[i]
        print(f"  Chapter {i+1}: {ch.title}...", end=" ", flush=True)
        all_pairs[i] = translator.translate_chapter(i, stories[i])
        print(f"done ({len(all_pairs[i])} sentences)")

    # Pass 3: Word extraction
    print("\n=== Pass 3: Word Extraction ===")
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
        print("\n=== Coverage Report ===")
        report = check_coverage(deck, frequency_data, top_n=1000)
        report_path = output_base / config.deck.id / "coverage_report.json"
        report_path.write_text(json.dumps(report.model_dump(), ensure_ascii=False, indent=2))
        print(f"  Top 1000 coverage: {report.top_1000_covered}/{report.top_1000_total} ({report.coverage_percent}%)")

    out_dir = output_base / config.deck.id
    print(f"""
Text generation complete. Review your output before generating media:
  Stories + image prompts : {out_dir}/stories/
  Translations            : {out_dir}/translations/
  Vocabulary              : {out_dir}/vocabulary.json

Edit any file freely — the pipeline reads from disk and won't overwrite unless you delete the file.
When happy, run:
  uv run python scripts/run_all.py --config {config.deck.id} --stage media
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


def main():
    parser = argparse.ArgumentParser(description="Run the full content pipeline")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--chapters", default=None, help="Chapter range (e.g. '1-3' or '1'). Defaults to all.")
    parser.add_argument("--stage", default="text", choices=["text", "media", "all"],
                        help="text = generate story/translations (default); media = generate images/audio; all = both")
    parser.add_argument("--frequency-file", default=None, help="Path to FrequencyWords file")
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

    if args.stage in ("text", "all"):
        api_key = get_api_key(config)
        llm = create_client(
            provider=config.llm.provider,
            api_key=api_key,
            model=config.llm.model,
            temperature=config.llm.temperature,
            max_retries=config.llm.max_retries,
        )
        run_text_stage(config, llm, chapter_range, output_base, args.frequency_file)

    if args.stage in ("media", "all"):
        run_media_stage(config, chapter_range, output_base, args.skip_audio)

    if args.stage != "text":
        print("\nPipeline complete!")


if __name__ == "__main__":
    main()
