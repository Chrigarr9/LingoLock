"""One-shot comparison: run two-phase story auditor on existing ch1-3 stories.

Uses find_issues (Pass 5a) with Sonnet 4.6 to find issues, then optionally
fix_issues_parallel (Pass 5b) with Gemini Flash Lite to apply fixes.

Saves results to output/es-de-buenos-aires/audit_comparison/:
  - sonnet_issues.json         — raw issues from Sonnet reviewer
  - chapter_XX_before.txt      — flat text before fixes
  - chapter_XX_after.txt       — flat text after fixes (applied to copies)
  - chapter_XX_diff.txt        — unified diff for quick review
  - cost.txt                   — API cost

Does NOT modify the original stories/ files.
"""

import json
import os
import sys
import difflib
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import load_config
from pipeline.llm import create_client
from pipeline.models import ChapterScene
from pipeline.story_auditor import find_issues, fix_issues_parallel, apply_fixes
from pipeline.story_generator import extract_flat_text

load_dotenv()

config = load_config(Path("configs/spanish_buenos_aires.yaml"))
output_base = Path("output")
out_dir = output_base / config.deck.id
comp_dir = out_dir / "audit_comparison"
comp_dir.mkdir(parents=True, exist_ok=True)

# Load existing stories
stories: dict[int, str] = {}
chapter_scenes: dict[int, ChapterScene] = {}
chapter_range = range(0, 3)  # ch1-3
for i in chapter_range:
    path = out_dir / "stories" / f"chapter_{i+1:02d}.json"
    cs = ChapterScene(**json.loads(path.read_text()))
    chapter_scenes[i] = cs
    stories[i] = extract_flat_text(cs)
    line_count = len(stories[i].split("\n"))
    print(f"  Loaded chapter {i+1}: {line_count} sentences")

# Save "before" texts
for i in chapter_range:
    before_path = comp_dir / f"chapter_{i+1:02d}_before.txt"
    before_path.write_text(stories[i])

# Build audit input
audit_chapters: dict[int, list[str]] = {}
for i in chapter_range:
    audit_chapters[i + 1] = stories[i].split("\n")

# Characters
characters = [{"name": config.protagonist.name, "role": "protagonist"}]
for sc in config.secondary_characters:
    characters.append({
        "name": sc.name,
        "role": sc.role or "secondary character",
        "chapters": sc.chapters,
        "visual_tag": sc.visual_tag,
    })

# Chapter configs
chapter_configs = [
    {"title": ch.title, "cefr_level": ch.cefr_level or config.story.cefr_level, "context": ch.context}
    for ch in config.story.chapters
]

# Create clients
api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPEN_ROUTER_API_KEY")
if not api_key:
    print("Error: OPENROUTER_API_KEY not set")
    sys.exit(1)

llm_review = create_client(
    provider="openrouter",
    api_key=api_key,
    model="anthropic/claude-sonnet-4-6",
    temperature=0.3,
    max_retries=2,
)

llm_fix = create_client(
    provider="openrouter",
    api_key=api_key,
    model="google/gemini-3.1-flash-lite-preview",
    temperature=0.3,
    max_retries=2,
)

# Pass 5a: Find issues
print(f"\n=== Pass 5a: Story Review (Sonnet 4.6) ===")
total_sents = sum(len(v) for v in audit_chapters.values())
print(f"  Reviewing chapters 1-3 ({total_sents} total sentences)...")

(issues, unnamed_chars), response = find_issues(
    chapters=audit_chapters,
    characters=characters,
    chapter_configs=chapter_configs,
    llm=llm_review,
)

# Cost
cost_usd = getattr(getattr(response, "usage", None), "cost_usd", None) or 0
cost_text = f"Sonnet 4.6 story review (ch1-3)\nCost: {cost_usd * 100:.2f}c (${cost_usd:.4f})\n"
if hasattr(response, "usage") and response.usage:
    u = response.usage
    cost_text += f"Input tokens: {getattr(u, 'prompt_tokens', '?')}\n"
    cost_text += f"Output tokens: {getattr(u, 'completion_tokens', '?')}\n"
print(f"  Review cost: {cost_usd * 100:.2f}c")

# Save raw issues
raw_output = {
    "issues": [i.model_dump() for i in issues],
    "unnamed_characters": [u.model_dump() for u in unnamed_chars],
}
(comp_dir / "sonnet_issues.json").write_text(json.dumps(raw_output, ensure_ascii=False, indent=2))

