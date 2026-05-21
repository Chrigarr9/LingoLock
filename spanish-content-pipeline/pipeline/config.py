"""Deck configuration loading and validation."""

from pathlib import Path

import yaml
from pydantic import BaseModel


class DeckInfo(BaseModel):
    name: str
    id: str
    type: str = "story"  # "story" (full pipeline) or "travel" (lightweight)


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
    image_tag: str = ""


class Destination(BaseModel):
    country: str
    city: str


class SecondaryCharacter(BaseModel):
    name: str
    visual_tag: str
    image_tag: str = ""
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
    frequency_file: str | None = None  # Path to frequency word list (relative to config dir)
    narration_style: str = "third-person"  # "third-person" or "first-person"
    audit_max_iterations: int = 1  # Max find→fix cycles in story audit
    grammar_constraints: str = ""  # Travel decks: injected into story gen prompt (e.g. "simple present only")


class ModelConfig(BaseModel):
    """Configuration for a single LLM model used by one pipeline step."""
    provider: str = "openrouter"
    model: str
    temperature: float = 0.7
    max_retries: int = 3


class ModelsConfig(BaseModel):
    """Per-step model configuration. Each pipeline pass uses its own model.

    Travel decks only require story_generation, translation, and word_extraction.
    Other fields are optional and only used by the full story pipeline.
    """
    story_generation: ModelConfig
    translation: ModelConfig
    word_extraction: ModelConfig
    # Full pipeline only — optional for travel decks
    cefr_simplification: ModelConfig | None = None
    grammar: ModelConfig | None = None
    gap_filling: ModelConfig | None = None
    chapter_audit: ModelConfig | None = None
    story_review: ModelConfig | None = None      # Pass 5a: find issues (e.g. Sonnet)
    story_fix: ModelConfig | None = None         # Pass 5b: fix issues in parallel (e.g. Gemini Flash)
    image_review: ModelConfig | None = None      # Pass 5c: review image prompts
    image_fix: ModelConfig | None = None         # Pass 5c: fix image prompts in parallel
    lemmatization: ModelConfig | None = None  # Falls back to cefr_simplification


class ImageGenerationConfig(BaseModel):
    enabled: bool = True
    provider: str = "together"
    model: str = "black-forest-labs/FLUX.1-kontext-pro"
    cheap_model: str = "black-forest-labs/FLUX.1-schnell"
    style: str = "warm storybook illustration, semi-realistic modern picture book, soft lighting"
    style_preset: str = "cartoon"  # controls style-specific prompt language; see STYLE_GUIDANCE
    # width:height ratio must match CARD_IMAGE_RATIO in ClozeCard.tsx (currently 3:2).
    # Changing the ratio here? Update the card component too.
    width: int = 768
    height: int = 512


class AudioGenerationConfig(BaseModel):
    enabled: bool = True
    provider: str = "gemini"  # "gemini", "google" (Cloud TTS), or "openai"
    model: str = "gemini-2.5-flash-preview-tts"  # Gemini TTS model name
    voice_name: str = "Aoede"  # Gemini TTS prebuilt voice name
    voice_gender: str = "male"  # For Google Cloud TTS / future use
    speaking_rate: float = 1.0


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


STYLE_GUIDANCE: dict[str, dict[str, str]] = {
    "cartoon": {
        "auditor_desc": "cartoon illustrations",
        "object_rule": "Exaggerate focal objects: oversized, saturated colors, bold shapes — picture-book energy.",
        "phone_rule": "as a cartoon illustration. This keeps the whole image in one consistent style.",
        "sentence_note": " Match the cartoon style.",
        "image_prompt_guidance": (
            'exaggerate size, color, and expression like a children\'s picture book. '
            'E.g. "a HUGE bright-red suitcase overflowing with clothes", '
            '"vivid cobalt-blue jeans held up dramatically". Make the key object impossible to miss.'
        ),
    },
    "photorealistic": {
        "auditor_desc": "photorealistic scenes",
        "object_rule": "Focal objects should be sharply lit, textured, and visually dominant.",
        "phone_rule": "as a realistic photograph. This prevents style breaks.",
        "sentence_note": "",
        "image_prompt_guidance": (
            'describe with precise detail, natural lighting, and realistic scale. '
            'E.g. "worn red leather suitcase open on the floor, clothes spilling out".'
        ),
    },
}


