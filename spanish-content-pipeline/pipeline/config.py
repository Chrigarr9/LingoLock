"""Deck configuration loading and validation."""

from pathlib import Path

import yaml
from pydantic import BaseModel


class DeckInfo(BaseModel):
    name: str
    id: str


class Languages(BaseModel):
    target: str
    target_code: str
    native: str
    native_code: str
    dialect: str


class Protagonist(BaseModel):
    name: str
    gender: str
    origin_country: str
    origin_city: str


class Destination(BaseModel):
    country: str
    city: str
    landmarks: list[str]


class ChapterDef(BaseModel):
    title: str
    context: str
    vocab_focus: list[str]


class StoryConfig(BaseModel):
    cefr_level: str
    sentences_per_chapter: list[int]
    chapters: list[ChapterDef]


class LLMConfig(BaseModel):
    provider: str
    model: str
    fallback_model: str
    temperature: float
    max_retries: int


class DeckConfig(BaseModel):
    deck: DeckInfo
    languages: Languages
    protagonist: Protagonist
    destination: Destination
    story: StoryConfig
    llm: LLMConfig

    @property
    def chapter_count(self) -> int:
        return len(self.story.chapters)

    @property
    def output_dir(self) -> Path:
        return Path("output") / self.deck.id


def load_config(path: Path) -> DeckConfig:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path) as f:
        raw = yaml.safe_load(f)
    return DeckConfig(**raw)
