"""Pass 5: Two-phase story audit — find issues then fix them.

Phase 5a: Reviewer model scans the full story, returns issues with severity
          and suggested fixes (no changes applied).
Phase 5b: Fixer model resolves each critical issue in parallel, getting only
          the surrounding context it needs.
"""

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Literal

from pydantic import BaseModel


# ── Models ──────────────────────────────────────────────────────────────

class AuditIssue(BaseModel):
    """An issue found by the reviewer (Pass 5a)."""
    chapter: int
    sentence_index: int
    category: str
    severity: Literal["critical", "minor"] = "critical"
    original: str
    description: str
    suggested_fix: str
    action: Literal["rewrite", "remove"] = "rewrite"


class AuditFix(BaseModel):
    """A resolved fix from the fixer (Pass 5b)."""
    chapter: int
    sentence_index: int
    original: str
    fixed: str  # empty string for "remove"
    action: Literal["rewrite", "remove"] = "rewrite"


class UnnamedCharacter(BaseModel):
    role: str
    chapters: list[int]
    suggested_visual_tag: str = ""


# ── Pass 5a: FIND ───────────────────────────────────────────────────────

def _build_find_prompt(
    chapters: dict[int, list[str]],
    characters: list[dict],
    chapter_configs: list[dict],
    focus_words_map: dict[tuple[int, int], str] | None = None,
) -> tuple[str, str]:
    """Build system + user prompt for the reviewer call."""

    # Character reference
    char_lines = []
    for c in characters:
        role = c.get("role", "character")
        chapters_in = c.get("chapters", [])
        ch_note = f" (chapters {chapters_in})" if chapters_in else ""
        vtag = c.get("visual_tag", "")
        vtag_note = f" | appearance: {vtag}" if vtag else ""
        char_lines.append(f"  - {c['name']}: {role}{ch_note}{vtag_note}")
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
            focus_tag = ""
            if focus_words_map:
                fw = focus_words_map.get((ch_num, idx), "")
                if fw:
                    focus_tag = f"  [vocab: {fw}]"
            story_lines.append(f"  [{ch_num}:{idx}] {sentence}{focus_tag}")
    story_block = "\n".join(story_lines)

    system = (
        "You are an expert language editor reviewing a graded reader story "
        "for language learners. You find semantic, grammatical, continuity, "
        "and narrative quality issues. You describe how to fix each issue "
        "but do NOT write the fixed sentence yourself. Return valid JSON."
    )

    prompt = (
        f"Review this complete story and find ALL issues.\n\n"
        f"CHARACTERS:\n{char_block}\n\n"
        f"STORY:\n{story_block}\n\n"
        f"Check for ALL of the following categories:\n\n"
        f"1. TENSE CONSISTENCY\n"
        f"   - Narrative tense must be consistent within each chapter\n"
        f"   - Past events in past tense, not present\n\n"
        f"2. CHARACTER CONSISTENCY\n"
        f"   - Characters must only appear in their assigned chapters\n"
        f"   - Names, relationships, roles must be consistent\n\n"
        f"3. CROSS-CHAPTER CONTINUITY\n"
        f"   - Objects, clothing, possessions consistent across chapters\n"
        f"   - Locations must match the story context\n\n"
        f"4. CEFR LEVEL VIOLATIONS\n"
        f"   - Each chapter has a CEFR level in brackets [A1], [A2], etc.\n"
        f"   - A1: only simple present, ser/estar, hay, basic adjectives, simple questions\n"
        f"   - A1 must NOT have: subjunctive, compound tenses, future tense "
        f"(haré, iré, será, gustará, tendré), imperatives (ten, pon, ven, di, haz, sal), "
        f"imperative+clitic (llámame, cuídate, dime), preterite, imperfecto\n"
        f"   - A2 may add: preterite, imperfecto, reflexives, comparatives, modals\n"
        f"   - A2 still must NOT have: subjunctive, compound tenses, future tense\n\n"
        f"5. SCENE LOGIC\n"
        f"   - Actions must fit the setting described in the chapter context\n"
        f"   - No contradictions between adjacent sentences\n"
        f"   - Verb collocations must be correct\n\n"
        f"6. DANGLING REFERENCES\n"
        f"   - Sentences introducing people, objects, or subplots NOT in the chapter "
        f"context or character list\n"
        f"   - Example: asking about a father when no father exists in the character list\n"
        f"   - Prefer rewriting to fit the story over removing\n"
        f"   - Only use \"remove\" if the sentence cannot be salvaged at all\n\n"
        f"7. REDUNDANCY\n"
        f"   - Same question asked twice in the same chapter\n"
        f"   - Same emotion expressed in 3+ consecutive sentences\n"
        f"   - Same key word in adjacent sentences\n\n"
        f"8. NARRATIVE FLOW\n"
        f"   - Events must occur in logical order\n"
        f"   - Non-sequiturs that break conversational flow\n"
        f"   - Example: saying \"hello\" mid-conversation\n\n"
        f"9. CONFIG ADHERENCE\n"
        f"   - The chapter CONTEXT describes the intended plot\n"
        f"   - Flag significant scene beats from the context that are completely absent\n"
        f"   - Only flag important omissions, not minor details\n\n"
        f"SEVERITY GUIDE:\n"
        f"  critical — contradictions, wrong CEFR grammar, dangling references, "
        f"broken logic, missing major plot beats\n"
        f"  minor — slight redundancy, minor word repetition, very small omissions\n\n"
        f"IMPORTANT CONTEXT:\n"
        f"  - This is a language learning app. Every sentence teaches vocabulary.\n"
        f"  - Sentences tagged [vocab: ...] contain MANDATORY gap-fill vocabulary.\n"
        f"  - These vocab words MUST appear in the fixed sentence unchanged.\n"
        f"  - Removing sentences hurts vocabulary coverage. ALWAYS prefer \"rewrite\" over \"remove\".\n"
        f"  - Only use \"remove\" for sentences that are completely unsalvageable "
        f"(e.g. broken beyond repair, pure duplicate of the previous sentence).\n"
        f"  - When describing fixes, instruct the fixer to PRESERVE all [vocab] words "
        f"exactly as written. Only grammar/word-order/function-word changes.\n\n"
        f"10. UNNAMED RECURRING CHARACTERS\n"
        f"   - Unnamed characters appearing in 2+ chapters\n"
        f"   - Report in separate 'unnamed_characters' array\n\n"
        f"Return ONLY this JSON structure:\n"
        f'{{\n'
        f'  "issues": [\n'
        f'    {{\n'
        f'      "chapter": 1,\n'
        f'      "sentence_index": 5,\n'
        f'      "category": "scene_logic",\n'
        f'      "severity": "critical",\n'
        f'      "original": "exact original sentence",\n'
        f'      "description": "What is wrong and why",\n'
        f'      "suggested_fix": "How to fix it (text description, not the fixed sentence)",\n'
        f'      "action": "rewrite"\n'
        f'    }}\n'
        f'  ],\n'
        f'  "unnamed_characters": [\n'
        f'    {{"role": "bus driver", "chapters": [3, 7], '
        f'"suggested_visual_tag": "middle-aged man, grey moustache, blue cap"}}\n'
        f'  ]\n'
        f'}}\n\n'
        f'If no issues found, return {{"issues": [], "unnamed_characters": []}}.'
    )

    return system, prompt


