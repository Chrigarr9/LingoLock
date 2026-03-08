"""REPORT step: Analyze vocabulary coverage against frequency data."""

from pathlib import Path

from pipeline.models import CoverageReport, OrderedDeck, VocabularyEntry

# ---------------------------------------------------------------------------
# Function words excluded from frequency coverage analysis.
# Only true grammatical function words: articles, prepositions, conjunctions,
# subject pronouns, object/reflexive clitics, possessive determiners,
# demonstratives, and contractions. Verbs and content adverbs are NOT excluded.
# ---------------------------------------------------------------------------
SPANISH_FUNCTION_WORDS: frozenset[str] = frozenset({
    # Articles
    "el", "la", "los", "las", "un", "una", "unos", "unas",
    # Contractions (de+el, a+el)
    "del", "al",
    # Subject pronouns
    "yo", "tú", "vos", "él", "ella", "ello",
    "nosotros", "nosotras", "vosotros", "vosotras", "ellos", "ellas",
    "usted", "ustedes",
    # Object / reflexive clitics
    "me", "te", "se", "lo", "le", "nos", "os", "les",
    # Possessive determiners
    "mi", "mis", "tu", "tus", "su", "sus",
    "nuestro", "nuestra", "nuestros", "nuestras",
    "vuestro", "vuestra", "vuestros", "vuestras",
    # Demonstratives
    "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas",
    "aquel", "aquella", "aquellos", "aquellas", "esto", "eso", "aquello",
    # Prepositions
    "de", "a", "en", "con", "por", "para", "sin", "sobre",
    "entre", "hasta", "desde", "ante", "bajo", "hacia", "según",
    "tras", "durante", "mediante", "contra",
    # Conjunctions
    "y", "e", "o", "u", "pero", "sino", "que", "porque",
    "cuando", "si", "aunque", "como", "donde", "mientras", "ni", "pues",
    # Relative / question words
    "qué", "quién", "quiénes", "cuál", "cuáles",
    "cuándo", "cómo", "dónde", "cuánto", "cuánta", "cuántos", "cuántas",
    "quien", "cual", "cuales", "cuyo", "cuya", "cuyos", "cuyas",
    # Pure quantity / identity determiners (not standalone vocab)
    "cada", "mismo", "misma", "mismos", "mismas",
    # Negation particle
    "no",
    # Discourse markers that aren't taught as standalone vocab
    "ya", "pues", "bueno",
})

