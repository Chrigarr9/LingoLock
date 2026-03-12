"""Deterministic lemmatization via spaCy.

Provides language-independent tokenization, lemmatization, and POS tagging.
Replaces hand-maintained verb form tables and function word lists.
"""

import re
from dataclasses import dataclass

import spacy
from spacy.language import Language


# Guillemets «» are not in spaCy's training data and cause cascading POS
# misclassification — nearby tokens get tagged PROPN instead of their real POS.
_DIALOGUE_MARKERS = re.compile(r"[«»]")


# POS tags that are always function words (language-independent)
_FUNCTION_POS: frozenset[str] = frozenset({
    "DET",    # articles, demonstratives, possessive determiners
    "ADP",    # prepositions
    "CCONJ",  # coordinating conjunctions
    "SCONJ",  # subordinating conjunctions
    "PROPN",  # proper nouns (names, places)
    "PUNCT",  # punctuation
    "SPACE",  # whitespace
    "X",      # other/unknown
    "SYM",    # symbols
    "PART",   # particles
})


@dataclass(frozen=True)
class TokenInfo:
    """A single token with its spaCy analysis."""
    text: str            # Surface form as it appears in text
    lemma: str           # Dictionary/base form
    pos: str             # Universal POS tag
    morph: str           # Morphological features string
    sentence_index: int  # Which sentence this token belongs to (0-based)


# Cache loaded spaCy models by language code
_models: dict[str, Language] = {}


def _get_model(lang: str) -> Language:
    """Load and cache a spaCy model for the given language code."""
    if lang not in _models:
        model_name = f"{lang}_core_news_sm"
        _models[lang] = spacy.load(model_name)
    return _models[lang]


def lemmatize_text(text: str, lang: str) -> list[TokenInfo]:
    """Tokenize and lemmatize full text with sentence context.

    Returns a TokenInfo for every non-punctuation, non-space token.
    Sentence boundaries are detected by spaCy's sentence splitter.
    """
    nlp = _get_model(lang)
    text = _DIALOGUE_MARKERS.sub("", text)
    doc = nlp(text)
    tokens: list[TokenInfo] = []

    for sent_idx, sent in enumerate(doc.sents):
        for token in sent:
            if token.pos_ in ("PUNCT", "SPACE", "X", "SYM"):
                continue
            tokens.append(TokenInfo(
                text=token.text,
                lemma=token.lemma_.lower(),
                pos=token.pos_,
                morph=str(token.morph),
                sentence_index=sent_idx,
            ))
    return tokens


def lemmatize_word(word: str, lang: str) -> str:
    """Lemmatize a single word without sentence context.

    Used for frequency file words. Less accurate than lemmatize_text
    for ambiguous forms, but sufficient for lemma resolution.
    """
    nlp = _get_model(lang)
    doc = nlp(word)
    return doc[0].lemma_.lower() if doc else word.lower()


def is_function_word(token: TokenInfo) -> bool:
    """Determine if a token is a function word based on POS and morphology.

    Uses universal POS tags and morphological features, so this works
    across all languages supported by spaCy.
    """
    if token.pos in _FUNCTION_POS:
        return True

    # Personal pronouns are function words (yo, me, se, le, nos, etc.)
    # Indefinite/negative/totality pronouns are content words (algo, nada, todo)
    if token.pos == "PRON":
        return "PronType=Prs" in token.morph

    # Negation particles tagged as ADV (e.g. "no")
    if token.pos == "ADV" and "Polarity=Neg" in token.morph:
        return True

    return False
