# Pipeline Bugfixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 bugs discovered during story consistency review: PROTAGONIST leaking into sentences, inconsistent character naming, narrative voice flipping, word extractor skipping common adverbs, and coverage checker lemma leak.

**Architecture:** Each fix is independent. Bug 1 (PROTAGONIST in sentences) and Bug 2 (mixed-case names) are both in `_post_process()`. Bug 3 (narrative voice) is a system prompt fix. Bug 4 (word extractor) is a prompt fix. Bug 5 (coverage checker lemma leak) is a filter fix.

**Tech Stack:** Python, pytest with mocks, Pydantic models

---

### Task 1: Fix PROTAGONIST placeholder leaking into sentence source text

The `_post_process()` function in `scene_story_generator.py:232` only replaces PROTAGONIST and character CAPS names in `image_prompt` fields. It never touches `sentence.source`. This means 13+ sentences across chapters 11, 13, 14, 19 contain the literal string "PROTAGONIST" in learner-facing Spanish text.

**Files:**
- Modify: `spanish-content-pipeline/pipeline/scene_story_generator.py:232-265`
- Test: `spanish-content-pipeline/tests/test_scene_story_generator.py`

**Step 1: Write the failing test**

Add to `tests/test_scene_story_generator.py`:

```python
def test_post_process_replaces_protagonist_in_sentence_source(tmp_path):
    """PROTAGONIST placeholder in sentence source text is replaced with the character name."""
    from pipeline.scene_story_generator import _post_process

    config = make_config(tmp_path)
    chapter = ChapterScene(chapter=1, scenes=[
        Scene(setting="test", description="test", shots=[
            Shot(
                focus="PROTAGONIST walking",
                image_prompt="PROTAGONIST walks down the street",
                sentences=[
                    ShotSentence(source="PROTAGONIST camina por la calle.", sentence_index=0),
                    ShotSentence(source="«¡Hola!», dice PROTAGONIST.", sentence_index=1),
                ],
            )
        ])
    ])
    result = _post_process(chapter, config)
    for scene in result.scenes:
        for shot in scene.shots:
            for sentence in shot.sentences:
                assert "PROTAGONIST" not in sentence.source, (
                    f"PROTAGONIST not replaced in: {sentence.source}"
                )
                assert config.protagonist.name in sentence.source


def test_post_process_replaces_secondary_caps_in_sentence_source(tmp_path):
    """Secondary character CAPS names in sentence source are replaced with regular name."""
    from pipeline.scene_story_generator import _post_process

    config = make_config(tmp_path)
    # Use the secondary character from make_config (check what name it uses)
    sc = config.secondary_characters[0]
    chapter = ChapterScene(chapter=2, scenes=[
        Scene(setting="test", description="test", shots=[
            Shot(
                focus="test",
                image_prompt="test scene",
                sentences=[
                    ShotSentence(source=f"«¡Bienvenida!», dice {sc.name.upper()}.", sentence_index=0),
                ],
            )
        ])
    ])
    result = _post_process(chapter, config)
    sent = result.scenes[0].shots[0].sentences[0].source
    assert sc.name.upper() not in sent
    assert sc.name in sent
```

**Step 2: Run tests to verify they fail**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_scene_story_generator.py::test_post_process_replaces_protagonist_in_sentence_source tests/test_scene_story_generator.py::test_post_process_replaces_secondary_caps_in_sentence_source -v`
Expected: FAIL — PROTAGONIST still in sentence source

**Step 3: Implement the fix**

In `_post_process()` in `scene_story_generator.py`, add sentence source replacement inside the shot loop, after the image_prompt processing:

```python
def _post_process(chapter_data: ChapterScene, config: DeckConfig) -> ChapterScene:
    """Inject style prefix, character tag, and 'no text' suffix into image prompts.
    Replace character placeholders in sentence source text with actual names."""
    style = config.image_generation.style if config.image_generation else ""
    suffix = "no text, no writing, no letters."
    p = config.protagonist
    visual_tag = p.visual_tag

    for scene in chapter_data.scenes:
        for shot in scene.shots:
            # --- Image prompt replacements (visual_tag for image model) ---
            raw = shot.image_prompt.strip()
            raw = raw.replace("PROTAGONIST", visual_tag)
            if p.name in raw and visual_tag not in raw:
                raw = raw.replace(p.name, f"{p.name} ({visual_tag})", 1)
            for sc in config.secondary_characters:
                name_upper = sc.name.upper()
                if name_upper in raw:
                    raw = raw.replace(name_upper, sc.visual_tag)
                elif sc.name in raw and sc.visual_tag not in raw:
                    raw = raw.replace(sc.name, f"{sc.name} ({sc.visual_tag})", 1)
            if raw.endswith("."):
                raw = raw[:-1]
            shot.image_prompt = f"{style}. {raw}. {suffix}"

            # --- Sentence source replacements (plain name for learners) ---
            for sentence in shot.sentences:
                sentence.source = sentence.source.replace("PROTAGONIST", p.name)
                for sc in config.secondary_characters:
                    sentence.source = sentence.source.replace(sc.name.upper(), sc.name)

    return chapter_data
