"""Pass 2: Translate story sentences to the native language."""

import json
from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.llm import LLMClient
from pipeline.models import SentencePair


SYSTEM_PROMPT = """You are a professional translator. Translate each sentence naturally — \
not word-for-word. Preserve the meaning and tone. Return valid JSON only."""


def _build_translation_prompt(config: DeckConfig, story_text: str) -> str:
    return f"""Translate each sentence from {config.languages.target} to {config.languages.native}.

Return a JSON object with a "sentences" array. Each element has:
- "source": the original {config.languages.target} sentence (unchanged)
- "target": the natural {config.languages.native} translation

Text to translate:
{story_text}

Return ONLY valid JSON. No markdown fences, no extra text."""


class SentenceTranslator:
    def __init__(self, config: DeckConfig, llm: LLMClient, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _translations_dir(self) -> Path:
        return self._output_base / self._config.deck.id / "translations"

    def _chapter_path(self, chapter_index: int) -> Path:
        return self._translations_dir() / f"chapter_{chapter_index + 1:02d}.json"

    def translate_chapter(self, chapter_index: int, story_text: str) -> list[SentencePair]:
        path = self._chapter_path(chapter_index)

        # Skip if already translated
        if path.exists():
            data = json.loads(path.read_text())
            return [SentencePair(**item) for item in data]

        prompt = _build_translation_prompt(self._config, story_text)
        result = self._llm.complete_json(prompt, system=SYSTEM_PROMPT)

        raw_sentences = result.parsed.get("sentences", [])
        pairs = []
        for i, s in enumerate(raw_sentences):
            pair = SentencePair(
                chapter=chapter_index + 1,
                sentence_index=i,
                source=s["source"],
                target=s["target"],
            )
            pairs.append(pair)

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps([p.model_dump() for p in pairs], ensure_ascii=False, indent=2))

        return pairs
