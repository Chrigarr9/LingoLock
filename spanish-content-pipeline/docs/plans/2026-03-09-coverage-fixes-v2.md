# Coverage Fixes v2: Gap Shots, Character Intros, Chapter Targeting

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix gap filling to target only processed chapters, produce complete shots with image prompts (max 3 sentences each), and add character introductions to stories.

**Architecture:** Gap filler output changes from `GapSentence` (loose sentences) to `GapShot` (1-3 sentences + image_prompt). Sentence inserter becomes shot inserter — inserts new shots between existing shots. Gap assignment is scoped to processed chapters only. Story generator gets character role instructions.

**Tech Stack:** Python, Pydantic, pytest

---

### Task 1: Add `role` field to SecondaryCharacter config

**Files:**
- Modify: `pipeline/config.py:34-37` (SecondaryCharacter model)
- Modify: `configs/spanish_buenos_aires.yaml` (add role to each character)
- Modify: `tests/test_config.py` (update test fixtures if needed)

**Step 1: Add role field to SecondaryCharacter**

In `pipeline/config.py`, the `SecondaryCharacter` model (line 34-37):

```python
class SecondaryCharacter(BaseModel):
    name: str
    role: str = ""  # e.g. "Maria's mother", "Maria's best friend"
    visual_tag: str
    chapters: list[int]
```

**Step 2: Add roles in YAML config**

In `configs/spanish_buenos_aires.yaml`, update each secondary character entry. Find the `secondary_characters:` section and add `role:` to each:

```yaml
  - name: "Ingrid"
    role: "Maria's mother"
    visual_tag: "..."
    chapters: [1, 2]

  - name: "Sofia"
    role: "Maria's best friend and host in Buenos Aires"
    visual_tag: "..."
    chapters: [5, 6, 7, ...]

  - name: "Diego"
    role: "a fellow traveler Maria meets on the plane, graphic designer"
    visual_tag: "..."
    chapters: [4, 18, 20, 23, 27]

  - name: "Lucas"
    role: "a sporty friend Maria meets through Sofia"
    visual_tag: "..."
    chapters: [13, 15, 16, 20, 23, 27]

  - name: "Valentina"
    role: "Lucas's Colombian girlfriend"
    visual_tag: "..."
    chapters: [13, 14, 17, 20, 23, 24, 27]

  - name: "Roberto"
    role: "a tango teacher"
    visual_tag: "..."
    chapters: [19, 23, 27]
```

**Step 3: Run tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_config.py -x -v`
Then: `uv run pytest tests/ -x -q`

**Step 4: Commit**

```bash
git add pipeline/config.py configs/spanish_buenos_aires.yaml
git commit -m "feat(config): add role field to secondary characters"
```

---

### Task 2: Add character introduction instructions to story generator

**Files:**
- Modify: `pipeline/story_generator.py` (chapter prompt builder, ~lines 164-206)

**Step 1: Update `_build_chapter_prompt` to include character introductions**

In `pipeline/story_generator.py`, find the `_build_chapter_prompt` function. It builds the per-chapter prompt.

Add two things:

1. **Protagonist introduction instruction** — add to the prompt for chapter 1 (or the first chapter in the range):

After the existing protagonist section, add:
```python
    # Character introduction instructions
    if chapter_index == 0:  # First chapter
        prompt += (
            f"\n\nIMPORTANT: This is the first chapter. Introduce {config.protagonist.name} "
            f"to the reader: she is from {config.protagonist.origin_country}, "
            f"traveling to {config.destination.city}, {config.destination.country}. "
            f"Make her name, origin, and reason for traveling clear in the first few sentences."
        )
```

2. **Secondary character role in the mandatory characters section** — update the loop that builds mandatory characters. Currently (line 178-183):

```python
for sc in config.secondary_characters:
    if (chapter_index + 1) in sc.chapters:
        secondary_section += f"\n- {sc.name}: MUST appear in at least one scene and speak at least one line of dialogue. Visual tag: {sc.visual_tag}"
```

Change to include role and introduction instruction:

```python
    first_chapter = min(sc.chapters) if sc.chapters else 999
    is_first_appearance = (chapter_index + 1) == first_chapter
    role_note = f" ({sc.role})" if sc.role else ""
    intro_note = f" Introduce {sc.name} to the reader — make the relationship clear." if is_first_appearance else ""
    secondary_section += (
        f"\n- {sc.name}{role_note}: MUST appear in at least one scene and "
        f"speak at least one line of dialogue. Visual tag: {sc.visual_tag}.{intro_note}"
    )
