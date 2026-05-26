"""Word-centric card extraction for subtitle decks.

Takes ProcessedEpisode objects (output of subtitle_processor), deduplicates to
one card per unique lemma (using the highest-scoring sentence as context), calls
an LLM to enrich each lemma with German hint / English gloss / CEFR level /
context note, generates cloze blanks from spaCy token data, and builds distractor
lists from the season's same-POS lemma pool.

Returns a list of dicts ready to be serialised as word_cards.json.
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from pipeline.subtitle_processor import ProcessedEpisode, ProcessedSentence

_BATCH_SIZE = 20  # Lemmas per enrichment LLM call

_SYSTEM_PROMPT = """\
You are a bilingual vocabulary expert (Spanish / German).
Return valid JSON only — no explanation, no markdown fences.
"""

_BATCH_TEMPLATE = """\
Language pair: Spanish → German
Learner's native language: German

For each lemma below, provide enrichment data based on the given sentence context.

Lemmas:
{lemma_block}

For each lemma return:
- "lemma": exactly as provided
- "german_hint": concise German translation IN CONTEXT (1-3 words, e.g. "Ehemann")
- "german_hint_general": the most common dictionary translation of the LEMMA — the meaning a learner should know first. This must be the general, broadly useful translation, NOT the sentence-specific one. If it would be identical to "german_hint", set "german_hint_general" to "".
- "english_gloss": concise English dictionary gloss for image generation (1-2 words, e.g. "husband")
- "context_note": brief grammar note, e.g. "masculine noun" / "3rd person singular present"
- "cefr_level": estimated CEFR level, one of A1 A2 B1 B2 C1 C2
- "image_prompt": a concrete English image prompt that teaches the lemma visually without any written text. Use the sentence context to choose the right sense, but do not include the Spanish word, German translation, letters, numbers, signs, captions, labels, logos, handwriting, or UI. Prefer one clear real-world object/action/scene. Avoid generic portraits unless the lemma is a person or relationship.

