"""A/B test: compare story quality between two generation approaches.

Approach A — Pure prose: Write unconstrained Spanish narrative, no scene/shot structure.
Approach B — Scene/shot structure but no CEFR/vocab constraints.

Generates chapters 1-3 with each approach for side-by-side comparison.

Usage:
  uv run python scripts/test_story_approaches.py --config configs/spanish_buenos_aires.yaml
"""

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from scripts.run_all import create_model_client

# ── Approach A: Pure prose ──────────────────────────────────────────────

SYSTEM_A = """\
You are a Spanish-language fiction writer creating chapters of a short novel \
about a young German woman's trip to Buenos Aires.

Write natural, literary prose in Spanish ({dialect} dialect). \
Write in {narration_style} about the protagonist {protagonist_name}.

Your prose should feel like a real short story — vivid, emotionally engaging, \
with sensory details, natural dialogue using «guillemets», and a clear narrative arc \
within each chapter. Do NOT write vocabulary drills, language exercises, or \
sentence lists. Write prose that a native speaker would enjoy reading.

Include dialogue between characters when they interact. \
Show emotions through actions and details, not just statements.

Return your response as a JSON object:
{{
  "chapter_title": "...",
  "prose": "The full chapter text as continuous prose paragraphs, separated by \\n\\n"
}}"""

PROMPT_A = """\
Write Chapter {chapter_num}: "{title}"

Protagonist: {protagonist_name} — a young German woman visiting Buenos Aires
Setting: {city}, {country}

Chapter context:
{context}

Characters in this chapter: {characters}

{story_so_far}

Write 400-600 words of natural Spanish prose. Make it feel like a real short story chapter."""


# ── Approach B: Scene/shot structure, no CEFR constraints ───────────────

SYSTEM_B = """\
You are both a storyteller and a film director creating a chapter of an illustrated \
story about a young German woman's trip to Buenos Aires.

Write natural, literary prose in Spanish ({dialect} dialect). \
Write in {narration_style} about the protagonist {protagonist_name}.

Your prose should feel like a real short story — vivid, emotionally engaging, \
with sensory details, natural dialogue using «guillemets», and a clear narrative arc. \
Do NOT write vocabulary drills, language exercises, or sentence lists.

## Output Format
Return a JSON object with a "scenes" array. Each scene has:
- "setting": snake_case location tag (e.g. "maria_bedroom_berlin")
- "description": 1-2 sentence environment description
- "shots": array of camera shots

Each shot has:
- "focus": what the camera focuses on
- "image_prompt": English description of the illustration (under 200 chars). \
  Use PROTAGONIST for {protagonist_name}. Use character names in ALL CAPS.
- "sentences": array of sentence objects, each with:
  - "source": ONE sentence in Spanish
  - "sentence_index": sequential 0-based index across the chapter

## Prose quality rules (most important)
- Write flowing narrative prose, not isolated captions or vocabulary exercises.
- Each sentence should advance the story naturally.
- Include dialogue with «guillemets» when characters interact.
- Include sensory details: smells, sounds, textures, emotions.
- No word count limits per sentence. Write naturally.
- No vocabulary targets. Just tell a good story.

## Visual rules
- Mostly close-up and medium shots. Max 1 wide shot per chapter.
- Exaggerate focal objects: bold colors, oversized, picture-book energy.
- Consecutive shots must focus on different things.
- sentence_index must be sequential starting from 0."""

PROMPT_B = """\
Write Chapter {chapter_num}: "{title}"

Protagonist: {protagonist_name} — a young German woman visiting Buenos Aires
Setting: {city}, {country}

Chapter context:
{context}

Characters in this chapter: {characters}

{story_so_far}

Write 25-35 sentences of natural Spanish prose, organized into scenes and shots.
Return the chapter as a JSON object with a "scenes" array."""


def get_characters_for_chapter(config, chapter_index):
    """Get character names present in a chapter."""
    chars = [config.protagonist.name]
    for sc in config.secondary_characters:
        if (chapter_index + 1) in sc.chapters:
            chars.append(sc.name)
    return ", ".join(chars)


