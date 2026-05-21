"""Subtitle-based sentence selection pipeline.

Two-pass algorithm:
  Pass 1 — fetch all episode subtitle files, merge cue lines into sentences,
            compute season-wide TF-IDF and document frequency.
  Pass 2 — for each episode in order, score candidate sentences and select
            the top-N using an adaptive two-pool system:
              Pool A: episode-specific words (df < backfill_episode_threshold)
              Pool B: globally common words  (df >= backfill_episode_threshold)
            Adaptive weights shift Pool A → Pool B over the season so early
            episodes teach distinctive vocab while late episodes backfill
            common words not yet covered.

Novelty bonuses:
  Type 1 — lemma never seen before (+1.0): brand-new word
  Type 2 — lemma seen but this morphological form is new (+0.3): new form
  Type 3 — lemma+form both seen (no bonus): already taught

Scoring uses the start-of-episode seen_lemmas/seen_forms snapshot (non-greedy),
so two sentences in the same episode that share a new lemma both receive the
novelty credit independently.
"""

import math
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

from pipeline.config import SubtitleDeckConfig, SubtitleProcessingConfig
from pipeline.lemmatizer import TokenInfo, is_function_word, lemmatize_texts

# ── Constants ──────────────────────────────────────────────────────────────

# Match terminal punctuation optionally followed by a closing quote/bracket.
# This ensures lines like `"¿te dolió?"` or `debilucho."` flush the buffer
# rather than continuing to accumulate into an overly long merged sentence.
_TERMINAL_PUNCT = re.compile(r'[.!?…]["""»\')\]]?\s*$')
_ELLIPSIS = re.compile(r"\.\.\.|…")
_CONNECTOR_START = re.compile(r"^(pero|porque|aunque|sin embargo|así que|ya que|como|si bien)\b", re.I)
_DEICTIC_WORDS = frozenset({"este", "esta", "estos", "estas", "ese", "esa", "esos", "esas",
                              "esto", "eso", "aquí", "ahí", "allí", "allá", "acá"})
_TEACHABLE_POS = frozenset({"NOUN", "VERB", "ADJ", "ADV"})
_WEAK_CARD_LEMMAS = frozenset({
    # Dialogue glue / deictics that often slip through as NOUN/ADV in subtitles.
    "que", "qué", "cual", "cuál", "quien", "quién", "tal",
    "este", "ese", "aquel", "esto", "eso", "aquello",
    # Intensifiers are common but make weak cloze+image cards.
    "muy", "mucho", "tan", "tanto", "más", "menos", "poco",
})


# ── Data structures ────────────────────────────────────────────────────────

@dataclass
class ProcessedSentence:
    id: str              # External card ID, e.g. "e01_s003"
    episode: int
    sentence_index: int  # Position within the episode's selected sentences
    text: str            # Spanish sentence text
    teaches_lemmas: list[str] = field(default_factory=list)  # New lemmas (Type 1)
    teaches_forms: list[str] = field(default_factory=list)   # New forms (Type 2)
    score: float = 0.0
    tokens: list[TokenInfo] = field(default_factory=list)  # spaCy tokens for cloze blank lookup


@dataclass
class ProcessedEpisode:
    episode: int
    title: str
    sentences: list[ProcessedSentence] = field(default_factory=list)


# ── Subtitle fetching ──────────────────────────────────────────────────────

def _fetch_subtitle(url: str, cache_path: Path) -> str:
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    # URL-encode only the filename portion so commas/spaces in episode titles survive
    parts = url.rsplit("/", 1)
    safe_url = parts[0] + "/" + urllib.parse.quote(parts[1]) if len(parts) == 2 else url
    print(f"    Fetching: {safe_url}")
    with urllib.request.urlopen(safe_url, timeout=30) as resp:
        text = resp.read().decode("utf-8")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(text, encoding="utf-8")
    return text


# ── Line merging ───────────────────────────────────────────────────────────

_NORMALIZE_RE = re.compile(r"^[-–—.…\s]+")

# Split at sentence-ending punctuation followed by whitespace and the start of a
# new sentence (capital letter, ¿, ¡, or an opening quote).
_SENT_SPLIT = re.compile(r'(?<=[.!?])\s+(?=[¿¡«\"""A-ZÁÉÍÓÚÜÑ])')