def find_issues(
    chapters: dict[int, list[str]],
    characters: list[dict],
    chapter_configs: list[dict],
    llm=None,
    focus_words_map: dict[tuple[int, int], str] | None = None,
) -> tuple[tuple[list[AuditIssue], list[UnnamedCharacter]], object]:
    """Pass 5a: Find issues in the story. Returns ((issues, unnamed_chars), LLMResponse)."""
    if not chapters or llm is None:
        return ([], []), None

    system, prompt = _build_find_prompt(chapters, characters, chapter_configs,
                                        focus_words_map=focus_words_map)
    response = llm.complete_json(prompt, system=system)

    parsed = response.parsed
    if isinstance(parsed, list):
        parsed = {"issues": parsed}

    issues = []
    for raw in parsed.get("issues", []):
        try:
            issues.append(AuditIssue(**raw))
        except Exception:
            continue

    unnamed = []
    for u in parsed.get("unnamed_characters", []):
        try:
            unnamed.append(UnnamedCharacter(**u))
        except Exception:
            continue

    return (issues, unnamed), response


# ── Pass 5b: FIX ────────────────────────────────────────────────────────

def _build_fix_prompt(
    issue: AuditIssue,
    surrounding: list[str],
    chapter_config: dict,
    focus_words: str = "",
) -> tuple[str, str]:
    """Build prompt for a single fixer call."""

    context_block = "\n".join(f"  {s}" for s in surrounding)
    ch_context = chapter_config.get("context", "")
    cefr = chapter_config.get("cefr_level", "?")

    system = (
        "You are a language editor fixing one specific issue in a graded reader "
        "for language learners. Apply the suggested fix precisely. "
        "Return valid JSON."
    )

    if issue.action == "remove":
        prompt = (
            f"TASK: Remove this sentence from the story.\n\n"
            f"Chapter {issue.chapter} [{cefr}]\n"
            f"Context: {ch_context}\n\n"
            f"Surrounding sentences:\n{context_block}\n\n"
            f"Sentence to remove:\n  [{issue.chapter}:{issue.sentence_index}] {issue.original}\n\n"
            f"Reason: {issue.description}\n\n"
            f"Return: {{\"fixed\": \"\", \"action\": \"remove\"}}"
        )
    else:
        focus_block = ""
        if focus_words:
            focus_block = (
                f"\n  MANDATORY VOCABULARY — these words MUST appear in the fixed sentence "
                f"(same form, same inflection):\n"
                f"    {focus_words}\n"
                f"  If you cannot fix the issue without changing these words, "
                f"return the original sentence unchanged.\n"
            )

        prompt = (
            f"TASK: Fix this sentence in a graded reader story.\n\n"
            f"Chapter {issue.chapter} [{cefr}]\n"
            f"Context: {ch_context}\n\n"
            f"Surrounding sentences:\n{context_block}\n\n"
            f"Problem sentence:\n  [{issue.chapter}:{issue.sentence_index}] {issue.original}\n\n"
            f"Issue: {issue.description}\n"
            f"How to fix: {issue.suggested_fix}\n\n"
            f"RULES:\n"
            f"  - PRESERVE all content words (nouns, verbs, adjectives, adverbs)\n"
            f"  - Only change grammar, word order, or function words\n"
            f"  - The chapter is [{cefr}] level — the fix must respect this CEFR level\n"
            f"  - Make the MINIMAL change needed\n"
            f"{focus_block}\n"
            f"Return ONLY: {{\"fixed\": \"the corrected sentence\", \"action\": \"rewrite\"}}"
        )

    return system, prompt