```

**Step 2: Run tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_story_generator.py -x -v`
Then: `uv run pytest tests/ -x -q`

Some tests check prompt content — they may need updating if they assert exact strings.

**Step 3: Commit**

```bash
git add pipeline/story_generator.py
git commit -m "feat(story-gen): add character introduction instructions to prompts"
```

---

### Task 3: Scope gap assignment to processed chapters only

**Files:**
- Modify: `pipeline/gap_filler.py` (`__init__`, `fill_gaps`, `_assign_via_llm`)
- Modify: `scripts/run_all.py` (Pass 4 — pass chapter_range to GapFiller)

**Step 1: Add `chapter_range` parameter to GapFiller**

In `pipeline/gap_filler.py`, update `__init__` to accept an optional `chapter_range`:

```python
def __init__(
    self,
    llm,
    output_dir: Path,
    config_chapters: list,
    target_language: str,
    native_language: str,
    dialect: str,
    max_new_words_per_sentence: int = 3,
    chapter_range: range | None = None,
):
    self._llm = llm
    self._output_dir = output_dir
    self._chapters = config_chapters
    self._target_lang = target_language
    self._native_lang = native_language
    self._dialect = dialect
    self._max_new_words = max_new_words_per_sentence
    # If chapter_range provided, only target those chapters for assignment
    self._target_chapters = chapter_range  # None = all chapters
```

**Step 2: Update `_assign_via_llm` to only use target chapters**

In `_assign_via_llm`, filter to only target chapters when building chapter summaries:

```python
def _assign_via_llm(self, missing_words: list[str]) -> dict[str, int]:
    """Single LLM call: assign each missing word to a chapter number."""
    # Use only target chapters if specified
    if self._target_chapters is not None:
        target_indices = list(self._target_chapters)  # 0-based
    else:
        target_indices = list(range(len(self._chapters)))

    target_per_chapter = max(1, len(missing_words) // max(1, len(target_indices)))

    chapter_summaries = []
    for idx in target_indices:
        ch_num = idx + 1
        ch = self._chapters[idx]
        if hasattr(ch, "title"):
            title, context, vocab_focus, cefr = ch.title, ch.context, ch.vocab_focus, ch.cefr_level
        else:
            title = ch.get("title", f"Chapter {ch_num}")
            context = ch.get("context", "")
            vocab_focus = ch.get("vocab_focus", [])
            cefr = ch.get("cefr_level", "")
        chapter_summaries.append(
            f"  {ch_num}. [{cefr}] \"{title}\" — {context}. Focus: {', '.join(vocab_focus)}"
        )

    chapters_text = "\n".join(chapter_summaries)
    words_text = ", ".join(missing_words)
    valid_nums = [idx + 1 for idx in target_indices]
    valid_range = ", ".join(str(n) for n in valid_nums)

    system = (
        f"You are a curriculum designer for a {self._target_lang} language learning deck."
    )
    prompt = (
        f"The following {self._target_lang} words are missing from our vocabulary deck "
        f"and need to be introduced in new example sentences.\n\n"
        f"Chapters:\n{chapters_text}\n\n"
        f"Missing words: {words_text}\n\n"
        f"Assign each word to the most appropriate chapter number ({valid_range}).\n\n"
        f"Rules:\n"
        f"1. Distribute words roughly evenly — aim for ~{target_per_chapter} words per chapter.\n"
        f"2. Only cluster multiple words in one chapter when the topical fit is clearly strong "
        f"(e.g. all food words → dining chapter). Otherwise spread them out.\n"
        f"3. Match CEFR level: A1 words → early chapters, B2 words → late chapters.\n\n"
        f'Return JSON: {{"word1": chapter_number, "word2": chapter_number, ...}}'
    )
    response = self._llm.complete_json(prompt, system=system)
    raw: dict = response.parsed

    # Validate and clamp chapter numbers to target range
    result: dict[str, int] = {}
    for word in missing_words:
        ch_num = raw.get(word, valid_nums[0])
        ch_num = int(ch_num)
        if ch_num not in valid_nums:
            ch_num = valid_nums[0]
        result[word] = ch_num
    return result
```

**Step 3: Pass chapter_range in run_all.py**

