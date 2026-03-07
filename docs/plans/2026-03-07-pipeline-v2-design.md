# Pipeline V2: Consistent Stories with Full Vocabulary Coverage

**Date:** 2026-03-07
**Goal:** Fix image prompt consistency, cross-chapter continuity, vocabulary coverage gaps, and grammar tracking so the pipeline produces production-ready decks for any language pair with minimal manual intervention.

---

## Problem Summary

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| Image prompts inconsistent for secondary characters | Only protagonist uses placeholder strategy; LLM free-forms secondary descriptions | Will waste ~$4 on inconsistent images |
| Characters missing from chapters (ch19, ch20) | No enforcement of config character list; LLM follows `context` field only | Story feels incomplete at climax |
| Cross-chapter continuity errors (suitcase color, greeting inconsistencies) | Each chapter generated in isolation; no previous-chapter context passed | Breaks immersion |
| Vocabulary coverage stuck at 32.4% top-1000 | Gap filler assigned inflected forms (96.3% already covered); pronouns filtered from deck | Deck too thin for A1-B2 span |
| Missing structural vocabulary (days, months, numbers) | No must-include word system; gap sentences are loose (no scenes/images) | Learner misses fundamentals |
| Grammar gaps (no imperfecto in A2, no pluscuamperfecto in B1) | No grammar audit; CEFR rules are suggestions not verified constraints | Incomplete grammar progression |

---

## Design

### Fix 1: Character Placeholder Strategy for Image Prompts

**File:** `pipeline/scene_story_generator.py`

**Changes to `_SYSTEM_PROMPT_TEMPLATE`:**

Add a new section after the protagonist consistency block:

```
## Secondary character consistency
When any secondary character appears in a shot's image_prompt, write their name
in ALL CAPS (e.g. SOFIA, LUCAS, ROBERTO). Do NOT describe their appearance —
post-processing will replace the name with the canonical visual tag.
Example:
  image_prompt: "Close-up of PROTAGONIST and SOFIA sitting at a cafe table."
```

**Changes to `_post_process()`:**

After the protagonist replacement loop, add a secondary character loop:

```python
for sc in config.secondary_characters:
    name_upper = sc.name.upper()
    if name_upper in raw:
        raw = raw.replace(name_upper, sc.visual_tag)
    # Safety net: if name appears in mixed case but tag wasn't injected
    elif sc.name in raw and sc.visual_tag not in raw:
        raw = raw.replace(sc.name, f"{sc.name} ({sc.visual_tag})", 1)
```

**Edge case — possessives:** If the visual_tag appears before `'s`, the prompt becomes broken (`jeans's hands`). After all replacements, apply a cleanup regex:

```python
import re
# Fix "visual_tag's X" → "X held by visual_tag"
raw = re.sub(r'(\([^)]+\))\s*\'s\s+(\w+)', r'\2 of \1', raw)
```

### Fix 2: Cross-Chapter Continuity via Auto-Summaries

**File:** `pipeline/scene_story_generator.py`

**New function `_generate_chapter_summary()`:**

After generating chapter N, extract a structured summary (~100 tokens):

```python
def _generate_chapter_summary(chapter_data: ChapterScene, config: DeckConfig, llm: LLMClient) -> str:
    """Generate a compact summary for cross-chapter continuity."""
    sentences = []
    for scene in chapter_data.scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sentences.append(sent.source)

    prompt = f"""Summarize this chapter in exactly 3-5 bullet points for continuity.
Include: key events, characters present, important objects (with colors/details), emotional state at end.
Keep under 100 words.

Sentences:
{chr(10).join(sentences)}"""

    system = "You are a story editor creating continuity notes. Be precise about visual details."
    result = llm.complete_json(prompt, system=system)
    return result.parsed.get("summary", "")
```

Alternatively, for cheaper operation, extract deterministically:
- Characters present: scan for character names in sentences
- Key objects: extract nouns from image prompts
- Events: first and last sentence of each scene

**Changes to `generate_chapter()` and `generate_all()`:**

```python
def generate_all(self, chapter_range):
    chapters = []
    summaries = []  # Accumulates as we go

    for i in chapter_range:
        chapter = self.generate_chapter(i, previous_summaries=summaries)
        chapters.append(chapter)

        # Generate and cache summary
        summary = self._get_or_generate_summary(chapter, i)
        summaries.append(f"Chapter {i+1}: {summary}")

    return chapters
```