def _normalize_for_dedup(text: str) -> str:
    """Strip leading dashes/ellipses/spaces and lowercase for dedup comparison."""
    return _NORMALIZE_RE.sub("", text).lower().rstrip(".!?…\"'")


def _split_at_boundaries(text: str, min_words: int = 3) -> list[str]:
    """Split text at internal sentence boundaries.

    Fragments shorter than min_words are merged back into their predecessor
    rather than becoming standalone cards.
    """
    parts = _SENT_SPLIT.split(text)
    if len(parts) <= 1:
        return [text]

    result: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if result and len(part.split()) < min_words:
            result[-1] = result[-1] + " " + part
        else:
            result.append(part)
    return result or [text]


def _merge_lines(raw_lines: list[str], max_lines: int = 4, max_words: int = 18) -> list[str]:
    """Group subtitle lines into sentence-level strings.

    Lines are joined until terminal punctuation is found, the buffer reaches
    max_lines, or the running word count would exceed max_words (safety valve).
    Blank lines always flush the buffer.

    After merging, each block is split at internal sentence boundaries so that
    multi-speaker lines or two-sentence cues become separate candidates.

    Duplicate sentences (same text after stripping leading dashes/ellipses) are
    removed so recurring subtitle lines (e.g. a repeated joke) don't produce
    identical cards.
    """
    sentences: list[str] = []
    seen: set[str] = set()
    buffer: list[str] = []
    buffer_words = 0

    def flush():
        nonlocal buffer_words
        if buffer:
            merged = " ".join(buffer)
            for part in _split_at_boundaries(merged):
                key = _normalize_for_dedup(part)
                if key and key not in seen:
                    seen.add(key)
                    sentences.append(part)
            buffer.clear()
            buffer_words = 0

    for raw in raw_lines:
        line = raw.strip()
        if not line:
            flush()
            continue
        line_words = len(line.split())
        # Skip all-caps lines (on-screen captions/title cards like "SOY TED, LLÁMAME")
        # — they are not spoken dialogue and would corrupt the merged sentence.
        words = line.split()
        is_caption = len(words) >= 2 and all(w.isupper() or not w.isalpha() for w in words)
        if is_caption:
            flush()
            continue
        # Flush first if adding this line would exceed the word limit
        if buffer and buffer_words + line_words > max_words:
            flush()
        buffer.append(line)
        buffer_words += line_words
        if _TERMINAL_PUNCT.search(line) or len(buffer) >= max_lines:
            flush()

    flush()
    return [s for s in sentences if s]


# ── Quality scoring ────────────────────────────────────────────────────────

def _quality_score(sentence: str, tokens: list[TokenInfo]) -> int:
    """Score sentence quality for teaching suitability.

    Scoring uses single-pass spaCy tokens (already computed for TF-IDF),
    so there is no extra model call here.
    """
    words = sentence.split()
    n = len(words)
    score = 0

    if 6 <= n <= 18:
        score += 2
    has_verb = any(t.pos in ("VERB", "AUX") for t in tokens)
    if has_verb:
        score += 2
    if _TERMINAL_PUNCT.search(sentence):
        score += 1
    content_tokens = [t for t in tokens if not is_function_word(t)]
    if tokens and len(content_tokens) / len(tokens) >= 0.35:
        score += 1
    if _ELLIPSIS.search(sentence):
        score -= 1
    if _CONNECTOR_START.match(sentence):
        score -= 1
    deictic_count = sum(1 for w in words if w.lower() in _DEICTIC_WORDS)
    if deictic_count >= 2:
        score -= 1

    return score


def _is_teachable_token(token: TokenInfo) -> bool:
    """Return true when a token should become a word-centric subtitle card.

    Subtitle dialogue contains many high-frequency glue words, pronouns,
    numerals, and interjections. They can score well by novelty, but they make
    weak vocabulary cards and poor standalone images. Keep the word-centric deck
    focused on content words that can carry a useful cloze and visual cue.
    """
    if is_function_word(token):
        return False
    if token.lemma.lower() in _WEAK_CARD_LEMMAS:
        return False
    if token.pos not in _TEACHABLE_POS:
        return False
    if not any(ch.isalpha() for ch in token.text):
        return False
    return True


# ── TF-IDF computation ─────────────────────────────────────────────────────

