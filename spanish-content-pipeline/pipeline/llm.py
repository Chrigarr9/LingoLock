"""OpenRouter LLM client with retry and JSON mode support."""

import json
import time
from dataclasses import dataclass

import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass
class Usage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


@dataclass
class LLMResponse:
    content: str
    usage: Usage
    parsed: dict | list | None = None


class LLMClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        temperature: float = 0.7,
        max_retries: int = 3,
        transport: httpx.BaseTransport | None = None,
    ):
        self._api_key = api_key
        self._model = model
        self._temperature = temperature
        self._max_retries = max_retries
        client_kwargs = {"timeout": 120.0}
        if transport:
            client_kwargs["transport"] = transport
        self._client = httpx.Client(**client_kwargs)

    def _call(self, messages: list[dict], response_format: dict | None = None) -> LLMResponse:
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": self._temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(OPENROUTER_URL, json=payload, headers=headers)
            if response.status_code < 500:
                response.raise_for_status()
                break
            last_error = response
            if attempt < self._max_retries - 1:
                time.sleep(1 * (attempt + 1))
        else:
            if last_error:
                last_error.raise_for_status()

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        usage_data = data.get("usage", {})
        usage = Usage(
            prompt_tokens=usage_data.get("prompt_tokens", 0),
            completion_tokens=usage_data.get("completion_tokens", 0),
            total_tokens=usage_data.get("total_tokens", 0),
        )
        return LLMResponse(content=content, usage=usage)

    def complete(self, prompt: str, system: str | None = None) -> LLMResponse:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return self._call(messages)

    def complete_json(
        self, prompt: str, system: str | None = None, response_schema: dict | None = None
    ) -> LLMResponse:
        response_format = {"type": "json_object"}
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        result = self._call(messages, response_format=response_format)
        result.parsed = json.loads(result.content)
        return result