**Changes to `_build_chapter_prompt()`:**

Add a "Story so far" section when previous summaries exist:

```python
story_so_far = ""
if previous_summaries:
    story_so_far = "\n\nStory so far:\n" + "\n".join(previous_summaries)
    story_so_far += "\n\nIMPORTANT: Maintain consistency with all details above (object colors, character relationships, established facts)."
```

**Caching:** Summaries are saved to `output/<deck-id>/stories/summary_{N:02d}.txt` alongside chapter JSONs. When resuming a partially-generated deck, summaries for cached chapters are loaded from disk.

### Fix 3: Character Presence Enforcement

**File:** `pipeline/scene_story_generator.py`

**Changes to `_build_chapter_prompt()`:**

Replace the current soft secondary character listing with a hard requirement:

```python
# Current (soft):
secondary_section += f"\nSecondary character: {sc.name} - {sc.visual_tag}"

# New (hard):
secondary_section += f"\n- {sc.name} (MUST appear in at least one scene and one line of dialogue)"
```

Add after the secondary section:

```python
if secondary_section:
    secondary_section = (
        "\n\nMANDATORY characters in this chapter "
        "(each MUST appear in at least one shot and speak at least once):"
        + secondary_section
    )
```

### Fix 4: Vocabulary-Integrated Story Generation

This is the biggest change. Instead of "generate story then fill gaps," we plan vocabulary coverage into the story from the start.

#### 4a: Must-Include Word Categories

**New file:** `pipeline/vocabulary_planner.py`

Define language-agnostic structural vocabulary categories that every deck must cover:

```python
MUST_INCLUDE_CATEGORIES = {
    "pronouns": {
        "description": "Personal pronouns (I, you, he, she, we, they)",
        "count": 8,  # Expected ~8 words
        "cefr": "A1",
    },
    "days": {
        "description": "Days of the week",
        "count": 7,
        "cefr": "A1",
    },
    "months": {
        "description": "Months of the year",
        "count": 12,
        "cefr": "A1",
    },
    "numbers_1_20": {
        "description": "Cardinal numbers 1-20",
        "count": 20,
        "cefr": "A1",
    },
    "numbers_tens": {
        "description": "Tens (30, 40, ... 100)",
        "count": 8,
        "cefr": "A1",
    },
    "colors": {
        "description": "Basic colors (red, blue, green, yellow, black, white, brown, orange, pink, purple)",
        "count": 10,
        "cefr": "A1",
    },
    "family": {
        "description": "Family members (mother, father, brother, sister, son, daughter, grandmother, grandfather)",
        "count": 8,
        "cefr": "A1",
    },
    "weather": {
        "description": "Weather terms (sun, rain, cloud, wind, hot, cold, warm)",
        "count": 7,
        "cefr": "A1",
    },
    "time_expressions": {
        "description": "Time of day, today, tomorrow, yesterday, now, always, never, sometimes",
        "count": 10,
        "cefr": "A1",
    },
    "body_parts": {
        "description": "Basic body parts (head, hand, eye, mouth, leg, arm, foot, hair, face)",
        "count": 9,
        "cefr": "A1",
    },
}
```

#### 4b: Vocabulary Planning Pass (new Pass 0b)

**New function in `vocabulary_planner.py`:**

Before story generation, plan which words each chapter must cover:

```python
def plan_vocabulary(
    config: DeckConfig,
    frequency_data: dict[str, int],
    frequency_lemmas: dict[str, FrequencyLemmaEntry] | None,
    top_n: int = 1000,
) -> dict[int, VocabularyPlan]:
    """Plan vocabulary distribution across chapters.

    Returns chapter_num -> VocabularyPlan with:
    - must_include_words: specific words that MUST appear in sentences
    - teaching_scenes: suggested scene descriptions for structural vocabulary
    - expanded_vocab_focus: original vocab_focus + frequency-driven additions
    """
```

Steps:
1. Load frequency list, filter inappropriate words (via frequency_lemmas).
2. Compute target words per CEFR level from top-N.
3. Distribute must-include categories across A1 chapters with natural scene suggestions:
   - Days of week -> chapter where characters plan activities
   - Months -> chapter where characters discuss travel dates/seasons
   - Numbers -> shopping/transport chapters
   - Weather -> outdoor activity chapters