def _compute_season_tfidf(
    all_ep_tokens: list[list[list[TokenInfo]]],  # [episode][sentence][token]
    n_episodes: int,
) -> tuple[list[dict[str, float]], dict[str, int], dict[str, int]]:
    """Compute per-episode TF-IDF scores, global document frequency, and global term frequency.

    Returns:
        tfidf_by_ep  — list of {lemma: tfidf_score} per episode
        doc_freq     — {lemma: number of episodes it appears in}
        global_freq  — {lemma: total occurrences across season}
    """
    doc_freq: dict[str, int] = {}
    global_freq: dict[str, int] = {}
    ep_term_freq: list[dict[str, int]] = []

    for ep_tokens in all_ep_tokens:
        tf: dict[str, int] = {}
        for sent_tokens in ep_tokens:
            for tok in sent_tokens:
                if is_function_word(tok):
                    continue
                tf[tok.lemma] = tf.get(tok.lemma, 0) + 1
                global_freq[tok.lemma] = global_freq.get(tok.lemma, 0) + 1
        ep_term_freq.append(tf)
        for lemma in tf:
            doc_freq[lemma] = doc_freq.get(lemma, 0) + 1

    tfidf_by_ep: list[dict[str, float]] = []
    for tf in ep_term_freq:
        tfidf: dict[str, float] = {}
        for lemma, count in tf.items():
            idf = math.log((n_episodes + 1) / (doc_freq.get(lemma, 0) + 1)) + 1.0
            tfidf[lemma] = count * idf
        # Normalize within episode
        max_val = max(tfidf.values(), default=1.0)
        tfidf_by_ep.append({k: v / max_val for k, v in tfidf.items()})

    return tfidf_by_ep, doc_freq, global_freq


# ── Sentence selection ─────────────────────────────────────────────────────

def _select_sentences(
    sentences: list[str],
    sent_tokens: list[list[TokenInfo]],
    quality_scores: list[int],
    tfidf: dict[str, float],
    global_freq: dict[str, int],
    doc_freq: dict[str, int],
    cfg: SubtitleProcessingConfig,
    seen_lemmas: set[str],
    seen_forms: set[str],
    ep_idx: int,
    n_episodes: int,
    episode: int,
) -> list[ProcessedSentence]:
    """Score and select top-N sentences for one episode.

    Uses start-of-episode seen_lemmas/seen_forms (non-greedy): all candidate
    sentences are scored against the same baseline state, so two sentences that
    share a new lemma both get novelty credit independently.
    """
    # Adaptive pool weights — linear interpolation over the season
    t = ep_idx / max(n_episodes - 1, 1)
    w_a = cfg.weight_a_start + t * (cfg.weight_a_end - cfg.weight_a_start)
    w_b = cfg.weight_b_start + t * (cfg.weight_b_end - cfg.weight_b_start)

    # Normalise global_freq for Pool B scoring
    max_gf = max(global_freq.values(), default=1)

    scored: list[tuple[float, int, ProcessedSentence]] = []

    for i, (sentence, tokens, qscore) in enumerate(zip(sentences, sent_tokens, quality_scores)):
        if qscore < cfg.quality_score_min:
            continue

        teachable_tokens = [t for t in tokens if _is_teachable_token(t)]
        content_lemmas = [t.lemma for t in teachable_tokens]
        content_forms = [t.text.lower() for t in teachable_tokens]

        pool_a_score = 0.0
        pool_b_score = 0.0
        teaches_lemmas: list[str] = []
        teaches_forms: list[str] = []
        novelty_bonus = 0.0

        for lemma, form in zip(content_lemmas, content_forms):
            ep_df = doc_freq.get(lemma, 0)

            # Pool A: episode-specific (low document frequency)
            if ep_df < cfg.backfill_episode_threshold:
                pool_a_score += tfidf.get(lemma, 0.0)
            else:
                # Pool B: globally common
                pool_b_score += global_freq.get(lemma, 0) / max_gf

            # Novelty bonus (scored against start-of-episode baseline)
            if lemma not in seen_lemmas:
                novelty_bonus += 1.0
                teaches_lemmas.append(lemma)
            elif form not in seen_forms:
                novelty_bonus += 0.3
                teaches_forms.append(form)

        base_score = w_a * pool_a_score + w_b * pool_b_score
        final_score = base_score + novelty_bonus

        ps = ProcessedSentence(
            id=f"e{episode:02d}_s{i:03d}",
            episode=episode,
            sentence_index=i,
            text=sentence,
            teaches_lemmas=teaches_lemmas,
            teaches_forms=teaches_forms,
            score=final_score,
            tokens=tokens,
        )
        scored.append((final_score, i, ps))

    scored.sort(key=lambda x: (-x[0], x[1]))
    selected = [ps for _, _, ps in scored[: cfg.chapter_size]]

    # Re-number sentence_index in selection order and update seen sets
    result: list[ProcessedSentence] = []
    for sel_idx, ps in enumerate(selected):
        ps.id = f"e{episode:02d}_s{sel_idx:03d}"
        ps.sentence_index = sel_idx
        for lemma in ps.teaches_lemmas:
            seen_lemmas.add(lemma)
        for form in ps.teaches_forms:
            seen_forms.add(form)
        result.append(ps)

    return result


