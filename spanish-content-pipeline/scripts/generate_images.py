"""Standalone: Run just Pass 5 (image generation via Flux)."""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.image_generator import ImageGenerator
from pipeline.image_prompter import ImagePromptResult
from pipeline.models import ImagePrompt


def main():
    parser = argparse.ArgumentParser(description="Generate images from prompts")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be generated")
    args = parser.parse_args()

    load_dotenv()
    config = load_config(Path(args.config))

    output_base = Path("output")
    prompts_path = output_base / config.deck.id / "image_prompts.json"

    if not prompts_path.exists():
        print("Error: image_prompts.json not found. Run Pass 4 first.")
        sys.exit(1)

    data = json.loads(prompts_path.read_text())
    prompts = ImagePromptResult(
        protagonist_prompt=data["protagonist_prompt"],
        style=data.get("style", ""),
        sentences=[ImagePrompt(**s) for s in data["sentences"]],
    )

    if args.dry_run:
        character_scenes = sum(1 for s in prompts.sentences if s.image_type == "character_scene")
        scene_only = len(prompts.sentences) - character_scenes
        cost = character_scenes * 0.025 + scene_only * 0.003 + 0.003
        print(f"Would generate {len(prompts.sentences)} images:")
        print(f"  Character scenes: {character_scenes} x $0.025 = ${character_scenes * 0.025:.2f}")
        print(f"  Scene-only: {scene_only} x $0.003 = ${scene_only * 0.003:.2f}")
        print(f"  Reference: 1 x $0.003 = $0.003")
        print(f"  Estimated total: ${cost:.2f}")
        return

    api_key = os.environ.get("TOGETHER_API_KEY")
    if not api_key:
        print("Error: TOGETHER_API_KEY not set")
        sys.exit(1)

    generator = ImageGenerator(config, api_key=api_key, output_base=output_base)
    manifest = generator.generate_all(prompts)
    success = sum(1 for e in manifest.images.values() if e.status == "success")
    failed = sum(1 for e in manifest.images.values() if e.status == "failed")
    print(f"\nDone: {success} generated, {failed} failed")


if __name__ == "__main__":
    main()
