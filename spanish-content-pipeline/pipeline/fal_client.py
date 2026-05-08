"""fal.ai image generation client.

Synchronous REST API — submit prompt, get image URL back.
Supports Z-Image-Turbo and FLUX models.

API docs: https://fal.ai/models/fal-ai/z-image/turbo/api
Pricing: $0.005/megapixel
"""

import time

import httpx

BASE_URL = "https://fal.run"

# fal.ai charges per megapixel
COST_PER_MEGAPIXEL = 0.005


class FalImageClient:
    """Synchronous image generation via fal.ai REST API."""

    def __init__(self, api_key: str, client: httpx.Client | None = None,
                 max_retries: int = 3):
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=120.0)
        self._max_retries = max_retries
        self.total_cost = 0.0
        self.image_count = 0

    def generate(self, model: str, prompt: str,
                 width: int = 768, height: int = 512,
                 seed: int | None = None) -> tuple[bytes, str]:
        """Generate an image. Returns (image_bytes, file_extension).

        seed: when provided, pins the diffusion seed so the same prompt+seed
        deterministically yields the same image. Used for character-identity
        consistency across scenes.
        """
        url = f"{BASE_URL}/{model}"
        payload: dict = {
            "prompt": prompt,
            "image_size": {"width": width, "height": height},
            "num_inference_steps": 4,
            "num_images": 1,
        }
        if seed is not None:
            payload["seed"] = seed
        headers = {
            "Authorization": f"Key {self._api_key}",
            "Content-Type": "application/json",
        }

        response = self._post_with_retry(url, payload, headers)
        data = response.json()

        # Response contains images[].url — download the first one
        images = data.get("images", [])
        if not images:
            raise ValueError(f"fal.ai returned no images: {data}")

        img_url = images[0]["url"]
        img_resp = self._client.get(img_url)
        img_resp.raise_for_status()

        # Detect extension from content-type or URL
        ct = img_resp.headers.get("content-type", "")
        if "png" in ct or img_url.endswith(".png"):
            ext = ".png"
        elif "webp" in ct or img_url.endswith(".webp"):
            ext = ".webp"
        else:
            ext = ".jpg"

        # Track cost
        megapixels = (width * height) / 1_000_000
        self.total_cost += megapixels * COST_PER_MEGAPIXEL
        self.image_count += 1

        return img_resp.content, ext

    def _post_with_retry(self, url: str, payload: dict,
                         headers: dict) -> httpx.Response:
        """HTTP POST with retry on 5xx and 429."""
        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                return response
            if response.status_code >= 500 or response.status_code == 429:
                last_error = response
                if attempt < self._max_retries - 1:
                    delay = int(response.headers.get("retry-after", 2 * (attempt + 1)))
                    print(f"\n      Retry {attempt + 1}/{self._max_retries} "
                          f"after {response.status_code} (waiting {delay}s)...",
                          end="", flush=True)
                    time.sleep(delay)
                continue
            raise httpx.HTTPStatusError(
                f"{response.status_code} for {response.url}: {response.text[:500]}",
                request=response.request, response=response,
            )
        if last_error:
            raise httpx.HTTPStatusError(
                f"{last_error.status_code} for {last_error.url} "
                f"after {self._max_retries} retries: {last_error.text[:500]}",
                request=last_error.request, response=last_error,
            )
        raise RuntimeError("Unreachable")  # pragma: no cover
