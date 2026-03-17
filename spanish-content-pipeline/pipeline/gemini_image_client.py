"""Google AI Studio (Gemini) image generation client.

Pricing: Gemini image generation is currently free in the AI Studio free tier.
"""

import base64
import math
import time

import httpx

BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def _aspect_ratio(width: int, height: int) -> str:
    """Convert pixel dimensions to aspect ratio string (e.g. '3:2')."""
    g = math.gcd(width, height)
    return f"{width // g}:{height // g}"


class GeminiImageClient:
    """Synchronous image generation via Google AI Studio generateContent."""

    def __init__(self, api_key: str, client: httpx.Client | None = None,
                 max_retries: int = 3):
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=120.0)
        self._max_retries = max_retries
        self.total_cost = 0.0  # Free tier — tracked for consistency
        self.image_count = 0

    def generate(self, model: str, prompt: str,
                 width: int = 768, height: int = 512) -> tuple[bytes, str]:
        """Generate an image. Returns (image_bytes, file_extension)."""
        url = f"{BASE_URL}/{model}:generateContent"
        ratio = _aspect_ratio(width, height)
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {"aspectRatio": ratio},
            },
        }
        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }
        response = self._post_with_retry(url, payload, headers)
        data = response.json()
        part = data["candidates"][0]["content"]["parts"][0]
        inline = part.get("inlineData") or part["inline_data"]
        image_bytes = base64.b64decode(inline["data"])
        mime = inline.get("mime_type", "image/png")
        ext = ".png" if "png" in mime else ".webp" if "webp" in mime else ".jpg"

        self.image_count += 1
        # Gemini free tier — no cost

        return image_bytes, ext

    def _post_with_retry(self, url: str, payload: dict,
                         headers: dict) -> httpx.Response:
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