def _get_surrounding(
    chapters: dict[int, list[str]],
    chapter: int,
    sentence_index: int,
    window: int = 5,
) -> list[str]:
    """Get surrounding sentences for context (window sentences before and after)."""
    sentences = chapters.get(chapter, [])
    start = max(0, sentence_index - window)
    end = min(len(sentences), sentence_index + window + 1)
    result = []
    for i in range(start, end):
        marker = " >>>" if i == sentence_index else "    "
        result.append(f"{marker} [{chapter}:{i}] {sentences[i]}")
    return result


def fix_issue(
    issue: AuditIssue,
    chapters: dict[int, list[str]],
    chapter_configs: list[dict],
    llm=None,
    focus_words_map: dict[tuple[int, int], str] | None = None,
) -> AuditFix:
    """Pass 5b: Fix a single issue. Returns an AuditFix.

    focus_words_map: maps (chapter, sentence_index) → focus words string
    from the shot that contains the sentence.
    """
    if issue.action == "remove":
        # No LLM call needed for removals
        return AuditFix(
            chapter=issue.chapter,
            sentence_index=issue.sentence_index,
            original=issue.original,
            fixed="",
            action="remove",
        )

    ch_cfg = chapter_configs[issue.chapter - 1] if issue.chapter <= len(chapter_configs) else {}
    surrounding = _get_surrounding(chapters, issue.chapter, issue.sentence_index)

    focus = ""
    if focus_words_map:
        focus = focus_words_map.get((issue.chapter, issue.sentence_index), "")

    system, prompt = _build_fix_prompt(issue, surrounding, ch_cfg, focus_words=focus)
    response = llm.complete_json(prompt, system=system)

    parsed = response.parsed
    if isinstance(parsed, list):
        parsed = parsed[0] if parsed else {}
    fixed_text = parsed.get("fixed", issue.original)
    action = parsed.get("action", "rewrite")
    if action not in ("rewrite", "remove"):
        action = "rewrite"

    return AuditFix(
        chapter=issue.chapter,
        sentence_index=issue.sentence_index,
        original=issue.original,
        fixed=fixed_text,
        action=action,
    )


