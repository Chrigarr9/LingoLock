"""Standalone: Run just Pass 4 (image prompt generation)."""
import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.image_prompter import ImagePrompter
from scripts.run_all import create_model_client


def main():
    parser = argparse.ArgumentParser(description="Generate image prompts for all sentences")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    args = parser.parse_args()

    load_dotenv()
    config = load_config(Path(args.config))

    llm = create_model_client(config.models.story_generation)

    output_base = Path("output")

    stories = {}
    translations = {}
    words: dict[int, list[dict]] = {}
    for i in range(config.chapter_count):
        story_path = output_base / config.deck.id / "stories" / f"chapter_{i + 1:02d}.txt"
        if story_path.exists():
            stories[i] = story_path.read_text()
        trans_path = output_base / config.deck.id / "translations" / f"chapter_{i + 1:02d}.json"
        if trans_path.exists():
            translations[i] = json.loads(trans_path.read_text())
        words_path = output_base / config.deck.id / "words" / f"chapter_{i + 1:02d}.json"
        if words_path.exists():
            words[i] = json.loads(words_path.read_text()).get("words", [])

    if not stories:
        print("Error: No stories found. Run passes 1-3 first.")
        sys.exit(1)

    prompter = ImagePrompter(config, llm, output_base=output_base)
    result = prompter.generate_prompts(stories, translations, words)
    print(f"Generated {len(result.sentences)} image prompts")


if __name__ == "__main__":
    main()