def run_test(config, llm, output_dir):
    narration_map = {
        "third-person": f"third person about {config.protagonist.name}",
        "first-person": f"first person as {config.protagonist.name}",
    }
    narration_style = narration_map.get(
        config.story.narration_style, narration_map["third-person"]
    )

    system_a = SYSTEM_A.format(
        dialect=config.languages.dialect,
        narration_style=narration_style,
        protagonist_name=config.protagonist.name,
    )
    system_b = SYSTEM_B.format(
        dialect=config.languages.dialect,
        narration_style=narration_style,
        protagonist_name=config.protagonist.name,
    )

    summaries_a = []
    summaries_b = []

    for ch_idx in range(3):
        ch = config.story.chapters[ch_idx]
        characters = get_characters_for_chapter(config, ch_idx)

        story_so_far_a = ""
        if summaries_a:
            story_so_far_a = "Story so far:\n" + "\n".join(summaries_a)

        story_so_far_b = ""
        if summaries_b:
            story_so_far_b = "Story so far:\n" + "\n".join(summaries_b)

        prompt_vars = dict(
            chapter_num=ch_idx + 1,
            title=ch.title,
            protagonist_name=config.protagonist.name,
            city=config.destination.city,
            country=config.destination.country,
            context=ch.context,
            characters=characters,
        )

        # ── Approach A ──
        print(f"\n{'='*60}")
        print(f"Chapter {ch_idx+1}: {ch.title}")
        print(f"{'='*60}")

        path_a = output_dir / f"approach_a_ch{ch_idx+1:02d}.json"
        if path_a.exists():
            print(f"  [A] Cached: {path_a}")
            result_a = json.loads(path_a.read_text())
        else:
            print(f"  [A] Generating pure prose...", end=" ", flush=True)
            prompt_a = PROMPT_A.format(**prompt_vars, story_so_far=story_so_far_a)
            resp_a = llm.complete_json(prompt_a, system=system_a)
            result_a = resp_a.parsed
            path_a.write_text(json.dumps(result_a, ensure_ascii=False, indent=2))
            print(f"done ({resp_a.usage.total_tokens} tokens)")

        # Extract prose for summary
        prose_a = result_a.get("prose", "")
        # Simple word count
        word_count_a = len(prose_a.split())
        sentence_count_a = prose_a.count(".") + prose_a.count("!") + prose_a.count("?")
        print(f"  [A] {word_count_a} words, ~{sentence_count_a} sentences")
        summaries_a.append(f"Chapter {ch_idx+1} ({ch.title}): {prose_a[:200]}...")

        # ── Approach B ──
        path_b = output_dir / f"approach_b_ch{ch_idx+1:02d}.json"
        if path_b.exists():
            print(f"  [B] Cached: {path_b}")
            result_b = json.loads(path_b.read_text())
        else:
            print(f"  [B] Generating scene/shot prose...", end=" ", flush=True)
            prompt_b = PROMPT_B.format(**prompt_vars, story_so_far=story_so_far_b)
            resp_b = llm.complete_json(prompt_b, system=system_b)
            result_b = resp_b.parsed
            path_b.write_text(json.dumps(result_b, ensure_ascii=False, indent=2))
            print(f"done ({resp_b.usage.total_tokens} tokens)")

        # Extract sentences from scene/shot structure
        sentences_b = []
        for scene in result_b.get("scenes", []):
            for shot in scene.get("shots", []):
                for sent in shot.get("sentences", []):
                    sentences_b.append(sent.get("source", ""))
        prose_b = " ".join(sentences_b)
        word_count_b = len(prose_b.split())
        print(f"  [B] {word_count_b} words, {len(sentences_b)} sentences, "
              f"{len(result_b.get('scenes', []))} scenes")
        summaries_b.append(f"Chapter {ch_idx+1} ({ch.title}): {prose_b[:200]}...")

    # ── Print comparison ──
    print(f"\n\n{'='*60}")
    print("COMPARISON — Read the output files to compare quality:")
    print(f"{'='*60}")
    print(f"  Approach A (pure prose): {output_dir}/approach_a_ch*.json")
    print(f"  Approach B (scene/shot): {output_dir}/approach_b_ch*.json")
    print()
    print("Key questions to evaluate:")
    print("  1. Which reads more like a real story vs a vocabulary exercise?")
    print("  2. Does the scene/shot structure in B hurt narrative flow?")
    print("  3. Is the dialogue natural in both?")
    print("  4. Which has better sensory details and emotional depth?")


def main():
    parser = argparse.ArgumentParser(description="A/B test story generation approaches")
    parser.add_argument("--config", required=True, help="Path to deck config YAML")
    parser.add_argument("--model", default=None, help="Override LLM model (default: config model)")
    args = parser.parse_args()

    load_dotenv()
    config = load_config(Path(args.config))

    story_model_config = config.models.story_generation
    if args.model:
        from pipeline.config import ModelConfig
        story_model_config = ModelConfig(
            provider=story_model_config.provider,
            model=args.model,
            temperature=story_model_config.temperature,
            max_retries=story_model_config.max_retries,
        )

    llm = create_model_client(story_model_config)
    model = story_model_config.model

    output_dir = Path("output") / config.deck.id / "story_test"
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Model: {model}")
    print(f"Output: {output_dir}")
    run_test(config, llm, output_dir)


if __name__ == "__main__":
    main()
