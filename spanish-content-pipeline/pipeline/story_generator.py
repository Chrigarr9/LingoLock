"""Pass 1: Generate story chapters using LLM."""

from pathlib import Path

from pipeline.config import DeckConfig
from pipeline.llm import LLMClient


SYSTEM_PROMPT = """You are a language learning story writer. You write short, engaging stories \
for language learners. Your stories use simple vocabulary and grammar appropriate for the \
specified CEFR level. Include dialogue between characters to make the story natural and \
conversational. Use real place names and cultural details from the destination city."""


def _build_chapter_prompt(config: DeckConfig, chapter_index: int) -> str:
    chapter = config.story.chapters[chapter_index]
    p = config.protagonist
    d = config.destination
    min_sentences, max_sentences = config.story.sentences_per_chapter

    pronoun = "She" if p.gender == "female" else "He"

    landmarks_str = ", ".join(d.landmarks[:5])

    return f"""Write Chapter {chapter_index + 1}: "{chapter.title}"

Language: {config.languages.target} ({config.languages.dialect} dialect)
CEFR Level: {config.story.cefr_level}
Length: {min_sentences}-{max_sentences} sentences

Protagonist: {p.name}, a young person from {p.origin_city}, {p.origin_country}.
{pronoun} is preparing to move to {d.city}, {d.country}.

Chapter context: {chapter.context}
Vocabulary focus areas: {", ".join(chapter.vocab_focus)}

Notable landmarks/places in {d.city}: {landmarks_str}

Requirements:
- Write ONLY in {config.languages.target}
- Use simple grammar: present tense, basic past tense, simple future
- No complex subordinate clauses
- Include at least one dialogue exchange with another character
- Reference real places in {d.city} where appropriate
- Make the reader feel {p.name}'s emotions (excitement, nervousness, curiosity)
- Each sentence should introduce vocabulary from the focus areas
- Output ONLY the story text, no translations or annotations"""


class StoryGenerator:
    def __init__(self, config: DeckConfig, llm: LLMClient, output_base: Path | None = None):
        self._config = config
        self._llm = llm
        self._output_base = output_base or Path("output")

    def _story_dir(self) -> Path:
        return self._output_base / self._config.deck.id / "stories"

    def _chapter_path(self, chapter_index: int) -> Path:
        return self._story_dir() / f"chapter_{chapter_index + 1:02d}.txt"

    def generate_chapter(self, chapter_index: int) -> str:
        path = self._chapter_path(chapter_index)

        # Skip if already generated
        if path.exists():
            return path.read_text()

        prompt = _build_chapter_prompt(self._config, chapter_index)
        result = self._llm.complete(prompt, system=SYSTEM_PROMPT)

        # Save to disk
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(result.content)

        return result.content

    def generate_all(self, chapter_range: range | None = None) -> list[str]:
        if chapter_range is None:
            chapter_range = range(self._config.chapter_count)

        stories = []
        for i in chapter_range:
            story = self.generate_chapter(i)
            stories.append(story)
        return stories