In `scripts/run_all.py`, where `GapFiller` is instantiated in Pass 4 (~line 220), add `chapter_range`:

```python
filler = GapFiller(
    llm=llm,
    output_dir=output_base / config.deck.id,
    config_chapters=config.story.chapters,
    target_language=config.languages.target,
    native_language=config.languages.native,
    dialect=config.languages.dialect or "",
    chapter_range=chapter_range,
)
```

**Step 4: Run tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -x -q`

Existing gap filler tests don't pass `chapter_range`, so they'll use the default (all chapters) — backward compatible.

**Step 5: Commit**

```bash
git add pipeline/gap_filler.py scripts/run_all.py
git commit -m "feat(gap-filler): scope word assignment to processed chapters only"
```

---

### Task 4: Change gap filler output from sentences to shots

**Files:**
- Modify: `pipeline/models.py` (add `GapShot` model)
- Modify: `pipeline/gap_filler.py` (`_generate_sentences` → `_generate_shots`, return type, prompt)
- Modify: `tests/test_gap_filler.py` (update tests for new output)

**Step 1: Add GapShot model**

In `pipeline/models.py`, add after the `GapSentence` class:

```python
class GapShot(BaseModel):
    """A complete shot generated by the gap filler — 1-3 sentences + image prompt."""
    sentences: list[str]  # 1-3 source-language sentences
    image_prompt: str  # English image description for this shot
    covers: list[str]  # all lemmas covered by sentences in this shot
    insert_after_shot: int = -1  # shot index to insert after (-1 = append to last scene)
```

**Step 2: Update gap filler to produce GapShots**

In `pipeline/gap_filler.py`:

1. Import `GapShot` from models
2. Change `fill_gaps` return type from `dict[int, list[GapSentence]]` to `dict[int, list[GapShot]]`
3. Rename `_generate_sentences` to `_generate_shots`
4. Update the LLM prompt to request shots with image prompts:

```python
def _generate_shots(
    self,
    chapter_num: int,
    ch_def,
    words: list[str],
    existing_sentences: list[SentencePair],
) -> list[GapShot]:
    """Generate shots covering all `words`, using existing sentences for context."""
    # ... title, context, cefr_level extraction same as before ...

    # Build existing sentences with shot boundaries for context
    existing_text = ""
    if existing_sentences:
        lines = [f'  [{s.sentence_index}] "{s.source}"' for s in existing_sentences]
        existing_text = (
            f"\nExisting chapter sentences (numbered by sentence_index):\n"
            + "\n".join(lines)
            + "\n"
        )

    dialect_note = f" Use {self._dialect} dialect." if self._dialect else ""
    words_text = ", ".join(words)

    system = (
        f"You are a {self._target_lang} language learning content creator. "
        f"You write natural, authentic sentences at the specified CEFR level."
    )
    prompt = (
        f"Chapter {chapter_num}: \"{title}\"\n"
        f"Context: {context}\n"
        f"CEFR level: {cefr_level}{existing_text}\n"
        f"Words to introduce ({len(words)} words): {words_text}\n\n"
        f"Generate SHOTS (groups of 1-3 sentences) that cover these words. Each shot will have its own illustration.\n\n"
        f"Rules:\n"
        f"1. Each shot has 1-3 sentences and one image_prompt (in English) describing the visual scene.\n"
        f"2. Use at most {self._max_new_words} of the listed words per sentence.\n"
        f"3. Target at least 90% coverage — cover at least {max(1, int(len(words) * 0.9))} of the {len(words)} words.\n"
        f"4. Each sentence must fit the chapter context and CEFR level.\n"
        f"5. Match the tone and style of the existing sentences above.{dialect_note}\n"
        f"6. The image_prompt should visually illustrate the vocabulary in the sentences.\n"
        f"7. For insert_after_shot: specify which existing shot index (0-based) this new shot "
        f"should be placed after. Use -1 to append at the end of the chapter.\n\n"
        f"Return JSON:\n"
        f'{{\n'
        f'  "shots": [\n'
        f'    {{\n'
        f'      "sentences": ["{self._target_lang} sentence 1", "{self._target_lang} sentence 2"],\n'
        f'      "image_prompt": "English description of the scene for illustration",\n'
        f'      "covers": ["lemma1", "lemma2", "lemma3"],\n'
        f'      "insert_after_shot": 3\n'
        f'    }}\n'
        f'  ]\n'
        f'}}'
    )
    response = self._llm.complete_json(prompt, system=system)
    raw_shots: list[dict] = response.parsed.get("shots", [])

    result = []
    for s in raw_shots:
        sentences = s.get("sentences", [])
        if isinstance(sentences, str):
            sentences = [sentences]
        result.append(GapShot(
            sentences=sentences[:3],  # enforce max 3
            image_prompt=s.get("image_prompt", ""),
            covers=s.get("covers", []),
            insert_after_shot=int(s.get("insert_after_shot", -1)),
        ))
    return result
