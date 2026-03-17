"""Image generation orchestrator.

Delegates to provider-specific clients (Together, Gemini, fal.ai, ModelScope).
Handles manifest management, caching, deduplication, and resumability.
"""

import json
from pathlib import Path

import httpx

from pipeline.config import DeckConfig
from pipeline.models import ImageManifest, ImageManifestEntry, ImagePrompt, ImagePromptResult


def detect_provider(model: str) -> str:
    """Detect image provider from model name."""
    if model.startswith("gemini-"):
        return "google"
    if model.startswith("fal-ai/"):
        return "fal"
    if "/" in model and ("Tongyi" in model or "Z-Image" in model):
        return "modelscope"
    return "together"


class ImageGenerator:
    def __init__(
        self,
        config: DeckConfig,
        together_api_key: str | None = None,
        gemini_api_key: str | None = None,
        modelscope_api_key: str | None = None,
        fal_api_key: str | None = None,
        output_base: Path | None = None,
        transport: httpx.BaseTransport | None = None,
        max_retries: int = 3,
        # Legacy parameter — maps to together_api_key
        api_key: str | None = None,
    ):
        self._config = config
        self._output_base = output_base or Path("output")
        self._img_config = config.image_generation

        # Resolve provider: explicit config > model-name detection
        explicit = self._img_config.provider
        if explicit and explicit != "together":
            self._provider = explicit
        else:
            self._provider = detect_provider(self._img_config.model)

        # Build shared HTTP client
        client_kwargs: dict = {"timeout": 120.0}
        if transport:
            client_kwargs["transport"] = transport
        self._client = httpx.Client(**client_kwargs)

        # Store API keys and create provider client lazily
        self._api_keys = {
            "together": together_api_key or api_key,
            "google": gemini_api_key,
            "modelscope": modelscope_api_key,
            "fal": fal_api_key,
        }
        self._max_retries = max_retries
        self._provider_client = None

    def _get_provider_client(self):
        """Lazily create the provider-specific image client."""
        if self._provider_client is not None:
            return self._provider_client

        key = self._api_keys.get(self._provider)

        if self._provider == "together":
            from pipeline.together_client import TogetherImageClient
            self._provider_client = TogetherImageClient(
                key, client=self._client, max_retries=self._max_retries)
        elif self._provider == "google":
            from pipeline.gemini_image_client import GeminiImageClient
            self._provider_client = GeminiImageClient(
                key, client=self._client, max_retries=self._max_retries)
        elif self._provider == "fal":
            from pipeline.fal_client import FalImageClient
            self._provider_client = FalImageClient(
                key, client=self._client, max_retries=self._max_retries)
        elif self._provider == "modelscope":
            from pipeline.modelscope_client import ModelScopeImageClient
            self._provider_client = ModelScopeImageClient(
                key, client=self._client)
        else:
            raise ValueError(f"Unknown image provider: {self._provider}")

        return self._provider_client

    @property
    def total_cost(self) -> float:
        """Total cost in USD across all generated images."""
        if self._provider_client is None:
            return 0.0
        return self._provider_client.total_cost

    @property
    def image_count(self) -> int:
        """Number of images generated in this session."""
        if self._provider_client is None:
            return 0
        return self._provider_client.image_count

    def _deck_dir(self) -> Path:
        return self._output_base / self._config.deck.id

    def _generate_image(self, prompt: str) -> tuple[bytes, str]:
        """Generate an image using the configured provider. Returns (bytes, extension)."""
        client = self._get_provider_client()
        return client.generate(
            model=self._img_config.model, prompt=prompt,
            width=self._img_config.width, height=self._img_config.height,
        )

    def _sentence_key(self, prompt: ImagePrompt) -> str:
        ch = str(prompt.chapter).zfill(2)
        si = str(prompt.sentence_index).zfill(2)
        return f"ch{ch}_s{si}"

    def generate_sentence_image(
        self,
        prompt: ImagePrompt,
        style: str,
        reference_path: Path | None,
    ) -> ImageManifestEntry:
        """Generate a single sentence image. Returns manifest entry."""
        key = self._sentence_key(prompt)

        try:
            image_bytes, ext = self._generate_image(prompt.prompt)
            rel_path = f"images/{key}{ext}"
            abs_path = self._deck_dir() / rel_path

            abs_path.parent.mkdir(parents=True, exist_ok=True)
            abs_path.write_bytes(image_bytes)

            return ImageManifestEntry(file=rel_path, status="success")
        except Exception as e:
            return ImageManifestEntry(file=None, status="failed", error=str(e))

    def generate_all(self, prompts: ImagePromptResult) -> ImageManifest:
        """Generate all images. Resumes from existing manifest if present."""
        manifest_path = self._deck_dir() / "image_manifest.json"

        # Load existing manifest for resumability
        existing_images: dict[str, ImageManifestEntry] = {}
        if manifest_path.exists():
            data = json.loads(manifest_path.read_text())
            for key, entry_data in data.get("images", {}).items():
                entry = ImageManifestEntry(**entry_data)
                if entry.status == "success" and entry.file:
                    abs_path = self._deck_dir() / entry.file
                    if abs_path.exists():
                        existing_images[key] = entry

        # Generate sentence images (dedup identical prompts)
        all_images = dict(existing_images)
        prompt_to_entry: dict[str, ImageManifestEntry] = {}
        for prompt in prompts.sentences:
            key = self._sentence_key(prompt)
            if key in existing_images:
                continue

            if prompt.prompt in prompt_to_entry:
                prev = prompt_to_entry[prompt.prompt]
                all_images[key] = ImageManifestEntry(file=prev.file, status=prev.status)
                print(f"    Reusing for {key} (same scene)")
                continue

            print(f"    Generating {key} ({prompt.image_type})...", end=" ", flush=True)
            entry = self.generate_sentence_image(prompt, prompts.style, None)
            all_images[key] = entry
            if entry.status == "success":
                prompt_to_entry[prompt.prompt] = entry
            print(entry.status)

        manifest = ImageManifest(
            reference="",
            model_character=self._img_config.model,
            model_scene=self._img_config.model,
            images=all_images,
        )
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2)
        )

        return manifest