```

**Step 4: Run tests to verify they pass**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_scene_story_generator.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add spanish-content-pipeline/pipeline/scene_story_generator.py spanish-content-pipeline/tests/test_scene_story_generator.py
git commit -m "fix(pipeline): replace PROTAGONIST and CAPS names in sentence source text"
```

---

### Task 2: Enforce consistent third-person narrative voice in system prompt

The system prompt at line 51 says "Write in third person about the protagonist by name" but the LLM still flips to first person in some chapters (9, 10, 15, 18, 20). Strengthen the instruction.

**Files:**
- Modify: `spanish-content-pipeline/pipeline/scene_story_generator.py:11-80` (system prompt)

**Step 1: Strengthen the narrative voice instruction**

In `_SYSTEM_PROMPT_TEMPLATE`, replace the sentence rules section. Change line 51 from:

```
- Write in third person about the protagonist by name (e.g. "Maria lleva…").
```

to:

```
- ALWAYS write in third person about the protagonist by name (e.g. "Maria lleva…"). \
NEVER use first person (yo, me, mi, nosotros). NEVER switch to first person for any reason — \
not for inner thoughts, not for emphasis, not for dialogue attribution. \
Wrong: "Camino por la calle." / "Me siento nerviosa." / "Nos sentamos." \
Right: "Maria camina por la calle." / "Maria se siente nerviosa." / "Ellas se sientan."
```

**Step 2: Run existing tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_scene_story_generator.py -v`
Expected: All tests PASS (prompt change doesn't break tests)

**Step 3: Commit**

```bash
git add spanish-content-pipeline/pipeline/scene_story_generator.py
git commit -m "fix(pipeline): enforce third-person narrative voice in system prompt"
```

---

### Task 3: Expand word extractor prompt to include common adverbs and quantifiers

The word extractor prompt says "extract content words" which the LLM interprets narrowly, skipping high-frequency adverbs like `bien`, `más`, `ahora`, `también`, `nunca`, `algo`, `nada`. These words exist in our sentences but never get extracted into the vocabulary.

**Files:**
- Modify: `spanish-content-pipeline/pipeline/word_extractor.py:15-42`
- Test: `spanish-content-pipeline/tests/test_word_extractor.py`

**Step 1: Write a test that checks the prompt includes adverb instructions**

Add to `tests/test_word_extractor.py`:

```python
def test_extraction_prompt_requests_common_adverbs():
    """The extraction prompt explicitly asks for high-frequency adverbs and quantifiers."""
    from pipeline.word_extractor import _build_extraction_prompt
    from pipeline.models import SentencePair

    config = make_config()
    pairs = [SentencePair(chapter=1, sentence_index=0,
                          source="Maria también camina bien.",
                          target="Maria geht auch gut.")]
    prompt = _build_extraction_prompt(config, pairs)
    # Should explicitly mention common adverbs to extract
    assert "bien" in prompt or "adverbs" in prompt.lower()
    assert "también" in prompt or "también" in prompt
