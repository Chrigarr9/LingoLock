"""ModelScope image generation client.

Uses the ModelScope async inference API (submit → poll → download).
Z-Image-Turbo is free on ModelScope with ~50-100 generations/hour soft limit.

API docs: https://api-inference.modelscope.cn
"""

import base64
import json
import time

import httpx

API_URL = "https://api-inference.modelscope.cn/v1/images/generations"
TASK_URL = "https://api-inference.modelscope.cn/v1/tasks"

# Polling config
POLL_INTERVAL_S = 5
MAX_POLLS = 60  # 5 minutes max


class ModelScopeImageClient:
    """Async-polling image generation client for ModelScope."""

    def __init__(self, api_key: str, client: httpx.Client | None = None):
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=120.0)
        self.total_cost = 0.0  # Free on ModelScope
        self.image_count = 0

    def generate(
        self,
        model: str,
        prompt: str,
        width: int = 768,
        height: int = 512,
        num_inference_steps: int = 9,
        guidance_scale: float = 0.0,
    ) -> tuple[bytes, str]:
        """Generate an image. Returns (image_bytes, file_extension).

        Handles both synchronous responses (image returned immediately)
        and async responses (task_id returned, requires polling).
        """
        task_data = self._submit(model, prompt, width, height,
                                 num_inference_steps, guidance_scale)

        # Some responses return the image directly (synchronous mode)
        result = self._try_extract_image(task_data)
        if result:
            self.image_count += 1
            return result

        # Async: poll until completion
        task_id = self._extract_task_id(task_data)
        result = self._poll_until_complete(task_id)
        self.image_count += 1
        return result

    def _submit(self, model: str, prompt: str, width: int, height: int,
                num_inference_steps: int, guidance_scale: float) -> dict:
        """Submit image generation task. Returns API response dict."""
        payload = {
            "model": model,
            "prompt": prompt,
            "height": height,
            "width": width,
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance_scale,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "X-ModelScope-Async-Mode": "true",
        }
        response = self._client.post(API_URL, json=payload, headers=headers)
        if response.status_code not in (200, 201):
            raise httpx.HTTPStatusError(
                f"ModelScope submit {response.status_code}: {response.text[:300]}",
                request=response.request, response=response,
            )
        return response.json()

    def _try_extract_image(self, data: dict) -> tuple[bytes, str] | None:
        """Try to extract image from a synchronous response. Returns None if async."""
        items = data.get("data", [])
        if not items:
            return None
        item = items[0]
        if "b64_json" in item:
            return base64.b64decode(item["b64_json"]), ".png"
        if "url" in item:
            return self._download_image(item["url"])
        return None

    def _extract_task_id(self, data: dict) -> str:
        """Extract task_id from async response."""
        task_id = data.get("task_id") or data.get("request_id")
        if not task_id:
            output = data.get("output", {})
            task_id = output.get("task_id") if isinstance(output, dict) else None
        if not task_id:
            raise ValueError(
                f"ModelScope: no task_id in response: {json.dumps(data)[:300]}"
            )
        return task_id

    def _poll_until_complete(self, task_id: str) -> tuple[bytes, str]:
        """Poll task status until image is ready. Returns (image_bytes, extension)."""
        poll_url = f"{TASK_URL}/{task_id}"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "X-ModelScope-Task-Type": "image_generation",
        }

        for _ in range(MAX_POLLS):
            time.sleep(POLL_INTERVAL_S)
            resp = self._client.get(poll_url, headers=headers)
            if resp.status_code != 200:
                continue

            poll_data = resp.json()
            status = poll_data.get("task_status", "").upper()

            if status in ("SUCCEED", "SUCCEEDED"):
                return self._extract_completed_image(poll_data)

            if status in ("FAILED", "FAILURE", "ERROR"):
                raise RuntimeError(
                    f"ModelScope task failed: {json.dumps(poll_data)[:300]}"
                )

        raise TimeoutError(
            f"ModelScope task {task_id} did not complete in {MAX_POLLS * POLL_INTERVAL_S}s"
        )

    def _extract_completed_image(self, poll_data: dict) -> tuple[bytes, str]:
        """Extract image URL from a completed task response and download it."""
        # Try output.image_url / output.url
        output = poll_data.get("output", poll_data.get("result", {}))
        if isinstance(output, dict):
            img_url = output.get("image_url") or output.get("url")
            if img_url:
                return self._download_image(img_url)
            # Try output.results[0].url
            results = output.get("results", output.get("data", []))
            if results:
                first = results[0] if isinstance(results, list) else results
                if isinstance(first, dict):
                    if "url" in first:
                        return self._download_image(first["url"])
                    if "b64_json" in first:
                        return base64.b64decode(first["b64_json"]), ".png"

        # Try top-level data array
        data_arr = poll_data.get("data", [])
        if data_arr and isinstance(data_arr[0], dict):
            if "url" in data_arr[0]:
                return self._download_image(data_arr[0]["url"])
            if "b64_json" in data_arr[0]:
                return base64.b64decode(data_arr[0]["b64_json"]), ".png"

        raise ValueError(
            f"ModelScope: task succeeded but no image found: "
            f"{json.dumps(poll_data)[:300]}"
        )

    def _download_image(self, url: str) -> tuple[bytes, str]:
        """Download image from URL. Returns (bytes, extension)."""
        resp = self._client.get(url)
        resp.raise_for_status()
        ext = ".png" if "png" in url else ".webp" if "webp" in url else ".jpg"
        return resp.content, ext