Return a JSON object: {{"enrichments": [{{"lemma": ..., "german_hint": ..., "german_hint_general": ..., "english_gloss": ..., "context_note": ..., "cefr_level": ..., "image_prompt": ...}}, ...]}}
"""


def _find_surface_form(ps: ProcessedSentence, lemma: str) -> str | None:
    """Return the surface form of lemma in the sentence via token data.

    Falls back to a case-insensitive substring search if tokens miss it
    (can happen when spaCy lemmatizes differently than stored).
    """
    # Primary: exact lemma match in stored token list
    for tok in ps.tokens:
        if tok.lemma.lower() == lemma.lower():
            return tok.text

    # Fallback: any token whose text matches the lemma (e.g. lemma = surface form for invariants)
    for tok in ps.tokens:
        if tok.text.lower() == lemma.lower():
            return tok.text

    # Last resort: find word-boundary match in raw text
    m = re.search(r'(?<!\w)' + re.escape(lemma) + r'(?!\w)', ps.text, re.IGNORECASE)
    return m.group(0) if m else None


def _make_cloze(sentence: str, surface_form: str) -> str:
    """Replace first word-boundary occurrence of surface_form with _____."""
    escaped = re.escape(surface_form)
    pattern = re.compile(r'(?<!\w)' + escaped + r'(?!\w)', re.IGNORECASE | re.UNICODE)
    return pattern.sub('_____', sentence, count=1)


def _call_enrichment(
    lemma_contexts: list[dict],
    llm: Any,
    verbose: bool,
) -> dict[str, dict]:
    """Call LLM once for a batch of lemmas. Returns {lemma: enrichment_dict}."""
    lines = []
    for i, item in enumerate(lemma_contexts, 1):
        lines.append(
            f'{i}. lemma="{item["lemma"]}", pos={item["pos"]}, '
            f'sentence: "{item["sentence"]}"'
        )
    user_msg = _BATCH_TEMPLATE.format(lemma_block="\n".join(lines))

    try:
        response = llm.complete_json(user_msg, system=_SYSTEM_PROMPT)
        raw = response.content if hasattr(response, "content") else str(response)
        raw = re.sub(r"```(?:json)?\s*|\s*```", "", raw).strip()
        data = json.loads(raw)
        enrichments = data.get("enrichments", [])
    except Exception as e:
        if verbose:
            print(f"    [word_extractor] enrichment batch error: {e}")
        enrichments = []

    result: dict[str, dict] = {}
    for entry in enrichments:
        lemma = str(entry.get("lemma", "")).strip()
        if lemma:
            result[lemma] = {
                "german_hint": str(entry.get("german_hint", lemma)).strip(),
                "german_hint_general": str(entry.get("german_hint_general", "")).strip(),
                "english_gloss": str(entry.get("english_gloss", lemma)).strip(),
                "context_note": str(entry.get("context_note", "")).strip(),
                "cefr_level": str(entry.get("cefr_level", "B1")).strip(),
                "image_prompt": str(entry.get("image_prompt", "")).strip(),
            }
    return result


def _pos_from_tokens(ps: ProcessedSentence, lemma: str) -> str:
    """Return POS tag for lemma from token data; defaults to 'word'."""
    _POS_MAP = {
        "NOUN": "noun", "VERB": "verb", "AUX": "verb",
        "ADJ": "adjective", "ADV": "adverb",
    }
    for tok in ps.tokens:
        if tok.lemma.lower() == lemma.lower():
            return _POS_MAP.get(tok.pos, tok.pos.lower())
    return "word"


def _generate_distractors(
    lemma: str,
    pos: str,
    cefr_level: str | None,
    all_cards: list[dict],
    count: int = 3,
) -> list[str]:
    """Sample distractors from same-season same-POS lemmas."""
    _CEFR_RANK = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}

    def cefr_dist(a: str | None, b: str | None) -> int:
        if not a or not b:
            return 999
        return abs(_CEFR_RANK.get(a, 3) - _CEFR_RANK.get(b, 3))

    pool = [c for c in all_cards if c["lemma"].lower() != lemma.lower()]
    same_pos = [c for c in pool if c["pos"] == pos]
    close_cefr = [c for c in same_pos if cefr_dist(cefr_level, c.get("cefr_level")) <= 1]

    candidates = close_cefr + [c for c in same_pos if c not in close_cefr]
    if len(candidates) < count:
        candidates += [c for c in pool if c not in candidates]

    selected: list[str] = []
    seen: set[str] = set()
    for c in candidates:
        if len(selected) >= count:
            break
        key = c["lemma"].lower()
        if key not in seen:
            seen.add(key)
            selected.append(c["lemma"])
    return selected


def _slugify(value: str) -> str:
    """ASCII slug for IDs and asset filenames."""
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9_-]+", "_", ascii_value.lower().strip())
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug or "word"


def _build_image_prompt(
    word_in_context: str,
    english_gloss: str,
    sentence: str,
    pos: str,
) -> str:
    """Build a context-aware prompt for a single vocabulary word image."""
    del sentence  # Avoid giving the image model subtitle text it may copy.

    normalized_word = word_in_context.lower().strip("¿?¡!.,;:")
    normalized_gloss = english_gloss.lower()

    visual_overrides = {
        "hoy": "fresh morning sunlight entering a simple room, a cup and fresh fruit on a clean table, immediate present-day feeling",
        "pintar": "a paintbrush applying bright colorful paint strokes to a small canvas, with a painter's palette nearby",
        "escuela": "an empty classroom with desks, chairs, backpacks, and a plain green chalkboard",
        "dedos": "close-up of several human fingers touching a small smooth pebble on a neutral table",
        "dedo": "close-up of one human finger touching a small smooth pebble on a neutral table",
        "niño": "a young boy in everyday clothes, natural candid photo",
        "años": "the same tree shown through four seasons in one realistic landscape scene",
        "año": "the same tree shown through four seasons in one realistic landscape scene",
        "puerta": "a closed wooden door as the main subject",
        "aceitunas": "a small bowl of green olives as the main subject",
        "aceituna": "a single green olive as the main subject",
        "refrigerador": "inside an open kitchen refrigerator, shelves with fresh food and cold light, viewed from the front",
        "bote": "a simple clear glass jar without a lid on a clean table",
        "mente": "a thoughtful person shown as a silhouette with soft abstract light around the head",
        "eternidad": "an infinity-shaped path under a wide sky, symbolic endless time",
        "millones": "a huge crowd of tiny repeated objects fading into the distance",
        "millón": "a huge crowd of tiny repeated objects fading into the distance",
        "cosas": "several everyday objects neatly arranged on a table",
        "cosa": "one simple everyday object on a clean table",
        "acercaba": "a person walking toward a door, viewed from behind, emphasizing approaching",
        "acercar": "a person walking toward a door, viewed from behind, emphasizing approaching",
        "cruzaron": "several objects moving across a path from one side to the other",
        "cruzar": "a person crossing a simple street at a crosswalk with no signs",
        "lleva": "a jar sitting in a refrigerator for a long time, subtle dust and cold light",
        "llevar": "a jar sitting in a refrigerator for a long time, subtle dust and cold light",
        "tocaba": "paintbrushes and colorful paint waiting on a classroom desk, ready to be used",
        "tocar": "paintbrushes and colorful paint waiting on a classroom desk, ready to be used",
        "medida": "a person getting closer to a door step by step, symbolic gradual progress",
        "noticiero": "a television news studio with cameras, lights, an empty anchor desk, and blank unlit screens",
        "código": "a closed padlock beside two metal keys on a plain table, symbolic secret access",
        "codigo": "a closed padlock beside two metal keys on a plain table, symbolic secret access",
        "palabra": "two people talking face to face with simple blank speech bubbles above them",
        "señal": "a radio tower on a hill emitting visible light rings into the sky, with no signs",
        "senal": "a radio tower on a hill emitting visible light rings into the sky, with no signs",
        "bar": "a clean wooden bar counter with stools, glasses, and bottles, no signs or labels",
        "rockola": "a vintage jukebox with colored lights, no visible labels or song titles",
        "pitufo": "a tiny blue toy figure inspired by a generic fantasy gnome, no recognizable characters",
        "pene": "a neutral urology clinic scene with a doctor desk, anatomical model box closed, and medical tools, no nudity",
    }

    concept = visual_overrides.get(normalized_word)
    if concept:
        visual_instruction = f"Main subject: {concept}."
    elif pos == "verb":
        visual_instruction = (
            f"Main subject: the meaning {english_gloss}, shown through hands, body movement, or interacting objects. "
            "Avoid portraits; make the action immediately recognizable."
        )
    elif pos == "noun":
        visual_instruction = (
            f"Main subject: the meaning {english_gloss} as a clear object, place, person, or visual concept. "
            "Do not use an unrelated portrait; if people appear, they must only support the target noun."
        )
    elif pos == "adjective":
        visual_instruction = (
            f"Main subject: one object or scene clearly demonstrating the quality {english_gloss}. "
            "Avoid generic portraits."
        )
    else:
        visual_instruction = (
            f"Main subject: a simple symbolic scene that makes the meaning {english_gloss} obvious. "
            "Avoid generic portraits."
        )

    return (
        f"Photorealistic real-world reference photo. {visual_instruction} "
        f"Clean simple background, warm natural light, unbranded real objects, no graphic design layout."
    )


def extract_word_cards(
    all_episodes: list[ProcessedEpisode],
    translations: dict[str, str],  # file_key → German sentence translation
    llm: Any,
    prior_lemmas: set[str] | None = None,
    verbose: bool = True,
) -> list[dict]:
    """Build one ClozeCard-compatible dict per unique new lemma across the season.

    Args:
        all_episodes: Processed episodes (with token data on each sentence)
        translations: file_key → German translation (ch01_s00 → "Ich glaube...")
        llm: LLM client with .complete_json()
        prior_lemmas: Lemmas already taught in prior seasons (skipped here)
        verbose: Print progress

    Returns:
        List of word card dicts (one per unique lemma, sorted by episode then score desc)
    """
    if prior_lemmas is None:
        prior_lemmas = set()

    def _file_key(episode: int, sentence_index: int) -> str:
        return f"ch{episode:02d}_s{sentence_index:02d}"

    # ── Step 1: Collect best sentence per lemma (dedup) ─────────────────────

    best: dict[str, tuple[float, ProcessedSentence, int]] = {}
    # lemma → (score, sentence, episode)

    for ep in all_episodes:
        for ps in ep.sentences:
            for lemma in ps.teaches_lemmas:
                if lemma in prior_lemmas:
                    continue
                current = best.get(lemma)
                if current is None or ps.score > current[0]:
                    best[lemma] = (ps.score, ps, ep.episode)

    if verbose:
        print(f"  {len(best)} unique new lemmas across {len(all_episodes)} episodes")

    # Sort by (episode, score desc) to maintain narrative order
    ordered = sorted(best.items(), key=lambda kv: (kv[1][2], -kv[1][0]))

    # ── Step 2: Enrich lemmas via LLM (batched) ──────────────────────────────

    enrichment_cache: dict[str, dict] = {}
    batch_input = []

    for lemma, (score, ps, episode) in ordered:
        surface = _find_surface_form(ps, lemma)
        cloze_sentence = _make_cloze(ps.text, surface) if surface else ps.text.replace(lemma, '_____', 1)
        pos = _pos_from_tokens(ps, lemma)
        batch_input.append({"lemma": lemma, "pos": pos, "sentence": cloze_sentence})

    for i in range(0, len(batch_input), _BATCH_SIZE):
        batch = batch_input[i: i + _BATCH_SIZE]
        if verbose:
            print(f"  Enriching lemmas {i + 1}–{min(i + _BATCH_SIZE, len(batch_input))} "
                  f"of {len(batch_input)}...")
        result = _call_enrichment(batch, llm, verbose)
        enrichment_cache.update(result)

    # ── Step 3: Build card dicts ─────────────────────────────────────────────

    partial_cards: list[dict] = []
    ep_counters: dict[int, int] = {}  # episode → card count within that episode

    for lemma, (score, ps, episode) in ordered:
        surface = _find_surface_form(ps, lemma)
        pos = _pos_from_tokens(ps, lemma)
        enrichment = enrichment_cache.get(lemma, {})

        german_hint = enrichment.get("german_hint", lemma)
        german_hint_general = enrichment.get("german_hint_general", "")
        english_gloss = enrichment.get("english_gloss", lemma)
        context_note = enrichment.get("context_note", "")
        cefr_level = enrichment.get("cefr_level", None)
        image_prompt = enrichment.get("image_prompt", "")

        cloze_sentence = _make_cloze(ps.text, surface) if surface else ps.text.replace(lemma, '_____', 1)

        # Use precomputed sentence translation keyed by file_key
        fk = _file_key(ps.episode, ps.sentence_index)
        sentence_translation = translations.get(fk, "")

        # Slug for image filename and stable card ID.
        lemma_slug = _slugify(lemma)

        ep_idx = ep_counters.get(episode, 0)
        ep_counters[episode] = ep_idx + 1
        card_id = f"{lemma_slug}-ch{episode:02d}-s{ep_idx:02d}"

        partial_cards.append({
            "id": card_id,
            "lemma": lemma,
            "lemma_slug": lemma_slug,
            "word_in_context": surface or lemma,
            "sentence": cloze_sentence,
            "sentence_translation": sentence_translation,
            "german_hint": german_hint,
            "german_hint_general": german_hint_general,
            "english_gloss": english_gloss,
            "pos": pos,
            "context_note": context_note,
            "cefr_level": cefr_level,
            "episode": episode,
            "sentence_file_key": fk,
            "image_prompt": image_prompt or _build_image_prompt(
                word_in_context=surface or lemma,
                english_gloss=english_gloss,
                sentence=ps.text,
                pos=pos,
            ),
        })

    # ── Step 4: Generate distractors (needs full card pool) ──────────────────

    for card in partial_cards:
        card["distractors"] = _generate_distractors(
            lemma=card["lemma"],
            pos=card["pos"],
            cefr_level=card.get("cefr_level"),
            all_cards=partial_cards,
        )

    if verbose:
        print(f"  Built {len(partial_cards)} word cards")

    return partial_cards
