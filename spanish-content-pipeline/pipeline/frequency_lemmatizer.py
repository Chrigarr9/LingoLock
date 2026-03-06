"""Pass 0: LLM-powered frequency word lemmatization and domain filtering.

Batch-lemmatizes the top-N words from a frequency file and classifies them
as appropriate/inappropriate for the deck domain. Results cached to disk.
"""

import json
from pathlib import Path

from pipeline.coverage_checker import SPANISH_FUNCTION_WORDS
from pipeline.models import FrequencyLemmaEntry


class FrequencyLemmatizer:
    """Lemmatize frequency words via LLM, cached to disk.

    Args:
        llm: LLMClient or GeminiClient instance.
        output_dir: Directory to save/load frequency_lemmas.json.
        target_language: Human-readable language name, e.g. "Spanish".
        domain: Short domain description for appropriateness filtering,
                e.g. "travel Spanish, Buenos Aires".
        batch_size: Number of words per LLM call (default 500).
        function_words: Words to skip (already known, not worth lemmatizing).
    """

    CACHE_FILE = "frequency_lemmas.json"

    def __init__(
        self,
        llm,
        output_dir: Path,
        target_language: str,
        domain: str,
        batch_size: int = 500,
        function_words: frozenset[str] = SPANISH_FUNCTION_WORDS,
    ):
        self._llm = llm
        self._output_dir = output_dir
        self._language = target_language
        self._domain = domain
        self._batch_size = batch_size
        self._function_words = function_words

    @property
    def cache_path(self) -> Path:
        return self._output_dir / self.CACHE_FILE

    def lemmatize(self, words: list[str]) -> dict[str, FrequencyLemmaEntry]:
        """Lemmatize words, using cache if available.

        Returns dict mapping inflected form → FrequencyLemmaEntry.
        """
        if self.cache_path.exists():
            raw = json.loads(self.cache_path.read_text())
            return {k: FrequencyLemmaEntry(**v) for k, v in raw.items()}

        to_process = [w for w in words if w not in self._function_words]
        result: dict[str, FrequencyLemmaEntry] = {}

        for i in range(0, len(to_process), self._batch_size):
            batch = to_process[i : i + self._batch_size]
            batch_result = self._lemmatize_batch(batch)
            result.update(batch_result)

        self._output_dir.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(
            json.dumps(
                {k: v.model_dump() for k, v in result.items()},
                ensure_ascii=False,
                indent=2,
            )
        )
        return result

    def _lemmatize_batch(self, words: list[str]) -> dict[str, FrequencyLemmaEntry]:
        word_list = "\n".join(words)
        system = (
            f"You are a {self._language} linguistics expert helping build a language learning deck "
            f"for the domain: {self._domain}."
        )
        prompt = (
            f"For each {self._language} word below, provide:\n"
            f'1. "lemma": the dictionary/base form (infinitive for verbs, singular masculine '
            f"for adjectives/nouns, exact form for invariable words)\n"
            f'2. "appropriate": true if this word is relevant and appropriate for the domain '
            f'"{self._domain}"; false if it is profanity, extreme violence, pure film/TV slang, '
            f"English proper names, or technical subtitle jargon irrelevant to everyday travel.\n\n"
            f"Words to process:\n{word_list}\n\n"
            f'Return JSON: {{"word1": {{"lemma": "...", "appropriate": true}}, ...}}'
        )
        response = self._llm.complete_json(prompt, system=system)
        raw: dict = response.parsed

        entries: dict[str, FrequencyLemmaEntry] = {}
        for word in words:
            if word in raw:
                entry = raw[word]
                entries[word] = FrequencyLemmaEntry(
                    lemma=str(entry.get("lemma", word)).lower().strip(),
                    appropriate=bool(entry.get("appropriate", True)),
                )
            else:
                # LLM skipped this word — assume identity + appropriate
                entries[word] = FrequencyLemmaEntry(lemma=word, appropriate=True)
        return entries
