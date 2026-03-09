"""Data models for the content pipeline.

Uses language-neutral field names (source/target instead of spanish/german)
so the pipeline works for any language pair.
"""

from pydantic import BaseModel


class SentencePair(BaseModel):
    chapter: int
    sentence_index: int
    source: str  # Target language sentence (e.g. Spanish)
    target: str  # Native language translation (e.g. German)


class WordAnnotation(BaseModel):
    source: str        # Word as it appears in text
    target: str        # Contextual translation in native language
    lemma: str         # Base/dictionary form
    pos: str           # Part of speech
    context_note: str = ""  # Grammar note (e.g. "3rd person singular present")
    similar_words: list[str] = []  # 6-8 semantically similar words in target language


class ChapterWords(BaseModel):
    chapter: int
    sentences: list[SentencePair]
    words: list[WordAnnotation]


class VocabularyEntry(BaseModel):
    id: str                         # Lemma (unique key)
    source: str                     # Lemma in target language
    target: list[str]               # All translations seen across contexts
    pos: str
    frequency_rank: int | None = None
    cefr_level: str | None = None
    first_chapter: int = 0          # Chapter where this word was first introduced
    order: int = 0                  # Global position in learning sequence
    examples: list[SentencePair]
    similar_words: list[str] = []   # 6-8 semantically similar words


class DeckChapter(BaseModel):
    chapter: int
    title: str
    words: list[VocabularyEntry]


class OrderedDeck(BaseModel):
    deck_id: str
    deck_name: str
    total_words: int
    chapters: list[DeckChapter]


class CoverageReport(BaseModel):
    total_vocabulary: int
    frequency_matched: int
    top_1000_covered: int
    top_1000_total: int
    coverage_percent: float
    missing_words: list[str]  # All appropriate missing words, sorted by frequency
    # Multi-threshold coverage: key = "top_N", value = {"covered": int, "total": int, "percent": float}
    thresholds: dict[str, dict[str, float]] = {}
    # Vocabulary entries outside the highest threshold (rare/specialised words)
    outside_top_n: int = 0
    outside_top_n_label: str = ""


class ImagePrompt(BaseModel):
    chapter: int
    sentence_index: int
    source: str  # Original sentence in target language
    image_type: str  # "character_scene" or "scene_only"
    characters: list[str] = []  # e.g. ["protagonist"]
    prompt: str  # English visual description for image generation
    setting: str = ""  # Reusable setting tag (e.g. "maria_bedroom_berlin")


class ImageManifestEntry(BaseModel):
    file: str | None  # Relative path to image, or None if failed
    status: str  # "success" or "failed"
    error: str | None = None


class ImageManifest(BaseModel):
    reference: str  # Path to protagonist reference image
    model_character: str
    model_scene: str
    images: dict[str, ImageManifestEntry]  # Key: "ch{NN}_s{NN}"


# --- Scene hierarchy (scene-first pipeline) ---


class ShotSentence(BaseModel):
    source: str          # Sentence in target language
    sentence_index: int  # Global index within chapter (0-based)


class Shot(BaseModel):
    focus: str              # What the camera focuses on (vocab-driven)
    image_prompt: str       # English image description (before style/tag injection)
    sentences: list[ShotSentence]


class Scene(BaseModel):
    setting: str         # Reusable location tag (e.g. "maria_bedroom_berlin")
    description: str     # Overall environment description
    shots: list[Shot]


class ChapterScene(BaseModel):
    chapter: int
    scenes: list[Scene]


class ImagePromptResult(BaseModel):
    protagonist_prompt: str = ""  # Optional — empty when no reference image needed
    style: str
    sentences: list[ImagePrompt]


class AudioManifestEntry(BaseModel):
    file: str | None       # "audio/ch01_s01.wav" or None if failed
    status: str            # "success" or "failed"
    error: str | None = None
    content_hash: str = ""  # SHA-256 first 16 chars of sentence text (for cache invalidation)


class AudioManifest(BaseModel):
    provider: str          # e.g. "google-gemini"
    model: str             # TTS model name
    language: str          # e.g. "es"
    audio: dict[str, AudioManifestEntry]  # Key: "ch{NN}_s{NN}"


class FrequencyLemmaEntry(BaseModel):
    lemma: str        # Dictionary/base form
    appropriate: bool # True if relevant to deck domain (no violence, slang, junk)


class GapWordAnnotation(BaseModel):
    target: str       # Translation in native language
    pos: str          # Part of speech


class GapSentence(BaseModel):
    source: str                              # Spanish sentence
    target: str                              # German translation
    covers: list[str]                        # Lemmas this sentence is intended to cover
    word_annotations: dict[str, GapWordAnnotation] = {}  # New words introduced
    insert_after: int = -1  # sentence_index to insert after (-1 = append)


class GrammarGapSentence(BaseModel):
    source: str           # Target-language sentence demonstrating the grammar structure
    target: str           # Native-language translation
    grammar_target: str   # Which grammar structure this demonstrates
    cefr_level: str       # CEFR level of the target
    chapter: int          # Chapter number it's assigned to
    insert_after: int = -1  # sentence_index to insert after (-1 = append)