```

5. Update `fill_gaps()` to use `_generate_shots` instead of `_generate_sentences`
6. Update cache reading/writing to handle GapShot format

**Step 3: Run tests, fix any failures**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/test_gap_filler.py -x -v`

Tests will need updating — they check for `GapSentence` output but now get `GapShot`.

**Step 4: Commit**

```bash
git add pipeline/models.py pipeline/gap_filler.py tests/test_gap_filler.py
git commit -m "feat(gap-filler): output GapShots with image prompts instead of loose sentences"
```

---

### Task 5: Update sentence inserter to insert shots

**Files:**
- Modify: `pipeline/sentence_inserter.py` (add `insert_shots_into_chapter_scene`)
- Create or modify: `tests/test_sentence_inserter.py` (add tests for shot insertion)
- Modify: `scripts/run_all.py` (Pass 4 — use new shot inserter)

**Step 1: Add `insert_shots_into_chapter_scene` function**

In `pipeline/sentence_inserter.py`, add a new function:

```python
def insert_shots_into_chapter_scene(
    chapter_scene: ChapterScene,
    new_shots: list,  # list[GapShot]
) -> ChapterScene:
    """Insert gap shots as new shots in the chapter.

    Each GapShot becomes a new Shot with its own image_prompt and sentences.
    Shots with insert_after_shot=N are placed after the Nth shot (0-based global count).
    Shots with insert_after_shot=-1 are appended to the last scene.
    All sentence_index values are re-numbered sequentially.
    Returns a new ChapterScene (original is not modified).
    """
    if not new_shots:
        return chapter_scene

    # Flatten existing shots with their global index
    existing_shots_flat: list[tuple[int, int, Shot]] = []  # (scene_idx, shot_idx, shot)
    global_shot_idx = 0
    for si, scene in enumerate(chapter_scene.scenes):
        for shi, shot in enumerate(scene.shots):
            existing_shots_flat.append((si, global_shot_idx, shot))
            global_shot_idx += 1

    # Build insertion map: global_shot_idx -> list of new Shots
    insertions: dict[int, list[Shot]] = {}
    appends: list[Shot] = []

    for gap_shot in new_shots:
        new_shot = Shot(
            focus=", ".join(gap_shot.covers),
            image_prompt=gap_shot.image_prompt,
            sentences=[
                ShotSentence(source=s, sentence_index=-1)
                for s in gap_shot.sentences
            ],
        )
        if gap_shot.insert_after_shot < 0:
            appends.append(new_shot)
        else:
            idx = min(gap_shot.insert_after_shot, global_shot_idx - 1)
            insertions.setdefault(idx, []).append(new_shot)

    # Rebuild scenes with new shots inserted
    new_scenes = []
    current_global = 0
    for scene in chapter_scene.scenes:
        new_scene_shots = []
        for shot in scene.shots:
            # Copy existing shot
            new_scene_shots.append(Shot(
                focus=shot.focus,
                image_prompt=shot.image_prompt,
                sentences=[ShotSentence(source=s.source, sentence_index=-1) for s in shot.sentences],
            ))
            # Insert any new shots after this one
            if current_global in insertions:
                new_scene_shots.extend(insertions[current_global])
            current_global += 1
        new_scenes.append(type(scene)(
            setting=scene.setting,
            description=scene.description,
            shots=new_scene_shots,
        ))

    # Append -1 shots to last scene
    if appends and new_scenes:
        new_scenes[-1].shots.extend(appends)

    # Re-index all sentences sequentially
    idx = 0
    for scene in new_scenes:
        for shot in scene.shots:
            for sent in shot.sentences:
                sent.sentence_index = idx
                idx += 1

    return ChapterScene(chapter=chapter_scene.chapter, scenes=new_scenes)
```

**Step 2: Write tests**

Add to `tests/test_sentence_inserter.py`:

