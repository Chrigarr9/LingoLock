"""LLM clients for OpenRouter and Google Gemini with retry and JSON mode support."""

import json
import sys
import time
from dataclasses import dataclass

import httpx

# Allow arbitrarily large integers in JSON responses from LLMs.
# Python 3.11+ limits int↔str conversion to 4300 digits (CVE-2020-10735),
# but models occasionally return huge numbers in JSON output.
sys.set_int_max_str_digits(0)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"



@dataclass
class Usage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float | None = None
    generation_id: str | None = None


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
        generation_id = data.get("id")
        usage_data = data.get("usage", {})
        # OpenRouter returns cost inline in the usage object
        cost_usd = usage_data.get("cost")
        usage = Usage(
            prompt_tokens=usage_data.get("prompt_tokens", 0),
            completion_tokens=usage_data.get("completion_tokens", 0),
            total_tokens=usage_data.get("total_tokens", 0),
            cost_usd=cost_usd,
            generation_id=generation_id,
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
        try:
            result.parsed = json.loads(result.content)
        except json.JSONDecodeError:
            text = result.content.strip()
            start = text.find("{")
            if start == -1:
                raise
            depth = 0
            end = start
            for i, ch in enumerate(text[start:], start):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
            result.parsed = json.loads(text[start : end + 1])
        return result


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiClient:
    """Direct Google Gemini API client with the same interface as LLMClient."""

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

    def _call(
        self,
        contents: list[dict],
        system_instruction: dict | None = None,
        generation_config: dict | None = None,
    ) -> LLMResponse:
        url = f"{GEMINI_BASE_URL}/{self._model}:generateContent"

        payload: dict = {"contents": contents}
        if system_instruction:
            payload["systemInstruction"] = system_instruction
        gen_config = {"temperature": self._temperature}
        if generation_config:
            gen_config.update(generation_config)
        payload["generationConfig"] = gen_config

        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }

        last_error = None
        for attempt in range(self._max_retries):
            response = self._client.post(url, json=payload, headers=headers)
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
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        usage_data = data.get("usageMetadata", {})
        usage = Usage(
            prompt_tokens=usage_data.get("promptTokenCount", 0),
            completion_tokens=usage_data.get("candidatesTokenCount", 0),
            total_tokens=usage_data.get("totalTokenCount", 0),
        )
        return LLMResponse(content=content, usage=usage)

    def complete(self, prompt: str, system: str | None = None) -> LLMResponse:
        system_instruction = None
        if system:
            system_instruction = {"parts": [{"text": system}]}
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        return self._call(contents, system_instruction=system_instruction)

    def complete_json(
        self, prompt: str, system: str | None = None, response_schema: dict | None = None
    ) -> LLMResponse:
        system_instruction = None
        if system:
            system_instruction = {"parts": [{"text": system}]}
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        generation_config = {"responseMimeType": "application/json"}
        result = self._call(
            contents,
            system_instruction=system_instruction,
            generation_config=generation_config,
        )
        try:
            result.parsed = json.loads(result.content)
        except json.JSONDecodeError:
            # Model sometimes appends trailing text after the closing brace.
            # Find the outermost JSON object by matching braces.
            text = result.content.strip()
            start = text.find("{")
            if start == -1:
                raise
            depth = 0
            end = start
            for i, ch in enumerate(text[start:], start):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
            result.parsed = json.loads(text[start : end + 1])
        return result


def create_client(
    provider: str,
    api_key: str,
    model: str,
    temperature: float = 0.7,
    max_retries: int = 3,
    transport: httpx.BaseTransport | None = None,
) -> LLMClient | GeminiClient:
    """Factory: create the right LLM client based on provider name."""
    if provider == "google":
        return GeminiClient(
            api_key=api_key,
            model=model,
            temperature=temperature,
            max_retries=max_retries,
            transport=transport,
        )
    # Default to OpenRouter for "openrouter" or any other value
    return LLMClient(
        api_key=api_key,
        model=model,
        temperature=temperature,
        max_retries=max_retries,
        transport=transport,
    )
