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


class UnnamedCharacter(BaseModel):
    role: str
    chapters: list[int]
    suggested_visual_tag: str = ""


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
        f"6. UNNAMED RECURRING CHARACTERS\n"
        f"   - Detect unnamed characters who appear in multiple chapters (vendor, waiter, bus driver, etc.)\n"
        f"   - If the same functional role appears in 2+ chapters, suggest a visual_tag for consistency\n"
        f"   - Report these in a separate 'unnamed_characters' array (see format below)\n\n"
        f"Return ONLY a JSON object with a 'fixes' array and optional 'unnamed_characters' array:\n"
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
        f"If no errors found, return {{\"fixes\": [], \"unnamed_characters\": []}}.\n\n"
        f"unnamed_characters format:\n"
        f'{{\n'
        f'  "role": "bus driver",\n'
        f'  "chapters": [3, 7],\n'
        f'  "suggested_visual_tag": "middle-aged man, grey moustache, blue cap, bus uniform"\n'
        f'}}'
    )

    return system, prompt


def audit_story(
    chapters: dict[int, list[str]],
    characters: list[dict],
    chapter_configs: list[dict],
    llm=None,
) -> tuple[list[AuditFix], list[UnnamedCharacter]]:
    """Audit the full story. Returns (fixes, unnamed_characters)."""
    if not chapters or llm is None:
        return [], []

    system, prompt = _build_audit_prompt(chapters, characters, chapter_configs)
    response = llm.complete_json(prompt, system=system)
    raw_fixes = response.parsed.get("fixes", [])

    fixes = []
    for f in raw_fixes:
        try:
            fixes.append(AuditFix(**f))
        except Exception:
            continue

    unnamed = []
    for u in response.parsed.get("unnamed_characters", []):
        try:
            unnamed.append(UnnamedCharacter(**u))
        except Exception:
            continue

    return fixes, unnamed


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