```python
from pipeline.sentence_inserter import insert_shots_into_chapter_scene
from pipeline.models import ChapterScene, Scene, Shot, ShotSentence

def _make_chapter():
    return ChapterScene(chapter=1, scenes=[Scene(
        setting="room", description="A room",
        shots=[
            Shot(focus="greet", image_prompt="img1", sentences=[
                ShotSentence(source="Hola.", sentence_index=0),
                ShotSentence(source="Buenos días.", sentence_index=1),
            ]),
            Shot(focus="ask", image_prompt="img2", sentences=[
                ShotSentence(source="¿Cómo estás?", sentence_index=2),
            ]),
        ],
    )])

def test_insert_shots_adds_new_shot():
    cs = _make_chapter()
    gap_shot = type("GS", (), {
        "sentences": ["Nueva frase."],
        "image_prompt": "new image",
        "covers": ["nuevo"],
        "insert_after_shot": 0,
    })()
    result = insert_shots_into_chapter_scene(cs, [gap_shot])
    assert len(result.scenes[0].shots) == 3  # was 2, now 3
    assert result.scenes[0].shots[1].image_prompt == "new image"
    assert result.scenes[0].shots[1].sentences[0].source == "Nueva frase."

def test_insert_shots_max_3_sentences():
    cs = _make_chapter()
    gap_shot = type("GS", (), {
        "sentences": ["A.", "B.", "C."],
        "image_prompt": "img",
        "covers": ["a"],
        "insert_after_shot": -1,
    })()
    result = insert_shots_into_chapter_scene(cs, [gap_shot])
    last_shot = result.scenes[0].shots[-1]
    assert len(last_shot.sentences) == 3

def test_insert_shots_preserves_existing():
    cs = _make_chapter()
    gap_shot = type("GS", (), {
        "sentences": ["X."],
        "image_prompt": "img",
        "covers": ["x"],
        "insert_after_shot": 0,
    })()
    result = insert_shots_into_chapter_scene(cs, [gap_shot])
    assert result.scenes[0].shots[0].sentences[0].source == "Hola."
    assert len(result.scenes[0].shots[0].sentences) == 2  # unchanged

def test_insert_shots_reindexes():
    cs = _make_chapter()
    gap_shot = type("GS", (), {
        "sentences": ["X.", "Y."],
        "image_prompt": "img",
        "covers": ["x"],
        "insert_after_shot": 0,
    })()
    result = insert_shots_into_chapter_scene(cs, [gap_shot])
    indices = [s.sentence_index for scene in result.scenes for shot in scene.shots for s in shot.sentences]
    assert indices == list(range(len(indices)))
```

**Step 3: Update run_all.py Pass 4 to use shot inserter**

In `scripts/run_all.py`, import the new function and use it instead of `insert_into_chapter_scene` for vocab gap results:

```python
from pipeline.sentence_inserter import insert_into_chapter_scene, insert_shots_into_chapter_scene
```

In Pass 4, change:
```python
chapter_scenes[ch_idx] = insert_into_chapter_scene(
    chapter_scenes[ch_idx], gap_sents,
)
```
To:
```python
chapter_scenes[ch_idx] = insert_shots_into_chapter_scene(
    chapter_scenes[ch_idx], gap_sents,
)
```

**Step 4: Run all tests**

Run: `cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline && uv run pytest tests/ -x -q`

**Step 5: Commit**

```bash
git add pipeline/sentence_inserter.py tests/test_sentence_inserter.py scripts/run_all.py
git commit -m "feat(inserter): add shot-level insertion for gap filler output"
```

---

### Task 6: Delete old gap caches, rerun pipeline on chapters 1-3

**Step 1: Delete cached output**

```bash
rm -rf output/es-de-buenos-aires/
```

**Step 2: Run pipeline**

```bash
cd /mnt/Shared/Code/projects/LingoLock/spanish-content-pipeline
uv run python scripts/run_all.py \
  --config configs/spanish_buenos_aires.yaml \
  --chapters 1-3 \
  --frequency-file data/frequency/es_50k.txt \
  --top-n 250
```

**Step 3: Verify**

Check:
- Pre-gap vs post-gap coverage (should be much closer to 90% now)
- No shot has more than 3 sentences
- Gap shots have their own image prompts
- Characters are properly introduced (Ingrid as mother, Maria as protagonist)
- Story auditor catches issues
- `vocabulary.json` word count