def fix_issues_parallel(
    issues: list[AuditIssue],
    chapters: dict[int, list[str]],
    chapter_configs: list[dict],
    llm=None,
    max_workers: int = 4,
    focus_words_map: dict[tuple[int, int], str] | None = None,
) -> list[AuditFix]:
    """Fix all issues in parallel. Returns list of fixes.

    focus_words_map: maps (chapter, sentence_index) → focus words string
    from the shot containing that sentence.
    """
    if not issues:
        return []

    fixes = []

    def _fix_one(issue):
        return fix_issue(issue, chapters, chapter_configs, llm=llm,
                         focus_words_map=focus_words_map)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {pool.submit(_fix_one, issue): issue for issue in issues}
        for future in as_completed(future_map):
            issue = future_map[future]
            try:
                fix = future.result()
                fixes.append(fix)
            except Exception as e:
                print(f"    ERROR fixing Ch{issue.chapter}[{issue.sentence_index}]: {e}")

    return fixes


# ── Apply fixes ─────────────────────────────────────────────────────────

def _reindex_sentences(data: dict) -> None:
    """Re-assign sentence_index 0, 1, 2... across the whole chapter after mutations."""
    idx = 0
    for scene in data.get("scenes", []):
        for shot in scene.get("shots", []):
            for sentence in shot.get("sentences", []):
                sentence["sentence_index"] = idx
                idx += 1


def dedup_consecutive_sentences(data: dict) -> int:
    """Remove consecutive sentences with identical source text. Returns count removed."""
    removed = 0
    for scene in data.get("scenes", []):
        for shot in scene.get("shots", []):
            sents = shot.get("sentences", [])
            if len(sents) <= 1:
                continue
            deduped = [sents[0]]
            for s in sents[1:]:
                if s.get("source") != deduped[-1].get("source"):
                    deduped.append(s)
                else:
                    removed += 1
            shot["sentences"] = deduped
        scene["shots"] = [s for s in scene.get("shots", []) if s.get("sentences")]
    data["scenes"] = [s for s in data.get("scenes", []) if s.get("shots")]
    return removed


def apply_fixes(
    fixes: list[AuditFix],
    stories_dir: Path,
) -> int:
    """Apply fixes to story JSON files. Returns count of applied fixes."""
    applied = 0

    by_chapter: dict[int, list[AuditFix]] = {}
    for fix in fixes:
        by_chapter.setdefault(fix.chapter, []).append(fix)

    for ch_num, ch_fixes in by_chapter.items():
        path = stories_dir / f"chapter_{ch_num:02d}.json"
        if not path.exists():
            continue

        data = json.loads(path.read_text())
        modified = False
        remove_indices: set[int] = set()

        # Build a lookup by sentence_index (match on index only, not source text)
        fix_by_idx: dict[int, AuditFix] = {}
        for fix in ch_fixes:
            fix_by_idx[fix.sentence_index] = fix

        for scene in data.get("scenes", []):
            for shot in scene.get("shots", []):
                for sentence in shot.get("sentences", []):
                    fix = fix_by_idx.get(sentence.get("sentence_index"))
                    if fix:
                        if fix.action == "remove":
                            remove_indices.add(fix.sentence_index)
                        else:
                            sentence["source"] = fix.fixed
                        modified = True
                        applied += 1

        if remove_indices:
            for scene in data.get("scenes", []):
                for shot in scene.get("shots", []):
                    shot["sentences"] = [
                        s for s in shot.get("sentences", [])
                        if s.get("sentence_index") not in remove_indices
                    ]
                scene["shots"] = [s for s in scene.get("shots", []) if s.get("sentences")]
            data["scenes"] = [s for s in data.get("scenes", []) if s.get("shots")]

        if modified:
            _reindex_sentences(data)
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    return applied
