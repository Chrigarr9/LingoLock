"""Frequency word lemmatization (spaCy) and domain appropriateness filtering (LLM).

spaCy handles lemmatization deterministically. The LLM is called once (cached)
to classify lemmas as appropriate/inappropriate for the deck domain.
"""

import json
from pathlib import Path

from pipeline.lemmatizer import is_function_word, lemmatize_text, lemmatize_word
from pipeline.models import FrequencyLemmaEntry


class FrequencyLemmatizer:
    """Lemmatize frequency words via spaCy, filter appropriateness via LLM.

    Args:
        llm: LLMClient instance (used only for appropriateness filtering).
        output_dir: Directory to save/load frequency_lemmas.json.
        target_language: Human-readable language name, e.g. "Spanish".
        lang_code: ISO language code, e.g. "es" (for spaCy model).
        domain: Short domain description for appropriateness filtering.
        batch_size: Number of lemmas per LLM call (default 500).
    """

    CACHE_FILE = "frequency_lemmas.json"

    def __init__(
        self,
        llm,
        output_dir: Path,
        target_language: str,
        lang_code: str,
        domain: str,
        batch_size: int = 500,
    ):
        self._llm = llm
        self._output_dir = output_dir
        self._language = target_language
        self._lang_code = lang_code
        self._domain = domain
        self._batch_size = batch_size

    @property
    def cache_path(self) -> Path:
        return self._output_dir / self.CACHE_FILE

    def lemmatize(self, words: list[str]) -> dict[str, FrequencyLemmaEntry]:
        """Lemmatize words via spaCy, filter via LLM. Cached to disk.

        Returns dict mapping surface form → FrequencyLemmaEntry.
        """
        if self.cache_path.exists():
            raw = json.loads(self.cache_path.read_text())
            return {k: FrequencyLemmaEntry(**v) for k, v in raw.items()}

        # Step 1: spaCy lemmatization + function word filtering
        word_to_lemma: dict[str, str] = {}
        for w in words:
            tokens = lemmatize_text(w, self._lang_code)
            if tokens and is_function_word(tokens[0]):
                continue  # Skip function words
            word_to_lemma[w] = lemmatize_word(w, self._lang_code)

        # Step 2: Deduplicate lemmas for LLM call
        unique_lemmas = sorted(set(word_to_lemma.values()))

        # Step 3: LLM appropriateness filtering on unique lemmas
        appropriateness: dict[str, bool] = {}
        for i in range(0, len(unique_lemmas), self._batch_size):
            batch = unique_lemmas[i : i + self._batch_size]
            batch_result = self._filter_batch(batch)
            appropriateness.update(batch_result)

        # Step 4: Build result mapping surface form → entry
        result: dict[str, FrequencyLemmaEntry] = {}
        for word, lemma in word_to_lemma.items():
            result[word] = FrequencyLemmaEntry(
                lemma=lemma,
                appropriate=appropriateness.get(lemma, True),
            )

        # Cache to disk
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(
            json.dumps(
                {k: v.model_dump() for k, v in result.items()},
                ensure_ascii=False, indent=2,
            )
        )
        return result

    def _filter_batch(self, lemmas: list[str]) -> dict[str, bool]:
        """Ask LLM which lemmas are appropriate for the domain."""
        word_list = "\n".join(lemmas)
        system = (
            f"You are a {self._language} linguistics expert helping build a language learning deck "
            f"for the domain: {self._domain}."
        )
        prompt = (
            f"For each {self._language} word below, answer true or false:\n"
            f"Is this word relevant and appropriate for a language learning deck "
            f'in the domain "{self._domain}"?\n'
            f"Answer false for: profanity, extreme violence, pure film/TV slang, "
            f"English proper names, or technical subtitle jargon.\n\n"
            f"Words:\n{word_list}\n\n"
            f'Return JSON: {{"word1": true, "word2": false, ...}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw: dict = response.parsed

        result: dict[str, bool] = {}
        for lemma in lemmas:
            result[lemma] = bool(raw.get(lemma, True))
        return result
