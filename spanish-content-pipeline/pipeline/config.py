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
    visual_tag: str = ""


class Destination(BaseModel):
    country: str
    city: str


class SecondaryCharacter(BaseModel):
    name: str
    visual_tag: str
    chapters: list[int]  # 1-indexed chapter numbers where this character appears
    role: str = ""


class ChapterDef(BaseModel):
    title: str
    context: str
    vocab_focus: list[str]
    cefr_level: str | None = None  # Overrides StoryConfig.cefr_level for this chapter


class StoryConfig(BaseModel):
    cefr_level: str
    sentences_per_chapter: list[int]
    chapters: list[ChapterDef]
    grammar_targets: dict[str, list[str]] = {}  # Optional: CEFR level -> grammar targets
    coverage_top_n: int = 1000  # Target top-N frequency words for coverage/gap-filling
    narration_style: str = "third-person"  # "third-person" or "first-person"


class ModelConfig(BaseModel):
    """Configuration for a single LLM model used by one pipeline step."""
    provider: str = "openrouter"
    model: str
    temperature: float = 0.7
    max_retries: int = 3


class ModelsConfig(BaseModel):
    """Per-step model configuration. Each pipeline pass uses its own model."""
    story_generation: ModelConfig
    cefr_simplification: ModelConfig
    grammar: ModelConfig
    gap_filling: ModelConfig
    chapter_audit: ModelConfig
    story_audit: ModelConfig
    translation: ModelConfig
    word_extraction: ModelConfig
    lemmatization: ModelConfig | None = None  # Falls back to cefr_simplification


class ImageGenerationConfig(BaseModel):
    enabled: bool = True
    provider: str = "together"
    model: str = "black-forest-labs/FLUX.1-kontext-pro"
    cheap_model: str = "black-forest-labs/FLUX.1-schnell"
    style: str = "warm storybook illustration, semi-realistic modern picture book, soft lighting"
    # width:height ratio must match CARD_IMAGE_RATIO in ClozeCard.tsx (currently 3:2).
    # Changing the ratio here? Update the card component too.
    width: int = 768
    height: int = 512


class AudioGenerationConfig(BaseModel):
    enabled: bool = True
    model: str = "gemini-2.5-flash-preview-tts"
    voice_name: str = "Aoede"  # Gemini TTS prebuilt voice name
    speaking_rate: float = 1.0  # Reserved for future use


class DeckConfig(BaseModel):
    deck: DeckInfo
    languages: Languages
    protagonist: Protagonist
    destination: Destination
    story: StoryConfig
    models: ModelsConfig
    image_generation: ImageGenerationConfig | None = None
    audio_generation: AudioGenerationConfig | None = None
    secondary_characters: list[SecondaryCharacter] = []

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