def get_style_guide(preset: str) -> dict[str, str]:
    """Return style-specific prompt fragments for the given preset name."""
    guide = STYLE_GUIDANCE.get(preset)
    if guide is None:
        import warnings
        warnings.warn(f"Unknown style_preset '{preset}', falling back to 'cartoon'", stacklevel=2)
        guide = STYLE_GUIDANCE["cartoon"]
    return guide


def load_config(path: Path) -> DeckConfig:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path) as f:
        raw = yaml.safe_load(f)
    return DeckConfig(**raw)


# ── Travel deck config ────────────────────────────────────────────────────

class TravelModelsConfig(BaseModel):
    """Model config for the travel pipeline — only phrase generation is required."""
    phrase_generation: ModelConfig


class TravelDeckConfig(BaseModel):
    """Lightweight config for travel quick-decks.

    No story, no characters, no CEFR levels — just a language pair,
    a destination, and model config for phrase generation + media.
    """
    deck: DeckInfo
    languages: Languages
    destination: Destination
    models: TravelModelsConfig
    image_generation: ImageGenerationConfig | None = None
    audio_generation: AudioGenerationConfig | None = None


def load_travel_config(path: Path) -> TravelDeckConfig:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path) as f:
        raw = yaml.safe_load(f)
    return TravelDeckConfig(**raw)


# ── Subtitle deck config ──────────────────────────────────────────────────

class CharacterConfig(BaseModel):
    name: str
    image_tag: str       # Physical description for image generation
    visual_tag: str = "" # Short tag for style references


class ShowConfig(BaseModel):
    title: str
    season: int
    subtitle_url_base: str  # Base URL prefix; each episode appends its file name
    art_style: str
    setting: str
    characters: list[CharacterConfig] = []


class SubtitleProcessingConfig(BaseModel):
    quality_score_min: int = 3
    backfill_episode_threshold: int = 10  # df >= N → Pool B (globally common)
    chapter_size: int = 50
    weight_a_start: float = 3.0           # Episode-specific weight at episode 1
    weight_a_end: float = 0.5             # Episode-specific weight at last episode
    weight_b_start: float = 0.5           # Backfill weight at episode 1
    weight_b_end: float = 3.0             # Backfill weight at last episode


class EpisodeConfig(BaseModel):
    episode: int
    title: str
    file: str  # Exact filename appended to subtitle_url_base


class SubtitleModelsConfig(BaseModel):
    translation: ModelConfig
    enrichment: ModelConfig


class SubtitleDeckConfig(BaseModel):
    deck: DeckInfo
    languages: Languages
    show: ShowConfig
    subtitle_processing: SubtitleProcessingConfig = SubtitleProcessingConfig()
    episodes: list[EpisodeConfig]
    models: SubtitleModelsConfig
    image_generation: ImageGenerationConfig | None = None
    audio_generation: AudioGenerationConfig | None = None
    prior_decks: list[str] = []  # Deck IDs whose lemmas are already known (cross-season dedup)

    def to_deck_config_stub(self) -> "DeckConfig":
        """Build a minimal DeckConfig so existing generators (SentenceTranslator,
        ImageGenerator, AudioGenerator) can be reused without modification."""
        return DeckConfig(
            deck=self.deck,
            languages=self.languages,
            protagonist=Protagonist(
                name=self.show.title,
                gender="neutral",
                origin_country="US",
            ),
            destination=Destination(country="US", city="New York"),
            story=StoryConfig(
                cefr_level="B1",
                sentences_per_chapter=[self.subtitle_processing.chapter_size] * len(self.episodes),
                chapters=[],
            ),
            models=ModelsConfig(
                story_generation=self.models.translation,
                translation=self.models.translation,
                word_extraction=self.models.enrichment,
            ),
            image_generation=self.image_generation,
            audio_generation=self.audio_generation,
        )


def load_subtitle_config(path: Path) -> SubtitleDeckConfig:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path) as f:
        raw = yaml.safe_load(f)
    return SubtitleDeckConfig(**raw)
