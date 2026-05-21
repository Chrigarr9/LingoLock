"""Subtitle deck pipeline.

Converts HIMYM (or any configured show) subtitle files into word-centric
flashcard decks: one ClozeCard per unique lemma taught across the season,
with a photorealistic vocabulary image and TTS audio per sentence.

Pass 1: Subtitle selection  — fetch episodes, score sentences, select top-N per episode
Pass 2: Translation         — translate each episode's sentences ES → DE
Pass 3: Word extraction     — deduplicate to one card per lemma, LLM enrichment
Pass 4: Image generation    — fal.ai generates one image per lemma (resume-safe)
Pass 5: Audio generation    — TTS generates one audio file per sentence
Output: output/<deck-id>/word_cards.json

Usage:
  uv run python scripts/run_subtitle.py --config configs/himym_s01_es.yaml
  uv run python scripts/run_subtitle.py --config configs/himym_s01_es.yaml --skip-images
  uv run python scripts/run_subtitle.py --config configs/himym_s01_es.yaml --skip-audio
  uv run python scripts/run_subtitle.py --config configs/himym_s01_es.yaml --select-only
  uv run python scripts/run_subtitle.py --config configs/himym_s01_es.yaml --episodes 1 2 3

Then bundle for the app:
  npx tsx scripts/build-subtitle-content.ts himym-s01-es
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.asset_compressor import normalize_image
from pipeline.audio_generator import AudioGenerator
from pipeline.config import load_subtitle_config
from pipeline.image_generator import ImageGenerator
from pipeline.llm import create_client
from pipeline.models import SentencePair
from pipeline.sentence_translator import SentenceTranslator
from pipeline.subtitle_processor import ProcessedEpisode, process_subtitle_deck
from pipeline.subtitle_word_extractor import extract_word_cards


# ── Helpers ────────────────────────────────────────────────────────────────

def _file_key(episode: int, sentence_index: int) -> str:
    """Generator-convention key: ch{ep:02d}_s{i:02d}"""
    return f"ch{episode:02d}_s{sentence_index:02d}"


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def limit_generation_episodes(
    all_episodes: list[ProcessedEpisode],
    episode_numbers: list[int] | None = None,
    max_cards_per_episode: int | None = None,
) -> list[ProcessedEpisode]:
    """Return the subset of selected episodes that should incur AI/media work.

    The subtitle selector always processes the full season so TF-IDF, document
    frequency, and cross-episode novelty are realistic. This helper controls the
    expensive downstream part: translation, word enrichment, images, and audio.
    """
    if episode_numbers:
        selected = [ep for ep in all_episodes if ep.episode in set(episode_numbers)]
    else:
        selected = list(all_episodes)

    if max_cards_per_episode is None:
        return selected

    if max_cards_per_episode < 1:
        raise ValueError("--max-cards-per-episode must be >= 1")

    limited: list[ProcessedEpisode] = []
    for ep in selected:
        limited.append(ProcessedEpisode(
            episode=ep.episode,
            title=ep.title,
            sentences=ep.sentences[:max_cards_per_episode],
        ))
    return limited


def _translations_match_episode(pairs: list[SentencePair], episode: ProcessedEpisode) -> bool:
    """Return true when cached translations line up with selected sentences."""
    if len(pairs) != len(episode.sentences):
        return False
    return all(pair.source == ps.text for pair, ps in zip(pairs, episode.sentences))


def get_api_key(provider: str) -> str | None:
    if provider == "google":
        return os.environ.get("GEMINI_API_KEY")
    return os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPEN_ROUTER_API_KEY")


def get_image_api_keys() -> dict[str, str | None]:
    return {
        "fal": os.environ.get("FAL_KEY") or os.environ.get("FAL_AI_API_KEY"),
        "google": os.environ.get("GEMINI_API_KEY"),
        "together": os.environ.get("TOGETHER_API_KEY"),
        "modelscope": os.environ.get("MODEL_SCOPE_API_KEY"),
    }


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Build a subtitle flashcard deck")
    parser.add_argument("--config", required=True, help="Path to subtitle deck config YAML")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--skip-audio", action="store_true")
    parser.add_argument("--select-only", action="store_true",
                        help="Run Pass 1 only (no translation/images/audio)")
    parser.add_argument("--episodes", nargs="+", type=int, metavar="N",
                        help="Limit translation+media to these episode numbers (selection always runs all)")
    parser.add_argument("--max-cards-per-episode", type=int,
                        help="Cheap test mode: cap expensive downstream work per selected episode")
    args = parser.parse_args()

    load_dotenv()
    config = load_subtitle_config(Path(args.config))
    deck_stub = config.to_deck_config_stub()

    deck_id = config.deck.id
    output_base = Path("output")
    out_dir = output_base / deck_id
    out_dir.mkdir(parents=True, exist_ok=True)
    cards_path = out_dir / "word_cards.json"

    print(f"Subtitle pipeline: {config.deck.name}")
    print(f"Language pair:     {config.languages.native} → {config.languages.target}")
    print(f"Deck ID:           {deck_id}")
    print(f"Episodes:          {len(config.episodes)}")
    print()

    # ── Load prior-deck lemmas for cross-season dedup ────────────────────────

    prior_lemmas: set[str] = set()
    for prior_id in config.prior_decks:
        prior_path = output_base / prior_id / "word_cards.json"
        if prior_path.exists():
            prior_cards = json.loads(prior_path.read_text())
            prior_lemmas.update(c["lemma"] for c in prior_cards if "lemma" in c)
            print(f"  Loaded {len(prior_lemmas)} prior lemmas from {prior_id}")

    # ── Pass 1: Subtitle selection ───────────────────────────────────────

    print("Pass 1: Selecting sentences from subtitle files (all episodes for TF-IDF)...")
    all_episodes: list[ProcessedEpisode] = process_subtitle_deck(
        config, output_base, verbose=True, prior_lemmas=prior_lemmas
    )

    total_sentences = sum(len(ep.sentences) for ep in all_episodes)
    print(f"  Total: {total_sentences} sentences across {len(all_episodes)} episodes\n")

    if args.select_only:
        # Save selected sentences for inspection and exit. This is intentionally
        # not word_cards.json because it is not app-ready content.
        selected_sentences = []
        for ep in all_episodes:
            for i, ps in enumerate(ep.sentences):
                selected_sentences.append({
                    "episode": ep.episode,
                    "episode_title": ep.title,
                    "file_key": _file_key(ep.episode, i),
                    "source": ps.text,
                    "teaches_lemmas": ps.teaches_lemmas,
                    "teaches_forms": ps.teaches_forms,
                    "score": ps.score,
                })
        selection_path = out_dir / "selected_sentences.json"
        selection_path.write_text(json.dumps(selected_sentences, ensure_ascii=False, indent=2))
        print(f"Saved {len(selected_sentences)} selected sentences to {selection_path}")
        return

    # ── Filter episodes for translation+media ────────────────────────────

    generation_episodes = limit_generation_episodes(
        all_episodes,
        episode_numbers=args.episodes,
        max_cards_per_episode=args.max_cards_per_episode,
    )
    if args.episodes or args.max_cards_per_episode:
        print("  Translation+enrichment+media limited to:")
        for ep in generation_episodes:
            print(f"    E{ep.episode:02d} {ep.title}: {len(ep.sentences)} selected sentences")
        print()

    # ── Pass 2: Translation ──────────────────────────────────────────────

    print("Pass 2: Translating sentences...")
    trans_model_cfg = config.models.translation
    trans_api_key = get_api_key(trans_model_cfg.provider)
    if not trans_api_key:
        print(f"Error: no API key for translation provider '{trans_model_cfg.provider}'")
        sys.exit(1)

    trans_llm = create_client(
        provider=trans_model_cfg.provider,
        api_key=trans_api_key,
        model=trans_model_cfg.model,
        temperature=trans_model_cfg.temperature,
    )
    translator = SentenceTranslator(deck_stub, trans_llm, output_base)

    # translations[file_key] = SentencePair
    translations: dict[str, SentencePair] = {}

    for ep in generation_episodes:
        chapter_index = ep.episode - 1  # SentenceTranslator uses 0-based
        story_text = "\n".join(ps.text for ps in ep.sentences)
        pairs, _ = translator.translate_chapter(chapter_index, story_text)

        if not _translations_match_episode(pairs, ep):
            cache_path = output_base / deck_id / "translations" / f"chapter_{ep.episode:02d}.json"
            if cache_path.exists():
                print(f"  E{ep.episode:02d}: cached translations do not match selected sentences; regenerating")
                cache_path.unlink()
                pairs, _ = translator.translate_chapter(chapter_index, story_text)
            if not _translations_match_episode(pairs, ep):
                print(f"Error: translations for E{ep.episode:02d} still do not match selected sentences")
                sys.exit(1)

        for i, pair in enumerate(pairs):
            translations[_file_key(ep.episode, i)] = pair
        print(f"  E{ep.episode:02d} {ep.title}: {len(pairs)} sentences translated")

    print()

    # ── Pass 3: Word extraction + enrichment ─────────────────────────────

    print("Pass 3: Extracting and enriching word cards...")
    enrich_model_cfg = config.models.enrichment
    enrich_api_key = get_api_key(enrich_model_cfg.provider)
    if not enrich_api_key:
        print(f"Error: no API key for enrichment provider '{enrich_model_cfg.provider}'")
        sys.exit(1)

    enrich_llm = create_client(
        provider=enrich_model_cfg.provider,
        api_key=enrich_api_key,
        model=enrich_model_cfg.model,
        temperature=enrich_model_cfg.temperature,
    )

    # Build file_key → German translation string for word extractor
    trans_strings = {fk: pair.target for fk, pair in translations.items()}

    word_cards = extract_word_cards(
        all_episodes=generation_episodes,
        translations=trans_strings,
        llm=enrich_llm,
        prior_lemmas=prior_lemmas,
        verbose=True,
    )
    print()

    # ── Pass 4: Image generation (per lemma) ─────────────────────────────

    images_dir = out_dir / "images"

    if args.skip_images or not (config.image_generation and config.image_generation.enabled):
        print("Pass 4: Images — skipped")
    else:
        print("Pass 4: Generating per-lemma images...")
        api_keys = get_image_api_keys()
        img_gen = ImageGenerator(
            config=deck_stub,
            together_api_key=api_keys["together"],
            gemini_api_key=api_keys["google"],
            fal_api_key=api_keys["fal"],
            modelscope_api_key=api_keys["modelscope"],
            output_base=output_base,
        )
        images_dir.mkdir(parents=True, exist_ok=True)

        success = 0
        for card in word_cards:
            slug = card["lemma_slug"]
            existing = next(iter(images_dir.glob(f"{slug}.*")), None)
            if existing is not None:
                card["image"] = slug
                success += 1
                continue

            prompt = card.get("image_prompt", card["english_gloss"])
            try:
                image_bytes, ext = img_gen._generate_image(prompt)  # noqa: SLF001
                tmp = images_dir / f"{slug}{ext}"
                tmp.write_bytes(image_bytes)
                final = normalize_image(tmp)
                card["image"] = slug
                success += 1
                print(f"    {slug} ✓")
            except Exception as e:
                print(f"    {slug} — FAILED: {e}")

        print(f"  {success}/{len(word_cards)} images generated\n")

    # ── Pass 5: Audio generation ─────────────────────────────────────────

    if args.skip_audio or not (config.audio_generation and config.audio_generation.enabled):
        print("Pass 5: Audio — skipped")
    else:
        print("Pass 5: Generating audio...")
        provider = config.audio_generation.provider
        if provider == "gemini":
            audio_api_key = os.environ.get("GEMINI_API_KEY")
        elif provider == "openai":
            audio_api_key = os.environ.get("OPENAI_API_KEY")
        else:
            audio_api_key = None

        if not audio_api_key:
            print(f"  WARNING: No API key for audio provider '{provider}' — skipping")
        else:
            audio_gen = AudioGenerator(deck_stub, audio_api_key, output_base)
            # Audio is per-sentence (not per-lemma): collect unique sentence pairs
            sentence_keys = {c["sentence_file_key"] for c in word_cards}
            all_pairs = [translations[fk] for fk in sorted(sentence_keys) if fk in translations]
            audio_manifest = audio_gen.generate_all(all_pairs)
            success = sum(1 for e in audio_manifest.audio.values() if e.status == "success")
            print(f"  {success}/{len(audio_manifest.audio)} audio files generated\n")

    # ── Attach audio keys to cards ────────────────────────────────────────

    audio_manifest_path = out_dir / "audio_manifest.json"
    audio_entries: dict[str, dict] = {}
    if audio_manifest_path.exists():
        audio_entries = json.loads(audio_manifest_path.read_text()).get("audio", {})

    for card in word_cards:
        fk = card["sentence_file_key"]
        entry = audio_entries.get(fk)
        pair = translations.get(fk)
        if (
            entry
            and entry.get("status") == "success"
            and pair is not None
            and entry.get("content_hash") == _content_hash(pair.source)
        ):
            card["audio"] = fk

    # ── Strip internal-only fields before saving ──────────────────────────

    output_cards = []
    for card in word_cards:
        c = {k: v for k, v in card.items() if k not in ("image_prompt", "lemma_slug")}
        output_cards.append(c)

    # ── Save word_cards.json ──────────────────────────────────────────────

    cards_path.write_text(json.dumps(output_cards, ensure_ascii=False, indent=2))

    with_images = sum(1 for c in output_cards if "image" in c)
    with_audio = sum(1 for c in output_cards if "audio" in c)
    print(f"Done. {len(output_cards)} word cards — {with_images} with images, {with_audio} with audio")
    print(f"Saved to {cards_path}")
    print(f"\nNext: npx tsx scripts/build-subtitle-content.ts {deck_id}")


if __name__ == "__main__":
    main()