4. Distribute remaining high-frequency content words across chapters by topical fit (LLM call, similar to current gap filler assignment but at lemma level and before story generation).
5. Output: per-chapter word lists that become hard constraints in the story generation prompt.

#### 4c: Scene Injection for Structural Vocabulary

The vocabulary planner generates **teaching scene suggestions** that get injected into the chapter prompt:

```python
TEACHING_SCENE_TEMPLATES = {
    "days": "In one scene, {companion} and {protagonist} plan the week together. {companion} teaches {protagonist} the days of the week ({target_language} words for Monday through Sunday) while looking at a calendar or planner.",
    "months": "{companion} asks {protagonist} when her birthday is. They talk about months and seasons, mentioning at least 6 months by name.",
    "numbers_1_20": "During a shopping or payment scene, {protagonist} counts items or money, using numbers naturally in conversation.",
    "weather": "{protagonist} and {companion} check the weather forecast together, discussing conditions for their planned outing.",
    "time_expressions": "At a transport stop or meeting point, characters discuss time — what time it is, when something arrives, how long they waited.",
}
```

These get appended to the chapter's `context` in the prompt, not in the YAML (keeping the YAML clean).

#### 4d: Hard Vocabulary Constraints in Story Generation

**Changes to `_build_chapter_prompt()`:**

Add a section after vocab_focus:

```python
if vocabulary_plan and vocabulary_plan.must_include_words:
    words_str = ", ".join(vocabulary_plan.must_include_words)
    prompt += f"\n\nMANDATORY vocabulary: You MUST use each of these words in at least one sentence: {words_str}"
    prompt += "\nThese words are high-frequency and critical for the learner. Weave them naturally into the story."

if vocabulary_plan and vocabulary_plan.teaching_scenes:
    prompt += "\n\nAdditional scene suggestions (incorporate naturally):"
    for scene_desc in vocabulary_plan.teaching_scenes:
        prompt += f"\n- {scene_desc}"
```

#### 4e: Fix Coverage Checker to Return Lemmas

**File:** `pipeline/coverage_checker.py`

Change `check_coverage()` to deduplicate at the lemma level before returning `missing_words`:

```python
# Current: returns raw frequency words (mix of inflected forms + lemmas)
missing = {w for w in top_words if not is_covered(w) and w not in inappropriate_lemmas}

# New: resolve to lemmas first, then check coverage
missing_lemmas = set()
for w in top_words:
    if is_covered(w):
        continue
    lemma = merged_map.get(w, w)
    if lemma in our_lemmas or lemma in inappropriate_lemmas:
        continue
    missing_lemmas.add(lemma)
```

#### 4f: Remove Pronoun Filter from Vocabulary Builder

**File:** `pipeline/vocabulary_builder.py`

Change:
```python
FILTERED_POS = {"article", "determiner", "preposition", "pronoun", "conjunction"}
```
To:
```python
FILTERED_POS = {"article", "determiner", "preposition", "conjunction"}
```

Pronouns are vocabulary that must be taught. The coverage checker's function word list handles them separately for frequency analysis.

#### 4g: Post-Generation Gap Verification

After story generation + word extraction, run coverage check. If words are still missing:

1. Generate gap sentences WITH full shot data (image_prompt, scene context) — not loose sentences.
2. Insert them into the chapter's scene list as additional shots.
3. Re-run word extraction on the new sentences.
4. Re-check coverage and report.

### Fix 5: Grammar Coverage Audit

**New file:** `pipeline/grammar_auditor.py`

#### 5a: Grammar Checklist in Config

Add to `DeckConfig` (optional, language-specific):

```yaml
grammar_targets:
  A1:
    - "simple present tense (indicativo presente)"
    - "ser vs estar basics"
    - "hay (there is/are)"
    - "simple questions with question words"
  A2:
    - "preterito indefinido (simple past)"
    - "preterito imperfecto (habitual/descriptive past)"
    - "preterito vs imperfecto contrast in same sentence"
    - "reflexive verbs"
    - "modal verbs (poder, querer, deber)"
    - "porque/cuando subordinate clauses"
  B1:
    - "present subjunctive (ojala, quizas, es importante que)"
    - "conditional (me gustaria, podria)"
    - "pluscuamperfecto indicative (habia + participle)"
    - "relative clauses (que, donde, quien)"
    - "si + imperfect subjunctive + conditional"
  B2:
    - "perfect subjunctive (haya + participle)"
    - "pluperfect subjunctive (hubiera + participle)"
    - "conditional perfect (habria + participle)"
    - "si hubiera... habria... (unreal past conditional)"
    - "passive voice"
    - "nuanced connectors (sin embargo, a pesar de, dado que)"
```