# ---------------------------------------------------------------------------
# Common inflected forms of high-frequency irregular Spanish verbs → infinitive.
# Used as a fallback when the word extractor hasn't seen a particular form
# (e.g. 3rd-person story never produces 1st-person "tengo", "voy", "soy").
# ---------------------------------------------------------------------------
SPANISH_VERB_FORMS: dict[str, str] = {
    # ser
    "soy": "ser", "eres": "ser", "es": "ser", "somos": "ser", "son": "ser",
    "era": "ser", "eras": "ser", "éramos": "ser", "eran": "ser",
    "fui": "ser", "fuiste": "ser", "fue": "ser", "fuimos": "ser", "fueron": "ser",
    "será": "ser", "seré": "ser", "serás": "ser", "seremos": "ser", "serán": "ser",
    "sería": "ser", "serías": "ser", "seríamos": "ser", "serían": "ser",
    "sea": "ser", "seas": "ser", "seamos": "ser", "sean": "ser",
    # estar
    "estoy": "estar", "estás": "estar", "está": "estar",
    "estamos": "estar", "estáis": "estar", "están": "estar",
    "estaba": "estar", "estabas": "estar", "estábamos": "estar", "estaban": "estar",
    "estuve": "estar", "estuviste": "estar", "estuvo": "estar",
    "estuvimos": "estar", "estuvieron": "estar",
    "estaré": "estar", "estarás": "estar", "estará": "estar", "estarán": "estar",
    "estaría": "estar", "estarías": "estar", "estaríamos": "estar",
    "esté": "estar", "estés": "estar", "estemos": "estar", "estén": "estar",
    # tener
    "tengo": "tener", "tienes": "tener", "tiene": "tener",
    "tenemos": "tener", "tenéis": "tener", "tienen": "tener",
    "tenía": "tener", "tenías": "tener", "teníamos": "tener", "tenían": "tener",
    "tuve": "tener", "tuviste": "tener", "tuvo": "tener",
    "tuvimos": "tener", "tuvieron": "tener",
    "tendré": "tener", "tendrás": "tener", "tendrá": "tener", "tendrán": "tener",
    "tendría": "tener", "tendrías": "tener",
    "tenga": "tener", "tengas": "tener", "tengamos": "tener", "tengan": "tener",
    # ir
    "voy": "ir", "vas": "ir", "va": "ir", "vamos": "ir", "vais": "ir", "van": "ir",
    "iba": "ir", "ibas": "ir", "íbamos": "ir", "iban": "ir",
    "fui": "ir", "fuiste": "ir",  # shared with ser — ir meaning is more common
    "iré": "ir", "irás": "ir", "irá": "ir", "iremos": "ir", "irán": "ir",
    "iría": "ir", "irías": "ir",
    "vaya": "ir", "vayas": "ir", "vayamos": "ir", "vayan": "ir",
    # poder
    "puedo": "poder", "puedes": "poder", "puede": "poder",
    "podemos": "poder", "podéis": "poder", "pueden": "poder",
    "podía": "poder", "podías": "poder", "podíamos": "poder", "podían": "poder",
    "pude": "poder", "pudiste": "poder", "pudo": "poder",
    "pudimos": "poder", "pudieron": "poder",
    "podré": "poder", "podrás": "poder", "podrá": "poder", "podrán": "poder",
    "podría": "poder", "podrías": "poder", "podríamos": "poder",
    "pueda": "poder", "puedas": "poder", "podamos": "poder", "puedan": "poder",
    # querer
    "quiero": "querer", "quieres": "querer", "quiere": "querer",
    "queremos": "querer", "queréis": "querer", "quieren": "querer",
    "quería": "querer", "querías": "querer", "queríamos": "querer", "querían": "querer",
    "quise": "querer", "quisiste": "querer", "quiso": "querer",
    "quisimos": "querer", "quisieron": "querer",
    "querré": "querer", "querrás": "querer", "querrá": "querer",
    "querría": "querer", "querrías": "querer",
    "quiera": "querer", "quieras": "querer", "queramos": "querer", "quieran": "querer",
    # hacer
    "hago": "hacer", "haces": "hacer", "hace": "hacer",
    "hacemos": "hacer", "hacéis": "hacer", "hacen": "hacer",
    "hacía": "hacer", "hacías": "hacer", "hacíamos": "hacer", "hacían": "hacer",
    "hice": "hacer", "hiciste": "hacer", "hizo": "hacer",
    "hicimos": "hacer", "hicieron": "hacer",
    "haré": "hacer", "harás": "hacer", "hará": "hacer", "harán": "hacer",
    "haría": "hacer", "harías": "hacer",
    "haga": "hacer", "hagas": "hacer", "hagamos": "hacer", "hagan": "hacer",
    # decir
    "digo": "decir", "dices": "decir", "dice": "decir",
    "decimos": "decir", "decís": "decir", "dicen": "decir",
    "decía": "decir", "decías": "decir", "decíamos": "decir", "decían": "decir",
    "dije": "decir", "dijiste": "decir", "dijo": "decir",
    "dijimos": "decir", "dijeron": "decir",
    "diré": "decir", "dirás": "decir", "dirá": "decir", "dirán": "decir",
    "diría": "decir", "dirías": "decir",
    "diga": "decir", "digas": "decir", "digamos": "decir", "digan": "decir",
    # saber
    "sé": "saber", "sabes": "saber", "sabe": "saber",
    "sabemos": "saber", "sabéis": "saber", "saben": "saber",
    "sabía": "saber", "sabías": "saber", "sabíamos": "saber", "sabían": "saber",
    "supe": "saber", "supiste": "saber", "supo": "saber",
    "supimos": "saber", "supieron": "saber",
    "sabré": "saber", "sabrá": "saber", "sabrán": "saber",
    "sepa": "saber", "sepas": "saber", "sepamos": "saber", "sepan": "saber",
    # ver
    "veo": "ver", "ves": "ver", "ve": "ver",
    "vemos": "ver", "veis": "ver", "ven": "ver",
    "veía": "ver", "veías": "ver", "veíamos": "ver", "veían": "ver",
    "vi": "ver", "viste": "ver", "vio": "ver", "vimos": "ver", "vieron": "ver",
    "veré": "ver", "verás": "ver", "verá": "ver", "verán": "ver",
    "vea": "ver", "veas": "ver", "veamos": "ver", "vean": "ver",
    # venir
    "vengo": "venir", "vienes": "venir", "viene": "venir",
    "venimos": "venir", "venís": "venir", "vienen": "venir",
    "venía": "venir", "venías": "venir", "veníamos": "venir", "venían": "venir",
    "vine": "venir", "viniste": "venir", "vino": "venir",
    "vinimos": "venir", "vinieron": "venir",
    "vendré": "venir", "vendrás": "venir", "vendrá": "venir", "vendrán": "venir",
    "vendría": "venir", "vendrías": "venir",
    "venga": "venir", "vengas": "venir", "vengamos": "venir", "vengan": "venir",
    # dar
    "doy": "dar", "das": "dar", "da": "dar", "damos": "dar", "dais": "dar", "dan": "dar",
    "daba": "dar", "dabas": "dar", "dábamos": "dar", "daban": "dar",
    "di": "dar", "diste": "dar", "dio": "dar", "dimos": "dar", "dieron": "dar",
    "daré": "dar", "dará": "dar", "darán": "dar",
    "daría": "dar", "darías": "dar",
    "dé": "dar", "des": "dar", "demos": "dar", "den": "dar",
    # poner
    "pongo": "poner", "pones": "poner", "pone": "poner",
    "ponemos": "poner", "ponéis": "poner", "ponen": "poner",
    "ponía": "poner", "ponías": "poner", "ponían": "poner",
    "puse": "poner", "pusiste": "poner", "puso": "poner",
    "pusimos": "poner", "pusieron": "poner",
    "pondré": "poner", "pondrá": "poner", "pondrán": "poner",
    "pondría": "poner", "pondrías": "poner",
    "ponga": "poner", "pongas": "poner", "pongamos": "poner", "pongan": "poner",
    # salir
    "salgo": "salir", "sales": "salir", "sale": "salir",
    "salimos": "salir", "salís": "salir", "salen": "salir",
    "salía": "salir", "salías": "salir", "salían": "salir",
    "salí": "salir", "saliste": "salir", "salió": "salir",
    "salimos": "salir", "salieron": "salir",
    "saldré": "salir", "saldrá": "salir", "saldrán": "salir",
    "saldría": "salir",
    "salga": "salir", "salgas": "salir", "salgamos": "salir", "salgan": "salir",
    # creer
    "creo": "creer", "crees": "creer", "cree": "creer",
    "creemos": "creer", "creéis": "creer", "creen": "creer",
    "creía": "creer", "creías": "creer", "creíamos": "creer", "creían": "creer",
    "creí": "creer", "creíste": "creer", "creyó": "creer",
    "creímos": "creer", "creyeron": "creer",
    "crea": "creer", "creas": "creer", "creamos": "creer", "crean": "creer",
    # haber (auxiliary — kept separate from ser/estar as it's distinct vocabulary)
    "he": "haber", "has": "haber", "ha": "haber",
    "hemos": "haber", "habéis": "haber", "han": "haber",
    "había": "haber", "habías": "haber", "habíamos": "haber", "habían": "haber",
    "hube": "haber", "hubo": "haber", "hubimos": "haber", "hubieron": "haber",
    "habrá": "haber", "habré": "haber", "habrás": "haber", "habrán": "haber",
    "habría": "haber", "habrías": "haber",
    "haya": "haber", "hayas": "haber", "hayamos": "haber", "hayan": "haber",
    # conocer
    "conozco": "conocer", "conoces": "conocer", "conoce": "conocer",
    "conocemos": "conocer", "conocéis": "conocer", "conocen": "conocer",
    "conocía": "conocer", "conocías": "conocer", "conocían": "conocer",
    "conocí": "conocer", "conociste": "conocer", "conoció": "conocer",
    "conozca": "conocer", "conozcas": "conocer", "conozcamos": "conocer",
    # parecer
    "parezco": "parecer", "pareces": "parecer", "parece": "parecer",
    "parecemos": "parecer", "parecen": "parecer",
    "parecía": "parecer", "parecías": "parecer", "parecían": "parecer",
    "pareció": "parecer", "parecí": "parecer",
    "parezca": "parecer", "parezcas": "parecer", "parezcan": "parecer",
    # seguir
    "sigo": "seguir", "sigues": "seguir", "sigue": "seguir",
    "seguimos": "seguir", "seguís": "seguir", "siguen": "seguir",
    "seguía": "seguir", "seguías": "seguir", "seguían": "seguir",
    "seguí": "seguir", "siguió": "seguir", "siguieron": "seguir",
    "siga": "seguir", "sigas": "seguir", "sigamos": "seguir", "sigan": "seguir",
    # sentir
    "siento": "sentir", "sientes": "sentir", "siente": "sentir",
    "sentimos": "sentir", "sentís": "sentir", "sienten": "sentir",
    "sentía": "sentir", "sentías": "sentir", "sentían": "sentir",
    "sentí": "sentir", "sentiste": "sentir", "sintió": "sentir",
    "sintimos": "sentir", "sintieron": "sentir",
    "sienta": "sentir", "sientas": "sentir", "sintamos": "sentir", "sientan": "sentir",
    # pensar
    "pienso": "pensar", "piensas": "pensar", "piensa": "pensar",
    "pensamos": "pensar", "pensáis": "pensar", "piensan": "pensar",
    "pensaba": "pensar", "pensabas": "pensar", "pensaban": "pensar",
    "pensé": "pensar", "pensaste": "pensar", "pensó": "pensar",
    "piense": "pensar", "pienses": "pensar", "pensemos": "pensar", "piensen": "pensar",
    # encontrar
    "encuentro": "encontrar", "encuentras": "encontrar", "encuentra": "encontrar",
    "encontramos": "encontrar", "encuentran": "encontrar",
    "encontraba": "encontrar", "encontraban": "encontrar",
    "encontré": "encontrar", "encontró": "encontrar", "encontraron": "encontrar",
    "encuentre": "encontrar", "encuentres": "encontrar", "encuentren": "encontrar",
    # volver
    "vuelvo": "volver", "vuelves": "volver", "vuelve": "volver",
    "volvemos": "volver", "vuelven": "volver",
    "volvía": "volver", "volvías": "volver", "volvían": "volver",
    "volví": "volver", "volvió": "volver", "volvieron": "volver",
    "vuelva": "volver", "vuelvas": "volver", "volvamos": "volver", "vuelvan": "volver",
    # pedir
    "pido": "pedir", "pides": "pedir", "pide": "pedir",
    "pedimos": "pedir", "pedís": "pedir", "piden": "pedir",
    "pedía": "pedir", "pedías": "pedir", "pedían": "pedir",
    "pedí": "pedir", "pidió": "pedir", "pidieron": "pedir",
    "pida": "pedir", "pidas": "pedir", "pidamos": "pedir", "pidan": "pedir",
    # llevar
    "llevo": "llevar", "llevas": "llevar", "lleva": "llevar",
    "llevamos": "llevar", "llevéis": "llevar", "llevan": "llevar",
    "llevaba": "llevar", "llevabas": "llevar", "llevaban": "llevar",
    "llevé": "llevar", "llevaste": "llevar", "llevó": "llevar", "llevaron": "llevar",
    # hablar
    "hablo": "hablar", "hablas": "hablar", "habla": "hablar",
    "hablamos": "hablar", "habláis": "hablar", "hablan": "hablar",
    "hablaba": "hablar", "hablabas": "hablar", "hablaban": "hablar",
    "hablé": "hablar", "hablaste": "hablar", "habló": "hablar", "hablaron": "hablar",
    # pasar
    "paso": "pasar", "pasas": "pasar", "pasa": "pasar",
    "pasamos": "pasar", "pasan": "pasar",
    "pasaba": "pasar", "pasabas": "pasar", "pasaban": "pasar",
    "pasé": "pasar", "pasaste": "pasar", "pasó": "pasar", "pasaron": "pasar",
}


