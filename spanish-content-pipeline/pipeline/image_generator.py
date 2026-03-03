"""Pass 5: Generate images via Flux APIs (together.ai)."""

import base64
import json
import time
from pathlib import Path

import httpx

from pipeline.config import DeckConfig
from pipeline.image_prompter import ImagePromptResult
from pipeline.models import ImageManifest, ImageManifestEntry, ImagePrompt

TOGETHER_API_URL = "https://api.together.xyz/v1/images/generations"


class ImageGenerator:
    def __init__(
        self,
        config: DeckConfig,
        api_key: str,
        output_base: Path | None = None,
        transport: httpx.BaseTransport | None = None,
        max_retries: int = 3,
    ):
        self._config = config
        self._api_key = api_key
        self._output_base = output_base or Path("output")
        self._max_retries = max_retries
        self._img_config = config.image_generation

        client_kwargs = {"timeout": 120.0}
        if transport:
            client_kwargs["transport"] = transport
        self._client = httpx.Client(**client_kwargs)

    def _deck_dir(self) -> Path:
        return self._output_base / self._config.deck.id

    def _call_api(self, model: str, prompt: str, image_url: str | None = None) -> bytes:
        """Call together.ai image generation API. Returns raw image bytes."""
        payload = {
            "model": model,
            "prompt": prompt,
            "width": self._img_config.width,
            "height": self._img_config.height,
            "response_format": "b64_json",
        }
        if image_url:
            payload["image_url"] = image_url

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(TOGETHER_API_URL, json=payload, headers=headers)
            if response.status_code < 500:
                response.raise_for_status()
                break
            last_error = response
            if attempt < self._max_retries - 1:
                time.sleep(2 * (attempt + 1))
        else:
            if last_error:
                last_error.raise_for_status()

        data = response.json()
        b64_data = data["data"][0]["b64_json"]
        return base64.b64decode(b64_data)

    def generate_reference(self, protagonist_prompt: str, style: str) -> Path:
        """Generate the protagonist reference image. Returns path to saved image."""
        refs_dir = self._deck_dir() / "references"
        ref_path = refs_dir / "protagonist.webp"

        if ref_path.exists():
            return ref_path

        full_prompt = f"{protagonist_prompt}. Style: {style}"
        image_bytes = self._call_api(self._img_config.cheap_model, full_prompt)

        refs_dir.mkdir(parents=True, exist_ok=True)
        ref_path.write_bytes(image_bytes)
        return ref_path

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
        rel_path = f"images/{key}.webp"
        abs_path = self._deck_dir() / rel_path

        full_prompt = f"{prompt.prompt}. Style: {style}"

        try:
            image_url = None
            if prompt.image_type == "character_scene" and reference_path and reference_path.exists():
                # Encode reference as data URI for Kontext
                ref_bytes = reference_path.read_bytes()
                ref_b64 = base64.b64encode(ref_bytes).decode()
                image_url = f"data:image/webp;base64,{ref_b64}"
                model = self._img_config.model
            else:
                model = self._img_config.cheap_model

            image_bytes = self._call_api(model, full_prompt, image_url=image_url)

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
                # Only keep successful entries where file actually exists
                if entry.status == "success" and entry.file:
                    abs_path = self._deck_dir() / entry.file
                    if abs_path.exists():
                        existing_images[key] = entry

        # Step A: Generate reference
        ref_path = self.generate_reference(prompts.protagonist_prompt, prompts.style)

        # Step B: Generate sentence images (dedup identical prompts)
        all_images = dict(existing_images)
        prompt_to_entry: dict[str, ImageManifestEntry] = {}
        for prompt in prompts.sentences:
            key = self._sentence_key(prompt)
            if key in existing_images:
                continue  # Already generated

            # Reuse image if an identical prompt was already generated
            if prompt.prompt in prompt_to_entry:
                prev = prompt_to_entry[prompt.prompt]
                all_images[key] = ImageManifestEntry(file=prev.file, status=prev.status)
                print(f"    Reusing for {key} (same scene)")
                continue

            print(f"    Generating {key} ({prompt.image_type})...", end=" ", flush=True)
            entry = self.generate_sentence_image(prompt, prompts.style, ref_path)
            all_images[key] = entry
            if entry.status == "success":
                prompt_to_entry[prompt.prompt] = entry
            print(entry.status)

        # Step C: Write manifest
        manifest = ImageManifest(
            reference=str(ref_path.relative_to(self._deck_dir())),
            model_character=self._img_config.model,
            model_scene=self._img_config.cheap_model,
            images=all_images,
        )
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2)
        )

        return manifest