if unnamed_chars:
    print(f"\n  Unnamed recurring characters ({len(unnamed_chars)}):")
    for uc in unnamed_chars:
        print(f"    {uc.role} (chapters {uc.chapters}): {uc.suggested_visual_tag}")

critical = [i for i in issues if i.severity == "critical"]
minor = [i for i in issues if i.severity == "minor"]
print(f"\n  Found {len(critical)} critical, {len(minor)} minor issues:")

for issue in issues:
    tag = "CRITICAL" if issue.severity == "critical" else "minor"
    print(f"\n    [{tag}] Ch{issue.chapter}[{issue.sentence_index}] ({issue.category})")
    print(f"      {issue.description}")
    print(f"      ORIG: {issue.original}")
    print(f"      FIX:  {issue.suggested_fix}")
    print(f"      Action: {issue.action}")

if critical:
    # Pass 5b: Fix critical issues
    print(f"\n=== Pass 5b: Fixing {len(critical)} critical issues (Gemini Flash Lite) ===")
    fixes = fix_issues_parallel(
        issues,
        chapters=audit_chapters,
        chapter_configs=chapter_configs,
        llm=llm_fix,
        max_workers=4,
    )

    for fix in fixes:
        if fix.action == "remove":
            print(f"    Ch{fix.chapter}[{fix.sentence_index}]: REMOVE")
        else:
            print(f"    Ch{fix.chapter}[{fix.sentence_index}]: {fix.original}")
            print(f"      -> {fix.fixed}")

    # Vocabulary preservation check
    import re
    print(f"\n  === Vocabulary Preservation Check ===")
    has_vocab_issue = False
    for fix in fixes:
        if fix.action == "remove":
            continue
        orig_words = set(re.findall(r'[a-zaeiounuu]+', fix.original.lower()))
        fixed_words = set(re.findall(r'[a-zaeiounuu]+', fix.fixed.lower()))
        lost = orig_words - fixed_words
        if lost:
            has_vocab_issue = True
            print(f"    WARNING Ch{fix.chapter}[{fix.sentence_index}] LOST words: {lost}")
    if not has_vocab_issue:
        print(f"    All content words preserved")

    # Apply fixes to COPIES of story files
    temp_dir = comp_dir / "_temp_stories"
    temp_dir.mkdir(exist_ok=True)
    for i in chapter_range:
        src = out_dir / "stories" / f"chapter_{i+1:02d}.json"
        dst = temp_dir / f"chapter_{i+1:02d}.json"
        dst.write_text(src.read_text())

    applied = apply_fixes(fixes, temp_dir)
    print(f"\n  Applied {applied}/{len(fixes)} fixes to copies")

    # Generate "after" texts and diffs
    for i in chapter_range:
        copy_path = temp_dir / f"chapter_{i+1:02d}.json"
        cs_after = ChapterScene(**json.loads(copy_path.read_text()))
        after_text = extract_flat_text(cs_after)
        after_path = comp_dir / f"chapter_{i+1:02d}_after.txt"
        after_path.write_text(after_text)

        # Unified diff
        before_lines = stories[i].splitlines(keepends=True)
        after_lines = after_text.splitlines(keepends=True)
        diff = difflib.unified_diff(
            before_lines, after_lines,
            fromfile=f"chapter_{i+1:02d} (before)",
            tofile=f"chapter_{i+1:02d} (after two-phase audit)",
            lineterm="",
        )
        diff_text = "\n".join(diff)
        diff_path = comp_dir / f"chapter_{i+1:02d}_diff.txt"
        diff_path.write_text(diff_text)
        if diff_text.strip():
            changed = sum(1 for l in diff_text.split("\n") if l.startswith("-") and not l.startswith("---"))
            print(f"    Chapter {i+1}: {changed} lines changed -- see {diff_path.name}")
        else:
            print(f"    Chapter {i+1}: no changes applied (fixes didn't match)")

    # Clean temp
    import shutil
    shutil.rmtree(temp_dir)

    cost_text += f"\nFix phase: {len(fixes)} fixes applied\n"
else:
    print("\n  No critical issues found -- clean bill of health!")
    for i in chapter_range:
        after_path = comp_dir / f"chapter_{i+1:02d}_after.txt"
        after_path.write_text(stories[i])

(comp_dir / "cost.txt").write_text(cost_text)
print(f"\n  Results saved to {comp_dir}/")