def load_frequency_data(path: Path) -> dict[str, int]:
    """Load FrequencyWords format: 'word count' per line, already sorted by frequency.

    Returns dict mapping word -> rank (1 = most frequent).
    """
    data = {}
    rank = 0
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) >= 2:
            rank += 1
            word = parts[0].lower()
            data[word] = rank
    return data


def _extract_vocab(vocab: OrderedDeck | list[VocabularyEntry]) -> list[VocabularyEntry]:
    """Extract flat word list from either format."""
    if isinstance(vocab, OrderedDeck):
        return [w for ch in vocab.chapters for w in ch.words]
    return vocab


def check_coverage(
    vocab: OrderedDeck | list[VocabularyEntry],
    frequency_data: dict[str, int],
    top_n: int = 1000,
    extra_thresholds: list[int] | None = None,
    inflection_to_lemma: dict[str, str] | None = None,
    frequency_lemmas: dict | None = None,  # dict[str, FrequencyLemmaEntry]
) -> CoverageReport:
    """Check how many top-N content words are covered by our vocabulary.

    Function words are excluded from the frequency comparison.

    Lemma resolution order (first match wins):
    1. frequency_lemmas (LLM-derived) — highest precedence, language-agnostic
    2. Word extractor map (inflection_to_lemma) — sentence-specific, accurate
    3. SPANISH_VERB_FORMS hardcoded map — fallback for irregular forms
    4. Exact match against our vocabulary lemmas

    extra_thresholds: additional top-N values to report alongside top_n.
    frequency_lemmas: LLM-derived lemmatization; words with appropriate=False
                      are excluded from the missing list.
    """
    entries = _extract_vocab(vocab)
    our_lemmas = {v.id.lower() for v in entries}

    # Build merged lemma map: frequency_lemmas > inflection_to_lemma > SPANISH_VERB_FORMS
    merged_map: dict[str, str] = {**SPANISH_VERB_FORMS}
    if inflection_to_lemma:
        merged_map.update(inflection_to_lemma)
    if frequency_lemmas:
        for word, entry in frequency_lemmas.items():
            merged_map[word] = entry.lemma

    def is_covered(word: str) -> bool:
        return word in our_lemmas or merged_map.get(word, word) in our_lemmas

    # Collect inappropriate lemmas/forms to exclude from gap analysis
    inappropriate_lemmas: set[str] = set()
    if frequency_lemmas:
        inappropriate_lemmas = {
            entry.lemma for entry in frequency_lemmas.values()
            if not entry.appropriate
        }
        # Also exclude the raw inflected forms
        inappropriate_lemmas |= {
            word for word, entry in frequency_lemmas.items()
            if not entry.appropriate
        }

    # Filter function words from frequency data
    content_freq = {
        word: rank for word, rank in frequency_data.items()
        if word not in SPANISH_FUNCTION_WORDS
    }

    top_words = {word for word, rank in content_freq.items() if rank <= top_n}
    covered = {w for w in top_words if is_covered(w)}
    frequency_matched = sum(1 for v in entries if v.frequency_rank is not None)

    # Resolve to lemmas, then deduplicate — avoids counting inflected forms of the same lemma
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

    missing_sorted = sorted(missing_lemmas, key=lambda w: content_freq.get(w, 999999))
    coverage_pct = (len(covered) / len(top_words) * 100) if top_words else 0.0

    # Extra thresholds
    thresholds: dict[str, dict[str, float]] = {}
    for n in (extra_thresholds or []):
        top_n_words = {word for word, rank in content_freq.items() if rank <= n}
        n_covered = {w for w in top_n_words if is_covered(w)}
        pct = (len(n_covered) / len(top_n_words) * 100) if top_n_words else 0.0
        thresholds[f"top_{n}"] = {
            "covered": len(n_covered),
            "total": len(top_n_words),
            "percent": round(pct, 1),
        }

    max_threshold = max([top_n] + list(extra_thresholds or []))
    outside_top = sum(
        1 for v in entries
        if v.frequency_rank is None or v.frequency_rank > max_threshold
    )

    return CoverageReport(
        total_vocabulary=len(entries),
        frequency_matched=frequency_matched,
        top_1000_covered=len(covered),
        top_1000_total=len(top_words),
        coverage_percent=round(coverage_pct, 1),
        missing_words=missing_sorted,
        thresholds=thresholds,
        outside_top_n=outside_top,
        outside_top_n_label=f"top_{max_threshold}",
    )
