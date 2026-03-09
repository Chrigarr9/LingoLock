"""Pass 5: Audit the complete story for semantic errors.

Single LLM call with the full story text, character list, and chapter
configs. Returns a list of fixes that are auto-applied to stories/.
"""

import json
from pathlib import Path

from pydantic import BaseModel


class AuditFix(BaseModel):
    chapter: int
    sentence_index: int
    original: str
    fixed: str
    reason: str


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
        story_lines.append(f"\n--- Chapter {ch_num}: \"{title}\" [{cefr}] ---")
        for idx, sentence in enumerate(chapters[ch_num]):
            story_lines.append(f"  [{ch_num}:{idx}] {sentence}")
    story_block = "\n".join(story_lines)

    system = (
        "You are an expert Spanish language editor reviewing a graded reader story "
        "for language learners. You check for semantic errors, not style preferences. "
        "Only flag clear mistakes. Return valid JSON."
    )

    prompt = (
        f"Review this complete story for errors.\n\n"
        f"CHARACTERS:\n{char_block}\n\n"
        f"STORY:\n{story_block}\n\n"
        f"Check for:\n"
        f"1. VERB COLLOCATIONS — subjects must use appropriate verbs "
        f"(cars/planes don't 'caminar', people don't 'volar')\n"
        f"2. CHARACTER CONSISTENCY — names, relationships, who appears where "
        f"(check character list above)\n"
        f"3. CROSS-CHAPTER CONTINUITY — objects/details that should carry over\n"
        f"4. CEFR LEVEL VIOLATIONS — sentences too complex for the chapter's level\n"
        f"5. SCENE LOGIC — actions must fit the setting\n\n"
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


def audit_story(
    chapters: dict[int, list[str]],
    characters: list[dict],
    chapter_configs: list[dict],
    llm=None,
) -> list[AuditFix]:
    """Audit the full story and return a list of fixes."""
    if not chapters or llm is None:
        return []

    system, prompt = _build_audit_prompt(chapters, characters, chapter_configs)
    response = llm.complete_json(prompt, system=system)
    raw_fixes = response.parsed.get("fixes", [])

    fixes = []
    for f in raw_fixes:
        try:
            fixes.append(AuditFix(**f))
        except Exception:
            continue  # Skip malformed fixes

    return fixes


def apply_fixes(
    fixes: list[AuditFix],
    stories_dir: Path,
) -> int:
    """Apply audit fixes to story JSON files. Returns count of applied fixes."""
    applied = 0

    # Group by chapter
    by_chapter: dict[int, list[AuditFix]] = {}
    for fix in fixes:
        by_chapter.setdefault(fix.chapter, []).append(fix)

    for ch_num, ch_fixes in by_chapter.items():
        path = stories_dir / f"chapter_{ch_num:02d}.json"
        if not path.exists():
            continue

        data = json.loads(path.read_text())
        modified = False

        for scene in data.get("scenes", []):
            for shot in scene.get("shots", []):
                for sentence in shot.get("sentences", []):
                    for fix in ch_fixes:
                        if (sentence.get("sentence_index") == fix.sentence_index
                                and sentence.get("source") == fix.original):
                            sentence["source"] = fix.fixed
                            modified = True
                            applied += 1

        if modified:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    return applied