```

Note: Adapt `make_config()` to whatever test helper exists in that file — read the file first.

**Step 2: Update the extraction prompt**

Replace the prompt in `_build_extraction_prompt` (line 20-42):

```python
    return f"""Analyze the following {config.languages.target} sentences with their \
{config.languages.native} translations. Extract every teachable word including:
- Nouns, verbs, adjectives
- Adverbs (especially common ones: bien, mal, más, menos, muy, mucho, poco, \
ahora, aquí, allí, hoy, también, tampoco, siempre, nunca, ya, todavía, solo, tan)
- Quantifiers and indefinite pronouns (algo, nada, alguien, nadie, otro, todo, cada)
- Important prepositions and conjunctions
- Interjections and discourse markers (gracias, sí, claro, perdón, bueno)

Skip ONLY: articles (el, la, los, las, un, una), subject pronouns (yo, tú, \
él, ella, nosotros), possessive determiners (mi, tu, su), demonstratives (este, ese), \
and proper nouns (names of people, places).

For each word, provide:
- "source": the word as it appears in the sentence
- "target": the correct {config.languages.native} translation in this context
- "lemma": the base/dictionary form (infinitive for verbs, masculine singular for adjectives)
- "pos": part of speech (noun, verb, adjective, adverb, preposition, conjunction, \
interjection, quantifier)
- "context_note": brief grammar note (e.g. "3rd person singular present", "feminine plural")
- "similar_words": 6-8 semantically similar {config.languages.target} words in lemma form \
(e.g. for "perro": ["gato", "vaca", "pollo", "caballo", "pájaro", "pez", "conejo", "ratón"]). \
These are used as multiple-choice distractors, so they should be from the same semantic \
category but clearly different words.

Sentences:
{sentence_block}

Return a JSON object with a "words" array containing all extracted words.
Return ONLY valid JSON. No markdown fences, no extra text."""
```

**Step 3: Run tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_word_extractor.py -v`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add spanish-content-pipeline/pipeline/word_extractor.py spanish-content-pipeline/tests/test_word_extractor.py
git commit -m "fix(pipeline): expand word extractor prompt to include common adverbs and quantifiers"
```

---

### Task 4: Fix coverage checker lemma leak — function words resolved from inflections

When an inflected form like `baja` (not a function word) resolves to lemma `bajo` (IS a function word/preposition), `bajo` appears in the missing words list. Same for `mi`→`yo`, `ti`→`tú`. The fix: after resolving to lemma, check if the lemma is in `SPANISH_FUNCTION_WORDS`.

**Files:**
- Modify: `spanish-content-pipeline/pipeline/coverage_checker.py:340-353`
- Test: `spanish-content-pipeline/tests/test_coverage_checker.py`

**Step 1: Write the failing test**

Add to `tests/test_coverage_checker.py` (or create it if it doesn't exist):

```python
def test_function_word_lemma_not_in_missing():
    """If an inflected form resolves to a function-word lemma, it should not appear as missing."""
    from pipeline.coverage_checker import check_coverage, SPANISH_FUNCTION_WORDS
    from pipeline.models import OrderedDeck, DeckChapter, VocabularyEntry

    deck = OrderedDeck(
        deck_id="test", deck_name="Test", total_words=1,
        chapters=[DeckChapter(chapter=1, title="Ch1", words=[
            VocabularyEntry(id="comer", source="come", target=["essen"],
                            pos="verb", first_chapter=1, order=0, examples=[]),
        ])],
    )
    # "baja" is rank 50, resolves to "bajo" which is a function word (preposition)
    frequency_data = {"baja": 50, "comer": 100}
    inflection_to_lemma = {"baja": "bajo"}

    report = check_coverage(deck, frequency_data, top_n=1000,
                            inflection_to_lemma=inflection_to_lemma)
    assert "bajo" not in report.missing_words, (
        "Function-word lemma 'bajo' should not appear in missing_words"
    )
```

**Step 2: Run test to verify it fails**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_coverage_checker.py::test_function_word_lemma_not_in_missing -v`
Expected: FAIL — "bajo" appears in missing_words

**Step 3: Implement the fix**

In `coverage_checker.py`, in the `missing_lemmas` loop (line 341-353), add a function-word check after resolving to lemma:

```python
    missing_lemmas: set[str] = set()
    for w in top_words:
        if is_covered(w):
            continue
        # Resolve to lemma
        lemma = merged_map.get(w, w)
        # Skip if lemma is covered or inappropriate
        if lemma in our_lemmas or lemma in inappropriate_lemmas:
            continue
        # Skip the raw form too if it's inappropriate
        if w in inappropriate_lemmas:
            continue
        # Skip if lemma resolves to a function word
        if lemma in SPANISH_FUNCTION_WORDS:
            continue
        missing_lemmas.add(lemma)
```

**Step 4: Run tests**

Run: `cd spanish-content-pipeline && uv run pytest tests/test_coverage_checker.py -v`
Expected: All tests PASS

**Step 5: Also run full test suite**

Run: `cd spanish-content-pipeline && uv run pytest -v`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add spanish-content-pipeline/pipeline/coverage_checker.py spanish-content-pipeline/tests/test_coverage_checker.py
git commit -m "fix(pipeline): exclude function-word lemmas from coverage missing list"
```

---

### Task 5: Verify all fixes together

**Step 1: Run full test suite**

Run: `cd spanish-content-pipeline && uv run pytest -v`
Expected: All tests PASS (115 existing + 3-4 new tests)

**Step 2: Commit all if not already committed**

```bash
git add -A
git commit -m "test: verify all pipeline bugfixes pass together"
```