#### 5b: Audit Pass (after text generation)

```python
def audit_grammar(
    chapters: dict[int, list[str]],  # chapter_num -> sentences
    grammar_targets: dict[str, list[str]],
    chapter_cefr_levels: dict[int, str],
    llm: LLMClient,
) -> GrammarAuditReport:
    """Check which grammar targets appear in the generated text."""
```

Groups chapters by CEFR level, sends one LLM call per level:
"Do these sentences contain examples of each grammar target? For each target, quote the sentence that demonstrates it, or mark as MISSING."

Returns a report with present/missing targets per CEFR level.

#### 5c: Targeted Regeneration (optional)

If critical grammar targets are missing (e.g., imperfecto in A2), the audit can suggest specific chapters to regenerate with an additional prompt constraint:

```
"This chapter MUST include at least 2 sentences using the preterito imperfecto
(descriptive/habitual past: era, tenia, habia, estaba). Use it to describe
backgrounds, habitual actions, or ongoing states."
```

This would require deleting the cached chapter file and re-running story generation for that chapter only.

---

## Pipeline Flow (V2)

```
Pass 0:  Frequency Lemmatizer (cached, unchanged)
Pass 0b: Vocabulary Planner (NEW — distributes words + injects teaching scenes)
Pass 1:  Scene Story Generator (MODIFIED — summaries, character enforcement, vocab constraints)
Pass 2:  Sentence Translator (unchanged)
Pass 3:  Word Extractor (unchanged)
Pass 3b: Coverage Verification (MODIFIED — lemma-level, gap shots with images)
Pass 3c: Grammar Audit (NEW — checks grammar targets, flags missing)
Pass 4:  Audio Generator (unchanged)
Pass 5:  Image Generator (unchanged)
Build:   Vocabulary Builder (MODIFIED — keep pronouns)
```

## File Changes Summary

| File | Change Type | Description |
|------|------------|-------------|
| `pipeline/scene_story_generator.py` | Modify | Placeholder strategy for all characters, chapter summaries, character enforcement, vocab constraints in prompt |
| `pipeline/vocabulary_planner.py` | New | Must-include categories, vocabulary distribution, teaching scene injection |
| `pipeline/grammar_auditor.py` | New | Grammar checklist audit per CEFR level |
| `pipeline/coverage_checker.py` | Modify | Return missing lemmas (not inflected forms) |
| `pipeline/vocabulary_builder.py` | Modify | Remove pronoun from FILTERED_POS |
| `pipeline/gap_filler.py` | Modify | Generate full shots (with image_prompt) not loose sentences |
| `pipeline/config.py` | Modify | Add optional `grammar_targets` to config |
| `scripts/run_all.py` | Modify | Add vocab planning pass, grammar audit pass, post-generation coverage verification |
| `configs/spanish_buenos_aires.yaml` | Modify | Add grammar_targets section |

## Migration / Backward Compatibility

- All changes are additive. Existing cached chapter files remain valid.
- To regenerate with V2 improvements: delete cached story files and re-run `--stage text`.
- The vocabulary planner and grammar auditor are optional passes — pipeline works without them but produces better output with them.
- `grammar_targets` in config is optional. If absent, grammar audit is skipped.

## Cost Impact

- Vocabulary planner: 1 LLM call for word distribution (~$0.001)
- Chapter summaries: 1 cheap call per chapter (~$0.0004 x 20 = $0.008)
- Grammar audit: 1 call per CEFR level (~$0.001 x 4 = $0.004)
- Total additional cost: ~$0.015 per full deck generation (negligible)

## Success Criteria

After V2, a generated deck should:
1. All secondary characters visually consistent across all their chapters (exact visual_tag in every image prompt)
2. All configured characters appear in their assigned chapters with dialogue
3. No cross-chapter continuity errors (object colors, relationships, established facts)
4. Top-1000 content word coverage >= 65% (up from 32.4%)
5. All must-include categories present (days, months, numbers, pronouns)
6. All CEFR grammar targets present in their respective level chapters
7. Every vocabulary word appears in a sentence with an associated scene/image
