"""Pass 5: Generate images via Together.ai (Flux) or Google AI Studio (Gemini)."""

import base64
import json
import math
import time
from pathlib import Path

import httpx

from pipeline.config import DeckConfig
from pipeline.models import ImageManifest, ImageManifestEntry, ImagePrompt, ImagePromptResult

TOGETHER_API_URL = "https://api.together.xyz/v1/images/generations"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def detect_provider(model: str) -> str:
    """Detect image provider from model name."""
    if model.startswith("gemini-"):
        return "google"
    return "together"


def _aspect_ratio(width: int, height: int) -> str:
    """Convert pixel dimensions to aspect ratio string (e.g. '3:2')."""
    g = math.gcd(width, height)
    return f"{width // g}:{height // g}"


class ImageGenerator:
    def __init__(
        self,
        config: DeckConfig,
        together_api_key: str | None = None,
        gemini_api_key: str | None = None,
        output_base: Path | None = None,
        transport: httpx.BaseTransport | None = None,
        max_retries: int = 3,
        # Legacy parameter — maps to together_api_key
        api_key: str | None = None,
    ):
        self._config = config
        self._together_api_key = together_api_key or api_key
        self._gemini_api_key = gemini_api_key
        self._output_base = output_base or Path("output")
        self._max_retries = max_retries
        self._img_config = config.image_generation
        self._provider = detect_provider(self._img_config.model)

        client_kwargs = {"timeout": 120.0}
        if transport:
            client_kwargs["transport"] = transport
        self._client = httpx.Client(**client_kwargs)

    def _deck_dir(self) -> Path:
        return self._output_base / self._config.deck.id

    def _call_together(self, model: str, prompt: str) -> tuple[bytes, str]:
        """Call Together.ai API. Returns (image_bytes, extension)."""
        payload = {
            "model": model,
            "prompt": prompt,
            "width": self._img_config.width,
            "height": self._img_config.height,
            "response_format": "b64_json",
        }
        headers = {
            "Authorization": f"Bearer {self._together_api_key}",
            "Content-Type": "application/json",
        }
        response = self._call_with_retry(TOGETHER_API_URL, payload, headers)
        data = response.json()
        b64_data = data["data"][0]["b64_json"]
        return base64.b64decode(b64_data), ".webp"

    def _call_gemini(self, model: str, prompt: str) -> tuple[bytes, str]:
        """Call Google AI Studio generateContent with image output. Returns (image_bytes, extension)."""
        url = f"{GEMINI_BASE_URL}/{model}:generateContent"
        ratio = _aspect_ratio(self._img_config.width, self._img_config.height)
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {"aspectRatio": ratio},
            },
        }
        headers = {
            "x-goog-api-key": self._gemini_api_key,
            "Content-Type": "application/json",
        }
        response = self._call_with_retry(url, payload, headers)
        data = response.json()
        part = data["candidates"][0]["content"]["parts"][0]
        inline = part.get("inlineData") or part["inline_data"]
        image_bytes = base64.b64decode(inline["data"])
        mime = inline.get("mime_type", "image/png")
        ext = ".png" if "png" in mime else ".webp" if "webp" in mime else ".jpg"
        return image_bytes, ext

    def _call_with_retry(self, url: str, payload: dict, headers: dict) -> httpx.Response:
        """HTTP POST with retry on 5xx and 422."""
        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                return response
            if response.status_code >= 500 or response.status_code == 422:
                last_error = response
                if attempt < self._max_retries - 1:
                    delay = 2 * (attempt + 1)
                    print(f"\n      Retry {attempt + 1}/{self._max_retries} after {response.status_code} (waiting {delay}s)...", end="", flush=True)
                    time.sleep(delay)
                continue
            body = response.text[:500]
            raise httpx.HTTPStatusError(
                f"{response.status_code} for {response.url}: {body}",
                request=response.request,
                response=response,
            )
        if last_error:
            body = last_error.text[:500]
            raise httpx.HTTPStatusError(
                f"{last_error.status_code} for {last_error.url} after {self._max_retries} retries: {body}",
                request=last_error.request,
                response=last_error,
            )

    def _generate_image(self, prompt: str) -> tuple[bytes, str]:
        """Generate an image using the configured provider. Returns (bytes, extension)."""
        model = self._img_config.model
        if self._provider == "google":
            return self._call_gemini(model, prompt)
        return self._call_together(model, prompt)

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