# ── Main entry point ───────────────────────────────────────────────────────

def process_subtitle_deck(
    config: SubtitleDeckConfig,
    output_base: Path,
    verbose: bool = True,
    prior_lemmas: set[str] | None = None,
) -> list[ProcessedEpisode]:
    """Run the full subtitle selection pipeline for all episodes.

    Returns one ProcessedEpisode per episode, each containing the selected
    sentences ready for translation, image, and audio generation.
    """
    cfg = config.subtitle_processing
    lang = config.languages.target_code
    n_episodes = len(config.episodes)
    cache_dir = output_base / config.deck.id / "subtitle_cache"

    # ── Pass 1: Fetch subtitles and tokenise ─────────────────────────────
    if verbose:
        print(f"Pass 1: Fetching and tokenising {n_episodes} episodes...")

    all_ep_sentences: list[list[str]] = []
    all_ep_tokens: list[list[list[TokenInfo]]] = []

    for ep_cfg in config.episodes:
        url = f"{config.show.subtitle_url_base}/{ep_cfg.file}"
        cache_path = cache_dir / ep_cfg.file
        raw_text = _fetch_subtitle(url, cache_path)
        raw_lines = raw_text.splitlines()
        sentences = _merge_lines(raw_lines)

        token_lists = lemmatize_texts(sentences, lang)
        all_ep_sentences.append(sentences)
        all_ep_tokens.append(token_lists)

        if verbose:
            print(f"  E{ep_cfg.episode:02d} {ep_cfg.title}: {len(sentences)} candidate sentences")

    # ── Compute season TF-IDF ─────────────────────────────────────────────
    if verbose:
        print("  Computing season TF-IDF...")

    tfidf_by_ep, doc_freq, global_freq = _compute_season_tfidf(all_ep_tokens, n_episodes)

    # ── Pass 2: Sequential selection ─────────────────────────────────────
    if verbose:
        print(f"\nPass 2: Selecting up to {cfg.chapter_size} sentences per episode...")

    seen_lemmas: set[str] = set(prior_lemmas) if prior_lemmas else set()
    seen_forms: set[str] = set()
    results: list[ProcessedEpisode] = []

    for ep_idx, ep_cfg in enumerate(config.episodes):
        sentences = all_ep_sentences[ep_idx]
        sent_tokens = all_ep_tokens[ep_idx]
        tfidf = tfidf_by_ep[ep_idx]

        quality_scores = [_quality_score(s, t) for s, t in zip(sentences, sent_tokens)]

        selected = _select_sentences(
            sentences=sentences,
            sent_tokens=sent_tokens,
            quality_scores=quality_scores,
            tfidf=tfidf,
            global_freq=global_freq,
            doc_freq=doc_freq,
            cfg=cfg,
            seen_lemmas=seen_lemmas,
            seen_forms=seen_forms,
            ep_idx=ep_idx,
            n_episodes=n_episodes,
            episode=ep_cfg.episode,
        )

        ep_result = ProcessedEpisode(episode=ep_cfg.episode, title=ep_cfg.title, sentences=selected)
        results.append(ep_result)

        if verbose:
            new_lemmas = sum(len(s.teaches_lemmas) for s in selected)
            new_forms = sum(len(s.teaches_forms) for s in selected)
            print(f"  E{ep_cfg.episode:02d} {ep_cfg.title}: {len(selected)} sentences, "
                  f"{new_lemmas} new lemmas, {new_forms} new forms")

    return results
