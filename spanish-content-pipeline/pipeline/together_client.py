"""Together.ai image generation client (FLUX models).

Pricing varies by model — see https://www.together.ai/pricing
"""

import base64
import time

import httpx

API_URL = "https://api.together.xyz/v1/images/generations"

# Approximate cost per image by model (Together doesn't return cost in response)
MODEL_COSTS = {
    "black-forest-labs/FLUX.1-schnell": 0.003,
    "black-forest-labs/FLUX.1-schnell-Free": 0.0,
    "black-forest-labs/FLUX.1-dev": 0.025,
    "black-forest-labs/FLUX.1-pro": 0.05,
    "black-forest-labs/FLUX1.1-pro": 0.04,
    "black-forest-labs/FLUX.1-kontext-pro": 0.04,
    "black-forest-labs/FLUX.2-pro": 0.05,
}
DEFAULT_COST = 0.04


class TogetherImageClient:
    """Synchronous image generation via Together.ai API."""

    def __init__(self, api_key: str, client: httpx.Client | None = None,
                 max_retries: int = 3):
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=120.0)
        self._max_retries = max_retries
        self.total_cost = 0.0
        self.image_count = 0

    def generate(self, model: str, prompt: str,
                 width: int = 768, height: int = 512) -> tuple[bytes, str]:
        """Generate an image. Returns (image_bytes, file_extension)."""
        payload = {
            "model": model,
            "prompt": prompt,
            "width": width,
            "height": height,
            "response_format": "b64_json",
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        response = self._post_with_retry(API_URL, payload, headers)
        data = response.json()
        b64_data = data["data"][0]["b64_json"]

        self.total_cost += MODEL_COSTS.get(model, DEFAULT_COST)
        self.image_count += 1

        return base64.b64decode(b64_data), ".webp"

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
